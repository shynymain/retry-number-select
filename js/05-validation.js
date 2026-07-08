/* ==========================================
   05-validation.js
   Ver2_010: 検証結果
========================================== */

(function(){
'use strict';

const C = window.KV2Common;
const S = window.KV2Store;

const TICKETS = [
  ['umaren','馬連'],
  ['wide','ワイド'],
  ['sanrenpuku','3連複']
];

let lastRows = [];
let lastSummary = null;
let lastRankings = [];
let lastAiHints = [];
let lastMissRows = [];

function esc(v){return C.esc(v)}
function pct(n){return (Number.isFinite(n)?(Math.round(n*10)/10):0)+'%'}
function yen(n){return (Number(n)||0).toLocaleString()+'円'}
function num(v){const n=C.toNum(v); return n===null?0:n}
function int(v){return C.toInt(v)||0}
function app(){return document.getElementById('app')}
function h(title,back){return `<h1>🏠${esc(title)}</h1>${back?'<button class="secondary" onclick="KV2App.showTop()">トップへ</button>':''}`}
function card(html,cls){return `<div class="card ${cls||''}">${html}</div>`}
function table(head,body,empty){return `<div class="tableWrap"><table><tr>${head.map(x=>`<th>${esc(x)}</th>`).join('')}</tr>${body||`<tr><td colspan="${head.length}">${esc(empty||'データなし')}</td></tr>`}</table></div>`}
function options(arr,selected){return (arr||[]).map(x=>`<option value="${esc(x)}" ${String(x)===String(selected)?'selected':''}>${esc(x)}</option>`).join('')}
function uniq(arr){return [...new Set((arr||[]).filter(Boolean))]}

function raceLabel(r){return `${r.date||''} ${r.place||''} ${r.raceNo||''} ${r.raceName||''}`.trim()}
function categoryKey(r){return `${r.grade||'未設定'} / ${r.surface||'未設定'} / ${r.condition||'未設定'}`}
function overallKey(r){return `全体 / ${r.surface||'未設定'} / ${r.condition||'未設定'}`}
function distanceLabel(r){const d=String(r.distance||'').trim(); return d?(/m$/i.test(d)?d:d+'m'):'距離未設定'}
function distanceKey(r){return `${r.surface||'未設定'} / ${distanceLabel(r)} / ${r.condition||'未設定'}`}

function resultPayMap(result,key){
  const m={};
  ((result&&result[key])||[]).forEach(x=>{const k=C.comboKey(x.combo||''); if(k)m[k]=int(x.pay);});
  return m;
}
function ticketStats(r,key){
  const p=r.prediction||{}, result=r.result||{};
  const resultCombos=(C.autoResultCombos(result)[key]||[]).map(C.comboKey).filter(Boolean);
  const payMap=resultPayMap(result,key);
  const predictions=((p[key]||[]).map(C.comboKey).filter(Boolean));
  const hitCombos=predictions.filter(x=>resultCombos.includes(x));
  const pay=hitCombos.reduce((s,x)=>s+(payMap[x]||0),0);
  const cost=predictions.length*100;
  return {key,predictions,hitCombos,hit:hitCombos.length>0,cost,pay,roi:cost?pay/cost*100:0,pointCount:predictions.length};
}
function allTickets(r){
  const items={}; let cost=0,pay=0,hit=false;
  TICKETS.forEach(([k])=>{items[k]=ticketStats(r,k); cost+=items[k].cost; pay+=items[k].pay; if(items[k].hit)hit=true;});
  return {items,cost,pay,hit,roi:cost?pay/cost*100:0};
}
function axisHit(r){
  const no=String((r.prediction&&r.prediction.axis&&r.prediction.axis.no)||'');
  const res=r.result||{};
  const first=(res.firsts||[]).map(String).includes(no);
  const second=(res.seconds||[]).map(String).includes(no);
  const third=(res.thirds||[]).map(String).includes(no);
  return {no,win:first,place:first||second||third,rank:first?'1着':second?'2着':third?'3着':'圏外'};
}
function rowStats(r){
  const all=allTickets(r), axis=axisHit(r);
  return {race:r,label:raceLabel(r),category:categoryKey(r),overall:overallKey(r),distance:distanceKey(r),axis,all};
}
function isDone(r){return !C.resultMissing(r.result||{})}

function normalizeJudgeLabel(v){
  const s=String(v||'').trim();
  if(!s)return '';
  if(/勝負/.test(s)) return '勝負';
  if(/抑え/.test(s)) return '抑え';
  if(/保留/.test(s)) return '保留';
  if(/見送り/.test(s)) return '見送り';
  // Ver1では「判定」欄に推奨馬券名（全部、馬連+3連複など）が入っている保存データがある。
  // それらは判定別ランキングには推奨馬券として出さず、買う前提のレースとして「勝負」に寄せる。
  if(/^(全部|全て|すべて|馬連|ワイド|3連複|三連複|馬連[+＋・、/,\s].*|ワイド[+＋・、/,\s].*|3連複[+＋・、/,\s].*|三連複[+＋・、/,\s].*)$/.test(s)) return '勝負';
  return '';
}
function judgeOf(r){
  const p=(r&&r.prediction)||{};
  return normalizeJudgeLabel(p.judge) || normalizeJudgeLabel(p.judgment) || normalizeJudgeLabel((r&&r.judgmentStats&&r.judgmentStats.judge)) || '';
}

function getFilters(){
  const ids=['vDateFrom','vDateTo','vPlace','vGrade','vSurface','vCondition','vJudge','vKeyword','vMinRaces'];
  const o={}; ids.forEach(id=>{const e=document.getElementById(id); o[id]=e?e.value:'';});
  return o;
}
function filteredRaces(){
  const f=getFilters();
  let races=C.sortSavedRaces(S.loadRaces()).filter(isDone);
  if(f.vDateFrom) races=races.filter(r=>(r.date||'')>=f.vDateFrom);
  if(f.vDateTo) races=races.filter(r=>(r.date||'')<=f.vDateTo);
  if(f.vPlace) races=races.filter(r=>r.place===f.vPlace);
  if(f.vGrade) races=races.filter(r=>r.grade===f.vGrade);
  if(f.vSurface) races=races.filter(r=>r.surface===f.vSurface);
  if(f.vCondition) races=races.filter(r=>(r.condition||'')===f.vCondition);
  if(f.vJudge) races=races.filter(r=>judgeOf(r)===f.vJudge);
  if(f.vKeyword){const kw=f.vKeyword.toLowerCase(); races=races.filter(r=>`${r.raceName||''} ${r.place||''} ${r.grade||''}`.toLowerCase().includes(kw));}
  return races;
}

function summarize(rows){
  const s={races:rows.length,cost:0,pay:0,hit:0,axisWin:0,axisPlace:0,tickets:{},__rows:rows};
  TICKETS.forEach(([k])=>s.tickets[k]={label:TICKETS.find(x=>x[0]===k)[1],races:0,cost:0,pay:0,hit:0,points:0});
  rows.forEach(x=>{
    s.cost+=x.all.cost; s.pay+=x.all.pay; if(x.all.hit)s.hit++;
    if(x.axis.win)s.axisWin++; if(x.axis.place)s.axisPlace++;
    TICKETS.forEach(([k])=>{const t=x.all.items[k], a=s.tickets[k]; if(t.pointCount){a.races++; a.points+=t.pointCount;} a.cost+=t.cost; a.pay+=t.pay; if(t.hit)a.hit++;});
  });
  s.roi=s.cost?s.pay/s.cost*100:0; s.hitRate=s.races?s.hit/s.races*100:0; s.axisWinRate=s.races?s.axisWin/s.races*100:0; s.axisPlaceRate=s.races?s.axisPlace/s.races*100:0;
  TICKETS.forEach(([k])=>{const a=s.tickets[k]; a.roi=a.cost?a.pay/a.cost*100:0; a.hitRate=a.races?a.hit/a.races*100:0;});
  return s;
}
function statsForGroup(rows,key,label){
  const s=summarize(rows);
  return {key,label:label||key,rows,summary:s};
}
function makeRankings(rows){
  const groups=[];
  const addMap=(name,fn)=>{
    const m={}; rows.forEach(x=>{const k=fn(x.race,x); if(!k)return; (m[k]=m[k]||[]).push(x);});
    Object.entries(m).forEach(([k,v])=>groups.push(statsForGroup(v,k,k)));
  };
  addMap('category',r=>categoryKey(r));
  addMap('overall',r=>overallKey(r));
  addMap('distance',r=>distanceKey(r));
  const min=int((document.getElementById('vMinRaces')||{}).value)||1;
  return groups.filter(g=>g.summary.races>=min).sort((a,b)=>b.summary.roi-a.summary.roi||b.summary.races-a.summary.races);
}
function hasRecent30(rows){
  return (rows||[]).length>=31;
}
function recent30Rows(rows){
  // 直近30Rは、検索条件適用後のトータル対象が31R以上ある場合だけ有効。
  // 30R以下ではトータルと同一母数になるため表示・CSV出力しない。
  return hasRecent30(rows) ? (rows||[]).slice(0,30) : [];
}
function periodLabel(rows,isRecent){
  if(!isRecent)return 'トータル';
  return '直近30R';
}
function getValidationMinRaces(){
  return int((document.getElementById('vMinRaces')||{}).value)||1;
}
function makeCategoryGroups(rows){
  const map={};
  (rows||[]).forEach(x=>{const k=categoryKey(x.race); (map[k]=map[k]||[]).push(x);});
  return Object.entries(map).map(([label,rs])=>({label,rows:rs,summary:summarize(rs)}));
}
function sortCategoryGroups(groups){
  return (groups||[]).sort((a,b)=>b.summary.roi-a.summary.roi||b.summary.axisPlaceRate-a.summary.axisPlaceRate||b.summary.races-a.summary.races);
}
function makeCategoryOnlyRankings(rows){
  const min=getValidationMinRaces();
  return sortCategoryGroups(makeCategoryGroups(rows).filter(g=>g.summary.races>=min));
}
function requiredRacesForCategoryLabel(label){
  const t=String(label||'');
  // ランキングとして最低限見る件数。G1/J重賞は2R、その他は3Rを基本にする。
  if(/(^|\s|\/)J?-?G1(\s|\/|$)|J-G2|J-G3/.test(t)) return 2;
  return 3;
}
function shouldShowCategoryRanking(g){
  if(!g || !g.summary) return false;
  const userMin=getValidationMinRaces();
  const required=Math.max(requiredRacesForCategoryLabel(g.label), userMin);
  return Number(g.summary.races||0) >= required;
}
function hasShowableAttributeRanking(rows, opts){
  return ['tansho','fukusho','umaren','wide','sanrenpuku'].some(kind=>
    makeAttrStats(rows||[],kind,opts||{}).length>0
  );
}
function shouldShowCategoryAttributeRanking(g){
  // カテゴリー別属性ランキングは必ず
  // ①カテゴリー掲載判定 → ②属性掲載判定 の順で判定する。
  // 対象Rが必要件数未満のカテゴリーは、属性側の1/3条件やAND条件を満たしても出力しない。
  return shouldShowCategoryRanking(g);
}
function makeCategoryAttributeRankings(rows){
  return sortCategoryGroups(makeCategoryGroups(rows).filter(shouldShowCategoryAttributeRanking));
}
function topRankRows(rankings,kind,limit){
  const sorted=rankings.slice().sort((a,b)=>{
    if(kind==='axis') return b.summary.axisPlaceRate-a.summary.axisPlaceRate||b.summary.races-a.summary.races;
    if(kind==='umaren'||kind==='wide'||kind==='sanrenpuku') return b.summary.tickets[kind].roi-a.summary.tickets[kind].roi||b.summary.tickets[kind].hitRate-a.summary.tickets[kind].hitRate;
    return b.summary.roi-a.summary.roi||b.summary.hitRate-a.summary.hitRate;
  }).slice(0,limit||30);
  return sorted.map((g,i)=>{
    const s=g.summary, tk=kind&&s.tickets[kind];
    if(kind==='axis') return `<tr><td>${i+1}</td><td class="left">${esc(g.label)}</td><td>${s.races}</td><td>${pct(s.axisPlaceRate)}</td><td>${pct(s.axisWinRate)}</td><td>${pct(s.roi)}</td></tr>`;
    if(tk) return `<tr><td>${i+1}</td><td class="left">${esc(g.label)}</td><td>${s.races}</td><td>${pct(tk.hitRate)}</td><td>${pct(tk.roi)}</td><td>${tk.hit}/${tk.races}</td></tr>`;
    return `<tr><td>${i+1}</td><td class="left">${esc(g.label)}</td><td>${s.races}</td><td>${pct(s.hitRate)}</td><td>${pct(s.roi)}</td><td>${pct(s.axisPlaceRate)}</td></tr>`;
  }).join('');
}

function horseByNo(r,no){return (r.horses||[]).find(h=>String(h.no)===String(no))||null}
function fiveKei(h,r){
  if(!h)return false; const no=int(h.no); const frame=int(h.frame)||C.frameOf(no,r.headCount); return no===5||no===14||no===15||frame===5||((frame+no)%10)===5;
}

function pastFinishVals(h){
  return ['past1','past2','past3'].map(k=>int(h&&h[k])).filter(v=>v>0);
}
function lastDigitFinish(v){ v=int(v); return v>0 ? Math.abs(v)%10 : null; }
function pastFinishDigits(h){
  const vs=pastFinishVals(h);
  return vs.map(lastDigitFinish).filter(v=>v!==null);
}
function sameSetDigits(ds, need){
  if(ds.length!==3) return false;
  return need.every(x=>ds.includes(x));
}
function exactSeq(ds, seq){
  return ds.length===3 && seq.length===3 && seq.every((v,i)=>ds[i]===v);
}
function anySeq(ds, seqs){
  return seqs.some(seq=>exactSeq(ds,seq));
}
function allPastOneDigit(vs){ return vs.length===3 && vs.every(v=>v>=1 && v<=9); }
function allPastTwoDigit(vs){ return vs.length===3 && vs.every(v=>v>=10); }
function allOddDigits(ds){ return ds.length===3 && ds.every(d=>d%2===1); }
function allEvenDigits(ds){ return ds.length===3 && ds.every(d=>d%2===0); }
function sumLastDigitFromDigits(ds){ return ds.length===3 ? ds.reduce((a,b)=>a+b,0)%10 : null; }
function isRisingPast(vs){
  if(vs.length!==3) return false;
  const p1=vs[0], p2=vs[1], p3=vs[2]; // past1=前走, past2=前2走, past3=前3走
  return (p3>p2 && p2>p1) || (p3>p2 && p2===p1);
}
function isFallingPast(vs){
  if(vs.length!==3) return false;
  const p1=vs[0], p2=vs[1], p3=vs[2];
  return (p3<p2 && p2<p1) || (p3===p2 && p2<p1);
}
function hasZoromeForSum(ds,sumDigit){
  return ds.length===3 && sumLastDigitFromDigits(ds)===sumDigit && (ds[2]===ds[1] || ds[1]===ds[0]);
}
function hasSandwichForSum(ds,sumDigit){
  return ds.length===3 && sumLastDigitFromDigits(ds)===sumDigit && ds[0]===ds[2];
}
function isSequentialDigits(ds){
  if(ds.length!==3) return false;
  const a=[...new Set(ds)].sort((x,y)=>x-y);
  return a.length===3 && (a[2]-a[0]===2);
}
function isCalcDigits(ds, vs){
  if(ds.length!==3) return false;
  const p1=ds[0], p2=ds[1], p3=ds[2];
  const base = (p1+p2===p3) || (p2+p3===p1) ||
    (p1-p2===p3) || (p2-p1===p3) || (p3-p2===p1) || (p2-p3===p1);
  if(base) return true;
  if(!vs || vs.length!==3) return false;
  const v1=vs[0], v2=vs[1], v3=vs[2];
  return (p1+p2===v3) || (p1-p2===v3) || (p2-p1===v3) ||
    (p2+p3===v1) || (p2-p3===v1) || (p3-p2===v1);
}
function transition59PatternLabels(ds, vs){
  const labels=[];
  if(!ds || ds.length!==3) return labels;

  const add=x=>{ if(x && !labels.includes(x)) labels.push(x); };

  const past1=ds[0], past2=ds[1], past3=ds[2];
  const rawPast1=(vs&&vs.length===3)?vs[0]:null;
  const past1As5=(past1===5 || rawPast1===14);

  const sum32=(past3+past2)%10;
  const sum21=(past2+past1)%10;

  if(sum32===5 && sum21===5) add('5→5');
  if(sum32===5 && past1As5) add('5→5着');

  if(sum32===5 && sum21===9) add('5→9');
  if(sum32===5 && past1===9) add('5→9着');

  if(sum32===9 && sum21===5) add('9→5');
  if(sum32===9 && past1As5) add('9→5着');

  if(sum32===9 && sum21===9) add('9→9');
  if(sum32===9 && past1===9) add('9→9着');

  if(ds.every(v=>v===5 || v===9)) add('59系');
  if(ds.every(v=>v===5 || v===6)) add('56系');
  if(ds.every(v=>v===6 || v===9)) add('69系');

  return labels;
}
                                                             }
function neighborHorseDigitsForPast1(r,h){
  const no=int(h&&h.no); if(!r || !no) return [];
  const horses=(r.horses||[]);
  const maxNo=Math.max.apply(null, horses.map(x=>int(x&&x.no)).filter(Boolean));
  const nums=[];
  if(no>1) nums.push(no-1);
  if(no<maxNo) nums.push(no+1);
  return nums.map(n=>horseByNo(r,n)).filter(Boolean).map(x=>lastDigitFinish(int(x&&x.past1))).filter(v=>v!==null);
}
function commonMarkPatternNames(h,r){
  const vs=pastFinishVals(h), ds=pastFinishDigits(h), labels=[];
  const add=name=>{ if(name && !labels.includes(name)) labels.push(name); };
  const p1=ds.length>=1 ? ds[0] : null;
  const rawP1=vs.length>=1 ? vs[0] : null;

  // 前走だけで成立する定義
  if(p1===5 || rawP1===14) add('5着');
  if(p1===6) add('6着');
  if(p1===9) add('9着');
  if(p1===2 && neighborHorseDigitsForPast1(r,h).includes(3)) add('23');
  if(p1===3 && neighborHorseDigitsForPast1(r,h).includes(2)) add('32');

  // ゾロ目だけは前走・前2走の2走で成立可
  if(ds.length>=2 && ds[0]===ds[1]) add('ゾロ目');
  if(ds.length>=3 && ds[1]===ds[2]) add('ゾロ目');

  // 上記以外の並び・数字パターンは3走すべて着順がある馬のみ判定
  if(ds.length!==3 || vs.length!==3) return labels.length ? labels : ['定義なし'];
  if(vs.length===3 && vs.every(v=>v%2===1)) add('奇数');
  if(vs.length===3 && vs.every(v=>v%2===0)) add('偶数');
  if(allPastOneDigit(vs)) add('1桁');
  if(allPastTwoDigit(vs)) add('2桁');
  if(isRisingPast(vs)) add('上り系');
  if(isFallingPast(vs)) add('下り系');
  if(ds[0]===ds[2]) add('挟み');
  if(isCalcDigits(ds, vs)) add('計算');
  transition59PatternLabels(ds, vs).forEach(add);
  return labels.length ? labels : ['定義なし'];
}
function noMarkPatternLabels(h,r){
  return commonMarkPatternNames(h,r);
}
function markClassLabels(mark,h,r){
  const vs=pastFinishVals(h), ds=pastFinishDigits(h), labels=[];
  const add=name=>{ if(name && !labels.includes(`${mark} ${name}`)) labels.push(`${mark} ${name}`); };
  if(!mark) return [];
  commonMarkPatternNames(h,r).filter(x=>x!=='定義なし').forEach(add);
  if(ds.length!==3 || vs.length!==3) return labels.length ? labels : [mark];
  // ◎専用定義
  if(mark==='◎'){
    if(sameSetDigits(ds,[1,5,9])) add('159');
    if(sameSetDigits(ds,[1,4,9]) && vs.some(v=>v===14)) add('159系');
    if(sameSetDigits(ds,[1,5,6])) add('156');
    if(sameSetDigits(ds,[1,4,6]) && vs.some(v=>v===14)) add('156系');
    if(anySeq(ds,[[1,5,4],[1,4,5],[4,5,1],[5,4,1]])) add('154');
    if(anySeq(ds,[[1,4,9],[4,1,9],[9,1,4]])) add('149');
    if(anySeq(ds,[[1,4,6],[4,1,6],[6,1,4]])) add('146');
    if(anySeq(ds,[[1,8,5],[8,1,5],[5,1,8]])) add('185');
    if(anySeq(vs,[[1,8,14],[8,1,14],[14,1,8]])) add('185系');
    if(ds.every(v=>v===5)) add('555');
    if(ds.every(v=>v===9)) add('999');
  }
  return labels.length ? labels : [mark];
}
function collectTextDeep(v, out){
  out=out||[];
  if(v===null || v===undefined) return out;
  if(typeof v==='string' || typeof v==='number' || typeof v==='boolean'){ out.push(String(v)); return out; }
  if(Array.isArray(v)){ v.forEach(x=>collectTextDeep(x,out)); return out; }
  if(typeof v==='object'){ Object.values(v).forEach(x=>collectTextDeep(x,out)); return out; }
  return out;
}
function raisedAttrSetFromRace(r){
  if(r && r.__raisedAttrSet20260705) return r.__raisedAttrSet20260705;
  const p=(r&&r.prediction)||{}, rv=(r&&(r.aiReview||r.reflection))||{};
  const text=collectTextDeep([p.reason,p.category,p.rates,rv]).join(' / ');
  const set=new Set();
  const addIf=(label,re)=>{ if(re.test(text)) set.add(label); };

  // 予想結果・AI振り返り・相談ヒント内に実際に出ている属性だけを優先して拾う。
  addIf('◎連動',/◎\s*(?:連動|印|軸|本命)|本命/);
  addIf('○連動',/○\s*(?:連動|印|対抗)|対抗/);
  addIf('▲連動',/▲\s*(?:連動|印|単穴)|単穴/);
  addIf('印連動',/(?:印|◎|○|▲)\s*(?:連動|重複|隣|候補)/);
  addIf('隣±1',/隣\s*(?:±|前後)?\s*1|隣接|前後1/);
  addIf('◎隣±1',/◎\s*隣|隣\s*(?:±|前後)?\s*1[^。\n]*◎/);
  addIf('○隣±1',/○\s*隣|隣\s*(?:±|前後)?\s*1[^。\n]*○/);
  addIf('▲隣±1',/▲\s*隣|隣\s*(?:±|前後)?\s*1[^。\n]*▲/);
  addIf('5系',/5系|五系|下1桁.?5|5枠|馬番.?5|14番|15番/);
  addIf('5系＋隣±1',/(5系[^。\n]*(?:隣|±1))|((?:隣|±1)[^。\n]*5系)/);
  addIf('印重複',/印重複|◎◎|◎○|○◎|○○|○▲|▲○/);
  addIf('中穴帯4〜9',/中穴|4.?9人気|4〜9人気|4～9人気/);
  addIf('軸候補人気2〜6',/軸候補.*2.?6人気|2〜6人気|2～6人気/);
  addIf('1〜3人気',/1.?3人気|1〜3人気|1～3人気/);
  addIf('10人気以下',/10人気以下|二桁人気|穴人気/);
  if(!set.size) set.add('__AUTO_STRUCTURAL__');
  r.__raisedAttrSet20260705=set;
  return set;
}
function allowRaisedAttr(r,label){
  const set=raisedAttrSetFromRace(r);
  return set.has('__AUTO_STRUCTURAL__') || set.has(label) ||
    (label.includes('＋') && [...set].some(x=>x!=='__AUTO_STRUCTURAL__' && label.includes(x))) ||
    (label.endsWith('連動') && set.has('印連動')) ||
    (label.endsWith('隣±1') && set.has('隣±1'));
}
function attrOfHorse(r,no,full){
  const h=horseByNo(r,no); if(!h)return ['不明'];
  const p=int(h.popularity), marks=(r.prediction&&r.prediction.marks)||{};
  const a=[];
  const add=v=>{ if(v && (full || allowRaisedAttr(r,v)) && !a.includes(v)) a.push(v); };
  // 印の中分類は今回追加した集計軸なので、AI理由文に出ていなくても属性ランキング対象にする。
  const addMarkAttr=v=>{ if(v && !a.includes(v)) a.push(v); };

  // 人気帯。人気だけで固定表示にならないよう、予想結果側に出ている人気帯を優先する。
  if(p>=1&&p<=3)add('1〜3人気');
  else if(p>=4&&p<=9)add('4〜9人気');
  else if(p>=10)add('10人気以下');
  if(p>=2&&p<=6)add('軸候補人気2〜6');
  if(p>=4&&p<=9)add('中穴帯4〜9');

  // 5系
  const isFive=fiveKei(h,r);
  if(isFive)add('5系');

  // 印分類。◎・○・▲の中身を前走/前2走/前3走から分類して集計する。
  const mark=marks[String(h.no)]||marks[h.no]||'';
  if(mark){
    // 既存集計キーも残す。ここを消すと、既存のランキング/相談ロジックが印連動を拾えず0R扱いになるケースがある。
    addMarkAttr('印連動');
    addMarkAttr(`${mark}連動`);
    addMarkAttr(`${mark}印`);
    // 新しい印内訳分類。前走データが3走揃わない場合は印単体（◎/○/▲）で集計する。
    markClassLabels(mark,h,r).forEach(v=>addMarkAttr(v));
  }

  // 隣±1。隣の印種別も分けて集計する。
  const n=int(h.no);
  const nearMarks=[];
  if(marks[n-1]) nearMarks.push(marks[n-1]);
  if(marks[n+1]) nearMarks.push(marks[n+1]);
  if(nearMarks.length){
    add('隣±1');
    add('印隣±1');
    [...new Set(nearMarks)].forEach(m=>add(`${m}隣±1`));
  }

  // 複合属性。予想結果・振り返りに上がった組み合わせだけ表示候補にする。
  if(isFive && mark) add(`5系＋${mark}連動`);
  if(isFive && nearMarks.length) add('5系＋隣±1');
  if(mark && nearMarks.length) add(`${mark}連動＋隣±1`);
  if(isFive && mark && nearMarks.length) add(`5系＋${mark}連動＋隣±1`);

  return a.length?a:['属性なし'];
}
function makeMissRankings(rows){
  const miss={}, attrs={}, hints={};
  rows.forEach(x=>{
    const r=x.race, res=C.autoResultCombos(r.result||{}), p=r.prediction||{};
    const axis=x.axis;
    TICKETS.forEach(([k,label])=>{
      const t=x.all.items[k];
      if(t.hit) return;
      const base=axis.place ? `${label}:軸成功・組み合わせ抜け` : `${label}:軸NG`;
      miss[base]=(miss[base]||0)+1;
      const resultNums=uniq((res[k]||[]).join('-').split('-').map(C.toInt));
      const predNums=uniq((p[k]||[]).join('-').split('-').map(C.toInt));
      resultNums.filter(n=>!predNums.includes(n)).forEach(n=>attrOfHorse(r,n).forEach(a=>attrs[`${label}:${a}`]=(attrs[`${label}:${a}`]||0)+1));
    });
    const rv=r.aiReview||r.reflection||{};
    (rv.ruleConsultHints||[]).forEach(h=>{hints[h]=(hints[h]||0)+1;});
  });
  const toRows=(obj)=>sortCountEntries(obj, rows).map(([k,v])=>`<tr><td class="left">${esc(k)}</td><td>${v}</td></tr>`).join('');
  lastMissRows=[...sortCountEntries(miss, rows).map(([k,v])=>({type:'miss',label:k,count:v})),...sortCountEntries(attrs, rows).map(([k,v])=>({type:'attr',label:k,count:v}))];
  lastAiHints=Object.entries(hints).sort((a,b)=>b[1]-a[1]).map(([label,count])=>({label,count}));
  return {missRows:toRows(miss),attrRows:toRows(attrs),hintRows:toRows(hints)};
}



/* ===== Ver2_010 detailed rankings ===== */
function median(nums){
  const a=(nums||[]).map(Number).filter(Number.isFinite).sort((x,y)=>x-y);
  if(!a.length)return 0;
  const m=Math.floor(a.length/2);
  return a.length%2?a[m]:(a[m-1]+a[m])/2;
}
function avg(nums){
  const a=(nums||[]).map(Number).filter(Number.isFinite);
  return a.length?a.reduce((s,x)=>s+x,0)/a.length:0;
}
function payForCombo(result,key,combo){
  const m=resultPayMap(result,key);
  return m[C.comboKey(combo)]||0;
}
function horseOddsPay(r,no){
  const target=String(no||'').trim();
  if(!target)return 0;
  const h=((r&&r.horses)||[]).find(x=>String(x&&x.no||'').trim()===target);
  const odds=C.toNum(h && (h.odds ?? h.winOdds ?? h['単勝'] ?? h['オッズ']));
  return odds!==null ? Math.round(odds*100) : 0;
}
function tanshoPayForHorse(r,no){
  // 軸回収率・単勝属性回収率は、単勝払戻入力ではなく出馬表の単勝オッズを優先する。
  // 単勝オッズが無い旧データだけ、従来の result.tansho.pay をフォールバックとして使う。
  const fromOdds=horseOddsPay(r,no);
  if(fromOdds)return fromOdds;
  return payForCombo((r&&r.result)||{},'tansho',no);
}
function firstNums(r){return ((r.result&&r.result.firsts)||[]).map(C.toInt).filter(Boolean)}
function placeNums(r){return uniq([...(r.result&&r.result.firsts||[]),...(r.result&&r.result.seconds||[]),...(r.result&&r.result.thirds||[])].map(C.toInt).filter(Boolean))}
function resultNumsForTicket(r,key){return uniq(((C.autoResultCombos(r.result||{})[key]||[]).join('-')).split('-').map(C.toInt).filter(Boolean))}
function resultPayForTicket(r,key){
  const combos=C.autoResultCombos(r.result||{})[key]||[];
  return combos.reduce((sum,c)=>sum+payForCombo(r.result||{},key,c),0);
}
function attrsInRace(r){
  const out={};
  (r.horses||[]).forEach(h=>attrOfHorse(r,h.no).forEach(a=>{(out[a]=out[a]||[]).push(h)}));
  return out;
}
function resultHasAttr(r,nums,attr){
  return (nums||[]).some(no=>attrOfHorse(r,no).includes(attr));
}
function attrRowsToHtml(list,cols){
  if(!list.length)return '';
  return list.map((x,i)=>`<tr><td>${i+1}</td>${cols.map(c=>`<td${c.left?' class="left"':''}>${esc(c.f(x))}</td>`).join('')}</tr>`).join('');
}
function makePerformanceRanking(rows){
  const s=summarize(rows);
  const body=[
    `<tr><td>対象レース数</td><td>${s.races}</td><td></td></tr>`,
    `<tr><td>軸 単勝的中レース数</td><td>${s.axisWin}</td><td></td></tr>`,
    `<tr><td>軸 複勝的中レース数</td><td>${s.axisPlace}</td><td></td></tr>`,
    `<tr><td>軸 単勝率</td><td>${pct(s.axisWinRate)}</td><td></td></tr>`,
    `<tr><td>軸 複勝率</td><td>${pct(s.axisPlaceRate)}</td><td></td></tr>`,
    `<tr><td>軸 単勝回収率</td><td>${pct(axisTanshoRoi(rows))}</td><td>軸を単勝100円で買った場合</td></tr>`
  ];
  TICKETS.forEach(([k,l])=>{const t=s.tickets[k]; body.push(`<tr><td>${l} 的中レース数</td><td>${t.hit}</td><td></td></tr>`, `<tr><td>${l} 的中率</td><td>${pct(t.hitRate)}</td><td></td></tr>`, `<tr><td>${l} 回収率</td><td>${pct(t.roi)}</td><td>${yen(t.pay)} / ${yen(t.cost)}</td></tr>`);});
  return card(`<div class="title">予想成績</div><p class="subtle">各馬券は1Rに複数的中しても、的中レース数は1回としてカウントします。</p>${table(['項目','値','補足'],body,'データなし')}`);
}
function axisTanshoRoi(rows){
  let cost=0,pay=0;
  rows.forEach(x=>{
    const no=x.axis.no; if(!no)return;
    cost+=100;
    if(x.axis.win) pay+=tanshoPayForHorse(x.race,no);
  });
  return cost?pay/cost*100:0;
}

function attributeDisplayMinCount(rows){
  const n = Array.isArray(rows) ? rows.length : Number(rows||0);
  return n ? Math.max(1, Math.ceil(n/3)) : 1;
}
function filterCountAttributeEntries(entries, rows){
  const min = attributeDisplayMinCount(rows);
  return (entries||[]).filter(([label,count])=>Number(count||0)>=min);
}
function sortCountEntries(obj, rows){
  return filterCountAttributeEntries(Object.entries(obj||{}), rows).sort((a,b)=>b[1]-a[1]);
}

function attrTicketHitTotal(st,key){
  return (st && st.ticketHits && Number(st.ticketHits[key]||0)) || 0;
}
function attrBool(v){ return v ? '○' : '×'; }
function attrShowByShare(st){ return attrBool(st && st.showByShare); }
function attrShowByTicketHit(st){ return attrBool(st && st.showByTicketHit); }
function shouldShowAttributeRanking(st,totalRows,opts){
  opts=opts||{};
  const total=Number(totalRows||0);
  const min=total?Math.max(1,Math.ceil(total/3)):1;
  const byShare=Number(st.target||0)>=min;
  const umaren=attrTicketHitTotal(st,'umaren');
  const wide=attrTicketHitTotal(st,'wide');
  const sanrenpuku=attrTicketHitTotal(st,'sanrenpuku');
  const allTicketHit3 = umaren>=3 && wide>=3 && sanrenpuku>=3;
  const anyTicketHit2 = Math.max(umaren,wide,sanrenpuku)>=2;
  const allowTicketHit = !opts.disableTicketHit;
  const byTicketHit = allowTicketHit && allTicketHit3 && anyTicketHit2;
  st.showByShare=byShare;
  st.showByTicketHit=byTicketHit;
  st.showReason=byShare ? '1/3以上' : (byTicketHit ? (opts.period==='recent'?'直近的中AND':'的中AND') : '');
  return byShare || byTicketHit;
}
function makeAttrStats(rows,kind,opts){
  opts=opts||{};
  const total=rows.length;
  const map={};
  const ticketKeys=['umaren','wide','sanrenpuku'];
  const ensure=a=>map[a]||(map[a]={attr:a,target:0,hit:0,cost:0,pay:0,pops:[],ticketHits:{umaren:0,wide:0,sanrenpuku:0},showByShare:false,showByTicketHit:false,showReason:''});
  rows.forEach(x=>{
    const r=x.race, byAttr=attrsInRace(r);
    Object.entries(byAttr).forEach(([a,horses])=>{
      const st=ensure(a); st.target++; st.cost+=100; horses.forEach(h=>{const p=int(h.popularity); if(p)st.pops.push(p);});

      // 掲載条件・CSV確認用：馬券別のトータル的中レース数を属性ごとに保持する。
      ticketKeys.forEach(tk=>{
        const nums=resultNumsForTicket(r,tk);
        if(resultHasAttr(r,nums,a)) st.ticketHits[tk]++;
      });

      if(kind==='tansho'){
        const first=firstNums(r); if(resultHasAttr(r,first,a)){st.hit++; first.forEach(no=>{if(attrOfHorse(r,no).includes(a)) st.pay+=tanshoPayForHorse(r,no);});}
      } else if(kind==='fukusho'){
        const nums=placeNums(r); if(resultHasAttr(r,nums,a)) st.hit++;
      } else if(ticketKeys.includes(kind)){
        const nums=resultNumsForTicket(r,kind); if(resultHasAttr(r,nums,a)){st.hit++; st.pay+=resultPayForTicket(r,kind);}
      }
    });
  });
  return Object.values(map).filter(x=>shouldShowAttributeRanking(x,total,opts)).map(x=>{
    x.hitRate=x.target?x.hit/x.target*100:0; x.roi=x.cost?x.pay/x.cost*100:0; x.avgPop=avg(x.pops); x.medPop=median(x.pops); return x;
  }).sort((a,b)=>{
    if(kind==='fukusho') return b.hitRate-a.hitRate||b.target-a.target;
    return b.roi-a.roi||b.hitRate-a.hitRate||b.target-a.target;
  });
}
function attrRankingCard(rows,kind,title,opts){
  opts=opts||{};
  const list=makeAttrStats(rows,kind,opts);
  if(kind==='fukusho'){
    const body=attrRowsToHtml(list,[{left:true,f:x=>x.attr},{f:x=>x.target},{f:x=>x.hit},{f:x=>attrTicketHitTotal(x,'umaren')},{f:x=>attrTicketHitTotal(x,'wide')},{f:x=>attrTicketHitTotal(x,'sanrenpuku')},{f:x=>`${Math.round(x.avgPop*10)/10} / ${Math.round(x.medPop*10)/10}`},{f:x=>pct(x.hitRate)},{f:x=>attrShowByShare(x)},{f:x=>attrShowByTicketHit(x)},{f:x=>x.showReason}]);
    return card(`<div class="title">${esc(title)}</div><p class="subtle">3着までに来た馬の属性を確認します。対象レースの1/3以上、または追加掲載条件（馬連・ワイド・3連複が全て3R以上的中 AND どれかが2R以上的中）を満たした属性を掲載します。</p>${table(['順位','属性','対象R','的中R','馬連的中R','ワイド的中R','3連複的中R','人気 平均/中央値','的中率','1/3判定','AND判定','掲載理由'],body,'データなし')}`);
  }
  const body=attrRowsToHtml(list,[{left:true,f:x=>x.attr},{f:x=>x.target},{f:x=>x.hit},{f:x=>attrTicketHitTotal(x,'umaren')},{f:x=>attrTicketHitTotal(x,'wide')},{f:x=>attrTicketHitTotal(x,'sanrenpuku')},{f:x=>`${Math.round(x.avgPop*10)/10} / ${Math.round(x.medPop*10)/10}`},{f:x=>pct(x.hitRate)},{f:x=>pct(x.roi)},{f:x=>attrShowByShare(x)},{f:x=>attrShowByTicketHit(x)},{f:x=>x.showReason}]);
  return card(`<div class="title">${esc(title)}</div><p class="subtle">対象レースの1/3以上、または追加掲載条件（馬連・ワイド・3連複が全て3R以上的中 AND どれかが2R以上的中）を満たした属性を掲載し、その属性を買った場合の的中率・回収率を確認します。</p>${table(['順位','属性','対象R','的中R','馬連的中R','ワイド的中R','3連複的中R','人気 平均/中央値','的中率','回収率','1/3判定','AND判定','掲載理由'],body,'データなし')}`);
}
function attrOfHorseFull(r,no){ return attrOfHorse(r,no,true); }
function attrHasResult(r,nums,attr){ return (nums||[]).some(no=>attrOfHorseFull(r,no).includes(attr)); }
function improvementMinCount(scopeRows){
  const n=(scopeRows||[]).length;
  return n ? Math.max(1, Math.ceil(n/3)) : 1;
}
function makeAttrOccurrenceMap(scopeRows, collector){
  const map={};
  (scopeRows||[]).forEach(x=>{
    const set=new Set();
    (collector(x)||[]).forEach(no=>attrOfHorseFull(x.race,no).forEach(a=>set.add(a)));
    set.forEach(a=>{(map[a]=map[a]||new Set()).add(x);});
  });
  return map;
}
function horsePopularity(r,no){
  const h=((r&&r.horses)||[]).find(x=>String(x&&x.no||'').trim()===String(no));
  const pop=int(h && (h.popularity ?? h.pop ?? h['人気']));
  return pop || 999;
}
function numsWithAttrSorted(r, attr){
  return uniq(((r&&r.horses)||[]).filter(h=>attrOfHorseFull(r,h.no).includes(attr)).map(h=>int(h.no)).filter(Boolean))
    .sort((a,b)=>horsePopularity(r,a)-horsePopularity(r,b)||a-b);
}
function existingTicketPointCount(r,key){
  const n=(((r&&r.prediction&&r.prediction[key])||[]).map(C.comboKey).filter(Boolean)).length;
  if(n)return n;
  if(key==='sanrenpuku')return 4;
  return 2;
}
function combosFromAxisAndCandidates(key, axisNo, candidates, limit){
  axisNo=int(axisNo); if(!axisNo)return [];
  const others=uniq((candidates||[]).map(int).filter(n=>n&&n!==axisNo));
  const out=[];
  if(key==='umaren'||key==='wide'){
    others.forEach(n=>out.push(C.comboKey(`${axisNo}-${n}`)));
  }else if(key==='sanrenpuku'){
    for(let i=0;i<others.length;i++){
      for(let j=i+1;j<others.length;j++) out.push(C.comboKey(`${axisNo}-${others[i]}-${others[j]}`));
    }
  }
  return uniq(out).slice(0, Math.max(0, limit||0));
}
function hitPayForCombos(r,key,combos){
  const resultCombos=(C.autoResultCombos((r&&r.result)||{})[key]||[]).map(C.comboKey).filter(Boolean);
  const payMap=resultPayMap((r&&r.result)||{}, key);
  const hits=(combos||[]).map(C.comboKey).filter(c=>resultCombos.includes(c));
  const pay=hits.reduce((sum,c)=>sum+(payMap[c]||0),0);
  return {hit:hits.length>0, pay, hits};
}
function currentPredictionNums(r){
  const p=(r&&r.prediction)||{};
  return uniq([].concat(p.umaren||[],p.wide||[],p.sanrenpuku||[]).join('-').split('-').map(C.toInt).filter(Boolean));
}
function simulatedTicketCombosForAttr(x, attr, mode, key){
  const r=x.race, p=r.prediction||{};
  const limit=existingTicketPointCount(r,key);
  const attrNums=numsWithAttrSorted(r,attr);
  if(!attrNums.length||!limit)return [];

  // 軸NG：属性内の最上位人気を軸1頭として、現行の相手候補を優先して点数内に収める。
  if(mode==='axis'){
    const axisNo=attrNums[0];
    const currentNums=currentPredictionNums(r).filter(n=>n!==axisNo);
    const candidates=uniq(currentNums.concat(attrNums.filter(n=>n!==axisNo)))
      .sort((a,b)=>horsePopularity(r,a)-horsePopularity(r,b)||a-b);
    return combosFromAxisAndCandidates(key, axisNo, candidates, limit);
  }

  // 相手抜け/組み合わせ抜け：現行軸は維持し、属性馬を相手候補として点数内に追加する。
  const axisNo=int(p.axis&&p.axis.no) || (x.axis&&int(x.axis.no));
  const currentNums=currentPredictionNums(r).filter(n=>n!==axisNo);
  const candidates=uniq(attrNums.filter(n=>n!==axisNo).concat(currentNums))
    .sort((a,b)=>{
      const ai=attrNums.includes(a)?0:1, bi=attrNums.includes(b)?0:1;
      return ai-bi || horsePopularity(r,a)-horsePopularity(r,b)||a-b;
    });
  return combosFromAxisAndCandidates(key, axisNo, candidates, limit);
}
function ticketAttrPerformance(scopeRows, attr, mode){
  mode=mode||'partner';
  const perf={target:(scopeRows||[]).length, overallCost:0, overallPay:0, axisWin:0, axisPlace:0, axisCost:0, axisPay:0, tickets:{}};
  TICKETS.forEach(([k])=>perf.tickets[k]={hit:0,cost:0,pay:0,hitRate:0,roi:0,points:0});
  (scopeRows||[]).forEach(x=>{
    const r=x.race;
    const attrNums=numsWithAttrSorted(r,attr);
    if(attrNums.length){
      const axisNo=(mode==='axis') ? attrNums[0] : (int((r.prediction&&r.prediction.axis&&r.prediction.axis.no))||attrNums[0]);
      if(attrHasResult(r, firstNums(r), attr)){
        if(mode==='axis'){
          if(firstNums(r).includes(axisNo)){ perf.axisWin++; perf.axisPay+=tanshoPayForHorse(r,axisNo); }
        }else{
          perf.axisWin++;
          firstNums(r).forEach(no=>{ if(attrOfHorseFull(r,no).includes(attr)) perf.axisPay+=tanshoPayForHorse(r,no); });
        }
      }
      if(mode==='axis'){
        if(placeNums(r).includes(axisNo)) perf.axisPlace++;
      }else if(attrHasResult(r, placeNums(r), attr)) perf.axisPlace++;
    }
    perf.axisCost+=100;

    TICKETS.forEach(([k])=>{
      const tk=perf.tickets[k];
      const combos=simulatedTicketCombosForAttr(x,attr,mode,k);
      const cost=combos.length*100;
      tk.cost+=cost;
      tk.points+=combos.length;
      perf.overallCost+=cost;
      if(cost){
        const hp=hitPayForCombos(r,k,combos);
        if(hp.hit) tk.hit++;
        tk.pay+=hp.pay;
        perf.overallPay+=hp.pay;
      }
    });
  });
  perf.axisWinRate=perf.target?perf.axisWin/perf.target*100:0;
  perf.axisRoi=perf.axisCost?perf.axisPay/perf.axisCost*100:0;
  perf.axisPlaceRate=perf.target?perf.axisPlace/perf.target*100:0;
  perf.overallRoi=perf.overallCost?perf.overallPay/perf.overallCost*100:0;
  TICKETS.forEach(([k])=>{const tk=perf.tickets[k]; tk.hitRate=perf.target?tk.hit/perf.target*100:0; tk.roi=tk.cost?tk.pay/tk.cost*100:0;});
  return perf;
}
function improvementRows(performanceRows, occurrenceMap, mode, missRows){
  const allRows=performanceRows||[];
  const missScope=missRows||allRows;
  const min=improvementMinCount(missScope);
  return Object.entries(occurrenceMap||{}).map(([attr,set])=>{
    const perf=ticketAttrPerformance(allRows, attr, mode);
    const occurrence=(set&&set.size)||0;
    return Object.assign({attr, occurrence, occurrenceRate:allRows.length?occurrence/allRows.length*100:0}, perf);
  }).filter(x=>x.occurrence>=min).sort((a,b)=>b.overallRoi-a.overallRoi||b.occurrence-a.occurrence||b.axisPlaceRate-a.axisPlaceRate);
}
function improvementTicketCells(x){
  return TICKETS.map(([k,l])=>`<td>${pct(x.tickets[k].hitRate)}</td><td>${pct(x.tickets[k].roi)}</td>`).join('');
}
function makeAxisNgRanking(rows){
  const scope=rows.filter(x=>!x.axis.place);
  const occ=makeAttrOccurrenceMap(scope, x=>placeNums(x.race));
  const list=improvementRows(rows, occ, 'axis', scope);
  const body=list.map((x,i)=>`<tr><td>${i+1}</td><td class="left">${esc(x.attr)}</td><td>${x.target}</td><td>${x.occurrence}</td><td>${pct(x.axisWinRate)}</td><td>${pct(x.axisRoi)}</td><td>${pct(x.axisPlaceRate)}</td><td>${pct(x.overallRoi)}</td>${improvementTicketCells(x)}</tr>`).join('');
  return card(`<div class="title">軸NGランキング</div><p class="subtle">軸が圏外だったレースで馬券内に来た馬の属性を抽出し、その属性を対象全レースで軸候補として採用した場合の実測成績を全体（馬連＋ワイド＋3連複）回収率の高い順に表示します。</p>${table(['順位','属性','対象R','出現R','軸単勝率','軸回収率','軸複勝率','全体(馬連+ワイド+3連複)回収率','馬連的中率','馬連回収率','ワイド的中率','ワイド回収率','3連複的中率','3連複回収率'],body,'データなし')}`);
}
function collectPartnerMissNums(x){
  if(!x.axis.place)return [];
  const r=x.race, p=r.prediction||{}, res=C.autoResultCombos(r.result||{}), out=[];
  TICKETS.forEach(([k])=>{
    const t=x.all.items[k]; if(t.hit)return;
    const resultNums=uniq((res[k]||[]).join('-').split('-').map(C.toInt).filter(Boolean));
    const predNums=uniq((p[k]||[]).join('-').split('-').map(C.toInt).filter(Boolean));
    resultNums.filter(n=>!predNums.includes(n)).forEach(n=>out.push(n));
  });
  return uniq(out);
}
function collectComboMissNums(x){
  if(!x.axis.place)return [];
  const r=x.race, p=r.prediction||{}, res=C.autoResultCombos(r.result||{}), out=[];
  TICKETS.forEach(([k])=>{
    const t=x.all.items[k]; if(t.hit)return;
    const resultNums=uniq((res[k]||[]).join('-').split('-').map(C.toInt).filter(Boolean));
    if(!resultNums.length)return;
    const predNums=uniq((p[k]||[]).join('-').split('-').map(C.toInt).filter(Boolean));
    const missing=resultNums.filter(n=>!predNums.includes(n));
    if(!missing.length) resultNums.forEach(n=>out.push(n));
  });
  return uniq(out);
}
function makePartnerMissRanking(rows){
  const scope=rows.filter(x=>collectPartnerMissNums(x).length>0);
  const occ=makeAttrOccurrenceMap(scope, collectPartnerMissNums);
  const list=improvementRows(rows, occ, 'partner', scope);
  const body=list.map((x,i)=>`<tr><td>${i+1}</td><td class="left">${esc(x.attr)}</td><td>${x.target}</td><td>${x.occurrence}</td><td>${pct(x.occurrenceRate)}</td><td>${pct(x.overallRoi)}</td>${improvementTicketCells(x)}</tr>`).join('');
  return card(`<div class="title">相手抜けランキング</div><p class="subtle">軸は来たが相手が抜けたレースで抜けた相手の属性を抽出し、その属性を対象全レースで相手条件へ追加した場合の実測成績を全体（馬連＋ワイド＋3連複）回収率の高い順に表示します。</p>${table(['順位','属性','対象R','出現R','出現率','全体(馬連+ワイド+3連複)回収率','馬連的中率','馬連回収率','ワイド的中率','ワイド回収率','3連複的中率','3連複回収率'],body,'データなし')}`);
}
function makeComboMissRanking(rows){
  const scope=rows.filter(x=>collectComboMissNums(x).length>0);
  const occ=makeAttrOccurrenceMap(scope, collectComboMissNums);
  const list=improvementRows(rows, occ, 'partner', scope);
  const body=list.map((x,i)=>`<tr><td>${i+1}</td><td class="left">${esc(x.attr)}</td><td>${x.target}</td><td>${x.occurrence}</td><td>${pct(x.occurrenceRate)}</td><td>${pct(x.overallRoi)}</td>${improvementTicketCells(x)}</tr>`).join('');
  return card(`<div class="title">組み合わせ抜けランキング</div><p class="subtle">軸・相手候補は来ているが組み合わせで外れたレースから属性を抽出し、その属性を対象全レースで買い目へ追加した場合の実測成績を全体（馬連＋ワイド＋3連複）回収率の高い順に表示します。</p>${table(['順位','属性','対象R','出現R','出現率','全体(馬連+ワイド+3連複)回収率','馬連的中率','馬連回収率','ワイド的中率','ワイド回収率','3連複的中率','3連複回収率'],body,'データなし')}`);
}
function makeLowRoiRanking(rows){
  const lists=[['単勝',makeAttrStats(rows,'tansho')],['馬連',makeAttrStats(rows,'umaren')],['ワイド',makeAttrStats(rows,'wide')],['3連複',makeAttrStats(rows,'sanrenpuku')]];
  const all=[]; lists.forEach(([label,list])=>list.forEach(x=>all.push({label,attr:x.attr,target:x.target,hit:x.hit,hitRate:x.hitRate,roi:x.roi})));
  const body=all.sort((a,b)=>a.roi-b.roi||b.target-a.target).slice(0,30).map((x,i)=>`<tr><td>${i+1}</td><td>${esc(x.label)}</td><td class="left">${esc(x.attr)}</td><td>${x.target}</td><td>${x.hit}</td><td>${pct(x.hitRate)}</td><td>${pct(x.roi)}</td></tr>`).join('');
  return card(`<div class="title">低回収率ランキング</div><p class="subtle">出現数はあるが回収率が低い属性を確認します。</p>${table(['順位','区分','属性','対象R','的中R','的中率','回収率'],body,'データなし')}`);
}
function normalizeRecommendKeys(keys){
  const mapOne=(x)=>{
    if(!x)return '';
    if(typeof x==='object') return mapOne(x.ticket||x.key||x.type||x.name||x.label||x.value);
    const t=String(x).trim();
    if(t==='umaren'||t==='馬連')return 'umaren';
    if(t==='wide'||t==='ワイド')return 'wide';
    if(t==='sanrenpuku'||t==='3連複'||t==='三連複')return 'sanrenpuku';
    return '';
  };
  let src=[];
  if(Array.isArray(keys)) src=keys;
  else if(keys&&typeof keys==='object'){
    ['umaren','wide','sanrenpuku','馬連','ワイド','3連複','三連複'].forEach(k=>{if(keys[k])src.push(k);});
    if(!src.length&&(keys.ticket||keys.key||keys.type||keys.name||keys.label||keys.value))src=[keys];
  }else if(typeof keys==='string'){
    src=keys.split(/[\n,、/・+＋]+/).map(x=>x.trim()).filter(Boolean);
  }
  const out=[];
  src.forEach(x=>{const k=mapOne(x); if(k&&!out.includes(k))out.push(k);});
  return out;
}
function recommendLabelFromKeys(keys){
  const arr=normalizeRecommendKeys(keys);
  if(!arr.length)return '推奨なし';
  return arr.map(k=>TICKETS.find(x=>x[0]===k)?.[1]||k).join('・');
}
function groupRanking(rows,mode){
  const map={};
  rows.forEach(x=>{
    const r=x.race, key=mode==='judge'?(judgeOf(r)||'未設定'):recommendLabelFromKeys(r.prediction&&r.prediction.recommend);
    (map[key]=map[key]||[]).push(x);
  });
  const body=Object.entries(map).map(([label,rs])=>({label,summary:summarize(rs)})).sort((a,b)=>b.summary.roi-a.summary.roi||b.summary.races-a.summary.races).map((g,i)=>{
    const s=g.summary;
    return `<tr><td>${i+1}</td><td class="left">${esc(g.label)}</td><td>${s.races}</td><td>${s.hit}</td><td>${pct(s.tickets.umaren.hitRate)}</td><td>${pct(s.tickets.umaren.roi)}</td><td>${pct(s.tickets.wide.hitRate)}</td><td>${pct(s.tickets.wide.roi)}</td><td>${pct(s.tickets.sanrenpuku.hitRate)}</td><td>${pct(s.tickets.sanrenpuku.roi)}</td></tr>`;
  }).join('');
  const title=mode==='judge'?'判定別ランキング':'推奨馬券別ランキング';
  return card(`<div class="title">${title}</div><p class="subtle">的中レース数は、各馬券のどれかが1つでも的中したレース数です。</p>${table(['順位',mode==='judge'?'判定':'推奨馬券','対象R','的中R','馬連的中率','馬連回収率','ワイド的中率','ワイド回収率','3連複的中率','3連複回収率'],body,'データなし')}`);
}

function markPatternStats(rows){
  const map={};
  const ensure=(group,label)=>map[group+'|'+label]||(map[group+'|'+label]={group,label,target:0,win:0,place:0,cost:0,pay:0,pops:[]});
  (rows||[]).forEach(x=>{
    const r=x.race||{}, marks=(r.prediction&&r.prediction.marks)||{};
    const first=new Set(firstNums(r)), place=new Set(placeNums(r));
    (r.horses||[]).forEach(h=>{
      const no=int(h.no); if(!no)return;
      const mark=marks[String(no)]||marks[no]||'';
      const group=mark || '印なし';
      const labels=mark ? markClassLabels(mark,h,r).map(v=>String(v).replace(/^([◎○▲])\s*/,'')) : noMarkPatternLabels(h,r);
      const uniqLabels=[...new Set(labels&&labels.length?labels:['定義なし'])];
      uniqLabels.forEach(label=>{
        const st=ensure(group,label); st.target++; st.cost+=100;
        const pop=int(h.popularity); if(pop)st.pops.push(pop);
        if(first.has(no)){ st.win++; st.pay+=tanshoPayForHorse(r,no); }
        if(place.has(no)) st.place++;
      });
    });
  });
  return Object.values(map).map(st=>{
    st.winRate=st.target?st.win/st.target*100:0;
    st.placeRate=st.target?st.place/st.target*100:0;
    st.roi=st.cost?st.pay/st.cost*100:0;
    st.avgPop=avg(st.pops); st.medPop=median(st.pops);
    return st;
  }).sort((a,b)=>{
    const order={'◎':1,'○':2,'▲':3,'印なし':4};
    return (order[a.group]||9)-(order[b.group]||9) || b.roi-a.roi || b.placeRate-a.placeRate || b.target-a.target;
  });
}
function markPatternRows(rows,group){
  return markPatternStats(rows).filter(x=>x.group===group);
}

function markPatternFullLabelsForHorse(r,h){
  const marks=(r&&r.prediction&&r.prediction.marks)||{};
  const mark=marks[String(h&&h.no)]||marks[h&&h.no]||'';
  const labels=mark ? markClassLabels(mark,h,r).map(v=>String(v).replace(/^([◎○▲])\s*/,'')) : noMarkPatternLabels(h,r);
  return {mark:mark||'印なし', labels:[...new Set(labels&&labels.length?labels:['定義なし'])]};
}
function markNeighborPatternStats(rows){
  const map={};
  const ensure=(group,label)=>map[group+'|'+label]||(map[group+'|'+label]={group,label,target:0,selfWin:0,selfPlace:0,leftPlace:0,rightPlace:0,neighborPlace:0,selfOut:0,thirdSelf:0,thirdNeighbor:0,cost:0,pay:0,pops:[]});
  (rows||[]).forEach(x=>{
    const r=x.race||{};
    const first=new Set(firstNums(r)), place=new Set(placeNums(r)), third=new Set((r.result&&r.result.thirds||[]).map(int).filter(Boolean));
    (r.horses||[]).forEach(h=>{
      const no=int(h.no); if(!no)return;
      const info=markPatternFullLabelsForHorse(r,h);
      info.labels.forEach(label=>{
        const st=ensure(info.mark,label); st.target++; st.cost+=100;
        const pop=int(h.popularity); if(pop)st.pops.push(pop);
        const l=no-1, rr=no+1;
        const selfP=place.has(no), leftP=place.has(l), rightP=place.has(rr), neighP=leftP||rightP;
        if(first.has(no)){ st.selfWin++; st.pay+=tanshoPayForHorse(r,no); }
        if(selfP) st.selfPlace++;
        if(leftP) st.leftPlace++;
        if(rightP) st.rightPlace++;
        if(neighP) st.neighborPlace++;
        if(!selfP) st.selfOut++;
        if(third.has(no)) st.thirdSelf++;
        if(third.has(l)||third.has(rr)) st.thirdNeighbor++;
      });
    });
  });
  return Object.values(map).map(st=>{
    st.selfWinRate=st.target?st.selfWin/st.target*100:0;
    st.selfPlaceRate=st.target?st.selfPlace/st.target*100:0;
    st.leftPlaceRate=st.target?st.leftPlace/st.target*100:0;
    st.rightPlaceRate=st.target?st.rightPlace/st.target*100:0;
    st.neighborPlaceRate=st.target?st.neighborPlace/st.target*100:0;
    st.selfOutRate=st.target?st.selfOut/st.target*100:0;
    st.thirdSelfRate=st.target?st.thirdSelf/st.target*100:0;
    st.thirdNeighborRate=st.target?st.thirdNeighbor/st.target*100:0;
    st.roi=st.cost?st.pay/st.cost*100:0;
    st.avgPop=avg(st.pops); st.medPop=median(st.pops);
    const maxRate=Math.max(st.selfPlaceRate,st.neighborPlaceRate,st.thirdSelfRate,st.thirdNeighborRate);
    st.role = maxRate===st.selfPlaceRate ? '軸向き' : (maxRate===st.neighborPlaceRate ? '相手向き' : '3頭目向き');
    return st;
  }).sort((a,b)=>b.selfPlaceRate-a.selfPlaceRate || b.neighborPlaceRate-a.neighborPlaceRate || b.roi-a.roi || b.target-a.target);
}
function markNeighborPatternTable(rows,limit){
  const list=markNeighborPatternStats(rows).slice(0,limit||40);
  const body=list.map((x,i)=>`<tr><td>${i+1}</td><td class="left">${esc(x.group)} ${esc(x.label)}</td><td>${x.target}</td><td>${x.selfWin}</td><td>${x.selfPlace}</td><td>${pct(x.selfPlaceRate)}</td><td>${x.leftPlace}</td><td>${pct(x.leftPlaceRate)}</td><td>${x.rightPlace}</td><td>${pct(x.rightPlaceRate)}</td><td>${x.neighborPlace}</td><td>${pct(x.neighborPlaceRate)}</td><td>${pct(x.selfOutRate)}</td><td>${pct(x.roi)}</td><td>${esc(x.role)}</td></tr>`).join('');
  return table(['順位','印/定義','対象馬数','本人1着','本人3着内','本人複勝率','左隣3着内','左隣率','右隣3着内','右隣率','左右隣3着内','隣率','本人圏外率','本人単勝回収率','判定'],body,'データなし');
}
function markRolePatternTable(rows,limit){
  const list=markNeighborPatternStats(rows).slice().sort((a,b)=>{
    const ar=(a.selfPlaceRate*1.2)+(a.neighborPlaceRate)+(a.thirdSelfRate*0.8)+(a.roi/20);
    const br=(b.selfPlaceRate*1.2)+(b.neighborPlaceRate)+(b.thirdSelfRate*0.8)+(b.roi/20);
    return br-ar || b.target-a.target;
  }).slice(0,limit||30);
  const body=list.map((x,i)=>`<tr><td>${i+1}</td><td class="left">${esc(x.group)} ${esc(x.label)}</td><td>${x.target}</td><td>${esc(x.role)}</td><td>${pct(x.selfPlaceRate)}</td><td>${pct(x.neighborPlaceRate)}</td><td>${pct(x.thirdSelfRate)}</td><td>${pct(x.thirdNeighborRate)}</td><td>${pct(x.roi)}</td><td>${Math.round(x.avgPop*10)/10} / ${Math.round(x.medPop*10)/10}</td></tr>`).join('');
  return table(['順位','印/定義','対象馬数','向き','軸向き(本人複勝率)','相手向き(隣複勝率)','3頭目本人率','3頭目隣率','本人単勝回収率','人気 平均/中央値'],body,'データなし');
}
function markNeighborAnalysisBlock(label,rs){
  return card(`<div class="title">印定義×本人・隣分析（${esc(label)}）</div><p class="hint">前走3走の並び・数字パターンごとに、その馬自身が来るのか、左隣・右隣が来るのかを集計します。軸向き・相手向き・3頭目向きの判断材料として使います。</p><h4>本人・左隣・右隣ランキング</h4>${markNeighborPatternTable(rs,40)}<h4>軸・相手・3頭目向きランキング</h4>${markRolePatternTable(rs,30)}`);
}
function pushMarkNeighborCsvSections(rows,out,prefix){
  prefix=prefix?String(prefix).trim():'トータル';
  out.push([]); out.push([`【印定義×本人・隣分析 ${prefix}】`]);
  out.push(['順位','印','定義','対象馬数','本人1着','本人3着内','本人複勝率','左隣3着内','左隣率','右隣3着内','右隣率','左右隣3着内','隣率','本人圏外率','本人単勝回収率','3頭目本人率','3頭目隣率','判定','人気平均','人気中央値']);
  markNeighborPatternStats(rows).forEach((x,i)=>out.push([i+1,x.group,x.label,x.target,x.selfWin,x.selfPlace,pct(x.selfPlaceRate),x.leftPlace,pct(x.leftPlaceRate),x.rightPlace,pct(x.rightPlaceRate),x.neighborPlace,pct(x.neighborPlaceRate),pct(x.selfOutRate),pct(x.roi),pct(x.thirdSelfRate),pct(x.thirdNeighborRate),x.role,Math.round(x.avgPop*10)/10,Math.round(x.medPop*10)/10]));
}
function markPatternTable(rows,group){
  const list=markPatternRows(rows,group);
  const body=list.map((x,i)=>`<tr><td>${i+1}</td><td class="left">${esc(x.label)}</td><td>${x.target}</td><td>${x.win}</td><td>${x.place}</td><td>${pct(x.winRate)}</td><td>${pct(x.placeRate)}</td><td>${pct(x.roi)}</td><td>${Math.round(x.avgPop*10)/10} / ${Math.round(x.medPop*10)/10}</td></tr>`).join('');
  return table(['順位','定義','対象馬数','1着数','3着内数','単勝率','複勝率','単勝回収率','人気 平均/中央値'],body,'データなし');
}
function markPatternAnalysisSections(rows){
  const section=(label,rs)=>card(`<div class="title">印分析・好走パターン分析（${esc(label)}）</div><p class="hint">印あり馬は◎/○/▲ごとの定義、印なし馬は共通定義（1桁・2桁・偶数・奇数・上り系・下り系・ゾロ目・挟み・計算・5→5・5→5着・5→9・5→9着・9→5・9→5着・9→9・9→9着・56系・59系・69系・5着・6着・9着・23・32）で分析します。印そのものではなく、どの前走並びの馬が来るかを確認します。</p><h4>◎</h4>${markPatternTable(rs,'◎')}<h4>○</h4>${markPatternTable(rs,'○')}<h4>▲</h4>${markPatternTable(rs,'▲')}<h4>印なし</h4>${markPatternTable(rs,'印なし')}`);
  let html=section('トータル',rows)+markNeighborAnalysisBlock('トータル',rows);
  if(hasRecent30(rows)){ const recent=recent30Rows(rows); html+=section('直近30R',recent)+markNeighborAnalysisBlock('直近30R',recent); }
  return html;
}
function pushMarkPatternCsvSections(rows,out,prefix){
  prefix=prefix?String(prefix).trim():'トータル';
  out.push([]); out.push([`【印分析・好走パターン分析 ${prefix}】`]);
  ['◎','○','▲','印なし'].forEach(group=>{
    out.push([]); out.push([`${group}`]);
    out.push(['順位','区分','定義','対象馬数','1着数','3着内数','単勝率','複勝率','単勝回収率','人気平均','人気中央値']);
    markPatternRows(rows,group).forEach((x,i)=>out.push([i+1,group,x.label,x.target,x.win,x.place,pct(x.winRate),pct(x.placeRate),pct(x.roi),Math.round(x.avgPop*10)/10,Math.round(x.medPop*10)/10]));
  });
}

function detailedRankingSections(rows){
  return attrRankingSections(rows);
}


function pushSummaryRankingCsv(rows,out,prefix){
  prefix = prefix ? String(prefix).trim() : '';
  const titleOf = (name)=> prefix ? `【${prefix} ${name}】` : `【${name}】`;
  const header=summaryRankColumns();
  out.push([]); out.push([titleOf('予想成績ランキング')]); out.push(header);
  const ss=summarize(rows); const u=ss.tickets.umaren, w=ss.tickets.wide, f=ss.tickets.sanrenpuku;
  out.push([1,'全体',ss.races,ss.axisWin,ss.axisPlace,pct(ss.axisWinRate),pct(axisTanshoRoi(rows)),pct(ss.axisPlaceRate),pct(ss.roi),u.hit,pct(u.hitRate),pct(u.roi),w.hit,pct(w.hitRate),pct(w.roi),f.hit,pct(f.hitRate),pct(f.roi)]);
  const pushGroup=(mode,title)=>{
    out.push([]); out.push([titleOf(title)]); out.push(header);
    groupedSummaryRankRows(rows,mode).forEach((g,i)=>{
      const s=g.summary, u=s.tickets.umaren, w=s.tickets.wide, f=s.tickets.sanrenpuku;
      out.push([i+1,g.label,s.races,s.axisWin,s.axisPlace,pct(s.axisWinRate),pct(axisTanshoRoi(g.rows)),pct(s.axisPlaceRate),pct(s.roi),u.hit,pct(u.hitRate),pct(u.roi),w.hit,pct(w.hitRate),pct(w.roi),f.hit,pct(f.hitRate),pct(f.roi)]);
    });
  };
  pushGroup('judge','判定別ランキング');
  pushGroup('recommend','推奨馬券別ランキング');
}
function pushAttributeCsvSections(rows,out,prefix,categoryLabel,opts){
  opts=opts||{};
  prefix = prefix ? String(prefix).trim() : '';
  categoryLabel = categoryLabel ? String(categoryLabel).trim() : '全体';
  const titleOf=(title)=>prefix ? `${prefix} ${title}` : title;
  const pushAttr=(kind,title)=>{
    out.push([]); out.push([`【${titleOf(title)}】`]);
    if(kind==='fukusho'){
      out.push(['順位','カテゴリー','属性','対象R','的中R','馬連的中R','ワイド的中R','3連複的中R','人気平均','人気中央値','的中率','1/3判定','AND判定','掲載理由']);
      makeAttrStats(rows,kind,opts).forEach((x,i)=>out.push([i+1,categoryLabel,x.attr,x.target,x.hit,attrTicketHitTotal(x,'umaren'),attrTicketHitTotal(x,'wide'),attrTicketHitTotal(x,'sanrenpuku'),Math.round(x.avgPop*10)/10,Math.round(x.medPop*10)/10,pct(x.hitRate),attrShowByShare(x),attrShowByTicketHit(x),x.showReason]));
    }else{
      out.push(['順位','カテゴリー','属性','対象R','的中R','馬連的中R','ワイド的中R','3連複的中R','人気平均','人気中央値','的中率','回収率','1/3判定','AND判定','掲載理由']);
      makeAttrStats(rows,kind,opts).forEach((x,i)=>out.push([i+1,categoryLabel,x.attr,x.target,x.hit,attrTicketHitTotal(x,'umaren'),attrTicketHitTotal(x,'wide'),attrTicketHitTotal(x,'sanrenpuku'),Math.round(x.avgPop*10)/10,Math.round(x.medPop*10)/10,pct(x.hitRate),pct(x.roi),attrShowByShare(x),attrShowByTicketHit(x),x.showReason]));
    }
  };
  out.push([]); out.push([`【${prefix?prefix+' ':''}属性ランキング】`]);
  pushAttr('tansho','単勝属性ランキング');
  pushAttr('fukusho','複勝属性ランキング');
  pushAttr('umaren','馬連属性ランキング');
  pushAttr('wide','ワイド属性ランキング');
  pushAttr('sanrenpuku','3連複属性ランキング');
}
function pushCategoryAttributeCsvSections(rows,out){
  makeCategoryAttributeRankings(rows).forEach(g=>{
    const recentJudge=hasRecent30(g.rows);
    pushAttributeCsvSections(g.rows,out,`カテゴリー別属性ランキング ${g.label} トータル`,g.label,recentJudge?{disableTicketHit:true,period:'total'}:{period:'total'});
    if(recentJudge) pushAttributeCsvSections(recent30Rows(g.rows),out,`カテゴリー別属性ランキング ${g.label} 直近30R`,g.label,{period:'recent'});
  });
}
function pushImprovementCsvSections(rows,out){
  const pushRows=(title,list,axisMode)=>{
    out.push([]); out.push([`【${title}】`]);
    if(axisMode){
      out.push(['順位','属性','対象R','出現R','軸単勝率','軸回収率','軸複勝率','全体(馬連+ワイド+3連複)回収率','馬連的中率','馬連回収率','ワイド的中率','ワイド回収率','3連複的中率','3連複回収率']);
      list.forEach((x,i)=>out.push([i+1,x.attr,x.target,x.occurrence,pct(x.axisWinRate),pct(x.axisRoi),pct(x.axisPlaceRate),pct(x.overallRoi),pct(x.tickets.umaren.hitRate),pct(x.tickets.umaren.roi),pct(x.tickets.wide.hitRate),pct(x.tickets.wide.roi),pct(x.tickets.sanrenpuku.hitRate),pct(x.tickets.sanrenpuku.roi)]));
    }else{
      out.push(['順位','属性','対象R','出現R','出現率','全体(馬連+ワイド+3連複)回収率','馬連的中率','馬連回収率','ワイド的中率','ワイド回収率','3連複的中率','3連複回収率']);
      list.forEach((x,i)=>out.push([i+1,x.attr,x.target,x.occurrence,pct(x.occurrenceRate),pct(x.overallRoi),pct(x.tickets.umaren.hitRate),pct(x.tickets.umaren.roi),pct(x.tickets.wide.hitRate),pct(x.tickets.wide.roi),pct(x.tickets.sanrenpuku.hitRate),pct(x.tickets.sanrenpuku.roi)]));
    }
  };
  out.push([]); out.push(['【改善分析ランキング】']);
  const axisScope=rows.filter(x=>!x.axis.place);
  pushRows('軸NGランキング', improvementRows(rows, makeAttrOccurrenceMap(axisScope, x=>placeNums(x.race)), 'axis', axisScope), true);
  const partnerScope=rows.filter(x=>collectPartnerMissNums(x).length>0);
  pushRows('相手抜けランキング', improvementRows(rows, makeAttrOccurrenceMap(partnerScope, collectPartnerMissNums), 'partner', partnerScope), false);
  const comboScope=rows.filter(x=>collectComboMissNums(x).length>0);
  pushRows('組み合わせ抜けランキング', improvementRows(rows, makeAttrOccurrenceMap(comboScope, collectComboMissNums), 'partner', comboScope), false);
  out.push([]); out.push(['【低回収率ランキング】']); out.push(['順位','区分','属性','対象R','的中R','的中率','回収率']);
  const lists=[['単勝',makeAttrStats(rows,'tansho')],['馬連',makeAttrStats(rows,'umaren')],['ワイド',makeAttrStats(rows,'wide')],['3連複',makeAttrStats(rows,'sanrenpuku')]];
  const all=[]; lists.forEach(([label,list])=>list.forEach(x=>all.push({label,attr:x.attr,target:x.target,hit:x.hit,hitRate:x.hitRate,roi:x.roi})));
  all.sort((a,b)=>a.roi-b.roi||b.target-a.target).slice(0,30).forEach((x,i)=>out.push([i+1,x.label,x.attr,x.target,x.hit,pct(x.hitRate),pct(x.roi)]));
}
function pushDetailedCsvSections(rows,out){
  pushAttributeCsvSections(rows,out);
}

function renderSummary(s){
  const axisRoi = axisTanshoRoi((s && s.__rows) || []);
  const boxes=[
    ['対象R',s.races,''],
    ['全体回収率',pct(s.roi),`${yen(s.pay)} / ${yen(s.cost)}`],
    ['全体的中率',pct(s.hitRate),`${s.hit}/${s.races}`],
    ['軸単勝率',pct(s.axisWinRate),`${s.axisWin}/${s.races}`],
    ['軸回収率',pct(axisRoi),'軸単勝100円換算'],
    ['軸複勝率',pct(s.axisPlaceRate),`${s.axisPlace}/${s.races}`]
  ];
  TICKETS.forEach(([k,l])=>{const t=s.tickets[k]; boxes.push([`${l}回収率`,pct(t.roi),`${t.hit}/${t.races} 的中率 ${pct(t.hitRate)}`]);});
  return `<div class="summaryCards">${boxes.map(b=>`<div class="summaryBox">${esc(b[0])}<br><b>${esc(b[1])}</b><div class="subtle">${esc(b[2])}</div></div>`).join('')}</div>`;
}

function summaryRankColumns(){
  return ['順位','区分','対象R','軸単勝的中R','軸複勝的中R','軸単勝率','軸回収率','軸複勝率','全体回収率','馬連的中R','馬連的中率','馬連回収率','ワイド的中R','ワイド的中率','ワイド回収率','3連複的中R','3連複的中率','3連複回収率'];
}
function summaryRankRow(label, rows, rank){
  const s=summarize(rows||[]);
  const u=s.tickets.umaren, w=s.tickets.wide, f=s.tickets.sanrenpuku;
  return `<tr><td>${rank||1}</td><td class="left">${esc(label)}</td><td>${s.races}</td><td>${s.axisWin}</td><td>${s.axisPlace}</td><td>${pct(s.axisWinRate)}</td><td>${pct(axisTanshoRoi(rows||[]))}</td><td>${pct(s.axisPlaceRate)}</td><td>${pct(s.roi)}</td><td>${u.hit}</td><td>${pct(u.hitRate)}</td><td>${pct(u.roi)}</td><td>${w.hit}</td><td>${pct(w.hitRate)}</td><td>${pct(w.roi)}</td><td>${f.hit}</td><td>${pct(f.hitRate)}</td><td>${pct(f.roi)}</td></tr>`;
}
function groupedSummaryRankRows(rows,mode){
  const map={};
  rows.forEach(x=>{
    const r=x.race;
    const key=mode==='judge'?(judgeOf(r)||'未設定'):recommendLabelFromKeys(r.prediction&&r.prediction.recommend);
    (map[key]=map[key]||[]).push(x);
  });
  return Object.entries(map).map(([label,rs])=>({label,rows:rs,summary:summarize(rs)})).sort((a,b)=>b.summary.roi-a.summary.roi||b.summary.hitRate-a.summary.hitRate||b.summary.races-a.summary.races);
}
function summaryRankingCards(rows){
  const parts=[];
  const addPeriod=(label,rs)=>{
    const overall=table(summaryRankColumns(), summaryRankRow(label, rs, 1), 'データなし');
    const judgeRows=groupedSummaryRankRows(rs,'judge').map((g,i)=>summaryRankRow(g.label,g.rows,i+1)).join('');
    const recRows=groupedSummaryRankRows(rs,'recommend').map((g,i)=>summaryRankRow(g.label,g.rows,i+1)).join('');
    parts.push(card(`<div class="title">予想成績（${esc(label)}）</div><p class="subtle">${esc(label)}の成績です。各馬券は1Rに複数的中しても、的中レース数は1回としてカウントします。</p>${overall}`));
    parts.push(card(`<div class="title">判定別ランキング（${esc(label)}）</div><p class="subtle">判定ごとの対象R・軸成績・各馬券の的中率/回収率を確認します。</p>${table(summaryRankColumns(), judgeRows, 'データなし')}`));
    parts.push(card(`<div class="title">推奨馬券別ランキング（${esc(label)}）</div><p class="subtle">推奨馬券ごとの対象R・軸成績・各馬券の的中率/回収率を確認します。</p>${table(summaryRankColumns(), recRows, 'データなし')}`));
  };
  addPeriod('トータル', rows);
  if(hasRecent30(rows)) addPeriod(periodLabel(rows,true), recent30Rows(rows));
  return parts.join('');
}
function ruleRankingRowsFor(rows,kind){
  const groups=[statsForGroup(rows||[],'全体','全体'), ...makeCategoryOnlyRankings(rows||[])];
  return groups.map((g,i)=>{
    const s=g.summary, tk=kind&&s.tickets[kind];
    if(kind==='axis') return `<tr><td>${i+1}</td><td class="left">${esc(g.label)}</td><td>${s.races}</td><td>${pct(s.axisPlaceRate)}</td><td>${pct(s.axisWinRate)}</td><td>${pct(s.roi)}</td></tr>`;
    if(tk) return `<tr><td>${i+1}</td><td class="left">${esc(g.label)}</td><td>${s.races}</td><td>${pct(tk.hitRate)}</td><td>${pct(tk.roi)}</td><td>${tk.hit}/${tk.races}</td></tr>`;
    return `<tr><td>${i+1}</td><td class="left">${esc(g.label)}</td><td>${s.races}</td><td>${pct(s.hitRate)}</td><td>${pct(s.roi)}</td><td>${pct(s.axisPlaceRate)}</td></tr>`;
  }).join('');
}
function ruleRankingTable(rows,kind){
  if(kind==='axis') return table(['順位','区分','対象R','軸複勝率','軸単勝率','全体回収率'], ruleRankingRowsFor(rows,'axis'), 'データなし');
  if(['umaren','wide','sanrenpuku'].includes(kind)){
    const label=TICKETS.find(x=>x[0]===kind)[1];
    return table(['順位','区分','対象R',`${label}的中率`,`${label}回収率`,'的中R/対象R'], ruleRankingRowsFor(rows,kind), 'データなし');
  }
  return table(['順位','区分','対象R','全体的中率','全体回収率','軸複勝率'], ruleRankingRowsFor(rows,'all'), 'データなし');
}
function ruleRankingSections(rows){
  const keys=[['all','全体'],['axis','軸'],['umaren','馬連'],['wide','ワイド'],['sanrenpuku','3連複']];
  const renderPeriod=(label,rs)=>card(`<div class="title">予想ルールランキング（${esc(label)}）</div><p class="subtle">全体とカテゴリー別を同じ表で確認します。カテゴリーは「グレード / 馬場 / 条件」です。</p>${keys.map(([k,l])=>`<details ${k==='all'?'open':''}><summary><b>${esc(l)}ランキング</b></summary>${ruleRankingTable(rs,k)}</details>`).join('')}`);
  return renderPeriod('トータル', rows)+(hasRecent30(rows)?renderPeriod(periodLabel(rows,true), recent30Rows(rows)):'');
}
function attrRankingBlock(rows,label,opts){
  opts=opts||{};
  const safeLabel = label ? String(label) : 'トータル';
  return card(`<div class="title">属性ランキング（${esc(safeLabel)}）</div><p class="hint">予想結果・AI振り返り・相談ヒントに上がっている属性を元に作成します。${esc(safeLabel)}対象レースの1/3以上に出現、または追加掲載条件（馬連・ワイド・3連複が全て3R以上的中 AND どれかが2R以上的中）を満たした属性を掲載します。</p>`)+
    attrRankingCard(rows,'tansho',`${safeLabel} 単勝属性ランキング`,opts)+
    attrRankingCard(rows,'fukusho',`${safeLabel} 複勝属性ランキング`,opts)+
    attrRankingCard(rows,'umaren',`${safeLabel} 馬連属性ランキング`,opts)+
    attrRankingCard(rows,'wide',`${safeLabel} ワイド属性ランキング`,opts)+
    attrRankingCard(rows,'sanrenpuku',`${safeLabel} 3連複属性ランキング`,opts);
}
function attrRankingSections(rows){
  const total = attrRankingBlock(rows,'トータル') + (hasRecent30(rows) ? attrRankingBlock(recent30Rows(rows),'直近30R') : '');
  const categoryDetails = makeCategoryAttributeRankings(rows).map(g=>{
    const recentJudge=hasRecent30(g.rows);
    const recent = recentJudge ?
      attrRankingCard(recent30Rows(g.rows),'tansho',`${g.label} 直近30R 単勝属性ランキング`,{period:'recent'})+
      attrRankingCard(recent30Rows(g.rows),'fukusho',`${g.label} 直近30R 複勝属性ランキング`,{period:'recent'})+
      attrRankingCard(recent30Rows(g.rows),'umaren',`${g.label} 直近30R 馬連属性ランキング`,{period:'recent'})+
      attrRankingCard(recent30Rows(g.rows),'wide',`${g.label} 直近30R ワイド属性ランキング`,{period:'recent'})+
      attrRankingCard(recent30Rows(g.rows),'sanrenpuku',`${g.label} 直近30R 3連複属性ランキング`,{period:'recent'}) : '';
    const totalOpts=recentJudge?{disableTicketHit:true,period:'total'}:{period:'total'};
    return `<details><summary><b>${esc(g.label)}</b>（${g.summary.races}R）</summary>`+
      attrRankingCard(g.rows,'tansho',`${g.label} トータル 単勝属性ランキング`,totalOpts)+
      attrRankingCard(g.rows,'fukusho',`${g.label} トータル 複勝属性ランキング`,totalOpts)+
      attrRankingCard(g.rows,'umaren',`${g.label} トータル 馬連属性ランキング`,totalOpts)+
      attrRankingCard(g.rows,'wide',`${g.label} トータル ワイド属性ランキング`,totalOpts)+
      attrRankingCard(g.rows,'sanrenpuku',`${g.label} トータル 3連複属性ランキング`,totalOpts)+
      recent+
      `</details>`;
  }).join('');
  return total + card(`<div class="title">カテゴリー別属性ランキング</div><p class="hint">現在の予想カテゴリー単位（グレード / 馬場 / 条件）ごとに、カテゴリー掲載判定（基本3R、G1/J重賞は2R）を先に通過したカテゴリーだけ、属性掲載判定（1/3以上またはAND的中条件）を行います。対象Rが必要件数未満のカテゴリーは、属性側の条件を満たしても表示しません。直近30Rで判定するカテゴリーは、AND的中条件を直近30R側だけで判定し、トータル側ではAND的中条件だけでは表示しません。</p>${categoryDetails||'<p class="subtle">データなし</p>'}`);
}


/* ===== Ver2_218 decision-combo pattern analysis ===== */
function lastDigit(n){ n=int(n); return ((n%10)+10)%10; }
function hFrame(r,no){ const h=horseByNo(r,no); return int(h&&h.frame)||C.frameOf(int(no), r.headCount||((r.horses||[]).length)); }
function hPop(r,no){ const h=horseByNo(r,no); return int(h&&h.popularity); }
function pairPatternLabels(r,a,b){
  a=int(a); b=int(b); if(!a||!b)return [];
  const fa=hFrame(r,a), fb=hFrame(r,b), da=lastDigit(a), db=lastDigit(b), out=[];
  const add=x=>{ if(x&&!out.includes(x)) out.push(x); };
  if(Math.abs(a-b)===1) add('連番');
  if(da===db) add('ゾロ目');
  if(Math.abs(a-b)===9 && Math.min(a,b)>=1 && Math.max(a,b)<=18) add('表裏');
  if(lastDigit(a+b)===9) add('和9');
  if(fa===fb) add('同枠');
  if(fa===5 || fb===5 || fiveKei(horseByNo(r,a),r) || fiveKei(horseByNo(r,b),r)) add('5系');
  if(fa===db || fb===da) add('枠↔馬');
  if(lastDigit(fa+a)===db || lastDigit(fa+a)===fb || lastDigit(fb+b)===da || lastDigit(fb+b)===fa) add('枠+馬');
  if(Math.abs(a-b)===2) add('飛び');
  const pa=hPop(r,a), pb=hPop(r,b); if(pa&&pb&&lastDigit(pa+pb)===9) add('人気9');
  return out;
}
function seqNoOrDigit(nums){
  const a=[...new Set((nums||[]).map(int).filter(Boolean))].sort((x,y)=>x-y);
  if(a.length!==3)return false;
  if(a[1]===a[0]+1 && a[2]===a[1]+1)return true;
  const d=[...new Set(a.map(lastDigit))].sort((x,y)=>x-y);
  return d.length===3 && d[1]===d[0]+1 && d[2]===d[1]+1;
}
function calcDigitsByOrder(nums){
  if((nums||[]).length!==3)return false;
  const a=nums.map(lastDigit), x=a[0], y=a[1], z=a[2];
  return (x+y===z)||(y+z===x)||(x-y===z)||(y-x===z)||(y-z===x)||(z-y===x);
}
function trioPatternLabels(r,nums){
  nums=(nums||[]).map(int).filter(Boolean); if(nums.length!==3)return [];
  const out=[], add=x=>{ if(x&&!out.includes(x)) out.push(x); };
  if(lastDigit(nums.reduce((s,n)=>s+n,0))===9) add('和9');
  const ps=nums.map(n=>hPop(r,n)); if(ps.every(Boolean)&&lastDigit(ps.reduce((s,n)=>s+n,0))===9) add('人気9');
  if(calcDigitsByOrder(nums)) add('計算');
  return out;
}
function markRelationLabelsForCombo(r,nums){
  const marks=(r.prediction&&r.prediction.marks)||{}; const out=[]; const add=x=>{ if(x&&!out.includes(x)) out.push(x); };
  (nums||[]).forEach(no=>{ const m=marks[String(no)]||marks[no]||''; if(['◎','○','▲'].includes(m)) add(m); });
  return out;
}
function onePopRelationLabelsForCombo(r,nums){
  const out=[]; const add=x=>{ if(x&&!out.includes(x)) out.push(x); };
  (nums||[]).forEach(no=>{ if(hPop(r,no)===1) add('1人気'); });
  return out;
}
function actualCombosForDecision(r,key){
  return (C.autoResultCombos((r&&r.result)||{})[key]||[]).map(c=>String(c||'').split('-').map(int).filter(Boolean)).filter(a=>a.length>=2);
}
function decisionPayForNums(r,key,nums){ return payForCombo((r&&r.result)||{}, key, (nums||[]).join('-')); }

/* ===== Ver2_224 advanced relation rankings ===== */
function relationLabelsBetweenHorseAndNums(r,targetNo,nums){
  targetNo=int(targetNo); nums=(nums||[]).map(int).filter(Boolean);
  const out=[]; const add=x=>{ if(x&&!out.includes(x)) out.push(x); };
  nums.forEach(n=>{
    if(!n)return;
    if(n===targetNo){ add('本人'); return; }
    pairPatternLabels(r,n,targetNo).forEach(add);
  });
  return out;
}
function markHorsesOf(r){
  const marks=(r&&r.prediction&&r.prediction.marks)||{};
  return (r.horses||[]).map(h=>({no:int(h.no), name:h.name||'', mark:marks[String(h.no)]||marks[h.no]||''})).filter(x=>x.no&&['◎','○','▲'].includes(x.mark));
}
function pop1HorseOf(r){
  return (r.horses||[]).find(h=>int(h.popularity)===1)||null;
}
function relationStatEnsure(map,key,label,ticket){
  return map[key]||(map[key]={label,ticket:ticket||'',target:0,hit:0,pay:0});
}
function addRelationPayStat(st,pay){ st.target++; st.hit++; st.pay += num(pay); }
function finishRelationStats(map){
  return Object.values(map).map(st=>{ st.hitRate=st.target?st.hit/st.target*100:0; st.roi=st.target?st.pay/(st.target*100)*100:0; return st; }).sort((a,b)=>b.roi-a.roi||b.hitRate-a.hitRate||b.target-a.target||String(a.label).localeCompare(String(b.label),'ja'));
}
function relationShareGroupKey(x){
  const parts=String(x.label||'').split('×');
  if(parts.length<=1) return `${x.ticket||''}|${x.label||''}`;
  return `${x.ticket||''}|${parts.slice(0,-1).join('×')}`;
}
function addRelationShares(list){
  const totals={};
  (list||[]).forEach(x=>{ const k=relationShareGroupKey(x); totals[k]=(totals[k]||0)+(x.target||0); });
  (list||[]).forEach(x=>{ const k=relationShareGroupKey(x); x.share=totals[k]?((x.target||0)/totals[k]*100):0; });
  return list;
}
function relationDefinitionOfLabel(label){
  const parts=String(label||'').split('×');
  return parts.length?parts[parts.length-1]:String(label||'');
}
function relationGroupOfLabel(label){
  const parts=String(label||'').split('×');
  return parts.length>1?parts.slice(0,-1).join('×'):String(label||'');
}
function advancedRelationStats(rows){
  const markMap={}, pop1Map={}, holeMap={};
  const tickets=[['umaren','馬連'],['wide','ワイド'],['sanrenpuku','3連複']];
  (rows||[]).forEach(x=>{
    const r=x.race||{};
    const marks=markHorsesOf(r);
    const pop1=pop1HorseOf(r);
    tickets.forEach(([key,ticketLabel])=>{
      actualCombosForDecision(r,key).forEach(nums=>{
        const pay=decisionPayForNums(r,key,nums);
        marks.forEach(mh=>{
          relationLabelsBetweenHorseAndNums(r,mh.no,nums).forEach(rel=>{
            addRelationPayStat(relationStatEnsure(markMap,`${ticketLabel}|${mh.mark}|${rel}`,`${mh.mark}×${rel}`,ticketLabel),pay);
          });
        });
        if(pop1){
          relationLabelsBetweenHorseAndNums(r,int(pop1.no),nums).forEach(rel=>{
            addRelationPayStat(relationStatEnsure(pop1Map,`${ticketLabel}|1人気|${rel}`,`1人気×${rel}`,ticketLabel),pay);
          });
        }
        nums.forEach(no=>{
          const h=horseByNo(r,no); if(!h || int(h.popularity)<4) return;
          marks.forEach(mh=>{
            relationLabelsBetweenHorseAndNums(r,mh.no,[no]).forEach(rel=>{
              addRelationPayStat(relationStatEnsure(holeMap,`${ticketLabel}|${mh.mark}|${rel}`,`穴馬4人気以下×${mh.mark}×${rel}`,ticketLabel),pay);
            });
          });
          if(pop1){
            relationLabelsBetweenHorseAndNums(r,int(pop1.no),[no]).forEach(rel=>{
              addRelationPayStat(relationStatEnsure(holeMap,`${ticketLabel}|1人気|${rel}`,`穴馬4人気以下×1人気×${rel}`,ticketLabel),pay);
            });
          }
        });
      });
    });
  });
  return {markLinks:addRelationShares(finishRelationStats(markMap)), pop1Links:addRelationShares(finishRelationStats(pop1Map)), holeLinks:addRelationShares(finishRelationStats(holeMap)), pop1Danger:pop1DangerStats(rows)};
}
function pop1DangerStats(rows){
  const map={};
  const ensure=label=>map[label]||(map[label]={label,target:0,out:0,win:0,place:0,cost:0,pay:0,pops:[]});
  (rows||[]).forEach(x=>{
    const r=x.race||{}; const h=pop1HorseOf(r); if(!h)return;
    const no=int(h.no); if(!no)return;
    const place=new Set(placeNums(r)), first=new Set(firstNums(r));
    const info=markPatternFullLabelsForHorse(r,h);
    const labels=[...new Set(info.labels&&info.labels.length?info.labels:['定義なし'])];
    labels.forEach(label=>{
      const st=ensure(label); st.target++; st.cost+=100; st.pops.push(1);
      if(first.has(no)){ st.win++; st.pay+=tanshoPayForHorse(r,no); }
      if(place.has(no)) st.place++; else st.out++;
    });
  });
  return Object.values(map).map(st=>{ st.outRate=st.target?st.out/st.target*100:0; st.winRate=st.target?st.win/st.target*100:0; st.placeRate=st.target?st.place/st.target*100:0; st.roi=st.cost?st.pay/st.cost*100:0; return st; }).sort((a,b)=>b.outRate-a.outRate||b.target-a.target||a.roi-b.roi);
}
function relationPatternAdvice(st){
  const top=(list,filter)=> (list||[]).filter(filter||(()=>true)).sort((a,b)=>b.roi-a.roi||b.share-a.share||b.target-a.target)[0];
  const target=[];
  const markTop=top(st.markLinks,x=>x.roi>=100 || x.share>=30);
  const holeTop=top(st.holeLinks,x=>x.roi>=100 || x.share>=30);
  const popTop=top(st.pop1Links,x=>x.roi>=100 || x.share>=30);
  if(markTop) target.push(`狙い：${markTop.label}（${markTop.ticket} / 回収率${pct(markTop.roi)} / 割合${pct(markTop.share)}）`);
  if(holeTop) target.push(`穴狙い：${holeTop.label}（${holeTop.ticket} / 回収率${pct(holeTop.roi)} / 割合${pct(holeTop.share)}）`);
  if(popTop) target.push(`1人気絡み：${popTop.label}（${popTop.ticket} / 回収率${pct(popTop.roi)} / 割合${pct(popTop.share)}）`);
  const danger=(st.pop1Danger||[]).filter(x=>x.target>=2).sort((a,b)=>b.outRate-a.outRate||a.roi-b.roi)[0];
  if(danger) target.push(`危険：1人気が「${danger.label}」の時は圏外率${pct(danger.outRate)}（対象${danger.target}R）`);
  return target.length?target:['狙い・危険パターンは、対象件数が増えるほど信頼度が上がります。'];
}
function relationDefinitionSummaryRows(list){
  const m={};
  (list||[]).forEach(x=>{
    const g=relationGroupOfLabel(x.label), d=relationDefinitionOfLabel(x.label), key=`${x.ticket}|${g}|${d}`;
    if(!m[key]) m[key]={ticket:x.ticket, group:g, definition:d, count:0, roiPay:0, cost:0};
    m[key].count+=(x.target||0); m[key].roiPay+=(x.pay||0); m[key].cost+=(x.target||0)*100;
  });
  const totals={}; Object.values(m).forEach(x=>{ const k=`${x.ticket}|${x.group}`; totals[k]=(totals[k]||0)+x.count; });
  return Object.values(m).map(x=>{ x.share=totals[`${x.ticket}|${x.group}`]?x.count/totals[`${x.ticket}|${x.group}`]*100:0; x.roi=x.cost?x.roiPay/x.cost*100:0; return x; }).sort((a,b)=>b.share-a.share||b.count-a.count||b.roi-a.roi);
}
function advancedRelationRankingSections(rows){
  const st=advancedRelationStats(rows);
  const commonHead=['順位','券種','繋がり','件数','割合','的中率','回収率'];
  const body=list=>list.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(x.ticket)}</td><td class="left">${esc(x.label)}</td><td>${x.target}</td><td>${pct(x.share||0)}</td><td>${pct(x.hitRate)}</td><td>${pct(x.roi)}</td></tr>`).join('');
  const dangerBody=st.pop1Danger.map((x,i)=>`<tr><td>${i+1}</td><td class="left">${esc(x.label)}</td><td>${x.target}</td><td>${x.out}</td><td>${pct(x.outRate)}</td><td>${pct(x.winRate)}</td><td>${pct(x.placeRate)}</td><td>${pct(x.roi)}</td></tr>`).join('');
  const defBody=list=>relationDefinitionSummaryRows(list).map((x,i)=>`<tr><td>${i+1}</td><td>${esc(x.ticket)}</td><td class="left">${esc(x.group)}</td><td class="left">${esc(x.definition)}</td><td>${x.count}</td><td>${pct(x.share)}</td><td>${pct(x.roi)}</td></tr>`).join('');
  const advice=relationPatternAdvice(st).map(x=>`<li>${esc(x)}</li>`).join('');
  return card(`<div class="title">繋がり予想分析ランキング</div><p class="hint">印・1人気と決まり目の繋がりを、軸・相手・穴馬・1人気危険判定に使える形で集計します。穴馬は4人気以下として集計します。</p>`+
    `<h4>狙い・危険パターン</h4><ul>${advice}</ul>`+
    `<h4>印繋がりランキング</h4>${table(commonHead,body(st.markLinks),'データなし')}`+
    `<h4>1人気繋がりランキング</h4>${table(commonHead,body(st.pop1Links),'データなし')}`+
    `<h4>穴馬繋がりランキング</h4>${table(commonHead,body(st.holeLinks),'データなし')}`+
    `<h4>定義別ランキング（印との繋がり）</h4>${table(['順位','券種','区分','定義','件数','割合','回収率'],defBody(st.markLinks),'データなし')}`+
    `<h4>定義別ランキング（1人気との繋がり）</h4>${table(['順位','券種','区分','定義','件数','割合','回収率'],defBody(st.pop1Links),'データなし')}`+
    `<h4>1人気危険ランキング</h4>${table(['順位','1人気の並び定義','対象R','圏外R','圏外率','単勝率','複勝率','単勝回収率'],dangerBody,'データなし')}`);
}
function pushAdvancedRelationCsvSections(rows,out,prefix){
  prefix=prefix?String(prefix).trim():'トータル';
  const st=advancedRelationStats(rows);
  const push=(title,list)=>{ out.push([]); out.push([`【${title} ${prefix}】`]); out.push(['順位','券種','繋がり','件数','割合','的中率','回収率']); list.forEach((x,i)=>out.push([i+1,x.ticket,x.label,x.target,pct(x.share||0),pct(x.hitRate),pct(x.roi)])); };
  push('印繋がりランキング',st.markLinks);
  push('1人気繋がりランキング',st.pop1Links);
  push('穴馬繋がりランキング',st.holeLinks);
  const pushDef=(title,list)=>{ out.push([]); out.push([`【${title} ${prefix}】`]); out.push(['順位','券種','区分','定義','件数','割合','回収率']); relationDefinitionSummaryRows(list).forEach((x,i)=>out.push([i+1,x.ticket,x.group,x.definition,x.count,pct(x.share),pct(x.roi)])); };
  pushDef('定義別ランキング（印との繋がり）',st.markLinks);
  pushDef('定義別ランキング（1人気との繋がり）',st.pop1Links);
  out.push([]); out.push([`【狙い・危険パターン ${prefix}】`]); relationPatternAdvice(st).forEach(x=>out.push([x]));
  out.push([]); out.push([`【1人気危険ランキング ${prefix}】`]);
  out.push(['順位','1人気の並び定義','対象R','圏外R','圏外率','単勝率','複勝率','単勝回収率']);
  st.pop1Danger.forEach((x,i)=>out.push([i+1,x.label,x.target,x.out,pct(x.outRate),pct(x.winRate),pct(x.placeRate),pct(x.roi)]));
}


function decisionPatternStats(rows){
  const patternMap={}, markLinkMap={}, popLinkMap={};
  const ensure=(map,k,label,ticket)=>map[k]||(map[k]={label,ticket,target:0,hit:0,pay:0,markLinks:{},popLinks:{}});
  const tickets=[['umaren','馬連'],['wide','ワイド'],['sanrenpuku','3連複']];
  (rows||[]).forEach(x=>{
    const r=x.race||{};
    tickets.forEach(([key,ticketLabel])=>{
      const combos=actualCombosForDecision(r,key);
      combos.forEach(nums=>{
        const patterns=key==='sanrenpuku'?trioPatternLabels(r,nums):pairPatternLabels(r,nums[0],nums[1]);
        const pay=decisionPayForNums(r,key,nums);
        const markRels=markRelationLabelsForCombo(r,nums);
        const popRels=onePopRelationLabelsForCombo(r,nums);
        patterns.forEach(pat=>{
          const st=ensure(patternMap,`${ticketLabel}|${pat}`,pat,ticketLabel); st.target++; st.hit++; st.pay+=pay;
          markRels.forEach(rel=>{ st.markLinks[rel]=(st.markLinks[rel]||0)+1; const lk=ensure(markLinkMap,`${ticketLabel}|${rel}|${pat}`,`${rel}×${pat}`,ticketLabel); lk.target++; lk.hit++; lk.pay+=pay; });
          popRels.forEach(rel=>{ st.popLinks[rel]=(st.popLinks[rel]||0)+1; const lk=ensure(popLinkMap,`${ticketLabel}|${rel}|${pat}`,`${rel}×${pat}`,ticketLabel); lk.target++; lk.hit++; lk.pay+=pay; });
        });
      });
    });
  });
  const linkText=obj=>Object.entries(obj||{}).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k}:${v}`).join(' / ');
  const finish=arr=>Object.values(arr).map(st=>{ st.hitRate=st.target?st.hit/st.target*100:0; st.roi=st.target?st.pay/(st.target*100)*100:0; st.markLinkText=linkText(st.markLinks); st.popLinkText=linkText(st.popLinks); return st; }).sort((a,b)=>b.roi-a.roi||b.hitRate-a.hitRate||b.target-a.target);
  return {patterns:finish(patternMap), markLinks:finish(markLinkMap), popLinks:finish(popLinkMap)};
}
function decisionPatternSections(rows){
  const stats=decisionPatternStats(rows);
  const pBody=stats.patterns.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(x.ticket)}</td><td class="left">${esc(x.label)}</td><td>${x.target}</td><td>${x.hit}</td><td>${pct(x.hitRate)}</td><td>${pct(x.roi)}</td><td class="left">${esc(x.markLinkText||'-')}</td><td class="left">${esc(x.popLinkText||'-')}</td></tr>`).join('');
  const mBody=stats.markLinks.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(x.ticket)}</td><td class="left">${esc(x.label)}</td><td>${x.target}</td><td>${x.hit}</td><td>${pct(x.hitRate)}</td><td>${pct(x.roi)}</td></tr>`).join('');
  const p1Body=stats.popLinks.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(x.ticket)}</td><td class="left">${esc(x.label)}</td><td>${x.target}</td><td>${x.hit}</td><td>${pct(x.hitRate)}</td><td>${pct(x.roi)}</td></tr>`).join('');
  return card(`<div class="title">決まり目分析ランキング</div><p class="hint">馬連・ワイド・3連複の決まり目から、連番・ゾロ目・表裏・和9・枠↔馬・枠+馬・飛び・5系・同枠・人気9などを集計します。印との繋がりと1人気との繋がりは分けて表示します。</p><h4>馬券の組み合わせ</h4>${table(['順位','券種','決まり目定義','出現数','的中数','出現率','回収率','印との繋がり','1人気との繋がり'],pBody,'データなし')}<h4>印との繋がり</h4>${table(['順位','券種','繋がり','出現数','的中数','出現率','回収率'],mBody,'データなし')}<h4>1人気との繋がり</h4>${table(['順位','券種','繋がり','出現数','的中数','出現率','回収率'],p1Body,'データなし')}`)+advancedRelationRankingSections(rows);
}
function pushDecisionPatternCsvSections(rows,out,prefix){
  prefix=prefix?String(prefix).trim():'トータル';
  const stats=decisionPatternStats(rows);
  out.push([]); out.push([`【決まり目分析ランキング ${prefix}】`]);
  out.push(['順位','券種','決まり目定義','出現数','的中数','出現率','回収率','印との繋がり','1人気との繋がり']);
  stats.patterns.forEach((x,i)=>out.push([i+1,x.ticket,x.label,x.target,x.hit,pct(x.hitRate),pct(x.roi),x.markLinkText||'',x.popLinkText||'']));
  out.push([]); out.push([`【印関連ランキング ${prefix}】`]);
  out.push(['順位','券種','繋がり','出現数','的中数','出現率','回収率']);
  stats.markLinks.forEach((x,i)=>out.push([i+1,x.ticket,x.label,x.target,x.hit,pct(x.hitRate),pct(x.roi)]));
  out.push([]); out.push([`【1人気関連ランキング ${prefix}】`]);
  out.push(['順位','券種','繋がり','出現数','的中数','出現率','回収率']);
  stats.popLinks.forEach((x,i)=>out.push([i+1,x.ticket,x.label,x.target,x.hit,pct(x.hitRate),pct(x.roi)]));
  pushAdvancedRelationCsvSections(rows,out,prefix);
}

function improvementAnalysisSections(rows, miss){
  return card(`<div class="title">改善分析ランキング</div><p class="hint">軸NG、相手抜け、組み合わせ抜けの3種類に整理し、どのランキングも対象全レースで現行買い目点数内に再計算した全体（馬連＋ワイド＋3連複）回収率を表示し、その回収率が高い順に表示します。</p>`)+
    makeAxisNgRanking(rows)+
    makePartnerMissRanking(rows)+
    makeComboMissRanking(rows)+
    makeLowRoiRanking(rows);
}

function render(){
  const out0=document.getElementById('validationResult');
  if(out0) out0.innerHTML=card(`<div class="title">処理中</div><p class="hint">保存レースを集計しています...</p>`);
  setTimeout(()=>renderCore(), 20);
}
function renderCore(){
  const races=filteredRaces();
  const rows=races.map(rowStats); lastRows=rows;
  const s=summarize(rows); lastSummary=s;
  const rankings=makeRankings(rows); lastRankings=rankings;
  const miss=makeMissRankings(rows);
  const canRecent30=hasRecent30(rows);
  const r30=recent30Rows(rows);
  const out=document.getElementById('validationResult');
  if(!out)return;
  const recentHtml=canRecent30 ? `<h4>直近30R</h4>${renderSummary(summarize(r30))}` : `<p class="hint">直近30Rはトータル対象が31R以上の場合のみ表示します。現在は${rows.length}Rのため、直近30Rランキングは表示しません。</p>`;
  out.innerHTML=
    card(`<div class="title">検証結果サマリー</div><p class="subtle">集計完了：トータル ${rows.length}R${canRecent30?' / 直近30R 30R':''}。直近30Rはトータル対象31R以上で、検索条件適用後に日付が新しい順の最大30Rです。</p><h4>トータル</h4>${renderSummary(s)}${recentHtml}<div class="grid4"><button onclick="KV2Validation.exportCsv('all')">検証結果CSV（1ファイル出力）</button>${C.copyButtonHtml ? C.copyButtonHtml('検証結果全文コピー','検証結果全文') : ''}</div>`)+
    summaryRankingCards(rows)+
    ruleRankingSections(rows)+
    markPatternAnalysisSections(rows)+
    decisionPatternSections(rows)+
    detailedRankingSections(rows)+
    improvementAnalysisSections(rows, miss);
}
function rankingTable(kind){
  if(kind==='axis') return table(['順位','条件','対象R','軸複勝率','軸単勝率','全体回収率'], topRankRows(lastRankings,'axis'), 'データなし');
  if(['umaren','wide','sanrenpuku'].includes(kind)){
    const label=TICKETS.find(x=>x[0]===kind)[1];
    return table(['順位','条件','対象R',`${label}的中率`,`${label}回収率`,'的中R/対象R'], topRankRows(lastRankings,kind), 'データなし');
  }
  return table(['順位','条件','対象R','全体的中率','全体回収率','軸複勝率'], topRankRows(lastRankings,'all'), 'データなし');
}
function switchRanking(kind){const el=document.getElementById('validationRankingBox'); if(el)el.innerHTML=rankingTable(kind)}

function show(){
  // 検証結果画面を開くだけの時点では保存レース全件を読まない。
  // AndroidではlocalStorageの全件読込＋正規化だけで数秒止まるため、固定選択肢で先に画面を表示し、
  // 実集計は「検証開始」押下時だけ行う。
  const places=['札幌','函館','福島','新潟','東京','中山','中京','京都','阪神','小倉'];
  const grades=['G1','G2','G3','J-G1','J-G2','J-G3','OP','L','特別1勝','特別2勝','特別3勝','1勝','2勝','3勝'];
  const surfaces=['芝','ダート','障害'];
  const conditions=['定量','別定','ハンデ'];
  app().innerHTML=`<div class="screen validationScreen">${h('検証結果',true)}${
    card(`<div class="title">検証条件</div><div class="grid4"><div><label>開始日</label><input id="vDateFrom" type="date"></div><div><label>終了日</label><input id="vDateTo" type="date"></div><div><label>開催地</label><select id="vPlace"><option value="">全て</option>${options(places)}</select></div><div><label>レース名</label><input id="vKeyword" placeholder="レース名・条件"></div></div><div class="grid4"><div><label>グレード</label><select id="vGrade"><option value="">全て</option>${options(grades)}</select></div><div><label>馬場</label><select id="vSurface"><option value="">全て</option>${options(surfaces)}</select></div><div><label>条件</label><select id="vCondition"><option value="">全て</option>${options(conditions)}</select></div><div><label>判定</label><select id="vJudge"><option value="">全て</option>${options(['勝負','抑え','保留','見送り'])}</select></div></div><div class="grid4"><div><label>ランキング最小件数</label><input id="vMinRaces" type="number" value="1" min="1"></div><button onclick="KV2Validation.render()">検証開始</button><button class="secondary" onclick="KV2Validation.clearFilters()">条件クリア</button>${C.copyButtonHtml ? C.copyButtonHtml('検証結果全文コピー','検証結果全文') : ''}<button class="secondary" onclick="KV2App.showTop()">トップへ</button></div><p class="hint">結果入力済みレースだけを対象に、的中率・回収率・軸成績・抜けランキングを集計します。</p>`)
  }<div id="validationResult"></div></div>`;
  const out=document.getElementById('validationResult');
  if(out){
    out.innerHTML=card(`<div class="title">検証開始前</div><p class="hint">条件を確認して「検証開始」を押すと集計します。画面を開くだけでは重い集計を走らせません。</p>`);
  }
}
function clearFilters(){['vDateFrom','vDateTo','vPlace','vGrade','vSurface','vCondition','vJudge','vKeyword'].forEach(id=>{const e=document.getElementById(id); if(e)e.value='';}); const m=document.getElementById('vMinRaces'); if(m)m.value=1; lastRows=[]; lastSummary=null; lastRankings=[]; lastAiHints=[]; lastMissRows=[]; const out=document.getElementById('validationResult'); if(out){out.innerHTML=card(`<div class="title">条件クリア済み</div><p class="hint">条件を確認して「検証開始」を押してください。</p>`);}}
function csvEscape(v){return `"${String(v??'').replace(/"/g,'""')}"`}
function downloadCsv(filename, rows){
  const csv=rows.map(r=>r.map(csvEscape).join(',')).join('\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function exportCsv(type){
  const ts=new Date().toISOString().slice(0,10).replace(/-/g,'');
  if(type==='all'){
    const s=lastSummary||summarize(lastRows);
    const rows=[];
    rows.push(['【サマリー】']);
    rows.push(['項目','値','補足']);
    rows.push(['対象R',s.races,'']);
    rows.push(['全体回収率',pct(s.roi),`${s.pay}/${s.cost}`]);
    rows.push(['全体的中率',pct(s.hitRate),`${s.hit}/${s.races}`]);
    rows.push(['軸単勝率',pct(s.axisWinRate),`${s.axisWin}/${s.races}`]);
    rows.push(['軸回収率',pct(axisTanshoRoi(lastRows)),'軸単勝100円換算']);
    rows.push(['軸複勝率',pct(s.axisPlaceRate),`${s.axisPlace}/${s.races}`]);
    TICKETS.forEach(([k,l])=>{const t=s.tickets[k]; rows.push([`${l}回収率`,pct(t.roi),`${t.pay}/${t.cost}`],[`${l}的中率`,pct(t.hitRate),`${t.hit}/${t.races}`]);});
    if(hasRecent30(lastRows)){
      const r30=recent30Rows(lastRows); const s30=summarize(r30);
      rows.push([]); rows.push(['【直近30Rサマリー】']); rows.push(['項目','値','補足']);
      rows.push(['対象R',s30.races,'']);
      rows.push(['全体回収率',pct(s30.roi),`${s30.pay}/${s30.cost}`]);
      rows.push(['全体的中率',pct(s30.hitRate),`${s30.hit}/${s30.races}`]);
      rows.push(['軸単勝率',pct(s30.axisWinRate),`${s30.axisWin}/${s30.races}`]);
      rows.push(['軸回収率',pct(axisTanshoRoi(r30)),'軸単勝100円換算']);
      rows.push(['軸複勝率',pct(s30.axisPlaceRate),`${s30.axisPlace}/${s30.races}`]);
      TICKETS.forEach(([k,l])=>{const t=s30.tickets[k]; rows.push([`${l}回収率`,pct(t.roi),`${t.pay}/${t.cost}`],[`${l}的中率`,pct(t.hitRate),`${t.hit}/${t.races}`]);});
    }
    pushSummaryRankingCsv(lastRows, rows);
    if(hasRecent30(lastRows)){
      pushSummaryRankingCsv(recent30Rows(lastRows), rows, '直近30R');
    }
    const pushRuleRankCsv=(label,rs)=>{
      rows.push([]); rows.push([`【予想ルールランキング ${label}】`]);
      rows.push(['区分','対象R','全体回収率','全体的中率','軸単勝率','軸回収率','軸複勝率','馬連回収率','馬連的中率','ワイド回収率','ワイド的中率','3連複回収率','3連複的中率']);
      [statsForGroup(rs,'全体','全体'), ...makeCategoryOnlyRankings(rs)].forEach(g=>{const ss=g.summary; rows.push([g.label,ss.races,pct(ss.roi),pct(ss.hitRate),pct(ss.axisWinRate),pct(axisTanshoRoi(g.rows||rs)),pct(ss.axisPlaceRate),pct(ss.tickets.umaren.roi),pct(ss.tickets.umaren.hitRate),pct(ss.tickets.wide.roi),pct(ss.tickets.wide.hitRate),pct(ss.tickets.sanrenpuku.roi),pct(ss.tickets.sanrenpuku.hitRate)]);});
    };
    pushRuleRankCsv('トータル', lastRows);
    if(hasRecent30(lastRows)) pushRuleRankCsv('直近30R', recent30Rows(lastRows));
    pushMarkPatternCsvSections(lastRows, rows, 'トータル');
    pushMarkNeighborCsvSections(lastRows, rows, 'トータル');
    pushDecisionPatternCsvSections(lastRows, rows, 'トータル');
    if(hasRecent30(lastRows)){
      pushMarkPatternCsvSections(recent30Rows(lastRows), rows, '直近30R');
      pushMarkNeighborCsvSections(recent30Rows(lastRows), rows, '直近30R');
      pushDecisionPatternCsvSections(recent30Rows(lastRows), rows, '直近30R');
    }
    pushAttributeCsvSections(lastRows, rows, 'トータル', '全体');
    if(hasRecent30(lastRows)) pushAttributeCsvSections(recent30Rows(lastRows), rows, '直近30R', '全体');
    pushCategoryAttributeCsvSections(lastRows, rows);
    pushImprovementCsvSections(lastRows, rows);
    return downloadCsv(`validation_results_${ts}.csv`,rows);
  }
  if(type==='summary'){
    const s=lastSummary||summarize(lastRows);
    const rows=[['項目','値','補足'],['対象R',s.races,''],['全体回収率',pct(s.roi),`${s.pay}/${s.cost}`],['全体的中率',pct(s.hitRate),`${s.hit}/${s.races}`],['軸単勝率',pct(s.axisWinRate),`${s.axisWin}/${s.races}`],['軸回収率',pct(axisTanshoRoi(lastRows)),'軸単勝100円換算'],['軸複勝率',pct(s.axisPlaceRate),`${s.axisPlace}/${s.races}`]];
    TICKETS.forEach(([k,l])=>{const t=s.tickets[k]; rows.push([`${l}回収率`,pct(t.roi),`${t.pay}/${t.cost}`],[`${l}的中率`,pct(t.hitRate),`${t.hit}/${t.races}`]);});
    return downloadCsv(`validation_summary_${ts}.csv`,rows);
  }
  if(type==='ranking'){
    const rows=[['条件','対象R','全体回収率','全体的中率','軸単勝率','軸回収率','軸複勝率','馬連回収率','馬連的中率','ワイド回収率','ワイド的中率','3連複回収率','3連複的中率']];
    lastRankings.forEach(g=>{const s=g.summary; rows.push([g.label,s.races,pct(s.roi),pct(s.hitRate),pct(s.axisWinRate),pct(axisTanshoRoi(g.rows||[])),pct(s.axisPlaceRate),pct(s.tickets.umaren.roi),pct(s.tickets.umaren.hitRate),pct(s.tickets.wide.roi),pct(s.tickets.wide.hitRate),pct(s.tickets.sanrenpuku.roi),pct(s.tickets.sanrenpuku.hitRate)]);});
    return downloadCsv(`validation_ranking_${ts}.csv`,rows);
  }
  const rows=[['日付','開催地','R','レース名','グレード','馬場','条件','判定','軸','軸結果','全体回収率','馬連回収率','ワイド回収率','3連複回収率']];
  lastRows.forEach(x=>{const r=x.race; rows.push([r.date,r.place,r.raceNo,r.raceName,r.grade,r.surface,r.condition,judgeOf(r),x.axis.no,x.axis.rank,pct(x.all.roi),pct(x.all.items.umaren.roi),pct(x.all.items.wide.roi),pct(x.all.items.sanrenpuku.roi)]);});
  downloadCsv(`validation_races_${ts}.csv`,rows);
}

window.KV2Validation={show,render,clearFilters,switchRanking,exportCsv};
})();
