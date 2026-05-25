(function(){
'use strict';
const STORE_KEY='revvan900.races.v1';
const JRA_PLACES=['札幌','函館','福島','新潟','東京','中山','中京','京都','阪神','小倉'];
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function int(v){const s=String(v??'').trim(); if(!s||/中止|除外|取消|競走中止|止|外/.test(s))return null; const x=parseInt(s.replace(/[^0-9-]/g,''),10); return Number.isFinite(x)?x:null;}
function num(v){const x=parseFloat(String(v??'').replace(/,/g,''));return Number.isFinite(x)?x:null;}
function raceIdOf(r){const d=String(r?.date||'').replaceAll('/','-'); const rr=String(r?.raceNo||r?.race||'').replace(/R$/,''); return `${d}_${r?.place||''}_${rr}R`;}
function frameOf(no,head){
  no=+no;head=+head||18;
  if(!Number.isFinite(no)||no<1)return '';
  if(head<=8)return no<=head?no:'';
  const caps=Array(8).fill(1);
  let extra=Math.max(0,head-8);
  for(let i=7;extra>0;i=(i-1+8)%8){caps[i]++;extra--;}
  let max=0;
  for(let f=1;f<=8;f++){max+=caps[f-1];if(no<=max)return f;}
  return '';
}
function compactArr(a){return (Array.isArray(a)?a:(a===undefined||a===null||a===''?[]:[a])).map(v=>String(v??'').trim()).filter(Boolean);}
function pairArr(a){return (Array.isArray(a)?a:[]).map(x=>({combo:String((x&&x.combo)??'').trim(),pay:String((x&&x.pay)??'').trim()})).filter(x=>x.combo||x.pay);}
function normalizeResult(result={},r={}){
  result=result&&typeof result==='object'?result:{};
  const firsts=compactArr(result.firsts).concat(compactArr(result.first)).concat(compactArr(r.first));
  const seconds=compactArr(result.seconds).concat(compactArr(result.second)).concat(compactArr(r.second));
  const thirds=compactArr(result.thirds).concat(compactArr(result.third)).concat(compactArr(r.third));
  const umarens=pairArr(result.umarens).concat(pairArr(result.umaren)).concat(pairArr([{combo:result.umarenCombo??result.umaren?.combo,pay:result.umarenPay??result.umaren?.pay}]));
  const wides=pairArr(result.wides).concat(pairArr(result.wide)).concat(pairArr([{combo:result.wide1Combo??result.wide?.[0]?.combo,pay:result.wide1Pay??result.wide?.[0]?.pay},{combo:result.wide2Combo??result.wide?.[1]?.combo,pay:result.wide2Pay??result.wide?.[1]?.pay},{combo:result.wide3Combo??result.wide?.[2]?.combo,pay:result.wide3Pay??result.wide?.[2]?.pay}]));
  const sanrenpukus=pairArr(result.sanrenpukus).concat(pairArr(result.sanrenpuku)).concat(pairArr([{combo:result.sanrenpukuCombo??result.sanrenpuku?.combo,pay:result.sanrenpukuPay??result.sanrenpuku?.pay}]));
  return {firsts:firsts.length?firsts:[''],seconds:seconds.length?seconds:[''],thirds:thirds.length?thirds:[''],umarens:umarens.length?umarens:[{combo:'',pay:''}],wides:wides.length?wides:[{combo:'',pay:''},{combo:'',pay:''},{combo:'',pay:''}],sanrenpukus:sanrenpukus.length?sanrenpukus:[{combo:'',pay:''}]};
}
function normalizeRace(raw={}){const r=raw&&typeof raw==='object'?raw:{}; const horses=Array.isArray(r.horses)?r.horses:(Array.isArray(r.entries)?r.entries:[]); const head=int(r.headcount)||horses.length||18; const raceNo=String(r.raceNo||r.race||'').replace(/R?$/,'R');
  return {id:String(r.id||r.raceId||raceIdOf({...r,raceNo})),date:String(r.date||'').replaceAll('/','-'),place:String(r.place||''),raceNo,raceName:String(r.raceName||r.name||''),grade:String(r.grade||''),surface:String(r.surface||r.track||''),distance:String(r.distance||''),condition:String(r.condition||''),age:String(r.age||''),sex:String(r.sex||''),headcount:head,
  horses:horses.map((h,i)=>{const no=int(h.no??h.horseNo??h.number)??i+1;return {no,frame:frameOf(no,head),name:String(h.name??h.horseName??''),odds:String(h.odds??h.winOdds??''),popularity:int(h.popularity)||'',past3:String(h.past3??h.prev3??''),past2:String(h.past2??h.prev2??''),past1:String(h.past1??h.prev1??h.past??''),mark:String(h.mark??'')};}),result:normalizeResult(r.result||{},r),memo:String(r.memo||''),updatedAt:r.updatedAt||new Date().toISOString()};}
function load(){try{const a=JSON.parse(localStorage.getItem(STORE_KEY)||'[]');if(Array.isArray(a))return a.map(normalizeRace);}catch(e){console.error(e)}return []}
function save(list){localStorage.setItem(STORE_KEY,JSON.stringify(list.map(normalizeRace)));}
function upsert(r){const x=window.REVPrediction.recalc(normalizeRace(r));x.id=raceIdOf(x);x.updatedAt=new Date().toISOString();const list=load().filter(a=>a.id!==x.id&&raceIdOf(a)!==x.id);list.unshift(x);save(list);return x;}
function byId(id){return load().find(r=>r.id===id||raceIdOf(r)===id);}
function deleteById(id){save(load().filter(r=>r.id!==id&&raceIdOf(r)!==id));}
window.REVStore={STORE_KEY,JRA_PLACES,esc,int,num,raceIdOf,frameOf,normalizeResult,normalizeRace,load,save,upsert,byId,deleteById};
})();
