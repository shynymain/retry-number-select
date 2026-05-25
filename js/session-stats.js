(function(){
'use strict';
function money(v){const n=parseInt(String(v||'').replace(/[^0-9]/g,''),10); return Number.isFinite(n)?n:0;}
function rate(a,b){return b?`${Math.round((a/b)*1000)/10}%`:'-';}
function matchMulti(preds,actual){return (preds||[]).some(p=>(actual||[]).some(a=>window.REVPrediction.hit(p,a.combo)));}
function payOfHit(preds,actual){const row=(actual||[]).find(a=>(preds||[]).some(p=>window.REVPrediction.hit(p,a.combo))); return row?money(row.pay):0;}
function contains(actual,q){return !q || String(actual||'').toLowerCase().includes(String(q).toLowerCase());}
function inMulti(actual,vals){return !vals?.length || vals.includes(String(actual||''));}
function anyContains(actual,vals){return !vals?.length || vals.some(v=>contains(actual,v));}
function filterRaces(list,cond={}){return list.filter(r=>{
  if(cond.from&&r.date<cond.from)return false;
  if(cond.to&&r.date>cond.to)return false;
  if(cond.judges?.length){const p=window.REVPrediction.predictions(r); if(!cond.judges.includes(p.judge))return false;}
  if(!inMulti(r.place,cond.places))return false;
  if(!contains(r.raceName,cond.raceName))return false;
  if(!anyContains(`${r.grade} ${r.raceName}`,cond.grades))return false;
  if(!inMulti(r.surface,cond.surfaces))return false;
  if(!contains(r.distance,cond.distance))return false;
  if(!contains(r.condition,cond.condition))return false;
  if(!contains(r.age,cond.age))return false;
  if(!contains(r.sex,cond.sex))return false;
  if(cond.headcount&&String(r.headcount||'')!==String(cond.headcount))return false;
  if(window.REVRuleCategories&&!window.REVRuleCategories.matchRace(r,cond))return false;
  return true;
});}
function calc(list,cond={}){const races=filterRaces(list,cond); const base={races:races.length,umaren:{buy:0,hit:0,pay:0},wide:{buy:0,hit:0,pay:0},sanrenpuku:{buy:0,hit:0,pay:0},axisWin:{buy:0,hit:0},axisPlace:{buy:0,hit:0}};
  races.forEach(r=>{const p=window.REVPrediction.predictions(r); const res=window.REVStore.normalizeResult(r.result||{}); const first=(res.firsts||[]).map(Number), place=[...(res.firsts||[]),...(res.seconds||[]),...(res.thirds||[])].map(Number); if(p.axis){base.axisWin.buy++; base.axisPlace.buy++; if(first.includes(+p.axis.no))base.axisWin.hit++; if(place.includes(+p.axis.no))base.axisPlace.hit++;}
    [['umaren','umarens',100],['wide','wides',300],['sanrenpuku','sanrenpukus',100]].forEach(([k,rk,buy])=>{const preds=p[k]||[]; if(!preds.length)return; base[k].buy+=buy; const actual=res[rk]||[]; if(matchMulti(preds,actual)){base[k].hit++; base[k].pay+=payOfHit(preds,actual);}});
  }); return base;}
function html(stats){const row=(name,o)=>`<tr><td>${name}</td><td>${o.buy?Math.round(o.buy/100):0}点</td><td>${o.hit}</td><td>${rate(o.hit,Math.round(o.buy/100))}</td><td>${o.buy?Math.round((o.pay/o.buy)*1000)/10+'%':'-'}</td><td>${o.pay.toLocaleString()}円</td></tr>`; return `<div class="statsBox"><div class="resultLine">対象レース：<b>${stats.races}</b></div><div class="grid2"><div class="metric">軸馬単勝的中率<br><b>${rate(stats.axisWin.hit,stats.axisWin.buy)}</b></div><div class="metric">軸馬複勝的中率<br><b>${rate(stats.axisPlace.hit,stats.axisPlace.buy)}</b></div></div><div class="tableWrap"><table><thead><tr><th>券種</th><th>買い目</th><th>的中</th><th>的中率</th><th>回収率</th><th>払戻</th></tr></thead><tbody>${row('馬連',stats.umaren)}${row('ワイド',stats.wide)}${row('3連複',stats.sanrenpuku)}</tbody></table></div></div>`;}

function cloneCondWithoutRuleTags(cond={}){
  const out={...cond};
  if(window.REVRuleCategories){
    (window.REVRuleCategories.RULE_CATEGORIES||[]).forEach(c=>delete out[c.key]);
  }
  return out;
}
function pctNum(hit,buy){return buy?Math.round((hit/buy)*1000)/10:0;}
function retNum(pay,buy){return buy?Math.round((pay/buy)*1000)/10:0;}
function totalBetStats(st){
  const buy=(st.umaren.buy||0)+(st.wide.buy||0)+(st.sanrenpuku.buy||0);
  const hit=(st.umaren.hit||0)+(st.wide.hit||0)+(st.sanrenpuku.hit||0);
  const pay=(st.umaren.pay||0)+(st.wide.pay||0)+(st.sanrenpuku.pay||0);
  return {buy,hit,pay,hitRate:pctNum(hit,Math.round(buy/100)),returnRate:retNum(pay,buy)};
}
function validationRankingHtml(list,cond={}){
  const RC=window.REVRuleCategories;
  if(!RC)return '<div class="small">予想ルールカテゴリー未読込</div>';
  const baseCond=cloneCondWithoutRuleTags(cond);
  const base=filterRaces(list,baseCond);
  const rows=[];
  (RC.RULE_CATEGORIES||[]).forEach(cat=>{
    (cat.values||[]).forEach(v=>{
      const sub=base.filter(r=>{
        const tags=r&&r.ruleTags?r.ruleTags:RC.tagsForRace(r);
        return (tags[cat.key]||[]).includes(v);
      });
      if(!sub.length)return;
      const st=calc(sub,{});
      const t=totalBetStats(st);
      rows.push({cat:cat.label,tag:v,races:sub.length,axisWin:pctNum(st.axisWin.hit,st.axisWin.buy),axisPlace:pctNum(st.axisPlace.hit,st.axisPlace.buy),hitRate:t.hitRate,returnRate:t.returnRate,pay:t.pay,buy:t.buy});
    });
  });
  rows.sort((a,b)=>(b.returnRate-a.returnRate)||(b.hitRate-a.hitRate)||(b.races-a.races));
  if(!rows.length)return '<div class="small">ランキング対象なし</div>';
  return `<div class="tableWrap"><table><thead><tr><th>順位</th><th>分類</th><th>タグ</th><th>対象</th><th>軸単勝</th><th>軸複勝</th><th>券種的中</th><th>回収率</th><th>払戻</th></tr></thead><tbody>${rows.slice(0,30).map((r,i)=>`<tr><td>${i+1}</td><td>${r.cat}</td><td>${r.tag}</td><td>${r.races}</td><td>${r.axisWin}%</td><td>${r.axisPlace}%</td><td>${r.hitRate}%</td><td>${r.returnRate}%</td><td>${r.pay.toLocaleString()}円</td></tr>`).join('')}</tbody></table></div>`;
}
function addDays(ymd,days){const d=new Date(`${ymd}T00:00:00`);d.setDate(d.getDate()+days);return d.toISOString().slice(0,10);}
function daysBetween(a,b){return Math.round((new Date(`${b}T00:00:00`)-new Date(`${a}T00:00:00`))/86400000);}
function periodCompareHtml(list,cond={}){
  const baseCond=cloneCondWithoutRuleTags(cond);
  const rows=[];
  function row(label,c){
    const st=calc(list,c),t=totalBetStats(st);
    rows.push({label,races:st.races,axisWin:pctNum(st.axisWin.hit,st.axisWin.buy),axisPlace:pctNum(st.axisPlace.hit,st.axisPlace.buy),hitRate:t.hitRate,returnRate:t.returnRate,pay:t.pay});
  }
  if(cond.from&&cond.to){
    const span=daysBetween(cond.from,cond.to);
    const prevTo=addDays(cond.from,-1);
    const prevFrom=addDays(prevTo,-span);
    row(`選択期間 ${cond.from}〜${cond.to}`,baseCond);
    row(`直前同期間 ${prevFrom}〜${prevTo}`,{...baseCond,from:prevFrom,to:prevTo});
  }else{
    const base=filterRaces(list,baseCond);
    const years=[...new Set(base.map(r=>String(r.date||'').slice(0,4)).filter(Boolean))].sort();
    years.forEach(y=>row(`${y}年`,{...baseCond,from:`${y}-01-01`,to:`${y}-12-31`}));
  }
  if(!rows.length)return '<div class="small">比較対象なし。検索開始日・検索終了日を入れると直前同期間と比較します。</div>';
  return `<div class="tableWrap"><table><thead><tr><th>期間</th><th>対象</th><th>軸単勝</th><th>軸複勝</th><th>券種的中</th><th>回収率</th><th>払戻</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r.label}</td><td>${r.races}</td><td>${r.axisWin}%</td><td>${r.axisPlace}%</td><td>${r.hitRate}%</td><td>${r.returnRate}%</td><td>${r.pay.toLocaleString()}円</td></tr>`).join('')}</tbody></table></div>`;
}

window.REVStats={calc,html,filterRaces,validationRankingHtml,periodCompareHtml};
})();
