/* ==========================================
   競馬予想検証アプリ Ver.2
   08-app.js screen implementation except validation
========================================== */
(function(){
  'use strict';
  const C=window.KV2Common, S=window.KV2Store, P=window.KV2Prediction;
  const app=document.getElementById('app');
  let searchState={mode:'all', meetingIndex:0};
  let currentDetailId='';
  const places=C.JRA_PLACES.concat(['門別','大井','川崎','船橋','浦和','園田','姫路','高知','佐賀','金沢','名古屋','笠松','盛岡','水沢']);
  function h(t,home,right){return `<div class="header">${home?`<button class="homeBtn" onclick="KV2App.showTop()">🏠</button>`:''}<span>${C.esc(t)}</span>${right||''}</div>`}
  function sc(x){return `<div class="screen">${x}</div>`}
  function opt(list,val){return list.map(x=>`<option value="${C.esc(x)}" ${x===val?'selected':''}>${C.esc(x)}</option>`).join('')}
  function resetScroll(){setTimeout(()=>{try{window.scrollTo(0,0); const scr=app.querySelector('.screen'); if(scr)scr.scrollTop=0; const tbl=app.querySelector('.inputTableWrap'); if(tbl)tbl.scrollLeft=0;}catch(e){}},0)}
  function raceHasAnyWinOdds(race){
    return (race && race.horses || []).some(horse=>{
      const raw = horse && (horse.odds ?? horse.winOdds ?? horse['単勝'] ?? horse['オッズ']);
      return String(raw ?? '').trim() !== '';
    });
  }
  function showTop(){
    const races=S.loadRaces();
    const resultMissingCount = races.filter(r=>C.resultMissing(r.result)).length;
    const oddsBlankRaceCount = races.filter(r=>!raceHasAnyWinOdds(r)).length;
    const recoverBox = races.length===0 ? `<div class="card"><div class="title">データ復元/移行</div><p class="hint">保存レースが0件の場合、同じブラウザ内に残っている旧保存キーまたはバックアップJSONから復元できます。</p><button type="button" class="green" onclick="KV2App.showMigration()">データ復元/移行を開く</button></div>` : '';
    const backupBox = `<div class="card"><div class="title">バックアップ</div><p class="hint">保存・編集・削除時に、アプリ内へ自動バックアップを作成します。新規保存後にも作成されます。外部保存用にJSON出力も残しています。</p><div class="grid3"><button type="button" class="secondary" onclick="KV2App.showAutoBackups()">自動バックアップ復元</button><button type="button" class="secondary" onclick="KV2App.exportBackupJson()">保存データJSON出力</button><label class="buttonLike secondary">JSONバックアップ取込<input type="file" accept=".json,application/json" style="display:none" onchange="KV2App.importBackupJsonFile(this)"></label></div><div id="backupMsg" class="subtle"></div></div>`;
    app.innerHTML=h('競馬予想検証アプリ Ver.2')+sc(`<div class="card topMenuCard"><div class="title">メニュー</div><button type="button" class="topNavBtn" data-top-action="input">レース情報入力</button><button type="button" class="topNavBtn" data-top-action="search">保存レース検索</button><button type="button" class="topNavBtn" data-top-action="validation">検証結果</button><button type="button" class="topNavBtn" data-top-action="consult">予想ルール相談</button></div><div class="card"><div class="title">保存状況</div><p>保存レース：${races.length}件</p><p>結果未入力：${resultMissingCount}件</p><p>オッズ空欄あり：${oddsBlankRaceCount}件</p></div>${backupBox}${recoverBox}`); bindTopMenuButtons(); resetScroll()
  }

  function showLoading(title){
    app.innerHTML = h(title || '読み込み中', true) + sc('<div class="card"><div class="title">処理中</div><p>保存レースを読み込んでいます...</p></div>');
  }
  function deferRun(title, fn){
    showLoading(title);
    setTimeout(fn, 20);
  }
  function runTopAction(action){
    if(action==='input') return deferRun('レース情報入力', ()=>showInput());
    if(action==='search') return deferRun('保存レース検索', ()=>showSearch());
    if(action==='validation') return deferRun('検証結果', ()=>showValidation());
    if(action==='consult') return deferRun('予想ルール相談', ()=>{ if(window.KV2RuleConsult && window.KV2RuleConsult.show) window.KV2RuleConsult.show('all'); });
  }
  function bindTopMenuButtons(){
    document.querySelectorAll('[data-top-action]').forEach(btn=>{
      if(btn.__kv2Bound) return;
      btn.__kv2Bound=true;
      const handler=function(ev){
        const action=this.getAttribute('data-top-action');
        if(!action) return;
        if(ev){ ev.preventDefault(); ev.stopPropagation(); }
        runTopAction(action);
      };
      btn.addEventListener('click', handler, false);
    });
  }
  function showInput(id){
    let race=id?S.getRace(id):S.blankRace({}); race=S.normalizeRace(race||{});
    app.innerHTML=h('レース情報入力',true)+sc(`<div class="card"><div class="title">基本情報</div><div class="grid3"><div><label>年月日</label><input id="raceDate" type="date" value="${C.esc(race.date)}"></div><div><label>開催地</label><select id="racePlace"><option></option>${opt(places,race.place)}</select></div><div><label>レース数</label><select id="raceNo"><option></option>${opt(Array.from({length:12},(_,i)=>`${i+1}R`),race.raceNo)}</select></div></div><div class="grid4"><div><label>レース名</label><input id="raceName" value="${C.esc(race.raceName)}"></div><div><label>グレード</label><select id="grade"><option></option>${opt(['G1','G2','G3','J-G1','J-G2','J-G3','OP','L','特別1勝','特別2勝','特別3勝','1勝','2勝','3勝'],race.grade)}</select></div><div><label>馬場</label><select id="surface"><option></option>${opt(['芝','ダート','障害'],race.surface)}</select></div><div><label>距離</label><input id="distance" value="${C.esc(race.distance)}"></div></div><div class="grid4"><div><label>条件</label><select id="condition">${opt(['定量','別定','ハンデ'],race.condition||'定量')}</select><div class="subtle">別定・ハンデ以外は定量扱い</div></div><div><label>年齢</label><select id="age"><option></option>${opt(['2歳','3歳','3歳以上','4歳以上'],race.age)}</select></div><div><label>性別</label><select id="sex"><option></option>${opt(['牝','混合'],race.sex||'混合')}</select></div><div><label>頭数</label><input id="headCount" type="number" min="1" max="18" value="${C.esc(race.headCount||18)}"></div></div></div>
    <div class="card"><div class="title">テキスト入力</div><div class="grid2"><div class="wideField"><label>基本・出馬表・前走</label><textarea id="combinedText" placeholder="基本情報・出馬表・前走をまとめて貼り付け"></textarea><button class="secondary" onclick="KV2App.parseText('combined')">基本・出馬表・前走を解析</button></div><div><label>オッズ</label><textarea id="oddsText" placeholder="オッズを貼り付け"></textarea><button class="secondary" onclick="KV2App.parseText('odds')">オッズを解析</button></div><div><label>結果</label><textarea id="resultText" placeholder="結果を貼り付け"></textarea><button class="secondary" onclick="KV2App.parseText('result')">結果を解析</button></div></div></div>
    <div class="card"><div class="between"><div class="title">出馬表・前走・オッズ</div><div><button class="small secondary" onclick="KV2App.setProvisional()">確定前</button><button class="small secondary" onclick="KV2App.refreshHorseRows()">頭数で行を作成</button><button class="small secondary" onclick="KV2App.clearHorses()">出馬表をクリア</button></div></div><div class="hint">確定前は馬番・枠を空欄保存できます。出馬表確定後に馬番を入れて保存すると馬番順に並び替え、枠も自動反映します。</div><div class="tableWrap inputTableWrap"><table><thead><tr><th class="stickyMark">印</th><th class="stickyFrame">枠</th><th class="stickyNo">馬番</th><th>馬名</th><th>単勝</th><th>人気</th><th>前走</th><th>前2</th><th>前3</th></tr></thead><tbody id="horseRows">${horseRows(race)}</tbody></table></div></div>
    <div class="bottomBar actionBar"><button class="secondary" onclick="KV2App.showTop()">トップへ</button><button class="green" onclick="KV2App.saveInput()">保存</button>${id?`<button class="red" onclick="KV2App.deleteRace('${C.esc(id)}')">削除</button>`:''}</div><div id="inputMessage"></div>`);
    window.KV2_EDITING_RACE_ID=id||'';
    resetScroll();
    updatePopularity();
  }
  function horseRows(race){
    const head=C.toInt(race.headCount)||18; const hs=race.horses||[]; const marks=(race.prediction&&race.prediction.marks)||{};
    let out='';
    for(let i=0;i<head;i++){
      const h=hs[i]||{no:i+1}; const no=h.no||''; const frame=no?C.frameOf(no,head):'';
      out+=`<tr><td class="stickyMark markCell">${C.esc(marks[no]||'')}</td><td class="stickyFrame">${frame?`<span class="frameCell frame${frame}">${frame}</span>`:''}</td><td class="stickyNo"><input class="shortInput" data-horse-row="${i}" data-field="no" value="${C.esc(no)}"></td><td><input class="horseNameInput" data-horse-row="${i}" data-field="name" maxlength="9" value="${C.esc(h.name||'')}"></td><td><input class="oddsInput" data-horse-row="${i}" data-field="odds" oninput="KV2App.updatePopularity()" value="${C.esc(h.odds||'')}"></td><td><input class="shortInput" data-horse-row="${i}" data-field="popularity" readonly value="${C.esc(h.popularity||'')}"></td><td><input class="shortInput" data-horse-row="${i}" data-field="past1" value="${C.esc(h.past1||'')}"></td><td><input class="shortInput" data-horse-row="${i}" data-field="past2" value="${C.esc(h.past2||'')}"></td><td><input class="shortInput" data-horse-row="${i}" data-field="past3" value="${C.esc(h.past3||'')}"></td></tr>`;
    }
    return out;
  }
  function collectRace(){
    const id=window.KV2_EDITING_RACE_ID||''; const old=id?S.getRace(id):null;
    const race={date:val('raceDate'),place:val('racePlace'),raceNo:val('raceNo'),raceName:val('raceName'),grade:val('grade'),surface:val('surface'),distance:val('distance'),condition:val('condition')||'定量',age:val('age'),sex:val('sex'),headCount:C.toInt(val('headCount'))||18,horses:[],result:(old&&old.result)||{firsts:[],seconds:[],thirds:[],tansho:[],umaren:[],wide:[],sanrenpuku:[]},prediction:(old&&old.prediction)||{}};
    const map={}; document.querySelectorAll('[data-horse-row]').forEach(el=>{const i=el.dataset.horseRow; map[i]=map[i]||{}; map[i][el.dataset.field]=el.value;});
    race.horses=Object.keys(map).map(k=>map[k]).filter(h=>h.name||h.no||h.odds||h.past1||h.past2||h.past3).map((h,i)=>({no:C.toInt(h.no)||'',name:(h.name||'').slice(0,9),odds:h.odds||'',popularity:h.popularity||'',past1:h.past1||'',past2:h.past2||'',past3:h.past3||''}));
    race.horses.sort((a,b)=>(C.toInt(a.no)||999)-(C.toInt(b.no)||999));
    return S.normalizeRace(race);
  }
  function updatePopularity(){
    const rows=[...document.querySelectorAll('#horseRows tr')];
    const items=[];
    rows.forEach(row=>{
      const oddsEl=row.querySelector('[data-field="odds"]');
      const popEl=row.querySelector('[data-field="popularity"]');
      const odds=C.toNum(oddsEl&&oddsEl.value);
      if(popEl) popEl.value='';
      if(odds!==null && oddsEl && String(oddsEl.value).trim()!=='') items.push({odds,popEl});
    });
    items.sort((a,b)=>a.odds-b.odds);
    let prev=null, rank=0;
    items.forEach((x,i)=>{ if(prev===null || x.odds!==prev) rank=i+1; if(x.popEl) x.popEl.value=rank; prev=x.odds; });
  }
  function refreshPredictionMarksInForm(){
    try{
      let race=collectRace();
      let marks={};
      if(canGeneratePrediction(race)){
        const generated=P.generate(race, S.loadRaces().filter(x=>x.id!==race.id));
        marks=(generated.prediction&&generated.prediction.marks)||{};
      }
      document.querySelectorAll('#horseRows tr').forEach(row=>{
        const noEl=row.querySelector('[data-field="no"]');
        const no=noEl?String(noEl.value||'').trim():'';
        const cell=row.querySelector('.markCell');
        if(cell) cell.textContent=marks[no]||'';
      });
    }catch(e){
      console.error('refreshPredictionMarksInForm error', e);
      document.querySelectorAll('#horseRows .markCell').forEach(cell=>{ cell.textContent=''; });
    }
  }
  function val(id){const e=document.getElementById(id); return e?e.value:''}
  function saveInput(){
    const saveBtn=document.querySelector('.bottomBar .green');
    if(saveBtn){ saveBtn.disabled=true; saveBtn.textContent='保存中...'; }
    try{
      let race=collectRace();
      if(!race.date || !race.place || !race.raceNo){
        msg('年月日・開催地・レース数を入力してください。');
        if(saveBtn){ saveBtn.disabled=false; saveBtn.textContent='保存'; }
        return;
      }
      if(window.KV2_PENDING_RESULT){
        race.result=fillTanshoByRaceOdds(window.KV2_PENDING_RESULT, race);
        window.KV2_PENDING_RESULT=null;
      }else if(race.result){
        race.result=fillTanshoByRaceOdds(race.result, race);
      }
      try{
        if(canGeneratePrediction(race)){
          race=P.generate(race, S.loadRaces().filter(x=>x.id!==race.id));
        }
      }catch(e){
        console.error('prediction generate error on saveInput', e);
        // 予想生成で失敗してもレース情報自体は保存できるようにする。
        race.prediction = race.prediction || {};
      }
      race=S.upsertRace(race);
      try{
        showDetail(race.id,'entry');
      }catch(e){
        console.error('showDetail after save error', e);
        alert('保存は完了しましたが、詳細画面の表示でエラーが出ました。保存レース検索から確認してください。\n' + (e&&e.message?e.message:String(e)));
        showSearch();
      }
    }catch(e){
      console.error('saveInput error', e);
      const isQuota = e && (e.name === 'QuotaExceededError' || /quota/i.test(String(e.message||'')));
      alert((isQuota?'保存容量上限のため保存できませんでした。不要な旧CSV/相談履歴を削除して再試行しましたが失敗しました。':'レース保存中にエラーが発生しました。') + '\n' + (e&&e.message?e.message:String(e)));
      if(saveBtn){ saveBtn.disabled=false; saveBtn.textContent='保存'; }
    }
  }
  function setProvisional(){
    document.querySelectorAll('#horseRows tr').forEach(row=>{
      const no=row.querySelector('[data-field="no"]');
      const frame=row.querySelector('.stickyFrame');
      if(no) no.value='';
      if(frame) frame.innerHTML='';
    });
    updatePopularity();
    msg('確定前にしました。馬番・枠は空欄保存できます。');
  }
  function refreshHorseRows(){const race=collectRace(); document.getElementById('horseRows').innerHTML=horseRows(race); updatePopularity(); refreshPredictionMarksInForm()}
  function clearHorses(){if(confirm('出馬表をクリアしますか？')){document.querySelectorAll('[data-horse-row]').forEach(e=>e.value='')}}
  function msg(t){const m=document.getElementById('inputMessage'); if(m)m.innerHTML=`<div class="card ok">${C.esc(t)}</div>`}

  function oddsNameMapFromText(text){
    const map={};
    try{
      let src=String(text||'').replace(/\r/g,'');
      // オッズ欄だけを見る。結果欄・払戻欄からは絶対に補完しない。
      const cut=src.search(/\n\s*(結果|レース結果\(着順\)|着順|払戻金)\s*\n/);
      if(cut>0) src=src.slice(0,cut);
      const lines=src.split('\n').map(x=>String(x||'').trim()).filter(Boolean);
      function badName(x){
        x=String(x||'').trim();
        return !x || /^(印|番|馬名|選択|人気順|馬番順|オッズ|単勝|確定|Copyright|登録)$/.test(x)
          || /人気|倍|父 |母 |牡|牝|kg|週|替|全 |ダ |芝 |ﾀｲﾑ|対戦|DM|騎手|調教師|馬主|生産者/.test(x)
          || /^\d+(?:\.\d+)?$/.test(x) || /^[①-⑯\s]+$/.test(x);
      }
      function put(no,name){
        no=String(no||'').trim(); name=String(name||'').trim();
        if(!/^\d{1,2}$/.test(no) || badName(name)) return;
        if(Number(no)<1 || Number(no)>18) return;
        map[no]=name.slice(0,9);
      }
      for(let i=0;i<lines.length;i++){
        // 8 ディールメーカー 14.0
        let m=lines[i].match(/^(\d{1,2})\s+(.+?)\s+\d+\.\d\s*(?:倍)?$/);
        if(m){ put(m[1],m[2]); continue; }
        // 8 ディールメーカー / 次行 14.0
        m=lines[i].match(/^(\d{1,2})\s+(.+)$/);
        if(m){
          for(let j=i+1;j<Math.min(lines.length,i+6);j++){
            if(/^\d+\.\d\s*(?:倍)?$/.test(lines[j])){ put(m[1],m[2]); break; }
          }
          continue;
        }
        // 8 / ディールメーカー / 14.0
        m=lines[i].match(/^(\d{1,2})$/);
        if(m){
          let nm='';
          for(let j=i+1;j<Math.min(lines.length,i+8);j++){
            if(!nm && !badName(lines[j])){ nm=lines[j]; continue; }
            if(nm && /^\d+\.\d\s*(?:倍)?$/.test(lines[j])){ put(m[1],nm); break; }
          }
        }
      }
    }catch(e){}
    return map;
  }
  function fillBlankHorseNamesFromOddsText(){
    const oddsEl=document.getElementById('oddsText');
    const names=oddsNameMapFromText(oddsEl?oddsEl.value:'');
    if(!Object.keys(names).length) return;
    document.querySelectorAll('#horseRows tr').forEach(row=>{
      const noEl=row.querySelector('[data-field="no"]');
      const nameEl=row.querySelector('[data-field="name"]');
      const no=noEl?String(noEl.value||'').trim():'';
      if(no && names[no] && nameEl && !String(nameEl.value||'').trim()) nameEl.value=names[no];
    });
  }

  function parseText(type){
    const race=collectRace(); const parser=window.KV2Parser; let data={};
    if(type==='combined') data=parser.parseCombined(val('combinedText'));
    if(type==='basic') data=parser.parseBasic(val('basicText'));
    if(type==='entry') data=parser.parseEntry(val('entryText'));
    if(type==='past') data=parser.parsePast(val('pastText'));
    if(type==='odds') data=parser.parseOdds(val('oddsText'));
    if(type==='result') data=parser.parseResult(val('resultText'));
    applyParsed(race,type,data); document.getElementById('manualFormHack');
  }
  function applyParsed(race,type,data){
    if(type==='combined'){
      Object.keys(data).forEach(k=>{
        if(k==='horses'||k==='pastMap') return;
        const id={date:'raceDate',place:'racePlace',raceNo:'raceNo',raceName:'raceName',headCount:'headCount'}[k]||k;
        const e=document.getElementById(id);
        if(e&&data[k]) e.value=data[k];
      });
      if(data.horses&&data.horses.length) mergeHorses(data.horses,{updateOdds:false});
      if(data.pastMap) applyMap(data.pastMap);
      refreshPredictionMarksInForm(); msg('基本・出馬表・前走を反映しました。出馬表 '+((data.horses||[]).length)+'頭 / 前走 '+Object.keys(data.pastMap||{}).length+'頭。オッズ・人気は更新していません。');
    }
    if(type==='basic'){Object.keys(data).forEach(k=>{const id={date:'raceDate',place:'racePlace',raceNo:'raceNo',raceName:'raceName',headCount:'headCount'}[k]||k; const e=document.getElementById(id); if(e&&data[k]) e.value=data[k];}); msg('基本情報を反映しました。');}
    if(type==='entry'){mergeHorses(data.horses||[],{updateOdds:false}); refreshPredictionMarksInForm(); msg('出馬表を反映しました。出馬表 '+((data.horses||[]).length)+'頭。オッズ・人気は更新していません。');}
    if(type==='past'){applyMap(data.pastMap||{}); refreshPredictionMarksInForm(); msg('前走を反映しました。前走 '+Object.keys(data.pastMap||{}).length+'頭。');}
    if(type==='odds'){applyMap(data.oddsMap||{}); updatePopularity(); refreshPredictionMarksInForm(); msg('オッズを反映しました。馬名は出馬表からのみ反映します。');}
    if(type==='result'){
      const result=fillTanshoFallback(data.result||{});
      window.KV2_PENDING_RESULT=result;
      renderResultPreview(result);
      msg('結果を入力欄へ反映しました。まだ保存していません。保存ボタンで登録します。');
    } else if(window.KV2_PENDING_RESULT){
      // 出馬表・オッズの再解析後でも、結果プレビューの馬名を最新の出馬表から再表示する
      renderResultPreview(window.KV2_PENDING_RESULT);
    }
  }
  function fillTanshoFallback(result){
    result=result||{};
    result.firsts=result.firsts||[]; result.tansho=result.tansho||[];
    const have=new Set(result.tansho.map(x=>String(x.combo||'')));
    const oddsByNo={};
    document.querySelectorAll('#horseRows tr').forEach(row=>{
      const noEl=row.querySelector('[data-field="no"]');
      const oddsEl=row.querySelector('[data-field="odds"]');
      const no=noEl?String(noEl.value||'').trim():'';
      const odds=C.toNum(oddsEl&&oddsEl.value);
      if(no && odds!==null) oddsByNo[no]=Math.round(odds*100);
    });
    result.firsts.forEach(no=>{
      no=String(no||'').trim();
      if(no && !have.has(no) && oddsByNo[no]){
        result.tansho.push({combo:no,pay:String(oddsByNo[no])});
        have.add(no);
      }
    });
    return result;
  }
  function fillTanshoByRaceOdds(result,race){
    // 1着馬が単勝の目に入る。払戻が未入力なら出馬表の単勝オッズ×100円で自動作成する。
    // 手入力済みの単勝払戻は上書きしないため、テキスト入力・手入力の両方に対応できる。
    result=result||{};
    result.firsts=(result.firsts||[]).map(x=>String(x||'').trim()).filter(Boolean);
    result.tansho=Array.isArray(result.tansho)?result.tansho:[];
    const have=new Set(result.tansho.map(x=>String(x&&x.combo||'').trim()).filter(Boolean));
    const oddsMap={};
    ((race&&race.horses)||[]).forEach(h=>{
      const no=String(h&&h.no||'').trim();
      const odds=C.toNum(h&&(h.odds ?? h.winOdds ?? h['単勝'] ?? h['オッズ']));
      if(no && odds!==null) oddsMap[no]=Math.round(odds*100);
    });
    result.firsts.forEach(no=>{
      if(no && !have.has(no) && oddsMap[no]){
        result.tansho.push({combo:no,pay:String(oddsMap[no]),auto:true});
        have.add(no);
      }
    });
    return result;
  }
  function horseNameMapFromForm(){
    const map={};

    // 画面上の入力表から取得
    document.querySelectorAll('#horseRows tr').forEach(row=>{
      const noEl=row.querySelector('[data-field="no"]');
      const nameEl=row.querySelector('[data-field="name"]');
      const no=noEl?String(noEl.value||'').trim():'';
      const name=nameEl?String(nameEl.value||'').trim():'';
      if(no && name) map[no]=name;
    });

    // 保存済み・編集中レースからも補完
    try{
      const race=collectRace();
      (race.horses||[]).forEach(h=>{
        const no=String(h.no||'').trim();
        const name=String(h.name||'').trim();
        if(no && name && !map[no]) map[no]=name;
      });
    }catch(e){}

    return map;
  }
  function renderResultPreview(result){
    let box=document.getElementById('resultPreview');
    if(!box){
      const host=document.getElementById('inputMessage');
      if(host){
        host.insertAdjacentHTML('beforebegin','<div class="card"><div class="title">結果解析プレビュー</div><div id="resultPreview"></div></div>');
        box=document.getElementById('resultPreview');
      }
    }
    if(!box)return;
    const nameMap=horseNameMapFromForm();
    const arr=(a)=>(a||[]).map(no=>{
      no=String(no||'').trim();
      return [no,nameMap[no]||''].filter(Boolean).join(' ');
    }).join(' / ')||'-';
    const pay=(a)=>(a||[]).map(x=>[x.combo,x.pay].filter(Boolean).join(' ')).join(' / ')||'-';
    box.innerHTML='<table class="miniStats"><tr><th>項目</th><th>内容</th></tr>'
      +'<tr><td>1着</td><td>'+C.esc(arr(result.firsts))+'</td></tr>'
      +'<tr><td>2着</td><td>'+C.esc(arr(result.seconds))+'</td></tr>'
      +(result.seconds&&result.seconds.length>1?'':'<tr><td>3着</td><td>'+C.esc(arr(result.thirds))+'</td></tr>')
      +'<tr><td>単勝</td><td>'+C.esc(pay(result.tansho))+'</td></tr>'
      +'<tr><td>馬連</td><td>'+C.esc(pay(result.umaren))+'</td></tr>'
      +'<tr><td>ワイド</td><td>'+C.esc(pay(result.wide))+'</td></tr>'
      +'<tr><td>3連複</td><td>'+C.esc(pay(result.sanrenpuku))+'</td></tr>'
      +'</table>';
  }
  function mergeHorses(list,opts){
    opts=opts||{};
    const updateOdds=opts.updateOdds===true;
    const race=collectRace();
    const by=new Map((race.horses||[]).map(h=>[String(h.no||h.name),h]));
    (list||[]).forEach(h=>{
      const key=String(h.no||h.name);
      const base=Object.assign({},by.get(key)||{});
      const patch={};
      if(h.no!==undefined) patch.no=h.no;
      if(h.name!==undefined) patch.name=h.name;
      if(h.past1!==undefined) patch.past1=h.past1;
      if(h.past2!==undefined) patch.past2=h.past2;
      if(h.past3!==undefined) patch.past3=h.past3;
      if(updateOdds){
        if(h.odds!==undefined) patch.odds=h.odds;
        if(h.popularity!==undefined) patch.popularity=h.popularity;
      }
      by.set(key,Object.assign(base,patch));
    });
    race.horses=[...by.values()];
    document.getElementById('horseRows').innerHTML=horseRows(race); updatePopularity(); refreshPredictionMarksInForm()
  }
  function applyMap(map){document.querySelectorAll('[data-horse-row]').forEach(el=>{const row=el.closest('tr'); const no=row.querySelector('[data-field="no"]').value; if(map[no] && map[no][el.dataset.field]!==undefined) el.value=map[no][el.dataset.field];}); updatePopularity(); refreshPredictionMarksInForm()}
  function deleteRace(id){if(confirm('削除しますか？')){S.deleteRace(id);showSearch()}}
  function displayRaceName(r){return String(r && r.raceName || '').replace(/(?:\s*(?:J[-・]?G\s*[1-3]|G\s*[1-3]|Ｇ[ⅠⅡⅢ]|GI|GII|GIII))+\s*$/i,'').trim()}
  function distanceText(r){const d=String(r&&r.distance||'').trim(); return d?(/m$/i.test(d)?d:d+'m'):''}
  function conditionLabel(r){return [r.grade||'',r.surface||'',distanceText(r),r.condition||''].filter(Boolean).join('・')||'今回条件'}

  function sameCondScore(r,x){
    let score=0;
    if(String(r.grade||'')===String(x.grade||'')) score+=3;
    if(String(r.surface||'')===String(x.surface||'')) score+=3;
    if(String(r.condition||'')===String(x.condition||'')) score+=3;
    if(distanceText(r) && distanceText(r)===distanceText(x)) score+=2;
    if(String(r.age||'')===String(x.age||'')) score+=1;
    return score;
  }
  function axisScoreBucket(score){
    score=C.toInt(score)||0;
    if(score>=70) return '70以上';
    if(score>=50) return '50〜69';
    if(score>=30) return '30〜49';
    return '30未満';
  }
  function hasMarkOverlap(r,no){
    const marks=(r.prediction&&r.prediction.marks)||{};
    const n=C.toInt(no); if(!n) return false;
    const m=String(marks[n]||'');
    return !!(m && (String(marks[n-1]||'') || String(marks[n+1]||'') || m.length>=2));
  }
  function rateForAxis(list,pred){
    const arr=(list||[]).filter(pred||(()=>true));
    let hit=0;
    arr.forEach(x=>{try{if(axisHitInfo(x).hit)hit++;}catch(e){}});
    return {n:arr.length,hit,rate:arr.length?Math.round(hit/arr.length*1000)/10:null};
  }
  function sampleComment(stat,label){
    if(!stat || !stat.n) return `${label}はまだ参考レースがありません。`;
    if(stat.n<3) return `${label}は${stat.n}Rのみのため、率では判断しません。`;
    if(stat.n<10) return `${label}は${stat.n}Rで、まだ参考値として扱います。`;
    return `${label}${stat.n}Rでは軸複勝率${stat.rate}%です。`;
  }
  function starLevel(n,max){
    const v=Math.max(1,Math.min(5,Math.round(n/max*5)));
    return '★★★★★'.slice(0,v)+'☆☆☆☆☆'.slice(0,5-v);
  }
  function aiEvidence(r){
    const p=r.prediction||{}, axis=p.axis||{};
    const axisNo=C.toInt(axis.no), score=C.toInt(p.axisScore||axis.score)||0;
    const bucket=axisScoreBucket(score);
    const all=S.loadRaces().filter(x=>x&&x.id!==r.id&&!C.resultMissing(x.result)&&x.prediction&&x.prediction.axis&&x.prediction.axis.no);
    const ranked=all.map(x=>({race:x,score:sameCondScore(r,x)})).sort((a,b)=>b.score-a.score);
    const exact=ranked.filter(x=>x.score>=11).map(x=>x.race);
    const nearGrade=ranked.filter(x=>x.score>=9).map(x=>x.race);
    const nearDistance=ranked.filter(x=>String(x.race.surface||'')===String(r.surface||'') && distanceText(x.race)===distanceText(r) && String(x.race.condition||'')===String(r.condition||'')).map(x=>x.race);
    const broad=ranked.filter(x=>String(x.race.surface||'')===String(r.surface||'') && String(x.race.condition||'')===String(r.condition||'')).map(x=>x.race);
    const fallback=ranked.slice(0,60).map(x=>x.race);
    const sample=(broad.length?broad:fallback).slice(0,60);
    const base=rateForAxis(sample);
    const same=rateForAxis(exact);
    const nearGradeStat=rateForAxis(nearGrade);
    const nearDistanceStat=rateForAxis(nearDistance);
    const broadStat=rateForAxis(broad);
    const scoreStat=rateForAxis(sample,x=>axisScoreBucket(C.toInt(x.prediction&&x.prediction.axisScore||x.prediction&&x.prediction.axis&&x.prediction.axis.score))===bucket);
    const fiveStat=rateForAxis(sample,x=>isFiveFamily(x.prediction&&x.prediction.axis&&x.prediction.axis.no,x.headCount));
    const nonFiveStat=rateForAxis(sample,x=>!isFiveFamily(x.prediction&&x.prediction.axis&&x.prediction.axis.no,x.headCount));
    const overlapStat=rateForAxis(sample,x=>hasMarkOverlap(x,x.prediction&&x.prediction.axis&&x.prediction.axis.no));
    const axisFive=axisNo?isFiveFamily(axisNo,r.headCount):false;
    const axisOverlap=hasMarkOverlap(r,axisNo);
    const tiers=[
      {key:'same',label:'同条件',detail:conditionLabel(r),stat:same},
      {key:'nearGrade',label:'近似条件①',detail:[r.surface,r.grade,r.condition].filter(Boolean).join('・')||'近いグレード条件',stat:nearGradeStat},
      {key:'nearDistance',label:'近似条件②',detail:[r.surface,distanceText(r),r.condition].filter(Boolean).join('・')||'近い距離条件',stat:nearDistanceStat},
      {key:'broad',label:'全体条件',detail:[r.surface,r.condition].filter(Boolean).join('・')||'全体条件',stat:broadStat}
    ];
    const primary = same.n>=3 ? same : (nearGradeStat.n>=3 ? nearGradeStat : (nearDistanceStat.n>=3 ? nearDistanceStat : (broadStat.n>=3 ? broadStat : same)));
    const primaryLabel = same.n>=3 ? '同条件' : (nearGradeStat.n>=3 ? '近似条件①' : (nearDistanceStat.n>=3 ? '近似条件②' : (broadStat.n>=3 ? '全体条件' : '参考レース不足')));
    const compare=[];
    if(scoreStat.n>=10) compare.push(`軸スコア${bucket}の過去${scoreStat.n}Rは軸複勝率${scoreStat.rate}%`);
    else if(scoreStat.n>=3) compare.push(`軸スコア${bucket}は過去${scoreStat.n}Rの参考値`);
    if(axisFive && fiveStat.n>=10) compare.push(`5系軸は過去${fiveStat.n}Rで${fiveStat.rate}%`);
    if(!axisFive && nonFiveStat.n>=10) compare.push(`5系非該当軸は過去${nonFiveStat.n}Rで${nonFiveStat.rate}%`);
    if(axisOverlap && overlapStat.n>=10) compare.push(`印重複/隣印ありは過去${overlapStat.n}Rで${overlapStat.rate}%`);
    const dataStars=same.n>=10?'★★★★★':same.n>=3?'★★★☆☆':(broadStat.n>=10?'★★★☆☆':broadStat.n>=3?'★★☆☆☆':'★☆☆☆☆');
    const matchStars=same.n?'★★★★★':nearGradeStat.n?'★★★★☆':nearDistanceStat.n?'★★★☆☆':broadStat.n?'★★☆☆☆':'★☆☆☆☆';
    const axisStars=score>=70?'★★★★★':score>=50?'★★★★☆':score>=30?'★★★☆☆':'★★☆☆☆';
    const tierMax=Math.max(same.n||0,nearGradeStat.n||0,nearDistanceStat.n||0,broadStat.n||0);
    const dataState=tierMax===0?'none':(tierMax<3?'thin':(tierMax<10?'reference':'enough'));
    return {sample:sample.length,label:primaryLabel,base,primary,same,nearGradeStat,nearDistanceStat,broadStat,scoreStat,fiveStat,nonFiveStat,overlapStat,axisFive,axisOverlap,compare,tiers,bucket,dataStars,matchStars,axisStars,tierMax,dataState};
  }
  function evidenceSentence(ev){
    if(!ev || !ev.same) return '保存済みレースでは、この条件の参考データが十分ではありません。今回は現在の予想ルール、軸スコア、印、相手候補のバランスを重視して判断しています。';
    if(ev.dataState==='none'){
      return '保存済みレースでは、この条件の参考データが十分ではありません。今回は過去データだけに依存せず、現在の予想ルール、軸スコア、印、相手候補のバランスを重視して判断しています。';
    }
    if(ev.dataState==='thin'){
      return '参考件数がまだ少ないため、数値は出さず、現在の予想ルールと近い条件の傾向を補助的に見ています。';
    }
    if(ev.same.n<10){
      return `同条件の参考レースは${ev.same.n}Rです。まだ参考値として扱い、近い条件も合わせて確認しています。`;
    }
    const parts=[`同条件${ev.same.n}Rでは軸複勝率${ev.same.rate}%`];
    if(ev.scoreStat&&ev.scoreStat.n>=10) parts.push(`軸スコア${ev.bucket}は${ev.scoreStat.rate}%`);
    if(ev.axisFive && ev.fiveStat&&ev.fiveStat.n>=10) parts.push(`5系軸は${ev.fiveStat.rate}%`);
    if(!ev.axisFive && ev.nonFiveStat&&ev.nonFiveStat.n>=10) parts.push(`5系非該当軸は${ev.nonFiveStat.rate}%`);
    return parts.join('、')+'です。';
  }
  function evidenceRangePanel(ev){
    if(!ev || !ev.tiers) return '';
    if(ev.dataState==='none'){
      return `<div class="aiEvidenceBox"><h5>参考データ</h5><p>保存済みレースでは十分な参考件数がありませんでした。今後データが蓄積されると、同条件・近似条件との比較も行います。</p></div>`;
    }
    const rows=ev.tiers.map(t=>`<tr><td>${C.esc(t.label)}</td><td class="left">${C.esc(t.detail)}</td><td>${C.esc((t.stat&&t.stat.n)||0)}R</td><td class="left">${C.esc(sampleComment(t.stat,t.label))}</td></tr>`).join('');
    const note=(ev.same&&ev.same.n>=10)
      ? '同条件の蓄積が十分あるため、同条件の数値を中心に判断しています。'
      : (ev.dataState==='thin' ? '参考件数がまだ少ないため、率は表示せず、現行ルールと候補比較を中心に判断しています。' : '同条件だけでは判断材料が不足しているため、近い条件まで広げて評価しています。');
    return `<div class="aiEvidenceBox"><h5>今回AIが参考にしたデータ</h5><div class="tableWrap"><table class="miniStats"><tr><th>範囲</th><th>条件</th><th>件数</th><th>扱い</th></tr>${rows}</table></div><p class="subtle">${C.esc(note)}</p></div>`;
  }
  function confidenceBreakdown(ev,confidence){
    return `<div class="aiConfidenceBox"><span><b>条件一致度</b> ${C.esc(ev&&ev.matchStars||'★☆☆☆☆')}</span><span><b>データ量</b> ${C.esc(ev&&ev.dataStars||'★☆☆☆☆')}</span><span><b>軸評価</b> ${C.esc(ev&&ev.axisStars||'★★★☆☆')}</span><span><b>総合信頼度</b> ${C.esc(confidence)}%</span></div>`;
  }
  function raceHeader(r){return `<div class="card"><div class="between"><div><div>${C.esc(r.date)}（${['日','月','火','水','木','金','土'][new Date(r.date).getDay()]||''}）</div><div style="font-size:20px;color:#075bb5;font-weight:800">${C.esc(r.place)} ${C.esc(r.raceNo)}</div></div><div><span style="font-size:26px;font-weight:900">${C.esc(displayRaceName(r))}</span> <span class="pill">${C.esc(r.grade)}</span><br>${C.esc(r.surface)} ${C.esc(distanceText(r))}　${C.esc(r.age)} ${C.esc(r.condition)}　${C.esc(r.headCount)}頭</div><div><button class="small secondary" onclick="KV2App.showInput('${C.esc(r.id)}')">編集</button></div></div></div>`}
  function predictionReady(r){
    const p=r&&r.prediction||{};
    // 旧版の保存済み予想は、表示時・予想再生成時にrev2-011ロジックで作り直す。
    if(!p || p.version !== (P && P.version)) return false;
    return !!(p.marks && Object.keys(p.marks).length) || !!(p.axis && p.axis.no) || (Array.isArray(p.umaren)&&p.umaren.length) || (Array.isArray(p.wide)&&p.wide.length) || (Array.isArray(p.sanrenpuku)&&p.sanrenpuku.length);
  }
  function canGeneratePrediction(r){
    if(!(r && Array.isArray(r.horses))) return false;
    // 予想生成はオッズが1頭以上入ってから。
    // オッズ発表前の空欄馬は出馬表には表示するが、予想対象にはしない。
    return r.horses.some(h=>h && h.no && String(h.odds||'').trim()!=='' && !h.cancelled);
  }
  function generatePredictionForDisplay(r, persist){
    if(!canGeneratePrediction(r)) return r;
    const races=S.loadRaces();
    const generated=P.generate(r, races);
    if(persist){
      try{ S.upsertRace(generated); }catch(e){ console.error('prediction persist error', e); }
    }
    return generated;
  }
  function detailTabs(id,tab){return `<div class="tabs tabs2"><button class="${tab==='entry'?'active':''}" onclick="KV2App.showDetail('${C.esc(id)}','entry')">出馬表</button><button class="${tab==='result'?'active':''}" onclick="KV2App.showDetail('${C.esc(id)}','result')">予想/結果</button></div>`}
  function showDetail(id,tab){let r=S.getRace(id); if(!r)return showSearch(); currentDetailId=id; if(canGeneratePrediction(r) && !predictionReady(r)) r=generatePredictionForDisplay(r,true); tab=(tab==='result')?'result':'entry'; app.innerHTML=h(tab==='result'?'レース予想/結果':'レース情報',true,`<button class="rightBtn" onclick="KV2App.showSearch()">検索へ</button>`)+sc(raceHeader(r)+detailTabs(id,tab)+detailNav(id,tab)+(tab==='result'?resultHtml(r):entryHtml(r))); resetScroll()}
  function entryHtml(r){const hs=(r.horses||[]).filter(h=>h && (h.no||h.name||h.past1||h.past2||h.past3||h.odds)); const marks=(r.prediction&&r.prediction.marks)||{}; return `<div class="card"><div class="between entryStatusOnly"><span></span><span class="badge green">馬番確定</span></div><div class="tableWrap"><table><thead><tr><th class="stickyMark">印</th><th class="stickyFrame">枠</th><th class="stickyNo">馬番</th><th>馬名（最大9文字）</th><th>単勝</th><th>人気</th><th>前走</th><th>前2</th><th>前3</th></tr></thead><tbody>${hs.map(h=>`<tr><td class="stickyMark markCell">${C.esc(marks[h.no]||'')}</td><td class="stickyFrame"><span class="frameCell frame${h.frame}">${h.frame}</span></td><td class="stickyNo">${h.no}</td><td class="left">${C.esc(h.name)}</td><td>${C.esc(h.odds)}</td><td>${C.esc(h.popularity)}</td><td>${C.esc(h.past1)}</td><td>${C.esc(h.past2)}</td><td>${C.esc(h.past3)}</td></tr>`).join('')}</tbody></table></div></div>`}
  function safeResultSection(name,fn){
    try{return fn();}
    catch(e){
      console.error('result section error:',name,e);
      return `<div class="card hint"><b>${C.esc(name)}の表示でエラー</b><br>この項目だけ表示をスキップしました。予想/結果画面自体は開けるようにしています。必要なら予想再生成または編集から保存し直してください。</div>`;
    }
  }
  function resultHtml(r){
    return `<div class="card hint"><b>保存済みの予想/結果</b><br>着順・払戻金は保存済みデータとして表示します。この画面では編集できません。修正する場合はレース情報入力画面から行ってください。</div>`+
      safeResultSection('予想',()=>predictionPanel(r,true))+
      safeResultSection('結果',()=>resultDisplayPanel(r))+
      safeResultSection('結果サマリー',()=>resultSummary(r))+
      safeResultSection('AI振り返り',()=>reflectionPanel(r))+
      safeResultSection('印分析',()=>markAnalysisReportPanel(r))+
      safeResultSection('決まり目分析',()=>decisionReportPanel(r))+
      `<div class="bottomBar resultReadonlyBar"><button class="secondary" onclick="KV2App.showSearch()">レース一覧へ</button><button class="secondary" onclick="KV2App.regeneratePrediction('${C.esc(r.id)}')">予想再生成</button><button class="secondary" onclick="KV2App.showInput('${C.esc(r.id)}')">出馬表編集</button></div>`;
  }
  function markFor(r,no){return String((r.prediction&&r.prediction.marks&&r.prediction.marks[no])||'')}
  function horseLabel(r,no){const h=horseOf(r,no); return no?`${no}${h.name?' '+h.name:''}`:''}
  function predictionHorseScore(r,h){
    const marks=(r.prediction&&r.prediction.marks)||{};
    const no=C.toInt(h&&h.no); if(!no)return 0;
    let score=0;
    if(marks[h.no])score+=30;
    if(marks[no-1]||marks[no+1])score+=20;
    if(isFiveFamily(no,r.headCount))score+=25;
    return score;
  }

  function recommendLabel(key){return key==='umaren'?'馬連':key==='wide'?'ワイド':key==='sanrenpuku'?'3連複':key;}
  function displayRecommendKeys(p){
    const rec=Array.isArray(p&&p.recommend)?p.recommend:[];
    // 推奨表示はAI予想レポートの「推奨」と一致させる。
    // 買い目は全券種表示するが、期待馬券だけに推奨バッジを付ける。
    if(rec.includes('umaren') && rec.includes('wide')) return ['umaren','wide'];
    if(rec.includes('wide')) return ['wide'];
    if(rec.includes('umaren')) return ['umaren'];
    if(rec.includes('sanrenpuku')) return ['sanrenpuku'];
    return [];
  }

  function makePredictionReport(r){
    const p=r.prediction||{}, axis=p.axis||{}, rates=p.rates||{}, rec=p.recommend||[];
    const ev=aiEvidence(r), evText=evidenceSentence(ev);
    const dataBrief=(ev.dataState==='none')?'予想時点では参考データが少ない状態でした。':(ev.dataState==='thin'?'予想時点では参考件数が少なく、数値は参考扱いでした。':'');
    const axisNo=C.toInt(axis.no), axisHorse=horseOf(r,axisNo), axisName=axisNo?horseLabel(r,axisNo):'軸なし';
    const score=C.toInt(p.axisScore||axis.score)||0;
    const pop=C.toInt(axisHorse.popularity||axis.popularity)||'';
    const marks=p.marks||{};
    const axisMark=markFor(r,axisNo);
    const axisFive=axisNo?isFiveFamily(axisNo,r.headCount):false;
    const candidates=(r.horses||[]).filter(h=>!h.cancelled&&C.toInt(h.no)).map(h=>({h,score:predictionHorseScore(r,h),pop:C.toInt(h.popularity)||99,mark:marks[h.no]||'',five:isFiveFamily(h.no,r.headCount)})).sort((a,b)=>b.score-a.score||a.pop-b.pop||C.toInt(a.h.no)-C.toInt(b.h.no));
    const rivals=candidates.filter(x=>C.toInt(x.h.no)!==axisNo).slice(0,3);
    const rivalText=rivals.length?rivals.map(x=>`${x.h.no}${x.h.name?' '+x.h.name:''}`).join('、'):'明確な対抗候補は少なめ';
    const pairNums=[...new Set([...(p.umaren||[]),...(p.wide||[])].join('-').split('-').map(C.toInt).filter(n=>n&&n!==axisNo))];
    const triNums=[...new Set((p.sanrenpuku||[]).join('-').split('-').map(C.toInt).filter(n=>n&&n!==axisNo))];
    const pairText=pairNums.length?pairNums.map(n=>horseLabel(r,n)).join('、'):'相手なし';
    const triText=triNums.length?triNums.map(n=>horseLabel(r,n)).join('、'):'候補なし';
    const cond=conditionLabel(r);
    const isHandicap=String(r.condition||'').includes('ハンデ');
    const displayRec=displayRecommendKeys(p);
    const expected=displayRec.length?displayRec.map(recommendLabel).join('・'):'見送り寄り';
    let level='C', confidence=55;
    if((rates.all&&Number(rates.all)>=120)||score>=70){level='B+'; confidence=68;}
    else if((rates.all&&Number(rates.all)>=100)||score>=50){level='B'; confidence=62;}
    if(isHandicap){confidence-=6;}
    if(ev.scoreStat&&ev.scoreStat.n>=10&&ev.scoreStat.rate!==null){confidence=Math.round((confidence+ev.scoreStat.rate)/2);}
    if(ev.dataState==='none') confidence-=8; else if(ev.dataState==='thin') confidence-=5; else if(ev.same&&ev.same.n<3) confidence-=4;
    if(ev.same&&ev.same.n>=10) confidence+=4;
    confidence=Math.max(42,Math.min(82,confidence));
    const outlook=isHandicap
      ? `${cond}で、ハンデ戦らしく軸の信頼度だけで押し切るより、相手の拾い方も重要になるレースです。今回は大きく広げず、軸と相手候補のバランスを見て組み立てています。${evText?` ${evText}`:''}`
      : `${cond}で、まず軸が馬券内に入るかを中心に見ています。買い目は点数を増やし過ぎず、検証上の回収率を崩さない形にしています。${evText?` ${evText}`:''}`;
    const axisReason=axisNo
      ? `今回は${axisName}を軸にしました。${pop?`${pop}人気で、`:''}軸スコアは${score}。${axisMark?`印は${axisMark}、`:''}${axisFive?'5系にも該当しており、':'5系には該当しませんが、'}候補内では総合評価が上位でした。${rivals.length?`比較対象は${rivalText}で、最後は軸スコアと相手との組み合わせを優先しました。`:''}${ev.compare.length?`過去傾向では${ev.compare.slice(0,2).join('、')}なので、この軸条件は結果後に必ず確認します。`:''}`
      : `今回は明確な軸を作れる条件が弱く、軸なし寄りの判定です。無理に買い目を増やすより、見送りまたは軽めの扱いが安全です。`;
    const trioNote=displayRec.includes('sanrenpuku')?'3連複も推奨対象として':'3連複は推奨ではなく参考買い目として';
    const partnerReason=axisNo
      ? `相手は${pairText}を中心にしました。馬連とワイドは軸から絞り、${trioNote}${triText}まで広げています。点数を増やせば的中率は上がりますが、今回は回収率を優先して現在の点数に抑えています。`
      : `軸が弱いため、相手評価も強く出し過ぎない構成です。`;
    const hesitation=axisNo
      ? `${rivals.length?`AIが迷った馬は${rivalText}です。`:''}${rivals[0]?`${rivals[0].h.no}番は評価が近く、軸にする選択肢もありましたが、今回は${axisNo}番の総合点を上に取りました。`:''}`
      : `軸候補の評価差が小さく、強く買うには根拠が足りません。`;
    const point=axisNo
      ? `今回の勝負ポイントは「${axisName}が馬券内に残るか」です。軸が来れば馬連・ワイド・3連複すべてに展開できますが、軸が崩れると全体が崩れやすい構成です。`
      : `今回の勝負ポイントは、無理に軸を固定しないことです。条件が揃うまでは買い目を抑える判断になります。`;
    const concern=isHandicap
      ? `不安材料はハンデ戦の波乱です。人気・軸スコアが高くても圏外になるケースがあるため、レース後は軸条件の成否を必ず検証します。`
      : `不安材料は、軸候補と相手候補の評価差が大きくない点です。軸が想定より伸びない場合は、相手だけ拾って外れる可能性があります。`;
    const oneLine=axisNo
      ? (isHandicap
        ? (ev.dataState==='none' ? `今回は過去データの裏付けが少ないため、自信度はやや控えめです。ただし現在の予想ルールでは${axisNo}番が最も安定していると判断しました。結果後は必ず軸条件を検証に回します。` : `今回は${axisNo}番を中心に見ますが、ハンデ戦なので過信はしません。軸が来れば全券種に展開できる一方、結果次第では軸条件をすぐ検証に回します。`)
        : (confidence>=65
          ? `今回は${axisNo}番を比較的信頼しています。点数を増やすより、今の買い目で期待値を取りに行く判断です。`
          : `今回は最後まで軸候補が接戦でした。${axisNo}番を選びますが、結果後は迷った馬との比較まで確認します。`))
      : `今回は無理に軸を固定しません。買うよりも、どの条件なら軸を作れるかを確認するレースです。`;
    return {version:'ver2-019-result-tab-safe-open',outlook,axisReason,partnerReason,hesitation,point,concern,oneLine,level,confidence,volatility:isHandicap?'高め':'標準',expected,evidence:ev,evidenceText:evText};
  }
  function predictionReportPanel(r){
    const rep=makePredictionReport(r);
    return `<div class="predCard aiPredictionReport"><h4>AI予想レポート</h4><div class="predBody reportBody">`+
      `<p><b>今回の見立て</b><br>${C.esc(rep.outlook)}</p>`+
      `<p><b>軸を選んだ理由</b><br>${C.esc(rep.axisReason)}</p>`+
      `<p><b>相手を選んだ理由</b><br>${C.esc(rep.partnerReason)}</p>`+
      `<p><b>AIが迷ったポイント</b><br>${C.esc(rep.hesitation)}</p>`+
      `<p><b>勝負ポイント</b><br>${C.esc(rep.point)}</p>`+
      `<p><b>不安材料</b><br>${C.esc(rep.concern)}</p>`+
      `<p class="aiOneLine"><b>AIのひとこと</b><br>${C.esc(rep.oneLine||'今回の判断は結果後にAIカルテへ残し、次回の予想ルール相談で確認します。')}</p>`+
      evidenceRangePanel(rep.evidence)+
      confidenceBreakdown(rep.evidence,rep.confidence)+
      `<div class="aiReportMeta"><span><b>期待度</b> ${C.esc(rep.level)}</span><span><b>荒れる可能性</b> ${C.esc(rep.volatility)}</span><span><b>推奨</b> ${C.esc(rep.expected)}</span></div>`+
      `</div></div>`;
  }
  function percentText(v){
    if(v===null || v===undefined || v==='') return '-';
    const n=Number(v);
    if(!Number.isFinite(n)) return '-';
    return (Math.round(n*10)/10)+'%';
  }
  function resultDone(r){
    const res=r&&r.result||{};
    return (res.firsts&&res.firsts.length) || (res.seconds&&res.seconds.length) || (res.thirds&&res.thirds.length);
  }
  function savedGradeNeed(grade,surface){
    const g=String(grade||''), sf=String(surface||'');
    if(/障|J-G/.test(g) || /障/.test(sf)) return 10;
    if(g==='G1' && sf==='ダート') return 3;
    if(g==='G1' && sf==='芝') return 10;
    if(['G2','G3','OP','L','特別1勝','特別2勝','特別3勝'].includes(g)) return 20;
    if(['1勝','2勝','3勝'].includes(g)) return 30;
    return 30;
  }
  function savedActualCategoryKey(r){
    if(/障/.test(r&&r.surface||'') || /^J-G/.test(r&&r.grade||'')) return '全障害';
    const g=(r&&r.grade)||'全体';
    const s=(r&&r.surface)||'';
    const c=(r&&r.condition)||'定量';
    return `${g}/${s}/${c}`;
  }
  function savedFallbackCategoryKey(r){
    const g=String(r&&r.grade||''), s=String(r&&r.surface||''), c=String(r&&r.condition||'定量');
    if(/障/.test(s)||/^J-G/.test(g)) return '全障害';
    if(g==='G1' && s==='芝') return 'G1+G2+G3/芝/定量';
    if(g==='G1' && s==='ダート') return 'G1+G2+G3/ダート/定量';
    return `全体/${s}/${c}`;
  }
  function validCategoryKeyText(key){
    key=String(key||'');
    if(!key) return false;
    if(key==='全障害') return true;
    const p=key.split('/');
    return !!(p[0] && p[1] && p[2]);
  }
  function categoryKeyForSavedRace(r){
    const cat=r&&r.prediction&&r.prediction.category;
    // 成績サマリーは実カテゴリー（グレード/馬場/条件）を基準に集計する。
    // 仮判定カテゴリーは「適用の予想カテゴリー」側に併記する。
    if(cat&&cat.primary) return cat.primary;
    return savedActualCategoryKey(r);
  }
  function savedRaceMatchesKey(targetRace,key){
    if(!targetRace) return false;
    key=String(key||'');
    if(key==='全障害') return /障/.test(targetRace.surface||'') || /^J-G/.test(targetRace.grade||'');
    const parts=key.split('/'), g=parts[0], s=parts[1], c=parts[2]||'定量';
    if(g==='全体') return (targetRace.surface||'')===s && (targetRace.condition||'定量')===c;
    if(g==='G1+G2+G3') return ['G1','G2','G3'].includes(targetRace.grade||'') && (targetRace.surface||'')===s && (targetRace.condition||'定量')===c;
    return (targetRace.grade||'')===g && (targetRace.surface||'')===s && (targetRace.condition||'定量')===c;
  }
  function matchSummaryCategory(baseRace, targetRace){
    return savedRaceMatchesKey(targetRace, categoryKeyForSavedRace(baseRace));
  }
  function raceSortDesc(a,b){
    const da=String(a.date||''), db=String(b.date||'');
    if(da!==db) return db.localeCompare(da);
    const na=C.toInt(a.raceNo)||0, nb=C.toInt(b.raceNo)||0;
    return nb-na;
  }
  function raceSortAsc(a,b){
    const da=String(a.date||''), db=String(b.date||'');
    if(da!==db) return da.localeCompare(db);
    const na=C.toInt(a.raceNo)||0, nb=C.toInt(b.raceNo)||0;
    return na-nb;
  }
  function parsePayValue(v){
    const n=C.toInt(String(v||'').replace(/円/g,''));
    return Number.isFinite(n) ? n : 0;
  }
  function resultPayMap(r,key){
    const out={};
    const arr=(r&&r.result&&r.result[key])||[];
    arr.forEach(x=>{
      const ck=C.comboKey(x&&x.combo);
      if(!ck) return;
      out[ck]=Math.max(out[ck]||0, parsePayValue(x&&x.pay));
    });
    return out;
  }
  function calcTicketStatsForSavedSummary(races){
    const st={
      targetCount:races.length,
      anyHit:0,
      axisWin:0,
      axisPlace:0,
      allInvest:0,
      allReturn:0,
      tickets:{
        umaren:{target:0,hit:0,invest:0,ret:0},
        wide:{target:0,hit:0,invest:0,ret:0},
        sanrenpuku:{target:0,hit:0,invest:0,ret:0}
      }
    };
    races.forEach(x=>{
      const pp=x.prediction||{}, res=x.result||{}, combos=C.autoResultCombos(res||{});
      let any=false;
      const ax=pp.axis&&pp.axis.no;
      if(ax){
        const no=String(ax);
        const firsts=(res.firsts||[]).map(String), seconds=(res.seconds||[]).map(String), thirds=(res.thirds||[]).map(String);
        if(firsts.includes(no)) st.axisWin++;
        if(firsts.includes(no)||seconds.includes(no)||thirds.includes(no)) st.axisPlace++;
      }
      ['umaren','wide','sanrenpuku'].forEach(k=>{
        const bets=(pp[k]||[]).map(C.comboKey).filter(Boolean);
        if(!bets.length) return;
        const uniq=[...new Set(bets)];
        const t=st.tickets[k];
        t.target++;
        const invest=uniq.length*100;
        t.invest+=invest;
        st.allInvest+=invest;
        const hitKeys=new Set((combos[k]||[]).map(C.comboKey).filter(Boolean));
        const payMap=resultPayMap(x.result||{},k);
        let hit=false, ret=0;
        uniq.forEach(ck=>{
          if(hitKeys.has(ck)){
            hit=true;
            ret += payMap[ck] || 0;
          }
        });
        if(hit){
          t.hit++;
          any=true;
        }
        t.ret+=ret;
        st.allReturn+=ret;
      });
      if(any) st.anyHit++;
    });
    const pct=(num,den)=>den?Math.round((num/den)*1000)/10:null;
    const rec=(key)=>{
      const t=st.tickets[key];
      return {
        target:t.target,
        hit:t.hit,
        hitRate:pct(t.hit,t.target),
        recovery:t.target ? (t.hit ? Math.round((t.ret/t.invest)*1000)/10 : 0) : null
      };
    };
    return {
      targetCount:st.targetCount,
      anyHitCount:st.anyHit,
      axisWinCount:st.axisWin,
      axisPlaceCount:st.axisPlace,
      allHit:pct(st.anyHit,st.targetCount),
      allRecovery:st.allInvest ? (st.anyHit ? Math.round((st.allReturn/st.allInvest)*1000)/10 : 0) : null,
      axisWin:pct(st.axisWin,st.targetCount),
      axisPlace:pct(st.axisPlace,st.targetCount),
      umaren:rec('umaren'),
      wide:rec('wide'),
      sanrenpuku:rec('sanrenpuku')
    };
  }
  function hitEnoughForSummary(summary){
    if(!summary) return false;
    const anyHits=summary.anyHitCount||0;
    const maxTicketHit=Math.max(summary.umaren&&summary.umaren.hit||0, summary.wide&&summary.wide.hit||0, summary.sanrenpuku&&summary.sanrenpuku.hit||0);
    return anyHits>=3 && maxTicketHit>=2;
  }
  function isBeforeSummaryTargetDate(x,target){
    const xd=C.normDate(x&&x.date||'');
    const td=C.normDate(target&&target.date||'');
    if(!xd || !td) return true;
    return xd < td;
  }
  function calcSavedRaceSummary(r){
    // 成績サマリーのトータルR・直近R・的中数は、予想対象日の前日までに結果入力済みのレースだけで集計する。
    // 当日レースや同日別レースは、保存済みでも判定母数・表示母数に含めない。
    const all=S.loadRaces().filter(x=>matchSummaryCategory(r,x)&&resultDone(x)&&isBeforeSummaryTargetDate(x,r)).sort(raceSortAsc);
    const total=calcTicketStatsForSavedSummary(all);
    const need=savedGradeNeed(r&&r.grade,r&&r.surface);
    let recent=null, useRecent=false, judgmentLabel=`トータル${all.length}R`, recentNote='';
    if(all.length>need){
      const start=Math.max(need, all.length-30);
      const target=all.slice(start);
      const tmp=calcTicketStatsForSavedSummary(target);
      tmp.rangeText=`${start+1}〜${all.length}R`;
      const forced=all.length>need+20; // 必要数+20Rまではトータル。超えたら直近対象で判定。
      const anyHitR=Number(tmp.anyHitCount||0);
      const maxTicketHit=Math.max(
        Number(tmp.umaren&&tmp.umaren.hit||0),
        Number(tmp.wide&&tmp.wide.hit||0),
        Number(tmp.sanrenpuku&&tmp.sanrenpuku.hit||0)
      );
      const hitOk=(anyHitR>=3 && maxTicketHit>=2);
      if(forced || hitOk){
        recent=tmp;
        useRecent=true;
        judgmentLabel=`直近${target.length}R（${tmp.rangeText}）`;
        recentNote=forced ? `対象Rが必要数+20Rを超えたため、直近${target.length}Rで判定します。` : `直近対象で的中条件（的中レース3R以上、かつ1券種2R以上的中）を満たしたため、直近${target.length}Rで判定します。`;
      }else{
        // 直近対象の成績は計算しても表示しない。判定も表示もトータルのみ。
        recent=null;
        useRecent=false;
        recentNote=`対象Rは必要数を超えていますが、直近対象（${start+1}〜${all.length}R）は的中条件未達（的中レース${anyHitR}R、券種別最大${maxTicketHit}R）のためトータル成績で判定します。`;
      }
    }
    return {total,recent,allCount:all.length,need,useRecent,judgmentLabel,recentNote};
  }
  function summaryRecoveryText(v){
    return (v===null || v===undefined) ? '-' : percentText(v);
  }
  function savedSummaryTable(title, summary, rangeText){
    if(!summary) return '';
    const t=summary.targetCount||0;
    const hitText=(n)=>`${Number(n||0)}R`;
    const rowTicket=(label,obj)=>{
      obj=obj||{};
      return `<tr><td>${label}</td><td>${obj.target||0}R</td><td>${hitText(obj.hit)}</td><td>${summaryRecoveryText(obj.recovery)}</td><td>${percentText(obj.hitRate)}</td></tr>`;
    };
    return `<div class="savedSummaryBlock"><h5>${C.esc(title)}</h5>`+
      `<div class="hint"><b>対象レース数：${t}R${rangeText?`（${C.esc(rangeText)}）`:''}</b></div>`+
      `<table class="miniStats"><tr><th>区分</th><th>対象R</th><th>的中R</th><th>回収率</th><th>的中率</th></tr>`+
      `<tr><td>全体</td><td>${t}R</td><td>${hitText(summary.anyHitCount)}</td><td>${summaryRecoveryText(summary.allRecovery)}</td><td>${percentText(summary.allHit)}</td></tr>`+
      `<tr><td>軸単勝</td><td>${t}R</td><td>${hitText(summary.axisWinCount)}</td><td>-</td><td>${percentText(summary.axisWin)}</td></tr>`+
      `<tr><td>軸複勝</td><td>${t}R</td><td>${hitText(summary.axisPlaceCount)}</td><td>-</td><td>${percentText(summary.axisPlace)}</td></tr>`+
      rowTicket('馬連',summary.umaren)+
      rowTicket('ワイド',summary.wide)+
      rowTicket('3連複',summary.sanrenpuku)+
      `</table></div>`;
  }
  function currentPredictionCategoryForDisplay(r){
    try{
      if(window.KV2Prediction && typeof window.KV2Prediction.categoryInfo==='function'){
        return window.KV2Prediction.categoryInfo(r, S.loadRaces());
      }
    }catch(e){}
    return (r&&r.prediction&&r.prediction.category) || {};
  }
  function predictionPanel(r,readonly){
    const p=r.prediction||{}; const axis=p.axis||{}; const cat=currentPredictionCategoryForDisplay(r); const rec=displayRecommendKeys(p);
    const summarySet=calcSavedRaceSummary(r);
    const consultBtn=`<button class="small green" onclick="KV2App.showRuleConsult('category','${C.esc(r.id)}')">💬 予想ルール相談</button>`;
    const summaryHtml=savedSummaryTable('トータル成績', summarySet.total, '') + (summarySet.recent ? savedSummaryTable('直近成績', summarySet.recent, summarySet.recent.rangeText) : '');
    const summaryNote=(summarySet.recent ? `判定基準：${summarySet.judgmentLabel}。トータル成績と直近成績を表示しています。${summarySet.recentNote||''}` : `判定基準：${summarySet.judgmentLabel}。トータル成績のみ表示しています。${summarySet.recentNote||''}`);
    return `<div class="card"><div class="between"><div class="title">予想</div>${C.copyButtonHtml ? C.copyButtonHtml('予想結果全文コピー','予想結果全文') : ''}</div><div class="predCard"><div class="between"><h4>適用の予想カテゴリー</h4>${consultBtn}</div><div class="predBody"><table class="miniStats"><tr><th>分類</th><th>グレード</th><th>馬場</th><th>条件</th></tr>${catRows(cat,r)}</table><div class="subtle">ボタンを押すと、このカテゴリーを対象にした予想ルール相談画面を開きます。</div></div></div><div class="predCard predAxis"><h4>判定・軸</h4><div class="predBody"><div class="between"><b class="badge green">${C.esc(p.judge||'見送り')}</b><span>軸スコア <b style="font-size:24px;color:#dc2626">${C.esc(p.axisScore||0)}</b></span></div><p>軸：${axis.no?`${axis.no} ${C.esc(axis.name||'')}`:'なし'} ${rec.length?'<span class="badge green">推奨</span>':''}</p><p class="subtle">詳しい判断理由は上のAI予想レポートに集約しています。</p></div></div>${ticketBox('馬連','umaren',p,rec)}${ticketBox('ワイド','wide',p,rec)}${ticketBox('3連複','sanrenpuku',p,rec)}<div class="predCard"><h4>成績サマリー</h4><div class="predBody">${summaryHtml}<div class="subtle">${C.esc(summaryNote)} 馬連・ワイド・3連複は、各券種の買い目があるレースを対象Rとして、的中R・的中率・回収率を同じ母数で再計算します。的中0件は回収率0%、対象0件は「-」表示です。</div></div></div>${predictionReportPanel(r)}</div>`
  }
  function catRows(cat,race){
    const rows=[]; cat=cat||{};
    const split=s=>String(s||'').split('/');
    const actualKey=savedActualCategoryKey(race);
    let primaryKey=cat.primary || actualKey;
    // 古い保存データや一部画面で primary が // のように欠落する場合は、レース基本情報から必ず復元する。
    if(!validCategoryKeyText(primaryKey)) primaryKey=actualKey;
    const a=split(primaryKey);
    const actualLabel=(primaryKey==='全障害') ? ['全障害','',''] : a;
    rows.push(`<tr><td>実カテゴリー</td><td>${C.esc(actualLabel[0]||'')}</td><td>${C.esc(actualLabel[1]||'')}</td><td>${C.esc(actualLabel[2]||'')}</td></tr>`);

    const need=Number(cat.need||savedGradeNeed(race&&race.grade,race&&race.surface)||0);
    const count=Number(cat.count||0);
    // 必要R未達かつ的中条件で本カテゴリー判定へ昇格していない場合だけ仮判定を併記する。
    const unmet = need>0 && count<need;
    const isFallbackBasis = (cat.judgmentBasis==='fallback' || cat.ready===false);
    const shouldShowFallback = unmet && isFallbackBasis;
    if(shouldShowFallback){
      let fb=cat.extra || cat.fallback || savedFallbackCategoryKey(race);
      if(!validCategoryKeyText(fb)) fb=savedFallbackCategoryKey(race);
      const b=split(fb);
      const fbLabel=(fb==='全障害') ? ['全障害','',''] : b;
      rows.push(`<tr><td>仮判定</td><td>${C.esc(fbLabel[0]||'')}</td><td>${C.esc(fbLabel[1]||'')}</td><td>${C.esc(fbLabel[2]||'')}</td></tr>`);
    }
    return rows.join('')
  }
  
function ticketBox(name,key,p,rec){const cls=key==='umaren'?'predUmaren':key==='wide'?'predWide':'predTrio'; return `<div class="predCard ${cls}"><h4>${name} <span class="subtle">(${(p[key]||[]).length}点)</span> ${rec.includes(key)?'<span class="badge green">推奨</span>':''}</h4><div class="predBody">予想　${C.esc((p[key]||[]).join('、')||'なし')}</div></div>`}
  function nameOf(r,no){const h=(r.horses||[]).find(x=>String(x.no)===String(no));return h?h.name:''}
  function resultDisplayPanel(r){
    const res=r.result||{};
    return `<div class="card resultReadonly"><div class="title">結果</div><div class="grid2"><div><h4>着順</h4><div>${finishDisplayRows(r)}</div></div><div><h4>払戻金</h4><div class="payGrid">${payDisplayBox('単勝','tansho',r)}${payDisplayBox('馬連','umaren',r)}${payDisplayBox('ワイド','wide',r)}${payDisplayBox('3連複','sanrenpuku',r)}</div></div></div></div>`;
  }
  function finishDisplayRows(r){
    const res=r.result||{}; let rows=[];
    [['firsts','1着'],['seconds','2着'],['thirds','3着']].forEach(([k,label])=>{
      if(k==='thirds' && ((res.seconds||[]).length>1)) return;
      const arr=res[k]||[];
      if(!arr.length) return;
      arr.forEach(no=>rows.push(`<div class="finishRow readonlyRow"><b>${label}</b><span>${C.esc(no)}</span><span>${C.esc(nameOf(r,no))}</span></div>`));
    });
    return rows.join('')||'<p class="subtle">結果未入力</p>';
  }
  function formatPayText(v){
    const raw=String(v||'').trim();
    if(!raw) return '';
    if(/[円]/.test(raw)) return raw;
    const n=C.toInt(raw);
    return n ? n.toLocaleString('ja-JP')+'円' : raw;
  }
  function payDisplayBox(label,key,r){
    let arr=(r.result&&r.result[key])||[];
    if(key==='tansho'){
      const tmp=fillTanshoByRaceOdds(JSON.parse(JSON.stringify(r.result||{})), r);
      arr=tmp.tansho||arr;
    }
    return `<div class="payBox"><h4>${label}</h4><div class="payRows">${arr.length?arr.map(x=>`<div class="payRow readonlyRow"><span>${C.esc(x.combo||'')}</span><span>${C.esc(formatPayText(x.pay||''))}</span></div>`).join(''):'<div class="subtle">未入力</div>'}</div></div>`;
  }
  function resultInputPanel(r){return `<div class="card"><div class="title">結果入力</div><div class="grid2"><div><h4>着順</h4><div id="finishRows">${finishRows(r)}</div><button class="small secondary" onclick="KV2App.addFinish('${C.esc(r.id)}')">同着馬を追加</button><div class="subtle">馬番を入れると馬名を自動表示します。2着同着が複数ある場合、3着欄は集計表示で省略されます。</div></div><div><h4>払戻金</h4><div class="payGrid">${payBox('単勝','tansho',r)}${payBox('馬連','umaren',r)}${payBox('ワイド','wide',r)}${payBox('3連複','sanrenpuku',r)}</div></div></div></div>`}
  function finishRows(r){let rows=[]; const res=r.result||{}; ['firsts','seconds','thirds'].forEach((k,idx)=>{let arr=res[k]||[]; if(!arr.length){ if(k==='thirds' && ((res.seconds||[]).length>1)) return; arr=['']; } arr.forEach(no=>{rows.push(`<div class="finishRow"><b>${idx+1}着</b><input value="${C.esc(no)}" data-finish="${k}" oninput="KV2App.fillHorseName(this,'${C.esc(r.id)}')"><span>${C.esc(nameOf(r,no))}</span><button class="small secondary" onclick="this.parentNode.remove()">×</button></div>`)});}); return rows.join('')}
  function payBox(label,key,r){const arr=(r.result&&r.result[key]&&r.result[key].length?r.result[key]:[{combo:'',pay:''}]); return `<div class="payBox"><h4>${label}</h4><div class="payRows">${arr.map(x=>`<div class="payRow"><span>${C.esc(x.combo?x.combo:'自動')}</span><input data-pay="${key}" data-combo="${C.esc(x.combo||'')}" value="${C.esc(x.pay||'')}"><button class="small secondary" onclick="this.parentNode.remove()">×</button></div>`).join('')}<button class="small secondary" onclick="KV2App.addPayRow(this,'${key}')">＋追加</button></div></div>`}
  function addFinish(id){const box=document.getElementById('finishRows'); box.insertAdjacentHTML('beforeend',`<div class="finishRow"><select data-rank><option>1着</option><option>2着</option><option>3着</option></select><input data-finish="firsts" oninput="KV2App.fillHorseName(this,'${C.esc(id)}')"><span></span><button class="small secondary" onclick="this.parentNode.remove()">×</button></div>`)}
  function fillHorseName(el,id){const r=S.getRace(id), h=(r.horses||[]).find(x=>String(x.no)===String(el.value)); const span=el.parentNode.querySelector('span'); if(span)span.textContent=h?h.name:''}
  function addPayRow(btn,key){btn.insertAdjacentHTML('beforebegin',`<div class="payRow"><span>自動</span><input data-pay="${key}" value=""><button class="small secondary" onclick="this.parentNode.remove()">×</button></div>`)}
  function saveResult(id){
    let r=S.getRace(id);
    const res={firsts:[],seconds:[],thirds:[],tansho:[],umaren:[],wide:[],sanrenpuku:[]};
    document.querySelectorAll('[data-finish]').forEach(e=>{
      let k=e.dataset.finish;
      const sel=e.parentNode.querySelector('[data-rank]');
      if(sel){k=sel.value==='1着'?'firsts':sel.value==='2着'?'seconds':'thirds'}
      if(e.value)res[k].push(e.value)
    });
    const auto=C.autoResultCombos(res);
    ['tansho','umaren','wide','sanrenpuku'].forEach(k=>{
      document.querySelectorAll(`[data-pay="${k}"]`).forEach((e,i)=>{
        if(e.value)res[k].push({combo:e.dataset.combo||auto[k]?.[i]||'',pay:e.value})
      })
    });
    r.result=fillTanshoByRaceOdds(res, r);
    r.aiReview=makeReflection(r);
    r.reflection=r.aiReview;
    S.upsertRace(r);
    showDetail(r.id,'result')
  }

  function predictedCost(p,key){return ((p&&p[key])||[]).length*100}
  function resultPayMap(result,key){
    const m={};
    ((result&&result[key])||[]).forEach(x=>{
      const k=C.comboKey(x.combo||'');
      if(k) m[k]=C.toInt(x.pay)||0;
    });
    return m;
  }
  function ticketStats(r,key){
    const p=r.prediction||{}, result=r.result||{};
    const resultCombos=C.autoResultCombos(result)[key]||[];
    const payMap=resultPayMap(result,key);
    const predictions=(p[key]||[]).map(C.comboKey).filter(Boolean);
    const hitCombos=predictions.filter(x=>resultCombos.includes(x));
    const hitPay=hitCombos.reduce((sum,x)=>sum+(payMap[x]||0),0);
    const cost=predictions.length*100;
    return {key,predictions,hitCombos,hit:hitCombos.length>0,cost,pay:hitPay,roi:cost?Math.round(hitPay/cost*1000)/10:0};
  }
  function allTicketStats(r){
    const a=['umaren','wide','sanrenpuku'].map(k=>ticketStats(r,k));
    const cost=a.reduce((s,x)=>s+x.cost,0), pay=a.reduce((s,x)=>s+x.pay,0);
    return {items:a,cost,pay,roi:cost?Math.round(pay/cost*1000)/10:0,hit:a.some(x=>x.hit)};
  }
  function axisHitInfo(r){
    const p=r.prediction||{}, no=String(p.axis&&p.axis.no||'');
    const res=r.result||{};
    const first=(res.firsts||[]).map(String).includes(no);
    const second=(res.seconds||[]).map(String).includes(no);
    const third=(res.thirds||[]).map(String).includes(no);
    return {no,hit:first||second||third,first,second,third,rank:first?'1着':second?'2着':third?'3着':'圏外'};
  }
  function resultSummary(r){
    if(C.resultMissing(r.result)) return '';
    const axis=axisHitInfo(r), u=ticketStats(r,'umaren'), w=ticketStats(r,'wide'), s3=ticketStats(r,'sanrenpuku'), all=allTicketStats(r);
    const box=(label,hit,sub)=>`<div class="summaryBox">${label}<br><b>${hit?'的中':'不的中'}</b><div class="subtle">${sub||''}</div></div>`;
    return `<div class="card"><div class="title">結果サマリー（自動判定）</div><div class="summaryCards">${box('軸',axis.hit,axis.rank)}${box('馬連',u.hit,`${u.pay.toLocaleString()}円 / ${u.roi}%`)}${box('ワイド',w.hit,`${w.pay.toLocaleString()}円 / ${w.roi}%`)}${box('3連複',s3.hit,`${s3.pay.toLocaleString()}円 / ${s3.roi}%`)}<div class="summaryBox">合計回収率<br><b>${all.roi}%</b><div class="subtle">${all.pay.toLocaleString()}円 / ${all.cost.toLocaleString()}円</div></div></div></div>`
  }
  function payTotal(r){let n=0; ['tansho','umaren','wide','sanrenpuku'].forEach(k=>(r.result[k]||[]).forEach(x=>n+=C.toInt(x.pay)||0)); return n}
  function stars(score){
    const n=Math.max(1,Math.min(5,score));
    return '★★★★★'.slice(0,n)+'☆☆☆☆☆'.slice(0,5-n);
  }
  function gradeForTicket(st){
    if(st.hit && st.roi>=200) return 5;
    if(st.hit && st.roi>=100) return 4;
    if(st.hit) return 3;
    if(st.predictions.length) return 2;
    return 1;
  }
  function horseOf(r,no){
    no=String(no||'');
    return (r.horses||[]).find(h=>String(h.no)===no)||{};
  }
  function isFiveFamily(no,head){
    const n=C.toInt(no); if(!n)return false;
    const f=C.frameOf(n,head||18);
    return n===5||n===14||n===15||f===5||String(n).slice(-1)==='5';
  }
  function nearResultText(r,no){
    const n=C.toInt(no); if(!n)return '不明';
    const nums=[...(r.result?.firsts||[]),...(r.result?.seconds||[]),...(r.result?.thirds||[])].map(C.toInt).filter(Boolean);
    if(nums.includes(n))return '馬券内';
    if(nums.some(x=>Math.abs(x-n)===1))return '隣±1が馬券内';
    return '隣±1も不発';
  }
  function markOfHorse(h){return String(h.mark||'');}
  function point(status,label,detail){return {status,label,detail};}
  function makeReflection(r){
    const p=r.prediction||{}, preReport=makePredictionReport(r), axis=axisHitInfo(r), u=ticketStats(r,'umaren'), w=ticketStats(r,'wide'), s3=ticketStats(r,'sanrenpuku'), all=allTicketStats(r);
    const ev=aiEvidence(r), evText=evidenceSentence(ev);
    const axisHorse=horseOf(r,axis.no), axisName=axis.no?`${axis.no} ${axisHorse.name||p.axis?.name||''}`.trim():'軸なし';
    const score=C.toInt(p.axisScore ?? p.axis?.score) || 0;
    const pop=C.toInt(axisHorse.popularity) || C.toInt(p.axis?.popularity) || '';
    const mark=markOfHorse(axisHorse);
    const five=isFiveFamily(axis.no,r.headCount);
    const near=nearResultText(r,axis.no);
    const conditionText=conditionLabel(r);
    const isHandicap=String(r.condition||'').includes('ハンデ');
    const predictedNums=[...new Set([...(p.umaren||[]),...(p.wide||[]),...(p.sanrenpuku||[])].join('-').split('-').map(C.toInt).filter(Boolean))];
    const resultNums=[...(r.result?.firsts||[]),...(r.result?.seconds||[]),...(r.result?.thirds||[])].map(C.toInt).filter(Boolean);
    const missedResult=resultNums.filter(n=>!predictedNums.includes(n));
    const includedResult=resultNums.filter(n=>predictedNums.includes(n));
    const resultNames=resultNums.map(n=>{const h=horseOf(r,n); return `${n}${h.name?' '+h.name:''}`;}).join('、');
    const missedNames=missedResult.map(n=>{const h=horseOf(r,n); return `${n}${h.name?' '+h.name:''}`;}).join('、');
    const includedNames=includedResult.map(n=>{const h=horseOf(r,n); return `${n}${h.name?' '+h.name:''}`;}).join('、');
    const axisAttrs=[];
    if(score) axisAttrs.push(`軸スコア${score}`);
    if(pop) axisAttrs.push(`${pop}人気`);
    axisAttrs.push(five?'5系該当':'5系非該当');
    axisAttrs.push(near);
    if(mark) axisAttrs.push(`印${mark}`);
    const points=[];
    points.push(point(axis.hit?'○':'×','軸的中',`軸${axisName}は${axis.rank}`));
    points.push(point(score>=50 && !axis.hit?'×':score>=50?'○':'△','軸スコア',`軸スコア${score||'-'}`));
    points.push(point(pop>=2&&pop<=6 ? (axis.hit?'○':'△') : '△','人気条件',pop?`${pop}人気`:'人気不明'));
    points.push(point(five ? (axis.hit?'○':'△') : '△','5系',five?'該当':'非該当'));
    points.push(point(near==='馬券内'?'○':near==='隣±1が馬券内'?'△':'×','隣±1',near));
    points.push(point(/◎/.test(mark)?(axis.hit?'○':'△'):'△','◎連動',mark?`印:${mark}`:'印なし'));
    points.push(point(/◎.*◎|○.*○|◎.*○|○.*◎|○.*▲|▲.*○/.test(mark)?(axis.hit?'○':'△'):'△','印重複',mark?`印:${mark}`:'重複なし'));
    points.push(point(u.hit?'○':'×','馬連',`${u.pay.toLocaleString()}円 / ${u.roi}%`));
    points.push(point(w.hit?'○':'×','ワイド',`${w.pay.toLocaleString()}円 / ${w.roi}%`));
    points.push(point(s3.hit?'○':'×','3連複',`${s3.pay.toLocaleString()}円 / ${s3.roi}%`));
    const bad=points.filter(x=>x.status==='×').map(x=>x.label);
    const ok=points.filter(x=>x.status==='○').map(x=>x.label);
    const needs=points.filter(x=>x.status==='△').map(x=>x.label);
    const confidence=Math.max(5,Math.min(95,Math.round((axis.hit?45:20)+(u.hit?15:0)+(w.hit?15:0)+(s3.hit?15:0)+(score>=50?5:0)+(all.roi>=100?5:0))));
    const priority=[['軸',axis.hit?1:5],['馬連',u.hit?1:axis.hit?5:3],['ワイド',w.hit?1:axis.hit?5:3],['3連複',s3.hit?1:axis.hit?4:2]].sort((a,b)=>b[1]-a[1]).map(x=>x[0]).join(' ＞ ');
    const axisText=axis.hit
      ? `軸に選んだ${axisName}は${axis.rank}に入りました。${axisAttrs.join('・')}という条件は、今回の${conditionText}では軸として機能しています。次回も同じ条件では軸候補として残してよい内容です。`
      : `軸に選んだ${axisName}は${axisAttrs.join('・')}でしたが、結果は圏外でした。予想時は「${preReport.point}」という見立てでしたが、その勝負ポイントが崩れました。今回は軸スコアや人気帯よりも、別の条件が結果に影響した可能性があります。${isHandicap?'ハンデ戦では能力差が読みづらいため、':''}同じ条件で「高スコア軸」がどの程度馬券内に来ているかを優先して確認します。`;
    function ticketText(label,st){
      if(st.hit) return `${label}は${st.hitCombos.join('、')}が的中し、${st.pay.toLocaleString()}円の払戻でした。今回の${label}の組み合わせは有効だったため、軸条件と相手条件を成功例として保存します。`;
      if(!st.predictions.length) return `${label}は買い目がありませんでした。まず買い目を出す条件が厳しすぎないかを確認します。`;
      if(!axis.hit){
        if(label==='ワイド' && includedResult.length) return `${label}は不的中でした。馬券内の${includedNames}は予想に含まれていましたが、軸が圏外だったため的中できませんでした。相手選択より、まず軸精度の改善を優先します。`;
        if(label==='3連複' && includedResult.length) return `${label}は不的中でした。馬券内の${includedNames}は一部拾えていますが、軸が圏外で${missedNames?`不足馬は${missedNames}です。`:''}軸条件を改善した後に、相手候補の広げ方を再検証します。`;
        return `${label}は不的中でした。今回は軸が圏外だったため、組み合わせの問題より軸選定の失敗が主因です。${missedNames?`結果馬で予想に入らなかった馬は${missedNames}です。`:''}`;
      }
      return `${label}は不的中でした。軸は馬券内に来ているため、原因は相手選択または組み合わせ抜けです。${missedNames?`不足馬は${missedNames}です。`:''}次は相手条件を優先して見直します。`;
    }
    const improveAxis=axis.hit
      ? `今回の軸条件は成功例として残します。同じ${conditionText}で同条件の軸複勝率が安定していれば、次回も維持候補です。`
      : `${conditionText}では、現在の軸条件だけでは信頼度が不足している可能性があります。まず「${pop?pop+'人気＋':''}${score?`軸スコア${score}前後＋`:''}${five?'5系＋':''}${near.includes('隣')?'隣±1':''}」の過去成績を確認し、より成績の良い軸条件がないか比較します。`;
    function improveTicket(label,st){
      if(st.hit) return `${label}は今回の条件を維持候補にします。的中時の軸・相手属性を検証結果に成功例として集計します。`;
      if(!axis.hit) return `${label}は軸不的中の影響が大きいため、買い目条件より先に軸の選び方を見直します。軸改善後も的中率が低い場合に、相手候補や点数配分を再検証します。`;
      return `${label}は軸が来ても外れているため、相手候補の条件を優先して見直します。抜けた馬の人気帯・5系・隣±1・連動の入り方を検証結果で集計します。`;
    }
    const hints=[];
    if(!axis.hit){
      hints.push('軸条件を優先見直し');
      if(score>=50) hints.push('軸スコア50以上の圏外率を検証');
      if(isHandicap) hints.push('ハンデ戦では5系・隣±1加点を下げた場合を再検証');
      if(pop>=2&&pop<=6) hints.push('2〜6人気軸の失敗率を確認');
    }
    if(axis.hit && !u.hit) hints.push('馬連の相手抜け属性を集計');
    if(!w.hit) hints.push(axis.hit?'ワイド相手抜け属性を集計':'軸改善後にワイド相手条件を再評価');
    if(!s3.hit) hints.push(axis.hit?'3連複の不足馬属性を集計':'軸改善後に3連複3頭目を再評価');
    const overallLines=[
      `軸　${stars(axis.hit?5:2)}（信頼度${confidence}%）`,
      axis.hit ? `理由：軸は${axis.rank}に入り、今回の軸条件は機能しました。` : `理由：軸スコアは${score||'-'}でしたが圏外。${isHandicap?'ハンデ戦では現在の軸条件との相性確認が必要です。':'現在の軸条件との相性確認が必要です。'}`,
      `馬連　${stars(gradeForTicket(u))}　${u.hit?'的中。':'軸不的中の影響。'}`,
      `ワイド　${stars(gradeForTicket(w))}　${w.hit?'的中。':(!axis.hit&&includedResult.length?'相手候補は一部拾えているため、軸改善で向上余地あり。':'不的中。')}`,
      `3連複　${stars(gradeForTicket(s3))}　${s3.hit?'的中。':'軸改善後に再評価。'}`
    ];
    // ver2-018: 結果タブ表示時に未定義参照で停止していたため、
    // 予想レポートの文章を安全に要約して振り返りへ渡す。
    const cleanOutlook = String((preReport && preReport.outlook) || '')
      .replace(String(evText || ''), '')
      .replace(/\s+/g, ' ')
      .trim();
    const dataBrief = ev && ev.dataState === 'none'
      ? '予想時点でも参考データが少ないことは把握していました。'
      : (ev && ev.dataState === 'thin'
        ? '予想時点では参考件数が少なく、数値は参考扱いでした。'
        : '');
    const reviewReport={
      preDecision: axis.no ? `予想時は${axisName}を中心に組み立てました。${cleanOutlook}` : `予想時は明確な軸を作りにくいレースと判断しました。${cleanOutlook}`,
      actual: axis.hit ? `実際の結果では軸の${axisName}が${axis.rank}に入り、軸判断は成功しました。結果馬は${resultNames||'未確定'}です。` : `実際の結果では軸の${axisName}が圏外となり、予想時に置いた勝負ポイントが崩れました。結果馬は${resultNames||'未確定'}です。`,
      why: axis.hit ? `軸は機能しています。外れた券種がある場合は、軸ではなく相手選択または組み合わせの不足が原因です。` : `${isHandicap?'ハンデ戦の波乱要素が強く出た可能性があります。':''}${dataBrief?dataBrief+' ':''}今回は軸スコア・人気帯だけでは足りず、印重複・5系・隣±1など別条件の重みを比較する必要があります。`,
      good: includedNames ? `良かった点は、馬券内の${includedNames}を候補に含められていたことです。完全に方向違いではなく、相手側には改善余地があります。` : `良かった点は少なく、今回は軸と相手の両方を見直す必要があります。`,
      improve: axis.hit ? `次は抜けた相手の人気帯・5系・隣±1・連動を検証し、買い目の組み合わせを調整します。` : `まず軸条件を優先して見直します。軸が安定しないまま買い目だけを広げると、回収率が落ちやすいためです。`,
      next: axis.hit ? `次回の同条件では、今回の軸条件を維持候補にしつつ、相手条件だけを比較します。` : `次回の同条件では、今回の軸条件と別条件を比較します。${ev.same&&ev.same.n>=10?`特に同条件の軸複勝率${ev.same.rate}%を基準に、`:''}より軸複勝率・回収率が高いルールを予想ルール相談へ回します。`
    };
    const aiChart={
      good: axis.hit ? `軸の${axisName}が${axis.rank}に入り、予想時の中心判断は成功しました。` : (includedNames ? `馬券内の${includedNames}を候補に入れられました。軸は外れましたが、相手側は完全な方向違いではありません。` : `今回は良かった判断が少なく、軸と相手の両方を見直すレースです。`),
      close: includedNames && !all.hit ? `候補に入っていた${includedNames}を、的中につながる組み合わせまで持っていけませんでした。` : (all.hit ? `買い目の組み合わせまで噛み合い、成功例として残せます。` : `惜しい判断は少なく、条件比較を優先します。`),
      wrong: axis.hit ? (all.hit ? `大きな誤りはありません。次は同条件で再現性を確認します。` : `軸は合っていたため、間違いは相手選択または組み合わせの不足です。`) : `最大の誤りは軸選定です。予想時の勝負ポイントだった${axisName}が圏外となり、全券種が崩れました。`,
      improve: axis.hit ? `次回の予想ルール相談では、軸条件は維持候補にして、抜けた相手条件だけを比較します。` : `次回の予想ルール相談では、${conditionText}の軸条件を優先比較します。${ev.dataState==='none'?'今回は参考データが不足していたため、現行ルールを優先した判断として保存します。':''}特に高スコア軸・人気帯・5系・隣±1の重みを見直します。`
    };
    return {
      version:'ver2-019-result-tab-safe-open',
      reviewReport,
      aiChart,
      predictionReport:preReport,
      evidence:{label:ev.label,base:ev.base,same:ev.same,scoreStat:ev.scoreStat,fiveStat:ev.fiveStat,nonFiveStat:ev.nonFiveStat,axisFive:ev.axisFive,text:evText,dataState:ev.dataState},
      summary:{axisHit:axis.hit,axisRank:axis.rank,axisNo:axis.no,axisScore:score,axisPopularity:pop,umaren:u,wide:w,sanrenpuku:s3,all,missedResult,includedResult,resultNums},
      points,
      pointSummary:{ok,bad,needs},
      axis:axisText,
      umaren:ticketText('馬連',u),
      wide:ticketText('ワイド',w),
      sanrenpuku:ticketText('3連複',s3),
      improveAxis,
      improveUmaren:improveTicket('馬連',u),
      improveWide:improveTicket('ワイド',w),
      improveSanrenpuku:improveTicket('3連複',s3),
      overall:overallLines.join('\n'),
      confidence,
      reasons:[`今回の原因:${axis.hit?'相手・組み合わせ':'軸選定'}`,`成功:${ok.length?ok.join('、'):'なし'}`,`改善候補:${bad.length?bad.join('、'):'なし'}`,`合計回収率:${all.roi}%`],
      priority,
      ruleConsultHints:hints,
      updatedAt:new Date().toISOString()
    };
  }
  function reflectionPanel(r){
    if(C.resultMissing(r.result))return '';
    const saved=r.aiReview||r.reflection||{};
    const rf=(saved.version==='ver2-019-result-tab-safe-open'&&saved.points&&saved.points.length&&saved.reviewReport&&saved.aiChart)?saved:makeReflection(r);
    const pointRows=(rf.points||[]).map(x=>`<tr><td>${C.esc(x.label)}</td><td><span class="badge ${x.status==='○'?'green':x.status==='×'?'red':'orange'}">${C.esc(x.status)}</span></td><td class="left">${C.esc(x.detail||'')}</td></tr>`).join('');
    const hintHtml=(rf.ruleConsultHints||[]).map(x=>`<li>${C.esc(x)}</li>`).join('');
    const rr=rf.reviewReport||{};
    const chart=rf.aiChart||{};
    const evSaved=rf.evidence||{};
    const evLine=evSaved.text||'';
    const finalLine=(rf.summary&&rf.summary.axisHit)
      ? '軸判断は成功。次は相手・組み合わせの改善を検証します。'
      : '今回は軸判断が最大の課題。買い目を広げる前に、同条件の軸条件を比較します。';
    const hintCount=(rf.ruleConsultHints||[]).length;
    const hintShort=(rf.ruleConsultHints||[]).slice(0,4).map(x=>`<li>${C.esc(x)}</li>`).join('');
    const detailId='aiDetail_'+String(r.id||'race').replace(/[^a-zA-Z0-9_-]/g,'_');
    const hintId='aiHint_'+String(r.id||'race').replace(/[^a-zA-Z0-9_-]/g,'_');
    const axisHitForLine=!!(rf.summary&&rf.summary.axisHit);
    const anyHitForLine=!!(rf.summary&&(rf.summary.umaren&&rf.summary.umaren.hit||rf.summary.wide&&rf.summary.wide.hit||rf.summary.sanrenpuku&&rf.summary.sanrenpuku.hit));
    const partialForLine=!!(rf.summary&&rf.summary.includedResult&&rf.summary.includedResult.length);
    const resultOneLine=axisHitForLine
      ? (anyHitForLine
        ? '今回は狙いが結果につながりました。現行ルールは維持しつつ、さらに回収率を伸ばせる余地だけ確認します。'
        : '軸判断は悪くありませんでした。次は相手候補の拾い方を中心に、買い目の組み合わせを見直します。')
      : (partialForLine
        ? '今回は軸判断が結果につながりませんでした。ただ、相手候補の方向性は完全には外れていません。次回は軸条件を優先して比較します。'
        : '今回は軸も相手も結果と噛み合いませんでした。同条件では軸条件から組み立て直す必要があります。');
    const aiMemo=(rf.summary&&rf.summary.axisHit)
      ? `今回は軸判断は悪くありません。次回の予想ルール相談では、軸を大きく変えるより、抜けた相手条件だけを比較します。`
      : `今回は軸スコアを優先しましたが、結果を見ると5系・印重複・隣±1の重みを比較した方が良さそうです。${evSaved.dataState==='none'?'今回は参考データが不足していたため、現行ルールを優先した判断として保存します。':''}この内容は次回の予想ルール相談で確認します。`;
    return `<div class="card aiResultReport"><div class="title">AI振り返りレポート</div><div class="predBody reportBody">`+
      `<p><b>予想時の考え</b><br>${C.esc(rr.preDecision||'予想時の判断を結果と照らし合わせて確認します。')}</p>`+
      `<p><b>結果で分かったこと</b><br>${C.esc(rr.actual||'結果との比較データを確認します。')}</p>`+
      `<p><b>判断のズレ</b><br>${C.esc(rr.why||'軸・相手・買い目のどこが結果に影響したか確認します。')}</p>`+
      `<p><b>次の一手</b><br>${C.esc(rr.next||'同条件で比較するルールを予想ルール相談へ回します。')}</p>`+
      `<p class="aiOneLine"><b>AIのひとこと</b><br>${C.esc(resultOneLine)}</p>`+
      `</div></div>`+
      `<div class="card aiChart"><div class="title">AIカルテ（今回の学習内容）</div><div class="karteGrid">`+
      `<div class="karteBox good"><h4>🟢 良かった判断</h4><p>${C.esc(chart.good||'成功した判断を保存します。')}</p></div>`+
      `<div class="karteBox close"><h4>🟡 惜しかった判断</h4><p>${C.esc(chart.close||'惜しかった判断を保存します。')}</p></div>`+
      `<div class="karteBox bad"><h4>🔴 間違えた判断</h4><p>${C.esc(chart.wrong||'間違えた判断を保存します。')}</p></div>`+
      `<div class="karteBox improve"><h4>📈 次回改善する内容</h4><p>${C.esc(chart.improve||'次回の改善候補を保存します。')}</p></div>`+
      `</div><div class="aiMemo"><b>AIメモ：</b>${C.esc(aiMemo)}</div>`+
      `<div class="hint"><b>AI最終判断：</b>${C.esc(finalLine)}<br><b>AI改善優先度：</b>${C.esc(rf.priority||'')}</div>`+
      `<div class="hint nextConsultBox"><b>次回の予想ルール相談で確認する内容</b>${hintShort?`<ul class="compactList">${hintShort}</ul>`:'<div class="subtle">改善候補なし</div>'}<span class="subtle">現在の改善候補：${hintCount}件</span></div></div>`+
      `<div class="card analysisDetails"><button type="button" class="secondary small toggleBtn" onclick="KV2App.togglePanel('${detailId}')">詳細分析（検証ポイント）を開く/閉じる</button><div id="${detailId}" class="toggleContent" hidden><div class="tableWrap"><table><tr><th>項目</th><th>判定</th><th>内容</th></tr>${pointRows}</table></div></div></div>`+
      `<div class="card analysisDetails"><button type="button" class="secondary small toggleBtn" onclick="KV2App.togglePanel('${hintId}')">AIが次回比較する候補を開く/閉じる</button><div id="${hintId}" class="toggleContent" hidden>${hintHtml?`<div class="hint"><ul class="compactList">${hintHtml}</ul></div>`:'<p class="subtle">改善候補はありません。</p>'}</div></div>`+
      `${rf.manualComment?`<div class="card"><div class="title">コメント</div><p>${C.esc(rf.manualComment)}</p></div>`:''}`
  }

  function markPastValsOf(h){
    return [h&&h.past1,h&&h.past2,h&&h.past3].map(C.toInt).filter(v=>v);
  }
  function markDigitsOf(h){
    const vals=[h&&h.past1,h&&h.past2,h&&h.past3].map(C.toInt);
    if(vals.some(v=>!v)) return null;
    return {p1:vals[0],p2:vals[1],p3:vals[2],d1:vals[0]%10,d2:vals[1]%10,d3:vals[2]%10,vals};
  }
  function mdAllOdd(d){return [d.d1,d.d2,d.d3].every(x=>x%2===1)}
  function mdAllEven(d){return [d.d1,d.d2,d.d3].every(x=>x%2===0)}
  function mdAllOneDigit(d){return d.vals.every(x=>x>=1&&x<=9)}
  function mdAllTwoDigit(d){return d.vals.every(x=>x>=10)}
  function mdUp(d){return (d.p3>d.p2 && d.p2>d.p1) || (d.p3>d.p2 && d.p2===d.p1)}
  function mdDown(d){return (d.p3<d.p2 && d.p2<d.p1) || (d.p3===d.p2 && d.p2<d.p1)}
  function mdSeqAny(d){
    const a=[d.d1,d.d2,d.d3].slice().sort((x,y)=>x-y);
    return a[0]+1===a[1] && a[1]+1===a[2];
  }
  function mdCalc(d){
    const a=d.d1,b=d.d2,c=d.d3;
    const base=(a+b===c)||(b+c===a)||(a-b===c)||(b-a===c)||(c-b===a)||(b-c===a);
    if(base) return true;
    return (a+b===d.p3)||(a-b===d.p3)||(b-a===d.p3)||
      (b+c===d.p1)||(b-c===d.p1)||(c-b===d.p1);
  }
  function mdSumLast(d){return (d.d1+d.d2+d.d3)%10}
  function mdHasAll(d,arr){const ds=[d.d1,d.d2,d.d3]; return arr.every(x=>ds.includes(x));}
  function mdOrder(d,seqs){const ds=[d.d1,d.d2,d.d3].join('-'); return seqs.some(s=>s.join('-')===ds);}
  function mdTransitionLabels(d){
    if(!d) return [];
    const out=[]; const add=x=>{if(x&&!out.includes(x))out.push(x)};
    const sum32=(d.d3+d.d2)%10, sum21=(d.d2+d.d1)%10;
    const past1As5=(d.d1===5 || d.p1===14);

    if(sum32===5 && sum21===5) add('5→5');
    if(sum32===5 && past1As5) add('5→5着');

    if(sum32===5 && sum21===9) add('5→9');
    if(sum32===5 && d.d1===9) add('5→9着');

    if(sum32===9 && sum21===5) add('9→5');
    if(sum32===9 && past1As5) add('9→5着');

    if(sum32===9 && sum21===9) add('9→9');
    if(sum32===9 && d.d1===9) add('9→9着');

    const ds=[d.d1,d.d2,d.d3];
    if(ds.every(v=>v===5 || v===9)) add('59系');
    if(ds.every(v=>v===5 || v===6)) add('56系');
    if(ds.every(v=>v===6 || v===9)) add('69系');
    return out;
  }
  function mdNeighborPast1Digits(r,h){
    const no=C.toInt(h&&h.no); if(!r||!no) return [];
    const horses=(r.horses||[]);
    const maxNo=Math.max.apply(null, horses.map(x=>C.toInt(x&&x.no)).filter(Boolean));
    const nums=[]; if(no>1) nums.push(no-1); if(no<maxNo) nums.push(no+1);
    return nums.map(n=>horseOf(r,n)).filter(Boolean).map(x=>dmLast(C.toInt(x&&x.past1))).filter(v=>v!==null);
  }
  function mdCommonLabels(r,h){
    const raw=markPastValsOf(h), out=[]; const add=x=>{if(x&&!out.includes(x))out.push(x)};
    const p1=raw.length>=1 ? dmLast(raw[0]) : null;
    if(p1===5 || raw[0]===14) add('5着');
    if(p1===6) add('6着');
    if(p1===9) add('9着');
    if(p1===2 && mdNeighborPast1Digits(r,h).includes(3)) add('23');
    if(p1===3 && mdNeighborPast1Digits(r,h).includes(2)) add('32');
    if(raw.length>=2 && raw[0]%10===raw[1]%10) add('ゾロ目');
    if(raw.length>=3 && raw[1]%10===raw[2]%10) add('ゾロ目');
    const d=markDigitsOf(h); if(!d) return out;
    if(d.vals.every(v=>v%2===1)) add('奇数');
    if(d.vals.every(v=>v%2===0)) add('偶数');
    if(mdAllOneDigit(d)) add('1桁');
    if(mdAllTwoDigit(d)) add('2桁');
    if(mdUp(d)) add('上り系');
    if(mdDown(d)) add('下り系');
    if(d.d1===d.d3) add('挟み');
    if(mdCalc(d)) add('計算');
    mdTransitionLabels(d).forEach(add);
    return out;
  }
  function mdMarkLabels(mark,h,r){
    const raw=markPastValsOf(h), out=[]; const add=x=>{if(x&&!out.includes(x))out.push(x)};
    const p1=raw.length>=1 ? dmLast(raw[0]) : null;
    if(p1===5 || raw[0]===14) add('5着');
    if(p1===6) add('6着');
    if(p1===9) add('9着');
    if(p1===2 && mdNeighborPast1Digits(r,h).includes(3)) add('23');
    if(p1===3 && mdNeighborPast1Digits(r,h).includes(2)) add('32');
    if(raw.length>=2 && raw[0]%10===raw[1]%10) add('ゾロ目');
    if(raw.length>=3 && raw[1]%10===raw[2]%10) add('ゾロ目');
    const d=markDigitsOf(h); if(!d) return out;
    if(d.vals.every(v=>v%2===1)) add('奇数');
    if(d.vals.every(v=>v%2===0)) add('偶数');
    if(mdAllOneDigit(d)) add('1桁');
    if(mdAllTwoDigit(d)) add('2桁');
    if(mdUp(d)) add('上り系');
    if(mdDown(d)) add('下り系');
    if(d.d1===d.d3) add('挟み');
    if(mdCalc(d)) add('計算');
    mdTransitionLabels(d).forEach(add);
    if(mark==='◎'){
      if([d.d1,d.d2,d.d3].every(v=>v===5)) add('555');
      if([d.d1,d.d2,d.d3].every(v=>v===9)) add('999');
      if(mdHasAll(d,[1,5,9])) add('159');
      if(mdHasAll(d,[1,4,9]) && d.vals.some(v=>v===14)) add('159系');
      if(mdHasAll(d,[1,5,6])) add('156');
      if(mdHasAll(d,[1,4,6]) && d.vals.some(v=>v===14)) add('156系');
      if(mdOrder(d,[[1,5,4],[1,4,5],[4,5,1],[5,4,1]])) add('154');
      if(mdOrder(d,[[1,4,9],[4,1,9],[9,1,4]])) add('149');
      if(mdOrder(d,[[1,4,6],[4,1,6],[6,1,4]])) add('146');
      if(mdOrder(d,[[1,8,5],[8,1,5],[5,1,8]])) add('185');
      if(mdOrder(d,[[1,8,4],[8,1,4],[4,1,8]]) && d.vals.some(v=>v===14)) add('185系');
    }
    return out;
  }
  function markLabelsForHorse(r,h){
    const mark=markFor(r,h&&h.no);
    const labels=mark ? mdMarkLabels(mark,h,r) : mdCommonLabels(r,h);
    return {mark, labels};
  }
  function fmtLabels(labels){return labels&&labels.length ? labels.join('・') : '該当なし'}

  function dmLast(n){n=C.toInt(n)||0; return ((n%10)+10)%10}
  function dmFrame(r,no){const h=horseOf(r,no)||{}; return C.toInt(h.frame)||C.frameOf(C.toInt(no), r.headCount||((r.horses||[]).length));}
  function dmPop(r,no){const h=horseOf(r,no)||{}; return C.toInt(h.popularity);}
  function dmFive(r,no){const h=horseOf(r,no)||{}; const f=dmFrame(r,no), n=C.toInt(no); return n===5||n===14||n===15||f===5||dmLast(f+n)===5;}
  function dmPairPatterns(r,a,b){
    a=C.toInt(a); b=C.toInt(b); if(!a||!b)return [];
    const fa=dmFrame(r,a), fb=dmFrame(r,b), da=dmLast(a), db=dmLast(b), out=[]; const add=x=>{if(x&&!out.includes(x))out.push(x)};
    if(Math.abs(a-b)===1)add('連番');
    if(da===db)add('ゾロ目');
    if(Math.abs(a-b)===9 && Math.min(a,b)>=1 && Math.max(a,b)<=18)add('表裏');
    if(dmLast(a+b)===9)add('和9');
    if(fa===fb)add('同枠');
    if(dmFive(r,a)||dmFive(r,b))add('5系');
    if(fa===db || fb===da)add('枠↔馬');
    if(dmLast(fa+a)===db || dmLast(fa+a)===fb || dmLast(fb+b)===da || dmLast(fb+b)===fa)add('枠+馬');
    if(Math.abs(a-b)===2)add('飛び');
    const pa=dmPop(r,a), pb=dmPop(r,b); if(pa&&pb&&dmLast(pa+pb)===9)add('人気9');
    return out;
  }
  function dmSeq(nums){const a=[...new Set((nums||[]).map(C.toInt).filter(Boolean))].sort((x,y)=>x-y); if(a.length!==3)return false; if(a[1]===a[0]+1&&a[2]===a[1]+1)return true; const d=[...new Set(a.map(dmLast))].sort((x,y)=>x-y); return d.length===3&&d[1]===d[0]+1&&d[2]===d[1]+1;}
  function dmCalc(nums){if((nums||[]).length!==3)return false; const [a,b,c]=nums.map(dmLast); return (a+b===c)||(b+c===a)||(a-b===c)||(b-a===c)||(b-c===a)||(c-b===a);}
  function dmTrioPatterns(r,nums){nums=(nums||[]).map(C.toInt).filter(Boolean); if(nums.length!==3)return []; const out=[]; const add=x=>{if(x&&!out.includes(x))out.push(x)}; if(dmLast(nums.reduce((s,n)=>s+n,0))===9)add('和9'); const ps=nums.map(n=>dmPop(r,n)); if(ps.every(Boolean)&&dmLast(ps.reduce((s,n)=>s+n,0))===9)add('人気9'); if(dmCalc(nums))add('計算'); return out;}
  function dmAddUnique(arr,x){ if(x&&!arr.includes(x))arr.push(x); }
  function dmRelationLabel(r,no,rels){
    return `${C.toInt(no)} ${horseOf(r,no)?.name||''}：${(rels&&rels.length)?rels.join('・'):'本人'}`.trim();
  }
  function dmRelationsBetweenHorseAndNums(r,markNo,nums){
    markNo=C.toInt(markNo); nums=(nums||[]).map(C.toInt).filter(Boolean);
    const rels=[];
    nums.forEach(n=>{
      if(!n)return;
      if(n===markNo){ dmAddUnique(rels,'本人'); return; }
      dmPairPatterns(r,n,markNo).forEach(x=>dmAddUnique(rels,x));
    });
    return rels;
  }
  function dmDecisionRelationSplit(r,nums,pats){
    nums=(nums||[]).map(C.toInt).filter(Boolean);
    const marks=[]; const pops=[];
    (r.horses||[]).forEach(h=>{
      const t=C.toInt(h.no); if(!t)return;
      const m=markFor(r,t);
      if(['◎','○','▲'].includes(m)){
        const rels=dmRelationsBetweenHorseAndNums(r,t,nums);
        if(rels.length) dmAddUnique(marks,`${m} ${dmRelationLabel(r,t,rels)}`);
      }
      if(dmPop(r,t)===1){
        const rels=dmRelationsBetweenHorseAndNums(r,t,nums);
        if(rels.length) dmAddUnique(pops,`1人気 ${dmRelationLabel(r,t,rels)}`);
      }
    });
    return {marks,pops};
  }

  function dmHorseRelationToMarkLabels(r,no){
    no=C.toInt(no); if(!no)return [];
    const out=[];
    (r.horses||[]).forEach(h=>{
      const t=C.toInt(h.no); const m=markFor(r,t);
      if(!t||!['◎','○','▲'].includes(m))return;
      const rels=[];
      if(t===no) dmAddUnique(rels,'本人');
      else dmPairPatterns(r,no,t).forEach(x=>dmAddUnique(rels,x));
      if(rels.length) dmAddUnique(out,`${m} ${dmRelationLabel(r,t,rels)}`);
    });
    return out;
  }
  function dmHorseRelationToPop1Labels(r,no){
    no=C.toInt(no); if(!no)return [];
    const pop1=(r.horses||[]).map(h=>C.toInt(h.no)).find(n=>dmPop(r,n)===1);
    if(!pop1)return [];
    const rels=[];
    if(pop1===no) dmAddUnique(rels,'本人');
    else dmPairPatterns(r,no,pop1).forEach(x=>dmAddUnique(rels,x));
    return rels.length ? [`1人気 ${dmRelationLabel(r,pop1,rels)}`] : [];
  }

  function dmHorseRelationToMarks(r,no){
    no=C.toInt(no); if(!no)return 'なし';
    const out=[];
    (r.horses||[]).forEach(h=>{
      const t=C.toInt(h.no); const m=markFor(r,t);
      if(!t||!['◎','○','▲'].includes(m))return;
      const rels=[];
      if(t===no) dmAddUnique(rels,'本人');
      else dmPairPatterns(r,no,t).forEach(x=>dmAddUnique(rels,x));
      if(rels.length) dmAddUnique(out,`${m} ${dmRelationLabel(r,t,rels)}`);
    });
    return out.join(' ／ ') || 'なし';
  }
  function dmHorseRelationToPop1(r,no){
    no=C.toInt(no); if(!no)return 'なし';
    const pop1=(r.horses||[]).map(h=>C.toInt(h.no)).find(n=>dmPop(r,n)===1);
    if(!pop1)return 'なし';
    const rels=[];
    if(pop1===no) dmAddUnique(rels,'本人');
    else dmPairPatterns(r,no,pop1).forEach(x=>dmAddUnique(rels,x));
    return rels.length ? `1人気 ${dmRelationLabel(r,pop1,rels)}` : 'なし';
  }

  function dmParseRelationLabel(label){
    const text=String(label||'').trim();
    const m=text.match(/^([◎○▲])\s+(.+?)：(.+)$/);
    if(m) return {group:m[1], horse:m[2], rels:String(m[3]||'').split('・').filter(Boolean)};
    const p=text.match(/^(1人気)\s+(.+?)：(.+)$/);
    if(p) return {group:p[1], horse:p[2], rels:String(p[3]||'').split('・').filter(Boolean)};
    return {group:'その他', horse:text, rels:[]};
  }
  function dmGroupedRelationsHtml(labels){
    labels=(labels||[]).filter(Boolean);
    if(!labels.length) return 'なし';
    const order=['◎','○','▲','印なし','1人気','その他'];
    const map={};
    labels.forEach(label=>{
      const x=dmParseRelationLabel(label);
      if(!map[x.group]) map[x.group]=new Map();
      const prev=map[x.group].get(x.horse)||new Set();
      (x.rels&&x.rels.length?x.rels:['本人']).forEach(r=>prev.add(r));
      map[x.group].set(x.horse,prev);
    });
    return `<div class="relBox">`+order.filter(g=>map[g]&&map[g].size).map(g=>{
      const items=[...map[g].entries()].map(([horse,rels])=>{
        const arr=[...rels].filter(Boolean);
        const relLis=arr.map(r=>`<li>${C.esc(r)}</li>`).join('');
        return `<div class="relItem"><div class="relHorse">${C.esc(horse)}（${C.esc(arr.length)}）</div><ul>${relLis}</ul></div>`;
      }).join('');
      return `<div class="relGroup"><div class="relGroupTitle">${C.esc(g)}</div>${items}</div>`;
    }).join('')+`</div>`;
  }
  function dmRelationCountRows(markLabels,popLabels){
    const stat={};
    function ensure(group){
      if(!stat[group]) stat[group]={horses:new Set(), relCount:0, rels:{}};
      return stat[group];
    }
    function add(group,horse,rels){
      const s=ensure(group);
      if(horse) s.horses.add(horse);
      const arr=(rels&&rels.length?rels:['本人']).filter(Boolean);
      s.relCount += arr.length;
      arr.forEach(r=>{ s.rels[r]=(s.rels[r]||0)+1; });
    }
    (markLabels||[]).forEach(label=>{
      const x=dmParseRelationLabel(label);
      add(x.group,x.horse,x.rels);
    });
    (popLabels||[]).forEach(label=>{
      const x=dmParseRelationLabel(label);
      add('1人気との繋がり',x.horse,x.rels);
    });
    return stat;
  }
  const DM_REL_PRIORITY=['枠+馬','枠↔馬','5系','本人','ゾロ目','飛び','同枠','連番','和9','人気9','表裏'];
  function dmRelationPriority(rel){
    const i=DM_REL_PRIORITY.indexOf(rel);
    return i>=0 ? i : 999;
  }
  function dmSortRelationEntries(entries){
    return (entries||[]).sort((a,b)=>{
      const dc=Number(b[1]||0)-Number(a[1]||0);
      if(dc) return dc;
      const pa=dmRelationPriority(a[0]), pb=dmRelationPriority(b[0]);
      if(pa!==pb) return pa-pb;
      return String(a[0]).localeCompare(String(b[0]),'ja');
    });
  }
  function dmTieHintForRows(rows){
    const counts={};
    (rows||[]).forEach(([,c])=>{ counts[c]=(counts[c]||0)+1; });
    const tie=Object.values(counts).filter(n=>n>=2).sort((a,b)=>b-a)[0]||0;
    return tie>=2 ? `<p class="hint">（${C.esc(tie)}項目同率）</p>` : '';
  }
  function dmRelationDefinitionRankingHtml(stat){
    const order=['◎','○','▲','印なし','1人気との繋がり'];
    const blocks=order.map(group=>{
      const s=stat[group];
      if(!s || !s.relCount) return '';
      const rows=dmSortRelationEntries(Object.entries(s.rels||{})).map(([rel,c],i)=>`<tr><td>${i+1}</td><td>${C.esc(rel)}</td><td>${C.esc(c)}</td></tr>`).join('');
      return `<h5>${C.esc(group)}</h5><div class="tableWrap"><table><tr><th>順位</th><th>定義</th><th>件数</th></tr>${rows}</table></div>`;
    }).join('');
    return blocks || '<p class="hint">定義別集計はありません。</p>';
  }
  function dmTopRelationRows(stat, group){
    const s=stat && stat[group];
    if(!s || !s.relCount) return [];
    return dmSortRelationEntries(Object.entries(s.rels||{})).slice(0,3);
  }
  function dmRelationConsiderationHtml(stat){
    const groups=['◎','○','▲','印なし','1人気との繋がり'];
    const blocks=groups.map(group=>{
      const rows=dmTopRelationRows(stat,group);
      if(!rows.length) return '';
      return `<h5>${C.esc(group)}</h5><ul class="compactList">${rows.map(([r,c])=>`<li>${C.esc(r)}　${C.esc(c)}件</li>`).join('')}</ul>${dmTieHintForRows(rows)}`;
    }).join('');
    if(!blocks) return '<p class="hint">今回の決まり目には強い繋がり定義は出ていません。</p>';
    return `${blocks}<p class="hint">次回の軸・相手・穴候補で優先比較します。</p>`;
  }
  function dmRelationConsultCandidates(stat){
    const priorityGroups=['◎','▲','1人気との繋がり','○','印なし'];
    const groupPriority={};
    priorityGroups.forEach((g,i)=>{ groupPriority[g]=i; });
    const counts={};
    const bestPriority={};
    const bestGroupCount={};
    priorityGroups.forEach(group=>{
      const s=stat && stat[group];
      if(!s) return;
      Object.entries(s.rels||{}).forEach(([rel,c])=>{
        const n=Number(c||0);
        if(!n) return;
        counts[rel]=(counts[rel]||0)+n;
        const gp=groupPriority[group];
        if(bestPriority[rel]===undefined || n>(bestGroupCount[rel]||0) || (n===(bestGroupCount[rel]||0) && gp<bestPriority[rel])){
          bestPriority[rel]=gp;
          bestGroupCount[rel]=n;
        }
      });
    });
    return Object.entries(counts)
      .filter(([rel,c])=>c>=2)
      .sort((a,b)=>{
        const dc=Number(b[1]||0)-Number(a[1]||0);
        if(dc) return dc;
        const ra=dmRelationPriority(a[0]), rb=dmRelationPriority(b[0]);
        if(ra!==rb) return ra-rb;
        const pa=bestPriority[a[0]]===undefined?99:bestPriority[a[0]];
        const pb=bestPriority[b[0]]===undefined?99:bestPriority[b[0]];
        if(pa!==pb) return pa-pb;
        const ga=bestGroupCount[a[0]]||0;
        const gb=bestGroupCount[b[0]]||0;
        if(ga!==gb) return gb-ga;
        return a[0].localeCompare(b[0],'ja');
      })
      .slice(0,6)
      .map(([rel])=>rel);
  }
  function dmRelationAiConsiderationHtml(stat){
    const candidates=dmRelationConsultCandidates(stat);
    if(!candidates.length) return '<p class="hint">次回の組み合わせ比較候補はありません。</p>';
    return `<p class="hint">次回の組み合わせ比較候補</p><ul class="compactList">${candidates.map(x=>`<li>${C.esc(x)}</li>`).join('')}</ul>`;
  }
  function dmRelationSummaryHtml(allMarkLabels,allPopLabels){
    const stat=dmRelationCountRows(allMarkLabels,allPopLabels);
    const order=['◎','○','▲','印なし','1人気との繋がり'];
    const rows=order.map(k=>{
      const s=stat[k]||{horses:new Set(),relCount:0};
      return `<tr><td>${C.esc(k)}</td><td>${C.esc(s.horses.size)}頭</td><td>${C.esc(s.relCount)}項目</td></tr>`;
    }).join('');
    const markOrder=['◎','○','▲','印なし'];
    const max=markOrder.map(k=>[k,(stat[k]&&stat[k].relCount)||0]).sort((a,b)=>b[1]-a[1])[0];
    const pop=(stat['1人気との繋がり']&&stat['1人気との繋がり'].relCount)||0;
    return `<h4>今回のレースまとめ</h4><div class="tableWrap"><table><tr><th>区分</th><th>頭数</th><th>繋がり項目</th></tr>${rows}</table></div><p class="hint">最多：${C.esc(max&&max[1]?max[0]:'該当なし')}${max&&max[1]?`（${C.esc(max[1])}項目）`:''} ／ 1人気との繋がり：${C.esc(pop)}項目</p><h4>繋がり考察</h4>${dmRelationConsiderationHtml(stat)}`;
  }

  function decisionReportPanel(r){
    if(C.resultMissing(r.result))return '';
    const ac=C.autoResultCombos(r.result||{});
    const pairRows=[];
    const allMarkRelLabels=[];
    const allPopRelLabels=[];
    [['馬連','umaren'],['ワイド','wide']].forEach(([label,key])=>{
      (ac[key]||[]).forEach(c=>{
        const nums=String(c).split('-').map(C.toInt).filter(Boolean);
        const pats=dmPairPatterns(r,nums[0],nums[1]);
        const rel=dmDecisionRelationSplit(r,nums,pats);
        rel.marks.forEach(x=>allMarkRelLabels.push(x));
        rel.pops.forEach(x=>allPopRelLabels.push(x));
        pairRows.push(`<tr><td>${C.esc(label)}</td><td>${C.esc(c)}</td><td class="left">${C.esc(pats.join('・')||'該当なし')}</td><td class="left">${dmGroupedRelationsHtml(rel.marks)}</td><td class="left">${dmGroupedRelationsHtml(rel.pops)}</td></tr>`);
      });
    });
    const trioRows=(ac.sanrenpuku||[]).map(c=>{
      const nums=String(c).split('-').map(C.toInt).filter(Boolean);
      const pats=dmTrioPatterns(r,nums);
      const rel=dmDecisionRelationSplit(r,nums,pats);
      rel.marks.forEach(x=>allMarkRelLabels.push(x));
      rel.pops.forEach(x=>allPopRelLabels.push(x));
      return `<tr><td>3連複</td><td>${C.esc(c)}</td><td class="left">${C.esc(pats.join('・')||'該当なし')}</td><td class="left">${dmGroupedRelationsHtml(rel.marks)}</td><td class="left">${dmGroupedRelationsHtml(rel.pops)}</td></tr>`;
    }).join('');
    const relationStat=dmRelationCountRows(allMarkRelLabels,allPopRelLabels);
    return `<div class="card decisionAnalysisReport"><div class="title">決まり目分析レポート</div><p class="hint">馬券の決まり目が、連番・ゾロ目・表裏・和9・枠↔馬・枠+馬・飛び・5系・同枠・人気9などに当てはまるか、さらに印との繋がりと1人気との繋がりを分けて確認します。</p><h4>馬連・ワイド</h4><div class="tableWrap"><table><tr><th>券種</th><th>決まり目</th><th>成立定義</th><th>印との繋がり</th><th>1人気との繋がり</th></tr>${pairRows.join('')||'<tr><td colspan="5">データなし</td></tr>'}</table></div><h4>3連複</h4><div class="tableWrap"><table><tr><th>券種</th><th>決まり目</th><th>成立定義</th><th>印との繋がり</th><th>1人気との繋がり</th></tr>${trioRows||'<tr><td colspan="5">データなし</td></tr>'}</table></div>${dmRelationSummaryHtml(allMarkRelLabels,allPopRelLabels)}<h4>AI考察</h4>${dmRelationAiConsiderationHtml(relationStat)}</div>`;
  }


  function markAnalysisReportPanel(r){
    if(C.resultMissing(r.result)) return '';
    const axisNo=C.toInt(r.prediction&&r.prediction.axis&&r.prediction.axis.no);
    const resultNums=[...(r.result?.firsts||[]),...(r.result?.seconds||[]),...(r.result?.thirds||[])].map(C.toInt).filter(Boolean);
    const axisH=axisNo?horseOf(r,axisNo):{};
    const axisInfo=axisNo?markLabelsForHorse(r,axisH):null;
    const resultRows=resultNums.map((no,idx)=>{
      const h=horseOf(r,no); const info=markLabelsForHorse(r,h); const rank=idx===0?'1着':idx===1?'2着':'3着';
      const markLabel=info.mark||'印なし';
      const markRelLabels=dmHorseRelationToMarkLabels(r,no);
      const popRelLabels=dmHorseRelationToPop1Labels(r,no);
      return `<tr><td>${rank}</td><td>${C.esc(horseLabel(r,no))}</td><td>${C.esc(markLabel)}</td><td class="left">${C.esc(fmtLabels(info.labels))}</td><td class="left">${dmGroupedRelationsHtml(markRelLabels)}</td><td class="left">${dmGroupedRelationsHtml(popRelLabels)}</td></tr>`;
    }).join('');
    const axisText=axisNo ? `${horseLabel(r,axisNo)} / ${axisInfo.mark||'印なし'}：${fmtLabels(axisInfo.labels)}` : '軸なし';
    const resultLabelLists=resultNums.map(no=>markLabelsForHorse(r,horseOf(r,no)).labels||[]);
    const common=[...new Set(resultLabelLists.flat())].filter(x=>resultLabelLists.length && resultLabelLists.every(a=>a.includes(x)));
    const axisLabels=axisInfo?axisInfo.labels:[];
    const resultUnion=[...new Set(resultLabelLists.flat())];
    const missingToAxis=resultUnion.filter(x=>!axisLabels.includes(x));
    const noMarkGood=resultNums.map(no=>({no,h:horseOf(r,no),info:markLabelsForHorse(r,horseOf(r,no))})).filter(x=>!x.info.mark);
    const noMarkRows=noMarkGood.map(x=>`<tr><td>${C.esc(horseLabel(r,x.no))}</td><td class="left">${C.esc(fmtLabels(x.info.labels))}</td></tr>`).join('');
    const resultNames=resultNums.map(no=>horseLabel(r,no)).join('、')||'未確定';
    const aiComment = common.length
      ? `馬券内馬（${resultNames}）に共通していた定義は「${common.join('・')}」です。次回はこの定義を軸・相手条件の比較候補にします。`
      : (missingToAxis.length ? `軸馬に薄く、馬券内馬側に出ていた定義は「${missingToAxis.slice(0,5).join('・')}」です。次回はこの差分を比較します。` : `今回は馬券内馬に明確な共通定義は出ていません。印・人気帯・5系との組み合わせで再確認します。`);
    const consults=[...new Set((common.length?common:missingToAxis).slice(0,6))];
    const consultHtml=consults.length ? `<ul class="compactList">${consults.map(x=>`<li>${C.esc(x)}を優先比較</li>`).join('')}</ul>` : '<div class="subtle">明確な印定義候補なし</div>';
    const placeSet=new Set(resultNums);
    const neighborRows=(r.horses||[]).map(h=>{
      const no=C.toInt(h.no); if(!no)return '';
      const info=markLabelsForHorse(r,h);
      const self=placeSet.has(no);
      const left=placeSet.has(no-1);
      const right=placeSet.has(no+1);
      const role=self?'本人が馬券内':((left||right)?'隣が馬券内':'本人・隣とも圏外');
      return `<tr><td>${no}</td><td>${C.esc(h.name||'')}</td><td>${C.esc(info.mark||'印なし')}</td><td class="left">${C.esc(fmtLabels(info.labels))}</td><td>${self?'○':'-'}</td><td>${left?'○':'-'}</td><td>${right?'○':'-'}</td><td>${C.esc(role)}</td></tr>`;
    }).join('');
    const neighborHint = `今回の出走馬について、各馬の並び定義が「本人に出たか」「左隣・右隣に出たか」を確認します。本人が来やすい定義は軸候補、隣が来やすい定義は相手候補として次回比較できます。`;
    return `<div class="card markAnalysisReport"><div class="title">印分析レポート</div>`+
      `<p class="hint">印そのものではなく、前走3走の並び・数字パターンから、どの形の馬が好走したかを確認します。印なし馬は共通定義だけで分析します。</p>`+
      `<h4>軸馬分析</h4><p>${C.esc(axisText)}</p>`+
      `<h4>馬券内馬分析</h4><div class="tableWrap"><table><tr><th>着順</th><th>馬</th><th>印</th><th>該当定義</th><th>印との繋がり</th><th>1人気との繋がり</th></tr>${resultRows||'<tr><td colspan="6">結果なし</td></tr>'}</table></div>`+
      `<h4>本人・隣分析</h4><p class="hint">${C.esc(neighborHint)}</p><div class="tableWrap"><table><tr><th>馬番</th><th>馬</th><th>印</th><th>該当定義</th><th>本人</th><th>左隣</th><th>右隣</th><th>判定</th></tr>${neighborRows||'<tr><td colspan="8">データなし</td></tr>'}</table></div>`+
      `<h4>印なし好走馬分析</h4>${noMarkRows?`<div class="tableWrap"><table><tr><th>馬</th><th>共通定義</th></tr>${noMarkRows}</table></div>`:'<p class="subtle">印なしで馬券内に来た馬はありません。</p>'}`+
      `<h4>AI考察</h4><p>${C.esc(aiComment)}</p>`+
      `<div class="hint"><b>今回の分析から相談候補</b>${consultHtml}</div></div>`;
  }

  function regeneratePrediction(id){
    let r=S.getRace(id);
    if(!r) return showSearch();
    if(canGeneratePrediction(r)) r=generatePredictionForDisplay(r,true);
    showDetail(r.id,'result');
  }
  function raceSort(a,b){
    const da=String(a.date||''), db=String(b.date||'');
    if(da!==db) return db.localeCompare(da);
    const pa=places.indexOf(a.place), pb=places.indexOf(b.place);
    if(pa!==pb) return (pa<0?999:pa)-(pb<0?999:pb);
    return (C.toInt(a.raceNo)||0)-(C.toInt(b.raceNo)||0);
  }
  function sortedRaces(){return S.loadRaces().slice().sort(raceSort)}
  function raceSortAsc(a,b){return -raceSort(a,b)}
  function meetingKey(r){return [r.date||'',r.place||''].join('|')}
  function uniqueMeetings(races){const seen=new Set(), out=[]; races.slice().sort(raceSortAsc).forEach(r=>{const k=meetingKey(r); if(!seen.has(k)){seen.add(k); out.push({key:k,date:r.date||'',place:r.place||''});}}); return out}
  function currentMeetingIndex(meetings){
    const d=val('searchDate'), p=val('searchPlace');
    let idx=meetings.findIndex(m=>(!d||m.date===d)&&(!p||m.place===p));
    if(idx<0 && currentDetailId){const r=S.getRace(currentDetailId); idx=meetings.findIndex(m=>m.date===r.date&&m.place===r.place)}
    if(idx<0) idx=meetings.length-1;
    return idx;
  }
  function setSearchField(id,v){const e=document.getElementById(id); if(e)e.value=v||''}
  function detailNav(id,tab){
    const sid=C.esc(id), stab=C.esc(tab);
    return `<div class="detailNavBlock"><div class="detailNavGrid"><button class="secondary" onclick="KV2App.prevMeeting('${sid}','${stab}')">◀前開催</button><button class="secondary" onclick="KV2App.nextMeeting('${sid}','${stab}')">次開催▶</button><button class="secondary" onclick="KV2App.prevRace('${sid}','${stab}')">◁前のレース</button><button class="secondary" onclick="KV2App.nextRace('${sid}','${stab}')">次のレース▷</button></div><button class="secondary textInputNavBtn" onclick="KV2App.showInput('${sid}')">テキスト入力</button></div>`;
  }
  function showSearch(){
    const races=sortedRaces();
    app.innerHTML=h('保存レース検索',true)+sc(`<div class="card"><div class="title">検索条件</div><div class="grid4"><div><label>日付</label><input id="searchDate" type="date"></div><div><label>開催地</label><select id="searchPlace"><option></option>${opt(places,'')}</select></div><div><label>レース名</label><input id="searchKeyword" placeholder="レース名"></div><div><label>結果</label><select id="searchResult"><option value="all">全て</option><option value="missing">結果未入力</option><option value="done">結果入力済み</option></select></div></div><div class="grid4"><div><label>グレード</label><select id="searchGrade"><option></option>${opt(['G1','G2','G3','J-G1','J-G2','J-G3','OP','L','特別1勝','特別2勝','特別3勝','1勝','2勝','3勝'],'')}</select></div><div><label>馬場</label><select id="searchSurface"><option></option>${opt(['芝','ダート','障害'],'')}</select></div><div><label>条件</label><select id="searchCondition"><option></option>${opt(['定量','別定','ハンデ'],'')}</select></div><div><label>判定</label><select id="searchJudge"><option></option>${opt(['勝負','抑え','保留','見送り'],'')}</select></div></div><div class="grid4"><button onclick="KV2App.renderSearch('all')">検索</button><button class="secondary" onclick="KV2App.renderSearch('missing')">結果未入力</button><button class="secondary" onclick="KV2App.renderSearch('week')">今週</button><button class="secondary" onclick="KV2App.showInput()">レース情報入力</button></div><div class="grid2"><button class="secondary" onclick="KV2App.prevMeeting()">前開催</button><button class="secondary" onclick="KV2App.nextMeeting()">次開催</button></div></div><div class="card"><div class="title">保存レース一覧 <span id="searchCount" class="subtle"></span></div><div id="searchList">${raceList(races)}</div></div>`);
    updateSearchCount(races.length);
    resetScroll()
  }
  function raceList(races){
    races=(races||[]).slice().sort(raceSort);
    if(!races.length)return '<p>保存レースはありません。</p>';
    return races.map(r=>{const miss=C.resultMissing(r.result); const p=r.prediction||{}; return `<div class="raceListItem"><div><b>${C.esc(r.date)}</b><br><span style="color:#075bb5;font-weight:800">${C.esc(r.place)} ${C.esc(r.raceNo)}</span></div><div><b>${C.esc(displayRaceName(r))}</b> <span class="pill">${C.esc(r.grade)}</span> ${miss?'<span class="badge red">結果未入力</span>':'<span class="badge green">結果済</span>'}<br><span class="subtle">${C.esc(r.surface)}${C.esc(r.distance)} ${C.esc(r.condition)} ${C.esc(r.age)} ／ 判定:${C.esc(p.judge||'-')}</span></div><div><button class="small" onclick="KV2App.showDetail('${C.esc(r.id)}','entry')">出馬表</button><button class="small secondary" onclick="KV2App.showDetail('${C.esc(r.id)}','result')">予想/結果</button></div></div>`}).join('')
  }
  function updateSearchCount(n){const e=document.getElementById('searchCount'); if(e)e.textContent=`（${n}件）`}
  function filterSearchRaces(mode){
    let races=sortedRaces();
    const d=val('searchDate'), place=val('searchPlace'), kw=val('searchKeyword').trim(), grade=val('searchGrade'), surface=val('searchSurface'), condition=val('searchCondition'), judge=val('searchJudge');
    const resultMode=mode==='missing'?'missing':(val('searchResult')||'all');
    if(mode==='week'){
      const now=new Date(); const day=now.getDay(); const start=new Date(now); start.setDate(now.getDate()-day); start.setHours(0,0,0,0); const end=new Date(start); end.setDate(start.getDate()+7);
      races=races.filter(r=>{const rd=new Date(r.date); return rd>=start && rd<end});
      setSearchField('searchDate','');
    }
    if(d) races=races.filter(r=>r.date===d);
    if(place) races=races.filter(r=>r.place===place);
    if(kw) races=races.filter(r=>displayRaceName(r).includes(kw) || String(r.raceName||'').includes(kw));
    if(grade) races=races.filter(r=>r.grade===grade);
    if(surface) races=races.filter(r=>r.surface===surface);
    if(condition) races=races.filter(r=>r.condition===condition);
    if(judge) races=races.filter(r=>(r.prediction&&r.prediction.judge)===judge);
    if(resultMode==='missing') races=races.filter(r=>C.resultMissing(r.result));
    if(resultMode==='done') races=races.filter(r=>!C.resultMissing(r.result));
    return races;
  }
  function renderSearch(mode){
    searchState.mode=mode||'all';
    const races=filterSearchRaces(searchState.mode);
    const list=document.getElementById('searchList'); if(list) list.innerHTML=raceList(races);
    updateSearchCount(races.length);
  }
  function adjacentRace(id,dir){
    const races=sortedRaces().slice().sort(raceSortAsc);
    if(!races.length) return null;
    let idx=races.findIndex(r=>r.id===id);
    if(idx<0) idx=dir>0?-1:races.length;
    const next=races[idx+dir];
    return next||null;
  }
  function moveRace(id,tab,dir){
    id=id||currentDetailId; tab=tab||'entry';
    const r=adjacentRace(id,dir);
    if(r) showDetail(r.id,tab);
  }
  function moveMeeting(id,tab,dir){
    const races=sortedRaces(); const meetings=uniqueMeetings(races); if(!meetings.length)return;
    let idx=currentMeetingIndex(meetings);
    if(id){const r=S.getRace(id); const k=r?meetingKey(r):''; const i=meetings.findIndex(m=>m.key===k); if(i>=0)idx=i;}
    idx=Math.max(0,Math.min(meetings.length-1,idx+dir));
    const m=meetings[idx];
    if(id){const target=races.slice().sort(raceSortAsc).find(r=>r.date===m.date&&r.place===m.place); if(target) return showDetail(target.id,tab||'entry');}
    setSearchField('searchDate',m.date); setSearchField('searchPlace',m.place); renderSearch('all');
  }



  function fmtBackupDate(iso){
    const d = new Date(iso);
    if(!iso || isNaN(d.getTime())) return String(iso||'');
    const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
    const hh=String(d.getHours()).padStart(2,'0'), mm=String(d.getMinutes()).padStart(2,'0');
    return `${y}/${m}/${day} ${hh}:${mm}`;
  }
  function showAutoBackups(){
    const backups = S.listAutoBackups ? S.listAutoBackups() : [];
    const rows = backups.length ? backups.map(b=>`<tr><td>${C.esc(fmtBackupDate(b.createdAt))}</td><td>${C.esc(b.count)}件</td><td>${C.esc(b.reason||'自動')}</td><td><button class="small green" onclick="KV2App.restoreAutoBackup('${C.esc(b.id)}')">復元</button> <button class="small secondary" onclick="KV2App.deleteAutoBackup('${C.esc(b.id)}')">削除</button></td></tr>`).join('') : '<tr><td colspan="4">自動バックアップはまだありません。</td></tr>';
    app.innerHTML = h('自動バックアップ復元', true) + sc(
      `<div class="card"><div class="title">自動バックアップ</div>`+
      `<p class="hint">保存・編集・削除時に作成されたバックアップです。新規保存後にも作成されます。最新10世代まで保持します。復元前にも現在状態を自動バックアップします。</p>`+
      `<div class="tableWrap"><table><thead><tr><th>作成日時</th><th>保存レース数</th><th>理由</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></div>`+
      `<div id="backupMsg" class="subtle"></div></div>`);
  }
  function restoreAutoBackup(id){
    if(!confirm('この自動バックアップへ復元しますか？現在の状態も復元前バックアップとして保存してから復元します。')) return;
    try{
      const list = S.restoreAutoBackup(id);
      alert(`復元しました（保存レース ${list.length}件）。`);
      showTop();
    }catch(e){
      alert('復元に失敗しました: '+(e&&e.message?e.message:e));
    }
  }
  function deleteAutoBackup(id){
    if(!confirm('この自動バックアップを削除しますか？')) return;
    try{
      S.deleteAutoBackup(id);
      showAutoBackups();
    }catch(e){
      alert('削除に失敗しました: '+(e&&e.message?e.message:e));
    }
  }

  function backupMessage(msg, ok){
    const el=document.getElementById('backupMsg');
    if(el){ el.innerHTML=`<span class="${ok?'ok':'ng'}">${C.esc(msg)}</span>`; }
    else { alert(msg); }
  }
  function exportBackupJson(){
    try{
      const text=S.exportJson();
      const d=new Date();
      const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
      const hh=String(d.getHours()).padStart(2,'0'), mm=String(d.getMinutes()).padStart(2,'0');
      const blob=new Blob([text],{type:'application/json'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url; a.download=`keiba_backup_${y}${m}${day}_${hh}${mm}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
      backupMessage(`JSONバックアップを出力しました（保存レース ${S.loadRaces().length}件）。`, true);
    }catch(e){
      backupMessage('JSON出力に失敗しました: '+(e&&e.message?e.message:e), false);
    }
  }
  function importBackupJsonFile(input){
    try{
      const f=input && input.files && input.files[0];
      if(!f) return backupMessage('取込するJSONファイルを選択してください。', false);
      const reader=new FileReader();
      reader.onload=function(){
        try{
          S.importJson(String(reader.result||''));
          const n=S.loadRaces().length;
          backupMessage(`JSONバックアップを取り込みました（保存レース ${n}件）。`, true);
          showTop();
        }catch(e){
          backupMessage('JSON取込に失敗しました: '+(e&&e.message?e.message:e), false);
        }finally{
          try{ input.value=''; }catch(_e){}
        }
      };
      reader.onerror=function(){ backupMessage('JSONファイルを読み込めませんでした。', false); };
      reader.readAsText(f);
    }catch(e){
      backupMessage('JSON取込に失敗しました: '+(e&&e.message?e.message:e), false);
    }
  }

  function showMigration(){
    const candidates=S.scanVer1Storage ? S.scanVer1Storage() : [];
    const rows=candidates.length
      ? candidates.map(x=>`<tr><td>${C.esc(x.key)}</td><td>${C.esc(x.count)}</td><td><button class="small green" onclick="KV2App.runVer1StorageImport('${C.esc(x.key)}')">このデータを移行</button></td></tr>`).join('')
      : '<tr><td colspan="3">同じブラウザ内のVer1保存レース候補は見つかりませんでした。</td></tr>';
    const oddsStats = S.getOddsSupplementStats ? S.getOddsSupplementStats() : {candidates:0,current:0,storage:0};
    app.innerHTML=h('Ver1データ移行',true)+sc(
      `<div class="card"><div class="title">Ver1保存レースをVer2へ移行</div>`+
      `<p>Ver1の保存レースを読み込み、Ver2の保存レース形式へ変換します。同じ日付・開催地・レース数は上書き更新、未登録レースは追加します。</p>`+
      `<div class="hint">移行後、検証結果で対象Rが31R以上になれば直近30Rの表示とCSV出力を確認できます。</div>`+
      `</div>`+
      `<div class="card"><div class="title">同じブラウザ内のVer1候補</div><div class="tableWrap"><table><thead><tr><th>保存キー</th><th>件数</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></div></div>`+
      `<div class="card"><div class="title">Ver1エクスポートJSONから移行</div>`+
      `<input id="ver1ImportFile" type="file" accept=".json,.txt,application/json">`+
      `<button class="green" onclick="KV2App.runVer1FileImport()">ファイルを読み込んで移行</button>`+
      `<p class="subtle">Ver1側でエクスポートしたJSONがある場合はこちらを使います。</p></div>`+
      `<div class="card"><div class="title">単勝CSVから後付け補完</div>`+
      `<input id="oddsCsvSupplementFile" type="file" accept=".csv,.txt,text/csv">`+
      `<button class="green" onclick="KV2App.runOddsCsvSupplement()">CSVを読み込んで単勝補完</button>`+
      `<p class="subtle">日付・開催地・R・馬番が一致した既存保存レースに、空欄の単勝だけを反映します。予想・結果・判定・払戻は変更しません。</p></div>`+
      `<div class="card"><div class="title">単勝払戻の一括再計算</div>`+
      `<button class="green" onclick="KV2App.runTanshoPayRecalc()">保存レースを一括再計算</button>`+
      `<p class="subtle">結果の1着馬と出馬表の単勝オッズから、単勝払戻をオッズ×100円で自動作成します。手入力済みの単勝払戻は上書きしません。</p></div>`+
      `<div id="migrationMessage"></div>`+
      `<div class="bottomBar"><button class="secondary" onclick="KV2App.showTop()">トップへ</button><button onclick="KV2App.showValidation()">検証結果へ</button></div>`
    );
    resetScroll();
  }

  function migrationMsg(t, ok){
    const el=document.getElementById('migrationMessage');
    if(el) el.innerHTML=`<div class="card ${ok?'ok':'warn'}">${C.esc(t)}</div>`;
  }


  function runTanshoPayRecalc(){
    if(!confirm('保存済みレースの単勝払戻を一括再計算しますか？手入力済みの単勝払戻は上書きしません。')) return;
    try{
      if(!S.recalcExistingTanshoPayFromFirstOdds) return migrationMsg('単勝払戻一括再計算機能が見つかりません。', false);
      const res = S.recalcExistingTanshoPayFromFirstOdds();
      if(!res.ok) return migrationMsg(res.message || '単勝払戻を再計算できませんでした。', false);
      migrationMsg(res.message || '単勝払戻を一括再計算しました。', true);
    }catch(e){
      console.error(e);
      migrationMsg('単勝払戻一括再計算中にエラーが発生しました。', false);
    }
  }


  function runOddsSupplementOnly(){
    try{
      if(!S.supplementExistingRacesOdds) return migrationMsg('単勝補完機能が見つかりません。', false);
      const res = S.supplementExistingRacesOdds();
      if(!res.ok) return migrationMsg(res.message || '単勝補完できませんでした。', false);
      migrationMsg(res.message || '単勝補完を実行しました。', true);
    }catch(e){
      migrationMsg('単勝補完中にエラーが発生しました。', false);
    }
  }


  function runOddsCsvSupplement(){
    const f=document.getElementById('oddsCsvSupplementFile')?.files?.[0];
    if(!f) return migrationMsg('単勝補完に使うCSVファイルを選択してください。', false);
    const reader=new FileReader();
    reader.onload=function(){
      try{
        if(!S.supplementExistingRacesOddsFromCsvText) return migrationMsg('CSV単勝補完機能が見つかりません。', false);
        const res=S.supplementExistingRacesOddsFromCsvText(String(reader.result||''));
        if(!res.ok) return migrationMsg(res.message || 'CSVから単勝補完できませんでした。', false);
        migrationMsg(res.message || 'CSVから単勝補完しました。', true);
      }catch(e){
        console.error(e);
        migrationMsg('CSV単勝補完中にエラーが発生しました。', false);
      }
    };
    reader.readAsText(f);
  }

  function runVer1StorageImport(key){
    if(!confirm('Ver1保存レースをVer2へ移行しますか？同一レースはVer1データで更新します。')) return;
    try{
      const res=S.importVer1FromStorage(key);
      if(!res.ok) return migrationMsg(res.message || '移行できませんでした。', false);
      migrationMsg(`移行完了：追加 ${res.imported}件、更新 ${res.updated}件、スキップ ${res.skipped}件、読込 ${res.total}件。${res.message ? ' '+res.message : ''}`, true);
    }catch(e){
      console.error(e);
      migrationMsg('移行中にエラーが発生しました。JSON形式またはVer1保存形式を確認してください。', false);
    }
  }

  function runVer1FileImport(){
    const f=document.getElementById('ver1ImportFile')?.files?.[0];
    if(!f) return migrationMsg('移行するJSONファイルを選択してください。', false);
    const reader=new FileReader();
    reader.onload=function(){
      try{
        const data=JSON.parse(String(reader.result||''));
        const res=S.importVer1Data(data);
        if(!res.ok) return migrationMsg(res.message || '移行できませんでした。', false);
        migrationMsg(`移行完了：追加 ${res.imported}件、更新 ${res.updated}件、スキップ ${res.skipped}件、読込 ${res.total}件。${res.message ? ' '+res.message : ''}`, true);
      }catch(e){
        console.error(e);
        migrationMsg('JSONファイルを読み込めませんでした。', false);
      }
    };
    reader.readAsText(f);
  }

  function showValidation(){
    if(window.KV2Validation && typeof window.KV2Validation.show==='function') return window.KV2Validation.show();
  }
  function togglePanel(id){
    const el=document.getElementById(id);
    if(el) el.hidden=!el.hidden;
  }

  window.KV2App={showTop,runTopAction,showAutoBackups,restoreAutoBackup,deleteAutoBackup,exportBackupJson,importBackupJsonFile,showMigration,runTanshoPayRecalc,runOddsSupplementOnly,runVer1StorageImport,runVer1FileImport,runOddsCsvSupplement,showInput,saveInput,setProvisional,refreshHorseRows,clearHorses,updatePopularity,parseText,deleteRace,showDetail,addFinish,fillHorseName,addPayRow,saveResult,regeneratePrediction,showSearch,renderSearch,showValidation,togglePanel,makeReflection,showRuleConsult:(mode,id)=>window.KV2RuleConsult.show(mode,id),prevRace:(id,tab)=>moveRace(id,tab,-1),nextRace:(id,tab)=>moveRace(id,tab,1),prevMeeting:(id,tab)=>moveMeeting(id,tab,-1),nextMeeting:(id,tab)=>moveMeeting(id,tab,1)};
  document.addEventListener('DOMContentLoaded',showTop);
})();
