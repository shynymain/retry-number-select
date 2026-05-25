(function(){
'use strict';
const S=()=>window.REVStore;
function d(v){const x=S().int(v);return x===null?null:Math.abs(x)%10;}
function asSpec(v,t){const x=S().int(v);if(x===null)return false;if(x===t)return true;if(t===5&&x===14)return true;if(t===9&&x===18)return true;return false;}
function asDigit(v,t){const x=S().int(v);return x!==null&&Math.abs(x)%10===t;}
function exactDigit(v,t){return d(v)===t;}
function markOf(h){const vals=[h.past1,h.past2,h.past3]; const nums=vals.map(S().int); if(nums.some(v=>v===null))return ''; const ds=vals.map(d); if(ds[0]===ds[1]&&ds[1]===ds[2])return '◎';
  const normal=[[1,4,9],[1,4,6],[1,8,5],[8,1,4],[9,1,4],[6,1,4],[8,1,5],[5,1,8],[4,1,9],[4,1,6]]; if(normal.some(p=>asSpec(vals[0],p[0])&&asSpec(vals[1],p[1])&&asSpec(vals[2],p[2])))return '◎';
  if(exactDigit(vals[0],1)&&exactDigit(vals[1],4)&&exactDigit(vals[2],5))return '◎'; if(exactDigit(vals[0],1)&&exactDigit(vals[1],5)&&exactDigit(vals[2],4))return '◎';
  if([1,5,9].every(t=>vals.some(v=>asSpec(v,t)||asDigit(v,t))))return '◎'; if([1,5,6].every(t=>vals.some(v=>asSpec(v,t)||asDigit(v,t))))return '◎'; const sum=(ds[0]+ds[1]+ds[2])%10; if(sum===5)return '○'; if(sum===9)return '▲'; return '';}
function recalc(r){r=S().normalizeRace(r); const sorted=r.horses.map(h=>({h,o:S().num(h.odds)})).filter(x=>x.o!==null).sort((a,b)=>a.o-b.o); let rank=0,shown=0,prev=null; sorted.forEach(x=>{shown++;if(prev===null||x.o!==prev)rank=shown;x.h.popularity=rank;prev=x.o;}); r.horses.forEach(h=>{h.frame=S().frameOf(h.no,r.headcount);h.mark=markOf(h);});return r;}
function isFive(h){return [5,14,15].includes(+h.no)||+h.frame===5;}
function connectToFive(h){return isFive(h)||[5,14,15].some(n=>Math.abs(+h.no-n)<=2)||Math.abs(+h.frame-5)<=1;}
function connScore(h,r){let score=0,reasons=[]; const marked=r.horses.filter(x=>x.mark); if(isFive(h)){score+=100;reasons.push('5系');} if([3,4,5,6,7].includes(+h.popularity)){score+=28;reasons.push('中穴帯');} if([4,5,6,7,8].includes(+h.popularity)&&isFive(h)){score+=18;reasons.push('狙い人気×5系');}
  for(const m of marked){if(+m.no===+h.no)continue; const gap=Math.abs(+h.no-+m.no); if(m.mark==='◎'&&gap<=2){score+=30;reasons.push('◎連動');} if(m.mark==='○'&&gap<=2){score+=15;reasons.push('○連動');} if(m.mark==='▲'&&gap<=2){score+=10;reasons.push('▲連動');} if(gap===1){score+=20;reasons.push('隣±1');} if(gap===2){score+=8;reasons.push('隣の隣');} if(((+h.no + +m.no)%10)===9){score+=12;reasons.push('和9');} if(+h.frame===+m.frame){score+=6;reasons.push('同枠');}}
  if(+h.popularity===1){score-=999;reasons.push('1人気軸禁止');} if(+h.popularity>=10){score-=9999;reasons.push('10人気以下排除');} if(+h.popularity===9&&isFive(h)&&score>150){score+=9999;reasons.push('9人気例外');}
  return {score,reasons:[...new Set(reasons)]};}
function raceEntryOK(r){const g=r.grade||'',c=r.condition||'',a=r.age||'',surf=r.surface||''; if(surf&&surf!=='芝')return false;if(/G3/i.test(g)&&/ハンデ/.test(c))return false;if(/OP|特別/.test(g+r.raceName)&&/2歳|3歳春/.test(a))return false;return true;}
function predictions(raw){const r=recalc(raw); const marks=r.horses.filter(h=>h.mark); const axes=r.horses.filter(connectToFive).map(h=>({...h,_c:connScore(h,r)})).filter(h=>h._c.score>-9000).sort((a,b)=>b._c.score-a._c.score||(+a.popularity||99)-(+b.popularity||99)); const axis=axes[0]||null; let judge='見送り',reason=[]; const strong=axis?axis._c:null; const onePop=r.horses.find(h=>+h.popularity===1); const attackOK=!onePop||(!isFive(onePop)||connScore(onePop,r).score<40);
  if(!raceEntryOK(r))reason.push('対象外条件'); if(marks.length<=1)reason.push('◎○▲が1頭のみ'); if(!axis)reason.push('軸不明'); if(axis&&(+axis.popularity<=2))reason.push('軸が2人気以内'); if(strong&&strong.score<=120)reason.push('5系接続弱い'); if(!attackOK)reason.push('1人気が5系/接続で固い'); if(axis&&marks.filter(h=>h.mark==='◎').length>=2&&isFive(axis)&&[3,4,5,6,7,8,9].includes(+axis.popularity)&&reason.length===0)judge='勝負';
  const pool=r.horses.filter(h=>axis&&h.no!==axis.no).map(h=>({h,c:connScore(h,r)})).filter(x=>x.c.score>-9000).sort((a,b)=>b.c.score-a.c.score||(+a.h.popularity||99)-(+b.h.popularity||99)).map(x=>x.h);
  const partners=pool.slice(0,3); const umaren=axis&&partners[0]?[`${axis.no}-${partners[0].no}`]:[]; const wide=axis?partners.map(h=>`${axis.no}-${h.no}`):[]; const sanrenpuku=axis&&partners.length>=2?[`${axis.no}-${partners[0].no}-${partners[1].no}`]:[];
  return {judge,axis,partners,umaren,wide,sanrenpuku,reason,axisReason:strong?strong.reasons:[]};}
function comboSet(s){return String(s||'').split('-').map(x=>S().int(x)).filter(Boolean).sort((a,b)=>a-b).join('-');}
function hit(a,b){return !!comboSet(a)&&comboSet(a)===comboSet(b);}
function betResult(r,predKey,resultKey){const p=predictions(r); const res=S().normalizeResult(r.result||{}); const preds=p[predKey]||[]; const actual=(res[resultKey]||[]).map(x=>x.combo).filter(Boolean); const ok=preds.some(c=>actual.some(a=>hit(c,a))); return {preds,actual,hit:ok};}
function analysisLines(r){r=recalc(r); const p=predictions(r); const u=betResult(r,'umaren','umarens'), w=betResult(r,'wide','wides'), s=betResult(r,'sanrenpuku','sanrenpukus'); const axis=p.axis?`${p.axis.no} ${p.axis.name}`:'なし'; return [`判定：${p.judge}`,`軸：${axis}`,`軸理由：${p.axisReason.join(' / ')||'なし'}`,`見送り理由：${p.reason.join(' / ')||'なし'}`,`馬券種別の予想結果 馬連：${u.preds.join(' / ')||'なし'}　${u.hit?'的中':'不的中'}`,`馬券種別の予想結果 ワイド：${w.preds.join(' / ')||'なし'}　${w.hit?'的中':'不的中'}`,`馬券種別の予想結果 3連複：${s.preds.join(' / ')||'なし'}　${s.hit?'的中':'不的中'}`,`印：${r.horses.filter(h=>h.mark).map(h=>`${h.mark}${h.no}`).join(' / ')||'なし'}`,`今回の反省：5系収束、隣±1、和9、人気ズレ、1人気の固さを券種別に確認。`, `当てられた予想ルール：◎ライン発生源、5系軸、隣±1、固定点数（馬連1点・ワイド3点・3連複1点）。`];}
window.REVPrediction={markOf,recalc,isFive,connScore,predictions,comboSet,hit,betResult,analysisLines};
})();
