(function(){
'use strict';
const $=(s,r=document)=>r.querySelector(s);
const S=window.REVStore;
function formHtml(){
  return `<div class="split"><h1>レース情報検索</h1><button class="btn gray" onclick="REVAPP.home()">トップへ</button></div>
  <div class="card">
    <div class="small">検索項目は基本情報の項目名に統一。基本の「年月日」「レース数」は検索項目から外し、検索開始日・検索終了日で期間指定します。</div>
    <div class="grid2">
      <div class="field"><label>検索開始日</label><input id="qFrom" type="date"></div>
      <div class="field"><label>検索終了日</label><input id="qTo" type="date"></div>
      <div class="field"><label>開催地</label><select id="qPlace"><option value=""></option>${S.JRA_PLACES.map(p=>`<option value="${S.esc(p)}">${S.esc(p)}</option>`).join('')}</select></div>
      <div class="field"><label>レース名</label><input id="qRaceName" placeholder="例：桜花賞"></div>
      <div class="field"><label>グレード</label><input id="qGrade" placeholder="例：G1 / 2勝"></div>
      <div class="field"><label>馬場</label><select id="qSurface"><option value=""></option><option>芝</option><option>ダ</option><option>障</option></select></div>
      <div class="field"><label>距離</label><input id="qDistance" placeholder="例：1600 / 1600m"></div>
      <div class="field"><label>条件</label><input id="qCondition" placeholder="例：定量 / ハンデ"></div>
      <div class="field"><label>年齢</label><input id="qAge" placeholder="例：3歳 / 4歳以上"></div>
      <div class="field"><label>性別</label><input id="qSex" placeholder="例：牝馬 / 混合"></div>
      <div class="field"><label>頭数</label><input id="qHeadcount" type="number" min="1" max="18" placeholder="例：18"></div>
    </div>
    <div class="btnRow"><button class="btn blue" onclick="REVAPP.searchRun()">検索</button><button class="btn gray" onclick="REVAPP.home()">閉じる</button></div>
  </div>
  <div id="searchResults"><div class="card small">検索条件を指定して「検索」を押すと、該当レースだけ表示します。</div></div>`;
}
function val(id){return String($(id)?.value||'').trim();}
function contains(actual, q){return !q || String(actual||'').toLowerCase().includes(String(q).toLowerCase());}
function run(races, cardRenderer){
  const from=val('#qFrom'), to=val('#qTo');
  const place=val('#qPlace'), raceName=val('#qRaceName'), grade=val('#qGrade'), surface=val('#qSurface');
  const distance=val('#qDistance'), condition=val('#qCondition'), age=val('#qAge'), sex=val('#qSex'), headcount=val('#qHeadcount');
  const list=(Array.isArray(races)?races:[]).filter(r=>
    (!from||r.date>=from)&&(!to||r.date<=to)&&
    contains(r.place,place)&&contains(r.raceName,raceName)&&contains(r.grade,grade)&&contains(r.surface,surface)&&
    contains(r.distance,distance)&&contains(r.condition,condition)&&contains(r.age,age)&&contains(r.sex,sex)&&
    (!headcount||String(r.headcount||'')===headcount)
  );
  const root=$('#searchResults');
  if(root) root.innerHTML=list.length?list.map(cardRenderer).join(''):'<div class="card">該当なし</div>';
}
window.REVSearch={formHtml,run};
})();
