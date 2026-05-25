(function(){
'use strict';
const S=()=>window.REVStore;
const P=()=>window.REVPrediction;

const RULE_CATEGORIES=[
  {
    key:'markTags',
    label:'印条件',
    values:['◎あり','◎複数','○あり','▲あり','◎なし']
  },
  {
    key:'axisTags',
    label:'軸条件',
    values:['5系軸','5番軸','14軸','15軸','5枠軸','◎連動','○連動','▲連動','隣±1','中穴帯','狙い人気×5系']
  },
  {
    key:'buyTags',
    label:'買い条件',
    values:['勝負','見送り','S型','5系収束','接続弱い','1人気固い','軸2人気以内','軸不明']
  },
  {
    key:'betTags',
    label:'買い目条件',
    values:['馬連1点','ワイド3点','3連複1点']
  },
  {
    key:'reflectionTags',
    label:'反省分類',
    values:['軸的中','軸違い','相手抜け','買い目的中','買い目不的中','見送り正解','勝負失敗']
  }
];

function uniq(a){return [...new Set((a||[]).filter(Boolean))];}
function includesNo(arr,no){return (arr||[]).map(Number).includes(+no);}
function actualPlace(result){return uniq([...(result.firsts||[]),...(result.seconds||[]),...(result.thirds||[])].map(Number));}
function anyHit(preds,actual){
  const hit=window.REVPrediction&&window.REVPrediction.hit;
  return !!hit && (preds||[]).some(p=>(actual||[]).some(a=>hit(p,a.combo)));
}
function tagsForRace(raw){
  const pred=P().predictions(raw);
  const r=pred.race||S().normalizeRace(raw);
  const res=S().normalizeResult(r.result||{});
  const marks=r.horses.filter(h=>h.mark);
  const tags={markTags:[],axisTags:[],buyTags:[],betTags:[],reflectionTags:[]};

  if(marks.some(h=>h.mark==='◎'))tags.markTags.push('◎あり');
  if(marks.filter(h=>h.mark==='◎').length>=2)tags.markTags.push('◎複数');
  if(marks.some(h=>h.mark==='○'))tags.markTags.push('○あり');
  if(marks.some(h=>h.mark==='▲'))tags.markTags.push('▲あり');
  if(!marks.some(h=>h.mark==='◎'))tags.markTags.push('◎なし');

  const axis=pred.axis;
  if(axis){
    if([5,14,15].includes(+axis.no)||+axis.frame===5)tags.axisTags.push('5系軸');
    if(+axis.no===5)tags.axisTags.push('5番軸');
    if(+axis.no===14)tags.axisTags.push('14軸');
    if(+axis.no===15)tags.axisTags.push('15軸');
    if(+axis.frame===5)tags.axisTags.push('5枠軸');
    const reasons=axis._c&&Array.isArray(axis._c.reasons)?axis._c.reasons:[];
    if(reasons.includes('◎連動'))tags.axisTags.push('◎連動');
    if(reasons.includes('○連動'))tags.axisTags.push('○連動');
    if(reasons.includes('▲連動'))tags.axisTags.push('▲連動');
    if(reasons.includes('隣±1'))tags.axisTags.push('隣±1');
    if(reasons.includes('中穴帯'))tags.axisTags.push('中穴帯');
    if(reasons.includes('狙い人気×5系'))tags.axisTags.push('狙い人気×5系');
  }

  tags.buyTags.push(pred.judge==='勝負'?'勝負':'見送り');
  if(marks.filter(h=>h.mark==='◎').length>=2 && axis && ([5,14,15].includes(+axis.no)||+axis.frame===5))tags.buyTags.push('S型');
  if(axis && ([5,14,15].includes(+axis.no)||+axis.frame===5) && (axis._c?.score||0)>120)tags.buyTags.push('5系収束');
  const reasonText=(pred.reason||[]).join(' ');
  if(/接続弱い/.test(reasonText))tags.buyTags.push('接続弱い');
  if(/1人気/.test(reasonText))tags.buyTags.push('1人気固い');
  if(/軸が2人気以内/.test(reasonText))tags.buyTags.push('軸2人気以内');
  if(/軸不明/.test(reasonText)||!axis)tags.buyTags.push('軸不明');

  if((pred.umaren||[]).length===1)tags.betTags.push('馬連1点');
  if((pred.wide||[]).length===3)tags.betTags.push('ワイド3点');
  if((pred.sanrenpuku||[]).length===1)tags.betTags.push('3連複1点');

  const placed=actualPlace(res);
  const axisPlaced=axis&&placed.includes(+axis.no);
  const betHit=anyHit(pred.umaren,res.umarens)||anyHit(pred.wide,res.wides)||anyHit(pred.sanrenpuku,res.sanrenpukus);
  const anyActual=(res.firsts||[]).filter(Boolean).length||(res.seconds||[]).filter(Boolean).length||(res.thirds||[]).filter(Boolean).length;
  if(anyActual){
    tags.reflectionTags.push(axisPlaced?'軸的中':'軸違い');
    tags.reflectionTags.push(betHit?'買い目的中':'買い目不的中');
    if(axisPlaced&&!betHit)tags.reflectionTags.push('相手抜け');
    if(pred.judge==='見送り'&&!betHit)tags.reflectionTags.push('見送り正解');
    if(pred.judge==='勝負'&&!betHit)tags.reflectionTags.push('勝負失敗');
  }
  Object.keys(tags).forEach(k=>tags[k]=uniq(tags[k]));
  return tags;
}
function selectHtml(id,cat){
  return `<div class="field"><label>${S().esc(cat.label)}</label><select id="${id}" multiple size="${Math.min(cat.values.length,5)}">${cat.values.map(v=>`<option value="${S().esc(v)}">${S().esc(v)}</option>`).join('')}</select><div class="small">予想ルールカテゴリー / 複数選択可</div></div>`;
}
function applyTags(raw){
  const r=S().normalizeRace(raw);
  r.ruleTags=tagsForRace(r);
  return r;
}
function matchRace(r,cond={}){
  const tags=r&&r.ruleTags?r.ruleTags:tagsForRace(r);
  return RULE_CATEGORIES.every(cat=>{
    const selected=cond[cat.key]||[];
    if(!selected.length)return true;
    const actual=tags[cat.key]||[];
    return selected.some(v=>actual.includes(v));
  });
}
window.REVRuleCategories={RULE_CATEGORIES,tagsForRace,applyTags,selectHtml,matchRace};
})();
