/* ==========================================
   06-rule-consult.js Ver.2 rev2-117
   Ver2_009: 予想ルール相談
   条件画面 / CSV読み込み / 比較結果 / 提案 / 会話型相談 / 反映 / 再計算
========================================== */
(function(){
  'use strict';
  const C=window.KV2Common, S=window.KV2Store;
  // CSV本体はlocalStorageに保存しない。
  // Android Chromeでは大きいCSV保存でQuotaExceededErrorになるため、
  // 相談画面を開いている間だけメモリ保持する。
  // CSV_KEYは旧版データ削除用にだけ残す。
  const CSV_KEY='keibaPredictionV2.ruleConsultCsvRows';
  const CSV_META_KEY='keibaPredictionV2.ruleConsultCsvMeta';
  const LAST_KEY='keibaPredictionV2.ruleConsultLastProposal';
  let ruleConsultCsvRowsMemory=[];

  function header(title){return `<div class="header"><button class="homeBtn" onclick="KV2App.showTop()">🏠</button>${title}</div>`}
  function screen(x){return `<div class="screen">${x}</div>`}
  function safe(v){return C.esc(v==null?'':v)}
  function num(v){
    if(v==null) return 0;
    const n=parseFloat(String(v).replace(/,/g,'').replace('%','').trim());
    return Number.isFinite(n)?n:0;
  }
  function safeAttr(s){ return safe(s).replace(/&quot;/g,'&quot;'); }

  function round1(v){
    const n=Number(v);
    if(!Number.isFinite(n)) return 0;
    return Math.round(n*10)/10;
  }
  function int(v){return C.toInt(v)||0}
  function loadRows(){
    return Array.isArray(ruleConsultCsvRowsMemory)?ruleConsultCsvRowsMemory:[];
  }
  function loadCsvMeta(){
    try{const m=JSON.parse(localStorage.getItem(CSV_META_KEY)||'{}'); return m&&typeof m==='object'?m:{}}catch(e){return {}}
  }
  function saveCsvMeta(meta){
    try{localStorage.setItem(CSV_META_KEY,JSON.stringify(meta||{}));}catch(e){console.warn('rule csv meta save failed',e);}
    return meta||{};
  }
  function sectionCounts(rows){
    const m={};
    (rows||[]).forEach(r=>{
      const k=String(r.rankingSection||r.basis||'未分類').trim()||'未分類';
      m[k]=(m[k]||0)+1;
    });
    return m;
  }
  function rankingUseType(section){
    section=String(section||'');
    if(isJudgeRankingSection(section)) return '除外：判定別';
    if(isLowReturnRankingSection(section)) return '除外：低回収率';
    if(isAxisNgRankingSection(section)) return '補助：軸NG';
    if(isPrimaryRuleRankingSection(section)) return '主候補';
    if(isAuxiliaryRuleRankingSection(section)) return '補助候補';
    return '参考';
  }
  function rankingCsvDebugSummary(rows){
    rows=rows||[];
    const by={};
    rows.forEach(r=>{
      const sec=String(r.rankingSection||r.basis||'未分類').trim()||'未分類';
      const type=rankingUseType(sec);
      const rec=by[sec]||(by[sec]={total:0,type:type,direct:0,hint:0});
      rec.total++;
      if(isDirectRuleCandidate(r)) rec.direct++;
      if(isAxisNgRankingSection(sec)) rec.hint++;
    });
    const lines=Object.entries(by).sort((a,b)=>b[1].total-a[1].total).map(([k,v])=>{
      const extra=v.direct?` / 候補${v.direct}`:(v.hint?` / ヒント${v.hint}`:'');
      return `・${safe(k)}：${int(v.total).toLocaleString()}件（${safe(v.type)}${extra}）`;
    });
    const direct=rows.filter(r=>isDirectRuleCandidate(r)).length;
    const axisHint=rows.filter(r=>isAxisNgRankingSection(r.rankingSection||r.basis)).length;
    return {lines,direct,axisHint};
  }
  function csvCandidateScore(r){
    r=r||{};
    return num(r.allReturn)*2 + num(r.axisPlace)*1.5 + num(r.umarenReturn) + num(r.wideReturn) + num(r.sanrenpukuReturn) + num(r.hitRate)*0.5 + Math.min(int(r.races||0),60);
  }
  function compactCsvRow(r){
    r=r||{};
    const o={
      category:normalizeCategoryLabel(r.category||r.rawCategory||''),
      races:int(r.races||r.doneR||r.totalR||0),
      basis:String(r.basis||'').slice(0,40),
      axisPlace:round1(num(r.axisPlace||r.axisPlaceRate)),
      allReturn:round1(num(r.allReturn)),
      umarenReturn:round1(num(r.umarenReturn)),
      wideReturn:round1(num(r.wideReturn)),
      sanrenpukuReturn:round1(num(r.sanrenpukuReturn)),
      hitRate:round1(num(r.hitRate)),
      umarenHit:round1(num(r.umarenHit)),
      wideHit:round1(num(r.wideHit)),
      sanrenpukuHit:round1(num(r.sanrenpukuHit)),
      ruleText:String(r.ruleText||'').slice(0,120),
      candidateSource:'rankingCsv',
      rankingSection:String(r.rankingSection||'CSV').slice(0,40)
    };
    if(r.isAttributeRanking) o.isAttributeRanking=true;
    o.score=round1(csvCandidateScore(o));
    return o;
  }
  function compactCsvRows(rows){
    // 判定別・低回収率ランキングは相談対象から除外する。
    // それ以外は、候補化しない補助ヒント（軸NGなど）も内訳確認用に保持する。
    const src=(rows||[]).map(compactCsvRow).filter(r=>{
      const section=String(r.rankingSection||r.basis||'');
      if(isJudgeRankingSection(section) || isLowReturnRankingSection(section)) return false;
      if(!isRealConsultCategoryLabel(r.category)) return false;
      return !!(r.races||r.allReturn||r.axisPlace||r.umarenReturn||r.wideReturn||r.sanrenpukuReturn);
    });
    const seen=new Set(), dedup=[];
    src.forEach(r=>{
      const k=[r.category,r.rankingSection,r.ruleText,r.races,r.allReturn,r.axisPlace,r.umarenReturn,r.wideReturn,r.sanrenpukuReturn].join('|');
      if(seen.has(k)) return; seen.add(k); dedup.push(r);
    });
    const groups={};
    dedup.forEach(r=>{ const k=(r.category||'')+'|'+(r.rankingSection||''); (groups[k]||(groups[k]=[])).push(r); });
    const kept=[];
    Object.values(groups).forEach(g=>{
      g.sort((a,b)=>csvCandidateScore(b)-csvCandidateScore(a));
      kept.push(...g.slice(0,8));
    });
    // 全体上位も少し残す。カテゴリー一致が弱いCSVでも候補が消えすぎないようにする。
    const top=dedup.slice().sort((a,b)=>csvCandidateScore(b)-csvCandidateScore(a)).slice(0,300);
    const m=new Map();
    [...kept,...top].forEach(r=>{
      const k=[r.category,r.rankingSection,r.ruleText,r.races,r.allReturn,r.axisPlace,r.umarenReturn,r.wideReturn,r.sanrenpukuReturn].join('|');
      if(!m.has(k)) m.set(k,r);
    });
    return [...m.values()].slice(0,1200);
  }
  function saveRows(rows){
    const compact=compactCsvRows(rows||[]);
    ruleConsultCsvRowsMemory=compact;
    // 旧版で保存された大容量CSVはここで必ず削除する。
    try{ localStorage.removeItem(CSV_KEY); }catch(e){}
    return compact;
  }
  function clearRows(){
    ruleConsultCsvRowsMemory=[];
    try{localStorage.removeItem(CSV_KEY);}catch(e){}
    try{localStorage.removeItem(CSV_META_KEY);}catch(e){}
    show('all')
  }
  function fmtDateTime(v){
    if(!v) return '';
    try{const d=new Date(v); if(!isNaN(d.getTime())) return d.toLocaleString('ja-JP');}catch(e){}
    return String(v||'');
  }
  function rankingCsvStatusHtml(rows){
    rows=rows||loadRows();
    const meta=loadCsvMeta();
    if(!rows.length){
      return `<div class="subtle">登録CSV：0行</div>`;
    }
    const dbg=rankingCsvDebugSummary(rows);
    const files=(meta.files&&meta.files.length)?meta.files:[{name:meta.fileName||'CSV',rows:rows.length,at:meta.loadedAt}];
    const fileLine=files.map(f=>`${safe(f.name||'CSV')} ${int(f.rows||0).toLocaleString()}行`).join(' / ');
    const sectionLine=dbg.lines.join('<br>');
    const total=int(meta.totalRows||rows.length);
    const stored=int(meta.storedRows||rows.length);
    return `<div class="hint"><b>ランキングCSV登録済み</b><br>登録ファイル：${files.length}件<br>読込行数：${total.toLocaleString()}行<br>相談対象：${stored.toLocaleString()}件 / 直接候補対象：${dbg.direct.toLocaleString()}件 / 軸NGヒント：${dbg.axisHint.toLocaleString()}件<br>${meta.memoryOnly?'保存方式：メモリのみ（容量超過防止）<br>':''}${fileLine?`登録内容：${fileLine}<br>`:''}${meta.loadedAt?`最終更新：${safe(fmtDateTime(meta.loadedAt))}<br>`:''}${sectionLine?`<details><summary>内訳を見る</summary><div class="subtle">${sectionLine}</div></details>`:''}</div>`;
  }
  function consultDataStatusHtml(items){
    const rows=loadRows();
    const rankingItems=(items||[]).filter(it=>it&&it.best&&it.best.candidateSource==='rankingCsv').length;
    const used=rows.length>0;
    const dbg=rankingCsvDebugSummary(rows);
    const detail=used&&dbg.lines.length?`<details><summary>ランキングCSV内訳</summary><div class="subtle">${dbg.lines.join('<br>')}</div></details>`:'';
    return `<div class="card"><div class="title">相談データ</div><div class="hint">✅ 保存レース<br>${used?`✅ ランキングCSV（相談対象${rows.length.toLocaleString()}件 / 直接候補対象${dbg.direct.toLocaleString()}件 / 軸NGヒント${dbg.axisHint.toLocaleString()}件 / 表示候補${rankingItems}件）${detail}`:'❌ ランキングCSV未登録（保存レースのみで相談）'}</div></div>`;
  }

  // 相談結果は全カテゴリー分を丸ごとlocalStorageへ保存すると、Android Chromeで容量上限に達する。
  // 画面操作中はメモリ保持を優先し、localStorageには反映に必要な最小情報だけ保存する。
  let lastProposalMemory=null;
  function compactBest(b){
    if(!b) return b;
    const keep=['category','ruleText','basis','score','races','doneR','totalR','axisPlace','axisPlaceRate','allReturn','umarenReturn','wideReturn','sanrenpukuReturn','umarenHit','wideHit','sanrenpukuHit','hitRate','candidateSource','rankingSection','candidateKind','isAuxiliaryRanking','isAttributeRanking','altType','altLabel','altDesc','fromConversation','selectedAlt'];
    const o={}; keep.forEach(k=>{ if(b[k]!=null) o[k]=b[k]; });
    return o;
  }
  function compactProposal(x){
    x=x||{};
    return {
      targetCategory:x.targetCategory,
      targetCategories:x.targetCategories,
      actualCategories:x.actualCategories,
      current:compactBest(x.current),
      best:compactBest(x.best),
      prefs:{
        comment:x.prefs&&x.prefs.comment||'',
        selectedCategoryLabel:x.prefs&&x.prefs.selectedCategoryLabel||'',
        axis:x.prefs&&x.prefs.axis,
        umaren:x.prefs&&x.prefs.umaren,
        wide:x.prefs&&x.prefs.wide,
        sanrenpuku:x.prefs&&x.prefs.sanrenpuku
      },
      items:(x.items||[]).map(it=>({category:it.category,current:compactBest(it.current),best:compactBest(it.best),error:it.error})),
      createdAt:x.createdAt
    };
  }
  function saveLast(x){
    lastProposalMemory=x||{};
    const compact=compactProposal(x||{});
    try{
      localStorage.setItem(LAST_KEY,JSON.stringify(compact));
    }catch(e){
      try{
        localStorage.removeItem(LAST_KEY);
        localStorage.setItem(LAST_KEY,JSON.stringify({
          targetCategory:compact.targetCategory,
          targetCategories:compact.targetCategories,
          current:compact.current,
          best:compact.best,
          prefs:{comment:compact.prefs&&compact.prefs.comment||''},
          items:(compact.items||[]).map(it=>({category:it.category,best:it.best,current:it.current})),
          createdAt:compact.createdAt,
          storageReduced:true
        }));
      }catch(e2){
        console.warn('rule consult proposal kept in memory only',e2);
      }
    }
  }
  function loadLast(){
    if(lastProposalMemory) return lastProposalMemory;
    try{return JSON.parse(localStorage.getItem(LAST_KEY)||'{}')||{}}catch(e){return {}}
  }

  function freshCategoryInfo(r){
    try{
      if(window.KV2Prediction && typeof window.KV2Prediction.categoryInfo==='function'){
        return window.KV2Prediction.categoryInfo(r, S.loadRaces());
      }
    }catch(e){}
    return r&&r.prediction&&r.prediction.category;
  }
  function categoryFrom(mode,id){
    if(mode==='category'&&id){
      const r=S.getRace(id); const p=freshCategoryInfo(r);
      return p&&p.used?p.used:categoryKeyOfRace(r);
    }
    return '全て';
  }
  function uniq(a){return [...new Set((a||[]).filter(Boolean))]}
  function optionLabel(cat){
    if(cat==='全て') return '全て';
    if(cat==='全障害') return '全障害';
    const p=String(cat||'').split('/');
    if(p.length>=3) return `${p[0]} / ${p[1]} / ${p[2]}`;
    return String(cat||'');
  }
  function appliedCategories(mode,id){
    const cats=['全て'];
    if(mode==='category'&&id){
      const r=S.getRace(id); const cat=freshCategoryInfo(r);
      if(cat){
        cats.push(cat.primary,cat.used);
        if(cat.extra && (cat.judgmentBasis==='fallback' || cat.ready===false || ((Number(cat.need)||0)>0 && (Number(cat.count)||0)<(Number(cat.need)||0)))) cats.push(cat.extra);
      }
      cats.push(categoryKeyOfRace(r));
    }else{
      S.loadRaces().forEach(r=>{
        const cat=freshCategoryInfo(r);
        if(cat){
          cats.push(cat.primary,cat.used);
          if(cat.extra && (cat.judgmentBasis==='fallback' || cat.ready===false || ((Number(cat.need)||0)>0 && (Number(cat.count)||0)<(Number(cat.need)||0)))) cats.push(cat.extra);
        }
        cats.push(categoryKeyOfRace(r));
        if(r && r.surface) cats.push(`全体/${r.surface}/${r.condition||'定量'}`);
      });
    }
    return uniq(cats);
  }
  function categorySelectHtml(mode,id,selected){
    const current=Array.isArray(selected)?selected:[selected||'全て'];
    const opts=appliedCategories(mode,id);
    const gradeOpts=opts.filter(v=>v!=='全て' && !String(v).startsWith('全体/'));
    const allOpts=opts.filter(v=>String(v).startsWith('全体/'));
    const checked=v=>current.includes('全て') ? v==='全て' : current.includes(v);
    const line=v=>`<label class="checkLine categoryCheckLine"><input class="ruleCatCheck" type="checkbox" value="${safe(v)}" ${checked(v)?'checked':''} onchange="KV2RuleConsult.onCategoryCheck(this)">${safe(optionLabel(v))}</label>`;
    return `<div class="card"><div class="title">対象カテゴリー</div>
      <div class="categoryCheckBox">${line('全て')}</div>
      <div class="subtle" style="margin-top:8px">グレード条件</div>
      <div class="categoryCheckBox">${gradeOpts.length?gradeOpts.map(line).join(''):'<span class="subtle">対象なし</span>'}</div>
      <div class="subtle" style="margin-top:8px">全体条件</div>
      <div class="categoryCheckBox">${allOpts.length?allOpts.map(line).join(''):'<span class="subtle">対象なし</span>'}</div>
      <div class="subtle">複数選択できます。全てを選ぶと全カテゴリーを対象にします。個別を選ぶと全ては自動解除します。</div>
    </div>`;
  }
  function onCategoryCheck(el){
    const checks=[...document.querySelectorAll('.ruleCatCheck')];
    const all=checks.find(c=>c.value==='全て');
    if(!all){ refreshAiKarteCarry(); return; }
    if(el && el.value==='全て' && el.checked){
      checks.forEach(c=>{ if(c!==all) c.checked=false; });
      refreshAiKarteCarry();
      return;
    }
    if(el && el.value!=='全て' && el.checked){ all.checked=false; }
    const any=checks.some(c=>c.value!=='全て' && c.checked);
    if(!any) all.checked=true;
    refreshAiKarteCarry();
  }
  function selectedCategories(){
    const vals=[...document.querySelectorAll('.ruleCatCheck:checked')].map(o=>o.value).filter(Boolean);
    if(!vals.length || vals.includes('全て')) return ['全て'];
    return vals;
  }
  function selectedCategoriesForInitial(cat){
    if(Array.isArray(cat)) return cat.length?cat:['全て'];
    return cat ? [cat] : ['全て'];
  }
  function refreshAiKarteCarry(){
    const box=document.getElementById('aiKarteCarryBox');
    if(!box) return;
    box.innerHTML=aiKarteCarryHtml(selectedCategories());
  }
  function categoryDisplay(cats){
    const a=Array.isArray(cats)?cats:[cats||'全て'];
    return a.map(optionLabel).join('、');
  }
  function categoryKeyOfRace(r){
    if(!r) return '全て';
    if(/障/.test(r.surface||'')||/^J-G/.test(r.grade||'')) return '全障害';
    return `${r.grade||'全体'}/${r.surface||'全体'}/${r.condition||'定量'}`;
  }
  function raceMatchesCategory(r,cat){
    if(Array.isArray(cat)) return cat.includes('全て') || cat.some(c=>raceMatchesCategory(r,c));
    if(!r || !cat || cat==='全て') return true;
    if(cat==='全障害') return /障/.test(r.surface||'')||/^J-G/.test(r.grade||'');
    const parts=String(cat).split('/');
    if(parts.length<3) return true;
    return (!parts[0]||parts[0]==='全体'||r.grade===parts[0]) && (!parts[1]||parts[1]==='全体'||r.surface===parts[1]) && (!parts[2]||parts[2]==='全体'||(r.condition||'定量')===parts[2]);
  }
  function activeRuleProposalForStats(cat){
    // 予想ルール相談で反映済みのカテゴリーは、次回相談時の「現状」を
    // 反映済みルールの見込み成績として扱う。これにより、採用＋再計算後に
    // 同じ候補がいつまでも「提案」として残る状態を防ぐ。
    if(Array.isArray(cat)){
      if(cat.length!==1) return null;
      cat=cat[0];
    }
    if(!cat || cat==='全て') return null;
    try{
      const rule=S.getRule&&S.getRule(cat);
      if(!rule || !rule.active || !rule.proposal) return null;
      const p=clonePlain(rule.proposal);
      if(!Number.isFinite(num(p.allReturn)) && !Number.isFinite(num(p.axisPlace||p.axisPlaceRate))) return null;
      return p;
    }catch(e){return null;}
  }
  function applyActiveRuleProjectionToStats(cat,stats){
    const p=activeRuleProposalForStats(cat);
    if(!p) return stats;
    return Object.assign({},stats,{
      category:Array.isArray(cat)?cat[0]:cat,
      basis:p.basis||stats.basis||'反映済み予想ルール',
      totalR:num(p.totalR||p.races||stats.totalR),
      doneR:num(p.doneR||p.races||stats.doneR),
      axisPlaceRate:num(p.axisPlace||p.axisPlaceRate),
      hitRate:num(p.hitRate||stats.hitRate),
      allReturn:num(p.allReturn),
      umarenReturn:num(p.umarenReturn),
      wideReturn:num(p.wideReturn),
      sanrenpukuReturn:num(p.sanrenpukuReturn),
      umarenHit:num(p.umarenHit||stats.umarenHit),
      wideHit:num(p.wideHit||stats.wideHit),
      sanrenpukuHit:num(p.sanrenpukuHit||stats.sanrenpukuHit),
      anyHitCount:num(p.anyHitCount||stats.anyHitCount),
      umarenHitCount:num(p.umarenHitCount||stats.umarenHitCount),
      wideHitCount:num(p.wideHitCount||stats.wideHitCount),
      sanrenpukuHitCount:num(p.sanrenpukuHitCount||stats.sanrenpukuHitCount),
      activeRuleApplied:true
    });
  }
  function currentStats(cat){
    const races=S.loadRaces().filter(r=>raceMatchesCategory(r,cat));
    const done=races.filter(r=>!C.resultMissing(r.result));
    let bet=0,pay=0, anyHit=0, axisHit=0, by={umaren:{bet:0,pay:0,hit:0},wide:{bet:0,pay:0,hit:0},sanrenpuku:{bet:0,pay:0,hit:0}};
    done.forEach(r=>{
      const p=r.prediction||{}, res=C.autoResultCombos(r.result||{}), pays=payoutMaps(r.result||{});
      const axisNo=String(p.axis&&p.axis.no||'');
      const top3=[...(r.result.firsts||[]),...(r.result.seconds||[]),...(r.result.thirds||[])].map(String);
      if(axisNo && top3.includes(axisNo)) axisHit++;
      let raceAny=false;
      [['umaren',200],['wide',200],['sanrenpuku',400]].forEach(([k,unit])=>{
        const arr=(p[k]||[]).map(C.comboKey).filter(Boolean);
        if(!arr.length) return;
        by[k].bet += arr.length*100; bet += arr.length*100;
        let kHit=false;
        arr.forEach(x=>{ if((res[k]||[]).includes(x)){ const pmt=pays[k][x]||0; by[k].pay+=pmt; pay+=pmt; kHit=true; raceAny=true; }});
        if(kHit) by[k].hit++;
      });
      if(raceAny) anyHit++;
    });
    const rr=(p,b)=>b?Math.round((p/b)*1000)/10:0;
    const hr=(h,n)=>n?Math.round((h/n)*1000)/10:0;
    const stats={
      category:cat,totalR:races.length,doneR:done.length,basis:done.length>=30?'直近30R':'トータル'+done.length+'R',
      axisPlaceRate:hr(axisHit,done.length),hitRate:hr(anyHit,done.length),allReturn:rr(pay,bet),
      umarenReturn:rr(by.umaren.pay,by.umaren.bet),wideReturn:rr(by.wide.pay,by.wide.bet),sanrenpukuReturn:rr(by.sanrenpuku.pay,by.sanrenpuku.bet),
      umarenHit:hr(by.umaren.hit,done.length),wideHit:hr(by.wide.hit,done.length),sanrenpukuHit:hr(by.sanrenpuku.hit,done.length),
      anyHitCount:anyHit,umarenHitCount:by.umaren.hit,wideHitCount:by.wide.hit,sanrenpukuHitCount:by.sanrenpuku.hit
    };
    return applyActiveRuleProjectionToStats(cat,stats);
  }
  function payoutMaps(result){
    const out={umaren:{},wide:{},sanrenpuku:{}};
    ['umaren','wide','sanrenpuku'].forEach(k=>{(result[k]||[]).forEach(x=>{out[k][C.comboKey(x.combo||x.key||x.numbers||'')]=num(x.pay||x.payout||x.amount)})});
    return out;
  }


  // 相談コメント専用：軸人気帯だけを変更した場合の保存レース実測比較。
  // 「馬連・ワイド・3連複は現状維持」は、相手抽出・買い目点数を現行ロジックのまま維持し、軸候補の人気帯だけ差し替える意味で扱う。
  function isFiveKeiHorseForConsult(h,race){
    if(!h) return false;
    const no=C.toInt(h.no); if(!no) return false;
    const head=C.toInt(race&&race.headCount)||18;
    const frame=C.toInt(h.frame)||C.frameOf(no,head);
    return no===5 || no===14 || no===15 || frame===5 || ((frame+no)%10)===5;
  }
  function hasLinkedMarkForConsult(h,marks){ return !!(h && marks && marks[h.no]); }
  function hasNeighborLinkForConsult(h,marks){
    const no=C.toInt(h&&h.no); if(!no || !marks) return false;
    return !!(marks[no-1] || marks[no+1]);
  }
  function scoreHorseForConsult(h,race,marks){
    let score=0;
    if(hasLinkedMarkForConsult(h,marks)) score+=30;
    if(hasNeighborLinkForConsult(h,marks)) score+=20;
    if(isFiveKeiHorseForConsult(h,race)) score+=25;
    return score;
  }
  function chooseAxisByPopularityRangeForConsult(race,marks,minPop,maxPop){
    race=riceSafeRace(race);
    marks=marks||{};
    const horses=(race.horses||[]).filter(h=>!h.cancelled && C.toInt(h.no));
    let cand=horses.filter(h=>{ const p=C.toInt(h.popularity); return p>=minPop && p<=maxPop; });
    if(!cand.length) cand=horses.filter(h=>marks[h.no]);
    if(!cand.length) cand=horses;
    if(!cand.length) return null;
    cand.forEach(h=>{ h.__consultScore=scoreHorseForConsult(h,race,marks); });
    cand.sort((a,b)=>(b.__consultScore||0)-(a.__consultScore||0) || (C.toInt(a.popularity)||99)-(C.toInt(b.popularity)||99) || (C.toInt(a.no)||999)-(C.toInt(b.no)||999));
    const h=cand[0];
    return {no:h.no,name:h.name||'',mark:marks[h.no]||'',score:h.__consultScore||0,popularity:C.toInt(h.popularity)||''};
  }
  function riceSafeRace(race){
    // 保存レースを直接変更しないため、馬データだけ浅く複製する。
    const r=Object.assign({},race||{});
    r.horses=(race&&Array.isArray(race.horses)?race.horses:[]).map(h=>Object.assign({},h||{}));
    try{ C.calcPopularity(r.horses||[]); }catch(e){}
    return r;
  }
  function byPopularityForConsult(horses){
    return (horses||[]).slice().sort((a,b)=>(C.toInt(a.popularity)||99)-(C.toInt(b.popularity)||99) || (C.toInt(a.no)||999)-(C.toInt(b.no)||999));
  }
  function makeTicketsForConsult(race,axis,marks){
    if(!axis) return {umaren:[],wide:[],sanrenpuku:[]};
    const axisNo=String(axis.no);
    const valid=(race.horses||[]).filter(h=>!h.cancelled && String(h.no)!==axisNo);
    const seen=new Set(), ordered=[];
    const push=h=>{ const k=String(h&&h.no||''); if(!h||!k||seen.has(k)) return; seen.add(k); ordered.push(h); };
    const nonAceMarked=valid.filter(h=>marks[h.no] && marks[h.no]!=='◎');
    const nonAceFive=valid.filter(h=>marks[h.no]!=='◎' && isFiveKeiHorseForConsult(h,race));
    const nonAcePop=byPopularityForConsult(valid.filter(h=>marks[h.no]!=='◎'));
    const aceMarked=valid.filter(h=>marks[h.no]==='◎');
    const acePop=byPopularityForConsult(valid.filter(h=>marks[h.no]==='◎'));
    [...nonAceMarked,...nonAceFive,...nonAcePop,...aceMarked,...acePop].forEach(push);
    const p1=ordered[0]&&ordered[0].no, p2=ordered[1]&&ordered[1].no, p3=ordered[2]&&ordered[2].no;
    const first3=new Set([String(p1||''),String(p2||''),String(p3||'')]);
    const p4Horse=ordered.find(h=>!first3.has(String(h.no)) && marks[h.no]!=='◎') || ordered.find(h=>!first3.has(String(h.no)));
    const p4=p4Horse&&p4Horse.no;
    const uniq=a=>[...new Set(a.filter(Boolean))];
    const tri=uniq([
      p1&&p2?C.comboKey(axis.no+'-'+p1+'-'+p2):'',
      p1&&p3?C.comboKey(axis.no+'-'+p1+'-'+p3):'',
      p2&&p3?C.comboKey(axis.no+'-'+p2+'-'+p3):'',
      p1&&p4?C.comboKey(axis.no+'-'+p1+'-'+p4):''
    ]).filter(x=>String(x||'').split('-').includes(axisNo)).slice(0,4);
    return {
      umaren:uniq([p1,p2].map(p=>p?C.comboKey(axis.no+'-'+p):'')),
      wide:uniq([p1,p2].map(p=>p?C.comboKey(axis.no+'-'+p):'')),
      sanrenpuku:tri
    };
  }

  function normalizeTicketPopularityRangesForConsult(intent){
    intent=intent||{};
    const all=intent.ticketPopularityRange||null;
    const kinds=(intent.kinds||{});
    const out={
      umaren:(kinds.umaren&&kinds.umaren.ticketPopularityRange)||all,
      wide:(kinds.wide&&kinds.wide.ticketPopularityRange)||all,
      sanrenpuku:(kinds.sanrenpuku&&kinds.sanrenpuku.ticketPopularityRange)||all
    };
    return (out.umaren||out.wide||out.sanrenpuku)?out:null;
  }
  function makeTicketsByPopularityRangeForConsult(race,axis,marks,ranges){
    if(!axis) return {umaren:[],wide:[],sanrenpuku:[]};
    ranges=ranges||{}; marks=marks||{};
    const axisNo=String(axis.no);
    const valid=(race.horses||[]).filter(h=>!h.cancelled && String(h.no)!==axisNo);
    const uniq=a=>[...new Set(a.filter(Boolean))];
    const orderedFor=(range)=>{
      let arr=valid.slice();
      if(range){
        const min=C.toInt(range.min)||1, max=C.toInt(range.max)||99;
        arr=arr.filter(h=>{ const p=C.toInt(h.popularity)||99; return p>=min && p<=max; });
      }
      if(!arr.length) arr=valid.slice();
      arr.forEach(h=>{ h.__consultTicketScore=scoreHorseForConsult(h,race,marks); });
      return arr.sort((a,b)=>(b.__consultTicketScore||0)-(a.__consultTicketScore||0) || (C.toInt(a.popularity)||99)-(C.toInt(b.popularity)||99) || (C.toInt(a.no)||999)-(C.toInt(b.no)||999));
    };
    const u=orderedFor(ranges.umaren), w=orderedFor(ranges.wide), t=orderedFor(ranges.sanrenpuku);
    const u1=u[0]&&u[0].no, u2=u[1]&&u[1].no;
    const w1=w[0]&&w[0].no, w2=w[1]&&w[1].no;
    const p1=t[0]&&t[0].no, p2=t[1]&&t[1].no, p3=t[2]&&t[2].no, p4=t[3]&&t[3].no;
    const tri=uniq([
      p1&&p2?C.comboKey(axis.no+'-'+p1+'-'+p2):'',
      p1&&p3?C.comboKey(axis.no+'-'+p1+'-'+p3):'',
      p2&&p3?C.comboKey(axis.no+'-'+p2+'-'+p3):'',
      p1&&p4?C.comboKey(axis.no+'-'+p1+'-'+p4):''
    ]).filter(x=>String(x||'').split('-').includes(axisNo)).slice(0,4);
    return {
      umaren:uniq([u1,u2].map(p=>p?C.comboKey(axis.no+'-'+p):'')),
      wide:uniq([w1,w2].map(p=>p?C.comboKey(axis.no+'-'+p):'')),
      sanrenpuku:tri
    };
  }

  function makeTicketsByAttributeRuleForConsult(race,axis,marks,rule,ranges){
    if(!axis) return {umaren:[],wide:[],sanrenpuku:[]};
    marks=marks||{}; ranges=ranges||{};
    const axisNo=String(axis.no);
    const valid=(race.horses||[]).filter(h=>!h.cancelled && String(h.no)!==axisNo);
    const uniq=a=>[...new Set(a.filter(Boolean))];
    const orderedFor=(range)=>{
      let arr=valid.slice();
      if(rule){
        const filtered=arr.filter(h=>horseMatchesAttributeRuleForConsult(h,race,marks,rule));
        if(filtered.length) arr=filtered;
      }
      if(range){
        const min=C.toInt(range.min)||1, max=C.toInt(range.max)||99;
        const ranged=arr.filter(h=>{ const p=C.toInt(h.popularity)||99; return p>=min && p<=max; });
        if(ranged.length) arr=ranged;
      }
      if(!arr.length) arr=valid.slice();
      arr.forEach(h=>{ h.__consultTicketScore=scoreHorseForConsult(h,race,marks); });
      return arr.sort((a,b)=>(b.__consultTicketScore||0)-(a.__consultTicketScore||0) || (C.toInt(a.popularity)||99)-(C.toInt(b.popularity)||99) || (C.toInt(a.no)||999)-(C.toInt(b.no)||999));
    };
    const u=orderedFor(ranges.umaren), w=orderedFor(ranges.wide), t=orderedFor(ranges.sanrenpuku);
    const u1=u[0]&&u[0].no, u2=u[1]&&u[1].no;
    const w1=w[0]&&w[0].no, w2=w[1]&&w[1].no;
    const p1=t[0]&&t[0].no, p2=t[1]&&t[1].no, p3=t[2]&&t[2].no, p4=t[3]&&t[3].no;
    const tri=uniq([
      p1&&p2?C.comboKey(axis.no+'-'+p1+'-'+p2):'',
      p1&&p3?C.comboKey(axis.no+'-'+p1+'-'+p3):'',
      p2&&p3?C.comboKey(axis.no+'-'+p2+'-'+p3):'',
      p1&&p4?C.comboKey(axis.no+'-'+p1+'-'+p4):''
    ]).filter(x=>String(x||'').split('-').includes(axisNo)).slice(0,4);
    return {
      umaren:uniq([u1,u2].map(p=>p?C.comboKey(axis.no+'-'+p):'')),
      wide:uniq([w1,w2].map(p=>p?C.comboKey(axis.no+'-'+p):'')),
      sanrenpuku:tri
    };
  }

  function cleanConsultConditionText(txt){
    return String(txt||'')
      .replace(/^[\s　、，。:：\/／・]+/,'')
      .replace(/^(?:を|は|に|へ|で|として|条件を|条件は)+/,'')
      .replace(/^[\s　、，。:：\/／・]+/,'')
      .trim();
  }
  function commentTextAfterKeyword(t,kw){
    const s=String(t||''); const i=s.indexOf(kw); if(i<0) return '';
    let part=s.slice(i+kw.length);
    [' 軸',' 買い目',' 相手',' 馬連',' ワイド',' 3連複',' 三連複',' 3複'].forEach(stop=>{ const j=part.indexOf(stop); if(j>=0) part=part.slice(0,j); });
    return cleanConsultConditionText(part);
  }

  function currentStatsWithCommentIntent(cat,intent){
    intent=intent||{};
    const races=S.loadRaces().filter(r=>raceMatchesCategory(r,cat));
    const done=races.filter(r=>!C.resultMissing(r.result));
    const axisRule=intent.axisAttributeRuleText?parseAttributeRuleForConsult(intent.axisAttributeRuleText):null;
    const ticketRule=intent.ticketAttributeRuleText?parseAttributeRuleForConsult(intent.ticketAttributeRuleText):null;
    const ranges=normalizeTicketPopularityRangesForConsult(intent)||{};
    const ch=intent.axisPopularityChange;
    let bet=0,pay=0,anyHit=0,axisHit=0,axisChanged=0,axisCompared=0,ticketChanged=0,ticketCompared=0;
    const by={umaren:{bet:0,pay:0,hit:0},wide:{bet:0,pay:0,hit:0},sanrenpuku:{bet:0,pay:0,hit:0}};
    done.forEach(orig=>{
      const r=riceSafeRace(orig); const p=orig.prediction||{}; const marks=p.marks||{};
      let axis=null;
      if(ch) axis=chooseAxisByPopularityRangeForConsult(r,marks,ch.toMin,ch.toMax);
      else if(axisRule) axis=chooseAxisByAttributeRuleForConsult(r,marks,axisRule);
      else if(p.axis&&p.axis.no) axis={no:p.axis.no,name:p.axis.name||'',mark:p.axis.mark||''};
      if(!axis){ const oldAxisNo=String(p.axisNo||p.axisHorseNo||''); if(oldAxisNo) axis={no:oldAxisNo}; }
      if(!axis) axis=chooseAxisByPopularityRangeForConsult(r,marks,2,6);
      const tickets=ticketRule ? makeTicketsByAttributeRuleForConsult(r,axis,marks,ticketRule,ranges) : (ranges.umaren||ranges.wide||ranges.sanrenpuku ? makeTicketsByPopularityRangeForConsult(r,axis,marks,ranges) : makeTicketsForConsult(r,axis,marks));
      try{
        ticketCompared++;
        const oldTicketKey=['umaren','wide','sanrenpuku'].map(k=>(p[k]||[]).map(C.comboKey).filter(Boolean).sort().join(',')).join('|');
        const newTicketKey=['umaren','wide','sanrenpuku'].map(k=>(tickets[k]||[]).map(C.comboKey).filter(Boolean).sort().join(',')).join('|');
        if(oldTicketKey!==newTicketKey) ticketChanged++;
      }catch(e){}
      const res=C.autoResultCombos(orig.result||{}), pays=payoutMaps(orig.result||{});
      const top3=[...(orig.result.firsts||[]),...(orig.result.seconds||[]),...(orig.result.thirds||[])].map(String);
      if(axis && top3.includes(String(axis.no))) axisHit++;
      if(axis){ axisCompared++; const oldAxis=String(p.axis&&p.axis.no||''); if(oldAxis && oldAxis!==String(axis.no)) axisChanged++; }
      let raceAny=false;
      [['umaren'],['wide'],['sanrenpuku']].forEach(([k])=>{
        const arr=(tickets[k]||[]).map(C.comboKey).filter(Boolean); if(!arr.length) return;
        by[k].bet += arr.length*100; bet += arr.length*100;
        let kHit=false;
        arr.forEach(x=>{ if((res[k]||[]).includes(x)){ const pmt=pays[k][x]||0; by[k].pay+=pmt; pay+=pmt; kHit=true; raceAny=true; }});
        if(kHit) by[k].hit++;
      });
      if(raceAny) anyHit++;
    });
    const rr=(p,b)=>b?Math.round((p/b)*1000)/10:0;
    const hr=(h,n)=>n?Math.round((h/n)*1000)/10:0;
    const parts=[];
    if(ch) parts.push(`軸人気${ch.toMin}〜${ch.toMax}人気`);
    if(axisRule && !ch) parts.push(`軸条件「${axisRule.raw}」`);
    if(ticketRule) parts.push(`買い目条件「${ticketRule.raw}」`);
    const fmt=r=>r?`${r.min}〜${r.max}人気`:'';
    if(ranges.umaren||ranges.wide||ranges.sanrenpuku){
      const rp=[]; if(ranges.umaren) rp.push(`馬連${fmt(ranges.umaren)}`); if(ranges.wide) rp.push(`ワイド${fmt(ranges.wide)}`); if(ranges.sanrenpuku) rp.push(`3連複${fmt(ranges.sanrenpuku)}`); parts.push(`買い目人気帯 ${rp.join(' / ')}`);
    }
    const label=parts.join(' / ')||'相談コメント条件';
    return {
      category:Array.isArray(cat)?cat[0]:cat,totalR:races.length,doneR:done.length,races:done.length,
      basis:`コメント実測：${label}`,candidateSource:'commentSimulation',candidateKind:'相談コメント実測',rankingSection:'相談コメント',forceCandidate:true,allowWorseDisplay:true,
      ruleText:`相談コメント条件を反映：${label}`,
      axisPlaceRate:hr(axisHit,done.length),axisPlace:hr(axisHit,done.length),hitRate:hr(anyHit,done.length),allReturn:rr(pay,bet),
      umarenReturn:rr(by.umaren.pay,by.umaren.bet),wideReturn:rr(by.wide.pay,by.wide.bet),sanrenpukuReturn:rr(by.sanrenpuku.pay,by.sanrenpuku.bet),
      umarenHit:hr(by.umaren.hit,done.length),wideHit:hr(by.wide.hit,done.length),sanrenpukuHit:hr(by.sanrenpuku.hit,done.length),
      anyHitCount:anyHit,umarenHitCount:by.umaren.hit,wideHitCount:by.wide.hit,sanrenpukuHitCount:by.sanrenpuku.hit,
      axisChanged,axisCompared,ticketChanged,ticketCompared,recalcRaceCount:done.length,changedAxisR:axisChanged,changedTicketR:ticketChanged,
      commentNote:`相談コメント条件（${label}）を保存レースで実測しました。`
    };
  }

  function attributeLabelFromConsultCandidate(r){
    const txt=String((r&&r.attributeLabel)||(r&&r.altLabel)||(r&&r.ruleText)||(r&&r.rankingSection)||(r&&r.basis)||'');
    // 末尾の「:属性」を最優先で取得。例：カテゴリー別属性ランキング ...:5系
    const m=txt.match(/:([^:\n]+)$/);
    let label=m?m[1]:txt;
    label=label.replace(/^補助候補を現行ルールへ変換：/,'').trim();
    return label;
  }
  function parseAttributeRuleForConsult(label){
    const s=String(label||'').replace(/\s/g,'');
    const rule={raw:s, minPop:null, maxPop:null, requireFive:false, requireMark:null, requireAnyMark:false, requireNeighbor:false, requireMarkNeighbor:null};
    let m=s.match(/軸候補人気(\d+)[〜～\-](\d+)/) || s.match(/(\d+)[〜～\-](\d+)人気/);
    if(m){ rule.minPop=C.toInt(m[1]); rule.maxPop=C.toInt(m[2]); }
    else if(/1[〜～\-]3人気/.test(s)){ rule.minPop=1; rule.maxPop=3; }
    else if(/4[〜～\-]9人気/.test(s)){ rule.minPop=4; rule.maxPop=9; }
    else if(/10人気以下|10番人気以下/.test(s)){ rule.minPop=10; rule.maxPop=99; }
    if(/5系/.test(s)) rule.requireFive=true;
    if(/◎連動/.test(s)) rule.requireMark='◎';
    else if(/○連動/.test(s)) rule.requireMark='○';
    else if(/▲連動/.test(s)) rule.requireMark='▲';
    else if(/印連動|連動/.test(s)) rule.requireAnyMark=true;
    if(/◎隣/.test(s)) { rule.requireNeighbor=true; rule.requireMarkNeighbor='◎'; }
    else if(/○隣/.test(s)) { rule.requireNeighbor=true; rule.requireMarkNeighbor='○'; }
    else if(/▲隣/.test(s)) { rule.requireNeighbor=true; rule.requireMarkNeighbor='▲'; }
    else if(/隣±?1|隣/.test(s)) rule.requireNeighbor=true;
    const hasAny = rule.minPop!=null || rule.requireFive || rule.requireMark || rule.requireAnyMark || rule.requireNeighbor;
    return hasAny?rule:null;
  }
  function horseMatchesAttributeRuleForConsult(h,race,marks,rule){
    if(!h || !rule) return false;
    const pop=C.toInt(h.popularity)||99;
    if(rule.minPop!=null && (pop<rule.minPop || pop>rule.maxPop)) return false;
    if(rule.requireFive && !isFiveKeiHorseForConsult(h,race)) return false;
    if(rule.requireMark && marks[String(h.no)]!==rule.requireMark) return false;
    if(rule.requireAnyMark && !marks[String(h.no)]) return false;
    if(rule.requireNeighbor){
      const no=C.toInt(h.no); let ok=false;
      [-1,1].forEach(d=>{ const mk=marks[String(no+d)]||marks[no+d]; if(mk && (!rule.requireMarkNeighbor || mk===rule.requireMarkNeighbor)) ok=true; });
      if(!ok) return false;
    }
    return true;
  }
  function chooseAxisByAttributeRuleForConsult(race,marks,rule){
    race=riceSafeRace(race); marks=marks||{};
    const horses=(race.horses||[]).filter(h=>!h.cancelled && C.toInt(h.no));
    let cand=horses.filter(h=>horseMatchesAttributeRuleForConsult(h,race,marks,rule));
    // 属性だけで該当なしの場合は、人気帯だけ/5系だけなど緩い順にフォールバックして、変更候補として成立させる。
    if(!cand.length && rule && rule.minPop!=null) cand=horses.filter(h=>{ const p=C.toInt(h.popularity)||99; return p>=rule.minPop && p<=rule.maxPop; });
    if(!cand.length && rule && rule.requireFive) cand=horses.filter(h=>isFiveKeiHorseForConsult(h,race));
    if(!cand.length) cand=horses.filter(h=>marks[String(h.no)]);
    if(!cand.length) cand=horses;
    cand.forEach(h=>{ h.__consultScore=scoreHorseForConsult(h,race,marks); });
    cand.sort((a,b)=>(b.__consultScore||0)-(a.__consultScore||0) || (C.toInt(a.popularity)||99)-(C.toInt(b.popularity)||99) || (C.toInt(a.no)||999)-(C.toInt(b.no)||999));
    const h=cand[0];
    return h?{no:h.no,name:h.name||'',mark:marks[String(h.no)]||'',score:h.__consultScore||0,popularity:C.toInt(h.popularity)||''}:null;
  }
  function currentStatsWithAttributeRule(cat,label,baseCandidate){
    const rule=parseAttributeRuleForConsult(label);
    if(!rule) return null;
    const races=S.loadRaces().filter(r=>raceMatchesCategory(r,cat));
    const done=races.filter(r=>!C.resultMissing(r.result));
    let bet=0,pay=0,anyHit=0,axisHit=0,axisChanged=0,axisCompared=0,ticketChanged=0,ticketCompared=0;
    const by={umaren:{bet:0,pay:0,hit:0},wide:{bet:0,pay:0,hit:0},sanrenpuku:{bet:0,pay:0,hit:0}};
    done.forEach(orig=>{
      const r=riceSafeRace(orig);
      const p=orig.prediction||{};
      const marks=p.marks||{};
      const axis=chooseAxisByAttributeRuleForConsult(r,marks,rule);
      const tickets=makeTicketsForConsult(r,axis,marks);
      try{
        ticketCompared++;
        const oldTicketKey=['umaren','wide','sanrenpuku'].map(k=>(p[k]||[]).map(C.comboKey).filter(Boolean).sort().join(',')).join('|');
        const newTicketKey=['umaren','wide','sanrenpuku'].map(k=>(tickets[k]||[]).map(C.comboKey).filter(Boolean).sort().join(',')).join('|');
        if(oldTicketKey!==newTicketKey) ticketChanged++;
      }catch(e){}
      const res=C.autoResultCombos(orig.result||{}), pays=payoutMaps(orig.result||{});
      const top3=[...(orig.result.firsts||[]),...(orig.result.seconds||[]),...(orig.result.thirds||[])].map(String);
      if(axis && top3.includes(String(axis.no))) axisHit++;
      if(axis){
        axisCompared++;
        const oldAxis=String(p.axis&&p.axis.no||'');
        if(oldAxis && oldAxis!==String(axis.no)) axisChanged++;
      }
      let raceAny=false;
      [['umaren'],['wide'],['sanrenpuku']].forEach(([k])=>{
        const arr=(tickets[k]||[]).map(C.comboKey).filter(Boolean);
        if(!arr.length) return;
        by[k].bet += arr.length*100; bet += arr.length*100;
        let kHit=false;
        arr.forEach(x=>{ if((res[k]||[]).includes(x)){ const pmt=pays[k][x]||0; by[k].pay+=pmt; pay+=pmt; kHit=true; raceAny=true; }});
        if(kHit) by[k].hit++;
      });
      if(raceAny) anyHit++;
    });
    const rr=(p,b)=>b?Math.round((p/b)*1000)/10:0;
    const hr=(h,n)=>n?Math.round((h/n)*1000)/10:0;
    const out=Object.assign({},baseCandidate||{}, {
      category:Array.isArray(cat)?cat[0]:cat,
      totalR:races.length,doneR:done.length,races:done.length,
      basis:`属性実測：${label}`,
      candidateSource:(baseCandidate&&baseCandidate.candidateSource)||'rankingCsv',
      candidateKind:(baseCandidate&&baseCandidate.candidateKind)||'属性ランキング実測',
      rankingSection:(baseCandidate&&baseCandidate.rankingSection)||'属性ランキング',
      ruleText:`属性「${label}」を軸条件に反映して再予想`,
      axisPlaceRate:hr(axisHit,done.length),axisPlace:hr(axisHit,done.length),hitRate:hr(anyHit,done.length),allReturn:rr(pay,bet),
      umarenReturn:rr(by.umaren.pay,by.umaren.bet),wideReturn:rr(by.wide.pay,by.wide.bet),sanrenpukuReturn:rr(by.sanrenpuku.pay,by.sanrenpuku.bet),
      umarenHit:hr(by.umaren.hit,done.length),wideHit:hr(by.wide.hit,done.length),sanrenpukuHit:hr(by.sanrenpuku.hit,done.length),
      anyHitCount:anyHit,umarenHitCount:by.umaren.hit,wideHitCount:by.wide.hit,sanrenpukuHitCount:by.sanrenpuku.hit,
      axisChanged,axisCompared,ticketChanged,ticketCompared,recalcRaceCount:done.length,
      changedAxisR:axisChanged,changedTicketR:ticketChanged,
      attributeRuleLabel:label,
      attributeRuleParsed:rule
    });
    return out;
  }
  function currentStatsWithAxisPopularityRange(cat,range){
    range=range||{};
    const minPop=C.toInt(range.toMin||range.min)||2, maxPop=C.toInt(range.toMax||range.max)||6;
    const races=S.loadRaces().filter(r=>raceMatchesCategory(r,cat));
    const done=races.filter(r=>!C.resultMissing(r.result));
    let bet=0,pay=0,anyHit=0,axisHit=0,axisChanged=0,axisCompared=0,ticketChanged=0,ticketCompared=0;
    const by={umaren:{bet:0,pay:0,hit:0},wide:{bet:0,pay:0,hit:0},sanrenpuku:{bet:0,pay:0,hit:0}};
    done.forEach(orig=>{
      const r=riceSafeRace(orig);
      const p=orig.prediction||{};
      const marks=p.marks||{};
      const axis=chooseAxisByPopularityRangeForConsult(r,marks,minPop,maxPop);
      const tickets=makeTicketsForConsult(r,axis,marks);
      try{
        ticketCompared++;
        const oldTicketKey=['umaren','wide','sanrenpuku'].map(k=>(p[k]||[]).map(C.comboKey).filter(Boolean).sort().join(',')).join('|');
        const newTicketKey=['umaren','wide','sanrenpuku'].map(k=>(tickets[k]||[]).map(C.comboKey).filter(Boolean).sort().join(',')).join('|');
        if(oldTicketKey!==newTicketKey) ticketChanged++;
      }catch(e){}
      const res=C.autoResultCombos(orig.result||{}), pays=payoutMaps(orig.result||{});
      const top3=[...(orig.result.firsts||[]),...(orig.result.seconds||[]),...(orig.result.thirds||[])].map(String);
      if(axis && top3.includes(String(axis.no))) axisHit++;
      if(axis){
        axisCompared++;
        const oldAxis=String(p.axis&&p.axis.no||'');
        if(oldAxis && oldAxis!==String(axis.no)) axisChanged++;
      }
      let raceAny=false;
      [['umaren'],['wide'],['sanrenpuku']].forEach(([k])=>{
        const arr=(tickets[k]||[]).map(C.comboKey).filter(Boolean);
        if(!arr.length) return;
        by[k].bet += arr.length*100; bet += arr.length*100;
        let kHit=false;
        arr.forEach(x=>{ if((res[k]||[]).includes(x)){ const pmt=pays[k][x]||0; by[k].pay+=pmt; pay+=pmt; kHit=true; raceAny=true; }});
        if(kHit) by[k].hit++;
      });
      if(raceAny) anyHit++;
    });
    const rr=(p,b)=>b?Math.round((p/b)*1000)/10:0;
    const hr=(h,n)=>n?Math.round((h/n)*1000)/10:0;
    return {
      category:Array.isArray(cat)?cat[0]:cat,
      totalR:races.length,doneR:done.length,races:done.length,
      basis:`コメント実測：軸人気${minPop}〜${maxPop}人気（相手・買い目条件は現状維持）`,
      candidateSource:'commentSimulation',candidateKind:'相談コメント実測',rankingSection:'相談コメント',forceCandidate:true,allowWorseDisplay:true,
      ruleText:`軸人気帯を${minPop}〜${maxPop}人気へ変更／馬連・ワイド・3連複の相手抽出と買い目点数は現状維持`,
      axisPlaceRate:hr(axisHit,done.length),axisPlace:hr(axisHit,done.length),hitRate:hr(anyHit,done.length),allReturn:rr(pay,bet),
      umarenReturn:rr(by.umaren.pay,by.umaren.bet),wideReturn:rr(by.wide.pay,by.wide.bet),sanrenpukuReturn:rr(by.sanrenpuku.pay,by.sanrenpuku.bet),
      umarenHit:hr(by.umaren.hit,done.length),wideHit:hr(by.wide.hit,done.length),sanrenpukuHit:hr(by.sanrenpuku.hit,done.length),
      anyHitCount:anyHit,umarenHitCount:by.umaren.hit,wideHitCount:by.wide.hit,sanrenpukuHitCount:by.sanrenpuku.hit,
      axisChanged,axisCompared,ticketChanged,ticketCompared,recalcRaceCount:done.length,
      changedAxisR:axisChanged,changedTicketR:ticketChanged,
      commentNote:`軸候補人気帯を${minPop}〜${maxPop}人気に変更した保存レース実測です。`
    };
  }
  function currentStatsWithTicketPopularityRange(cat,ranges){
    ranges=ranges||{};
    const races=S.loadRaces().filter(r=>raceMatchesCategory(r,cat));
    const done=races.filter(r=>!C.resultMissing(r.result));
    let bet=0,pay=0,anyHit=0,axisHit=0,axisChanged=0,axisCompared=0,ticketChanged=0,ticketCompared=0;
    const by={umaren:{bet:0,pay:0,hit:0},wide:{bet:0,pay:0,hit:0},sanrenpuku:{bet:0,pay:0,hit:0}};
    done.forEach(orig=>{
      const r=riceSafeRace(orig);
      const p=orig.prediction||{};
      const marks=p.marks||{};
      let axis=p.axis&&p.axis.no?{no:p.axis.no,name:p.axis.name||'',mark:p.axis.mark||''}:null;
      if(!axis){
        const oldAxisNo=String(p.axisNo||p.axisHorseNo||'');
        if(oldAxisNo) axis={no:oldAxisNo};
      }
      if(!axis) axis=chooseAxisByPopularityRangeForConsult(r,marks,2,6);
      const tickets=makeTicketsByPopularityRangeForConsult(r,axis,marks,ranges);
      try{
        ticketCompared++;
        const oldTicketKey=['umaren','wide','sanrenpuku'].map(k=>(p[k]||[]).map(C.comboKey).filter(Boolean).sort().join(',')).join('|');
        const newTicketKey=['umaren','wide','sanrenpuku'].map(k=>(tickets[k]||[]).map(C.comboKey).filter(Boolean).sort().join(',')).join('|');
        if(oldTicketKey!==newTicketKey) ticketChanged++;
      }catch(e){}
      const res=C.autoResultCombos(orig.result||{}), pays=payoutMaps(orig.result||{});
      const top3=[...(orig.result.firsts||[]),...(orig.result.seconds||[]),...(orig.result.thirds||[])].map(String);
      if(axis && top3.includes(String(axis.no))) axisHit++;
      if(axis){ axisCompared++; }
      let raceAny=false;
      [['umaren'],['wide'],['sanrenpuku']].forEach(([k])=>{
        const arr=(tickets[k]||[]).map(C.comboKey).filter(Boolean);
        if(!arr.length) return;
        by[k].bet += arr.length*100; bet += arr.length*100;
        let kHit=false;
        arr.forEach(x=>{ if((res[k]||[]).includes(x)){ const pmt=pays[k][x]||0; by[k].pay+=pmt; pay+=pmt; kHit=true; raceAny=true; }});
        if(kHit) by[k].hit++;
      });
      if(raceAny) anyHit++;
    });
    const rr=(p,b)=>b?Math.round((p/b)*1000)/10:0;
    const hr=(h,n)=>n?Math.round((h/n)*1000)/10:0;
    const labelParts=[];
    const fmt=r=>r?`${r.min}〜${r.max}人気`:'';
    if(ranges.umaren) labelParts.push(`馬連${fmt(ranges.umaren)}`);
    if(ranges.wide) labelParts.push(`ワイド${fmt(ranges.wide)}`);
    if(ranges.sanrenpuku) labelParts.push(`3連複${fmt(ranges.sanrenpuku)}`);
    const label=labelParts.join(' / ')||'買い目人気帯変更';
    return {
      category:Array.isArray(cat)?cat[0]:cat,
      totalR:races.length,doneR:done.length,races:done.length,
      basis:`コメント実測：${label}`,
      candidateSource:'commentSimulation',candidateKind:'相談コメント実測',rankingSection:'相談コメント',forceCandidate:true,allowWorseDisplay:true,
      ruleText:`買い目人気帯を${label}へ変更（軸は現状維持）`,
      axisPlaceRate:hr(axisHit,done.length),axisPlace:hr(axisHit,done.length),hitRate:hr(anyHit,done.length),allReturn:rr(pay,bet),
      umarenReturn:rr(by.umaren.pay,by.umaren.bet),wideReturn:rr(by.wide.pay,by.wide.bet),sanrenpukuReturn:rr(by.sanrenpuku.pay,by.sanrenpuku.bet),
      umarenHit:hr(by.umaren.hit,done.length),wideHit:hr(by.wide.hit,done.length),sanrenpukuHit:hr(by.sanrenpuku.hit,done.length),
      anyHitCount:anyHit,umarenHitCount:by.umaren.hit,wideHitCount:by.wide.hit,sanrenpukuHitCount:by.sanrenpuku.hit,
      axisChanged,axisCompared,ticketChanged,ticketCompared,recalcRaceCount:done.length,
      changedAxisR:axisChanged,changedTicketR:ticketChanged,
      commentNote:`相談コメントの買い目人気帯（${label}）を保存レースで実測しました。`
    };
  }
  function commentSimulationCandidates(cat,prefs,current){
    const intent=(prefs&&prefs.commentIntent)||parseConsultComment(prefs&&prefs.comment||'');
    const sims=[];
    const ch=intent&&intent.axisPopularityChange;
    const ticketRanges=normalizeTicketPopularityRangesForConsult(intent);
    const hasTicketAttr=!!(intent&&intent.ticketAttributeRuleText);
    const hasAxisAttr=!!(intent&&intent.axisAttributeRuleText);
    if((ch||hasAxisAttr) && (ticketRanges||hasTicketAttr)){
      const sim=currentStatsWithCommentIntent(cat,intent);
      sim.score=scoreCandidate(sim,prefs,current||currentStats(cat))+560;
      sims.push(sim);
      return sims;
    }
    if(ch){
      const sim=currentStatsWithAxisPopularityRange(cat,{toMin:ch.toMin,toMax:ch.toMax});
      sim.score=scoreCandidate(sim,prefs,current||currentStats(cat))+500;
      sims.push(sim);
    }
    if(hasAxisAttr){
      const sim=currentStatsWithCommentIntent(cat,intent);
      sim.score=scoreCandidate(sim,prefs,current||currentStats(cat))+505;
      sims.push(sim);
    }
    if(ticketRanges && !hasTicketAttr){
      const sim=currentStatsWithTicketPopularityRange(cat,ticketRanges);
      sim.score=scoreCandidate(sim,prefs,current||currentStats(cat))+520;
      sims.push(sim);
    }else if(hasTicketAttr){
      const sim=currentStatsWithCommentIntent(cat,intent);
      sim.score=scoreCandidate(sim,prefs,current||currentStats(cat))+525;
      sims.push(sim);
    }
    return sims;
  }

  function show(mode,id){
    const cat=categoryFrom(mode,id), rows=loadRows();
    document.getElementById('app').innerHTML=header('予想ルール相談')+screen(`
      <div class="card">
        <div class="title">予想ルール相談条件</div>
        <div class="hint">CSV未読込の場合は保存済みレースの現状成績から相談します。CSV読込後はCSV候補を優先して比較します。</div>
        ${categorySelectHtml(mode,id,cat)}
        <label>相談コメント（任意）</label>
        <textarea id="consultComment" maxlength="500" placeholder="例）馬連は現状維持。ワイドは回収率重視。軸は的中率優先。"></textarea>
        ${checks()}
        <div id="aiKarteCarryBox">${aiKarteCarryHtml(selectedCategoriesForInitial(cat))}</div>
        <div class="card">
          <div class="title">外部データ（ランキングCSV）</div>
          <input id="ruleCsvInput" type="file" accept=".csv,text/csv" style="display:none" onchange="KV2RuleConsult.loadCsvFile(this)">
          <button class="secondary" onclick="document.getElementById('ruleCsvInput').click()">予想ルールランキング読み込み</button>
          <button class="secondary" onclick="KV2RuleConsult.clearCsv()">登録CSVクリア</button>
          ${rankingCsvStatusHtml(rows)}
        </div>
        <div class="bottomBar"><button class="secondary" onclick="KV2App.showTop()">閉じる</button><button class="green" onclick="KV2RuleConsult.runFromForm()">予想ルール相談</button></div>
      </div>`);
  }
  function checks(){
    return `<div class="card"><div class="title">相談条件</div>${['軸','馬連','ワイド','3連複'].map((k,i)=>`<div class="checkCard"><h3>${k}</h3><div class="checkGrid"><label class="checkLine"><input id="chk${i}_keep" type="checkbox" ${i===0?'':'checked'}>現状維持</label><label class="checkLine"><input id="chk${i}_hit" type="checkbox" checked>的中率</label><label class="checkLine"><input id="chk${i}_ret" type="checkbox" checked>回収率</label><label class="checkLine"><input id="chk${i}_fixed" type="checkbox" checked>買い目固定</label></div></div>`).join('')}<div class="subtle">未指定時：全体回収率が高い候補を優先し、その中で軸複勝率が高いルールを提案します。</div></div>`
  }

  function splitCategory(cat){
    if(Array.isArray(cat)) cat=cat[0]||'全て';
    const parts=String(cat||'全て').split('/');
    return {grade:parts[0]||'',surface:parts[1]||'',condition:parts[2]||''};
  }
  function classifyHint(text){
    const t=String(text||'');
    // 券種名を含む候補は、軸改善後という文言があっても券種別へ分類する。
    if(/3連複|三連複|3頭目/.test(t)) return 'sanrenpuku';
    if(/ワイド/.test(t)) return 'wide';
    if(/馬連/.test(t)) return 'umaren';
    if(/軸|人気|スコア|5系|隣|連動|印/.test(t)) return 'axis';
    return 'other';
  }
  function hintKindLabel(k){return ({axis:'軸',umaren:'馬連',wide:'ワイド',sanrenpuku:'3連複',other:'その他'})[k]||'その他'}

  function hintTheme(text,kind){
    const t=String(text||'');
    if(/ワイド/.test(t)) return 'ワイド相手条件';
    if(/3連複|三連複|3頭目/.test(t)) return '3連複3頭目';
    if(/馬連/.test(t)) return '馬連相手条件';
    if(/人気|2〜6|2～6/.test(t)) return '人気帯';
    if(/5系/.test(t)) return '5系';
    if(/隣/.test(t)) return '隣±1';
    if(/連動/.test(t)) return '連動';
    if(/印/.test(t)) return '印重複';
    if(/スコア/.test(t)) return '軸スコア';
    if(kind==='axis') return '軸条件';
    return hintKindLabel(kind||'other');
  }
  function themePriority(theme){
    const order={'軸条件':1,'軸スコア':2,'人気帯':3,'5系':4,'隣±1':5,'連動':6,'印重複':7,'馬連相手条件':8,'ワイド相手条件':9,'3連複3頭目':10};
    return order[theme]||99;
  }
  function star(n){
    n=Math.max(1,Math.min(5,Math.round(num(n)||1)));
    return '★★★★★'.slice(0,n)+'☆☆☆☆☆'.slice(0,5-n);
  }
  function groupCarryThemes(arr){
    const map={};
    (Array.isArray(arr)?arr:[]).forEach(h=>{
      const theme=hintTheme(h.text,h.kind);
      if(!map[theme]) map[theme]={theme,kind:h.kind||'other',count:0,score:0,severity:0,items:[],categories:{}};
      const g=map[theme];
      g.count += int(h.count||1);
      g.score += num(h.score||h.count||1);
      g.severity = Math.max(g.severity||0,num(h.severity||1));
      g.items.push(h);
      Object.keys(h.categories||{}).forEach(c=>g.categories[c]=(g.categories[c]||0)+(h.categories[c]||1));
    });
    return Object.values(map).sort((a,b)=>themePriority(a.theme)-themePriority(b.theme)||(b.score||0)-(a.score||0));
  }
  function carryScoreBreakdown(arr,sample){
    arr=Array.isArray(arr)?arr:[];
    const totalCount=arr.reduce((n,h)=>n+int(h.count||1),0);
    const maxSeverity=arr.reduce((n,h)=>Math.max(n,num(h.severity||0)),0);
    const sameTrend=Math.min(6,Math.max(0,groupCarryThemes(arr).length));
    const occurrence=Math.min(8,totalCount);
    const severity=Math.min(10,maxSeverity*2);
    const samplePenalty=(num(sample)<3)?'少数Rのため参考扱い':'';
    return {occurrence,severity,sameTrend,total:occurrence+severity+sameTrend,samplePenalty};
  }
  function raceMatchCategoryString(r,cat){
    if(!cat || cat==='全て') return true;
    if(Array.isArray(cat)) return cat.includes('全て') || cat.some(c=>raceMatchCategoryString(r,c));
    return raceMatchesCategory(r,cat);
  }
  function categoryAsRace(cat){
    const p=String(cat||'').split('/');
    return {grade:p[0]||'',surface:p[1]||'',condition:p[2]||''};
  }
  function hintCategories(h){
    const c=h&&h.categories;
    if(Array.isArray(c)) return c.filter(Boolean);
    if(c && typeof c==='object') return Object.keys(c).filter(Boolean);
    const one=h&&h.category;
    return one?[one]:[];
  }
  function carryRelationToCategory(h,cat){
    if(!cat || cat==='全て') return 'all';
    const keys=hintCategories(h).filter(k=>k && k!=='全て');
    if(keys.includes(cat)) return 'exact';
    // 全体条件などは参考候補として扱う。完全一致ではないためスコアも表示も弱める。
    const ref=keys.some(k=>raceMatchesCategory(categoryAsRace(k),cat)||raceMatchesCategory(categoryAsRace(cat),k));
    return ref?'reference':'';
  }
  function filterCarryForCategory(arr,cat,mode){
    arr=Array.isArray(arr)?arr:[];
    return arr.filter(h=>{
      const rel=carryRelationToCategory(h,cat);
      if(mode==='exact') return rel==='exact'||rel==='all';
      if(mode==='reference') return rel==='reference';
      return !!rel;
    }).map(h=>Object.assign({},h,{relation:carryRelationToCategory(h,cat)}));
  }
  function karteRecordKind(text){
    return classifyHint(text);
  }
  function karteSeverity(kind,text,review){
    let n=1;
    const t=String(text||'');
    const s=review&&review.summary||{};
    if(kind==='axis' && !s.axisHit) n+=3;
    if(/軸条件|軸スコア|人気帯|5系|隣/.test(t)) n+=2;
    if(/馬連|ワイド|3連複/.test(t)) n+=1;
    if(s.all && num(s.all.roi)===0) n+=1;
    return Math.min(5,n);
  }
  function karteCategoryKeys(r){
    const arr=[];
    arr.push(categoryKeyOfRace(r));
    if(r && r.surface) arr.push(`全体/${r.surface}/${r.condition||'定量'}`);
    if(r && (/障/.test(r.surface||'')||/^J-G/.test(r.grade||''))) arr.push('全障害');
    arr.push('全て');
    return uniq(arr);
  }
  function fallbackHintsFromReview(r,review){
    const out=[];
    const pts=Array.isArray(review&&review.points)?review.points:[];
    const bad=pts.filter(p=>p&&p.status==='×').map(p=>String(p.label||''));
    const needs=pts.filter(p=>p&&p.status==='△').map(p=>String(p.label||''));
    const s=review&&review.summary||{};
    if(!s.axisHit || bad.includes('軸的中')) out.push('軸条件を優先見直し');
    if(bad.includes('軸スコア')) out.push('軸スコア50以上の圏外率を検証');
    if(needs.includes('人気条件') || bad.includes('人気条件')) out.push('人気帯の失敗率を確認');
    if(needs.includes('5系') || bad.includes('5系')) out.push('5系の重みを比較');
    if(bad.includes('隣±1') || needs.includes('隣±1')) out.push('隣±1の重みを比較');
    if(needs.includes('◎連動') || bad.includes('◎連動')) out.push('◎連動の優先度を比較');
    if(needs.includes('印重複') || bad.includes('印重複')) out.push('印重複の優先度を比較');
    if(bad.includes('馬連')) out.push(s.axisHit?'馬連の相手抜け属性を集計':'軸改善後に馬連相手条件を再評価');
    if(bad.includes('ワイド')) out.push(s.axisHit?'ワイド相手抜け属性を集計':'軸改善後にワイド相手条件を再評価');
    if(bad.includes('3連複')) out.push(s.axisHit?'3連複の不足馬属性を集計':'軸改善後に3連複3頭目を再評価');
    return uniq(out);
  }
  function reviewForRace(r){
    // 相談内容連携は、保存済みaiReviewの有無や旧バージョンに左右されないよう、
    // 結果入力済みレースでは最新のmakeReflectionを必ず試し、保存済み情報とマージする。
    const saved=(r&&(r.aiReview||r.reflection))||{};
    let fresh=null;
    if(window.KV2App && typeof window.KV2App.makeReflection==='function'){
      try{ fresh=window.KV2App.makeReflection(r)||null; }catch(e){ fresh=null; }
    }
    const rv=Object.assign({}, saved||{}, fresh||{});
    // ruleConsultHintsだけは旧保存分と最新生成分を両方残す。
    rv.ruleConsultHints=uniq([
      ...((saved&&Array.isArray(saved.ruleConsultHints))?saved.ruleConsultHints:[]),
      ...((fresh&&Array.isArray(fresh.ruleConsultHints))?fresh.ruleConsultHints:[])
    ]);
    rv.points=(fresh&&Array.isArray(fresh.points)&&fresh.points.length)?fresh.points:((saved&&Array.isArray(saved.points))?saved.points:[]);
    rv.summary=(fresh&&fresh.summary)||saved.summary||null;
    rv.reasons=(fresh&&Array.isArray(fresh.reasons))?fresh.reasons:((saved&&Array.isArray(saved.reasons))?saved.reasons:[]);
    return rv||{};
  }
  function karteRecordsForRace(r){
    const review=reviewForRace(r);
    const hints=uniq([...(Array.isArray(review.ruleConsultHints)?review.ruleConsultHints:[]), ...fallbackHintsFromReview(r,review)]);
    const cats=karteCategoryKeys(r);
    return hints.map(text=>{
      const kind=karteRecordKind(text);
      return {
        kind,text,categories:cats,severity:karteSeverity(kind,text,review),
        date:r.date||'',raceId:r.id||'',raceLabel:`${r.date||''} ${r.place||''}${r.raceNo||''}R ${r.name||r.raceName||''}`.trim(),
        resultCause:(review.reasons||[]).join(' / '), axisHit:!!(review.summary&&review.summary.axisHit),
        source:'AIカルテ'
      };
    });
  }
  function karteCarryItems(cat,limit){
    const races=(S.loadRaces?S.loadRaces():[]).filter(r=>r&&r.result&&!C.resultMissing(r.result)&&raceMatchCategoryString(r,cat));
    const agg={}; let used=0;
    races.forEach(r=>{
      const records=karteRecordsForRace(r).filter(rec=>!cat || cat==='全て' || raceMatchCategoryString(r,cat) || (rec.categories||[]).some(c=>raceMatchesCategory({grade:r.grade,surface:r.surface,condition:r.condition},c)));
      if(records.length) used++;
      records.forEach(rec=>{
        const key=rec.kind+'||'+rec.text;
        if(!agg[key]) agg[key]={kind:rec.kind,text:rec.text,count:0,score:0,severity:0,races:[],lastAt:'',categories:{},source:'AIカルテ'};
        agg[key].count++;
        agg[key].score += rec.severity||1;
        agg[key].severity=Math.max(agg[key].severity||0,rec.severity||1);
        agg[key].races.push(rec.raceLabel);
        (rec.categories||[]).forEach(c=>{agg[key].categories[c]=(agg[key].categories[c]||0)+1;});
        if(String(rec.date||'').localeCompare(String(agg[key].lastAt||''))>0) agg[key].lastAt=rec.date||agg[key].lastAt||'';
      });
    });
    let items=Object.values(agg).sort((a,b)=>(b.score||0)-(a.score||0) || (b.count||0)-(a.count||0) || String(b.lastAt).localeCompare(String(a.lastAt)));
    if(limit) items=items.slice(0,limit);
    return {items,used,total:races.length};
  }
  function selectedCarryHints(){
    return [...document.querySelectorAll('.aiCarryCheck:checked')].map(x=>{
      const cats={}; String(x.dataset.cats||'').split('|').filter(Boolean).forEach(c=>cats[c]=1);
      return {kind:x.dataset.kind||'other',text:x.value,count:int(x.dataset.count||0),score:num(x.dataset.score||0),severity:num(x.dataset.severity||0),categories:cats};
    });
  }
  function carryThemePreview(arr,limit){
    return (arr||[]).slice(0,limit||3).map(g=>g.theme).filter(Boolean).join('・') + (((arr||[]).length>(limit||3))?'…':'');
  }
  function comparePlanLabel(theme,kind){
    const t=String(theme||'');
    if(/人気/.test(t)) return '人気帯変更';
    if(/5系/.test(t)) return '5系重み変更';
    if(/軸スコア/.test(t)) return '軸スコア条件変更';
    if(/軸条件/.test(t)) return '軸条件変更';
    if(/隣/.test(t)) return '隣±1重み変更';
    if(/連動/.test(t)) return '連動優先変更';
    if(/印重複/.test(t)) return '印重複優先変更';
    if(kind==='umaren'||/馬連/.test(t)) return '馬連相手条件変更';
    if(kind==='wide'||/ワイド/.test(t)) return 'ワイド相手条件変更';
    if(kind==='sanrenpuku'||/3連複/.test(t)) return '3連複3頭目変更';
    return t||'改善テーマ比較';
  }
  function sortCarryThemesForCompare(themes){
    return (themes||[]).slice().sort((a,b)=>(b.count||0)-(a.count||0)||(b.score||0)-(a.score||0)||String(a.theme||'').localeCompare(String(b.theme||'')));
  }
  function groupPriorityStars(k,arr){
    if(k==='axis') return '★★★★★';
    if(k==='umaren' || k==='wide' || k==='sanrenpuku') return '★★★☆☆';
    const mx=(arr||[]).reduce((n,g)=>Math.max(n,num(g.severity||0)),0);
    return star(mx||3);
  }
  function aiKarteCarryHtml(cat){
    const cats=selectedCategoriesForInitial(cat);
    const carry=karteCarryItems(cats,20);
    const items=carry.items;
    const selectedLabel=categoryDisplay(cats);
    if(!items.length) return `<div class="card hint"><b>AIカルテから引き継いだ改善候補</b><br><span class="subtle">対象カテゴリー：${safe(selectedLabel)}</span><br>このカテゴリーにはまだ引き継ぎ候補がありません。結果入力後のAIカルテが増えると、ここに比較候補が表示されます。</div>`;
    const themes=groupCarryThemes(items);
    const by={axis:[],umaren:[],wide:[],sanrenpuku:[],other:[]};
    themes.forEach(it=>(by[it.kind]||by.other).push(it));
    const countText=['axis','umaren','wide','sanrenpuku','other'].map(k=>({k,n:(by[k]||[]).length})).filter(x=>x.n).map(x=>`${hintKindLabel(x.k)} ${x.n}テーマ`).join(' / ');
    const mainKinds=['axis','umaren','wide','sanrenpuku'];
    const summaryChecks=mainKinds.map(k=>{
      const arr=by[k]||[];
      if(!arr.length) return '';
      const checked=k==='axis'?'checked':'';
      const pri=groupPriorityStars(k,arr);
      const preview=carryThemePreview(arr,3);
      return `<label class="checkLine aiCarrySummaryLine"><input class="aiCarryKindCheck" type="checkbox" ${checked} data-kind="${safe(k)}" onchange="KV2RuleConsult.toggleCarryKind(this)"><span><b>${safe(hintKindLabel(k))}改善</b><br><span class="subtle">${safe(preview)}</span></span><span class="badge blue">${arr.length}テーマ</span><span class="badge">${safe(pri)}</span></label>`;
    }).join('');
    const section=k=>{
      const arr=sortCarryThemesForCompare(by[k]||[]);
      if(!arr.length) return '';
      return `<details class="carryKindDetails" data-carry-kind="${safe(k)}"><summary>${safe(hintKindLabel(k))}改善（${arr.length}）</summary>${arr.map((g,i)=>{
        const id=`aiCarry_${k}_${i}_${Math.random().toString(36).slice(2,7)}`;
        const catsStr=Object.keys(g.categories||{}).filter(c=>c!=='全て').join('|');
        const detail=g.items.slice(0,3).map(x=>x.text).filter(Boolean).join(' / ');
        const checked=k==='axis'?'checked':'';
        return `<label class="checkLine aiCarryLine" for="${id}"><input id="${id}" class="aiCarryCheck" type="checkbox" ${checked} data-kind="${safe(g.kind)}" data-count="${g.count}" data-score="${num(g.score)}" data-severity="${num(g.severity)}" data-cats="${safe(catsStr)}" value="${safe(g.theme)}"><span><b>${safe(g.theme)}</b><br><span class="subtle">${safe(detail)}</span></span><span class="badge blue">${g.count}回</span></label>`;
      }).join('')}</details>`;
    };
    return `<div class="card aiCarry"><div class="title">AIカルテから引き継いだ改善候補</div>`+
      `<div class="hint">対象カテゴリー：${safe(selectedLabel)}<br>保存レース：${carry.total}R（AIカルテ該当：${carry.used}R）<br>改善テーマ：${themes.length}件${countText?`（${safe(countText)}）`:''}<br><span class="subtle">カテゴリーを変更すると、この候補も切り替わります。</span>${carry.total<3?`<br><span class="subtle">※対象レースが少ないため、今回の提案は参考です。</span>`:''}</div>`+
      `<div class="carrySummaryChecks">${summaryChecks}</div>`+
      `<div class="hint">相談ではチェックONの改善テーマだけを比較します。<br>予想ルールは変更されず、相談結果を採用した場合だけ反映されます。</div>`+
      `<details class="aiCarryDetails"><summary>改善テーマ詳細（優先順位順）</summary><div class="carryKindGrid">${['axis','umaren','wide','sanrenpuku','other'].map(section).join('')}</div></details></div>`;
  }

  function toggleCarryKind(el){
    const kind=el&&el.dataset&&el.dataset.kind;
    if(!kind) return;
    document.querySelectorAll(`.aiCarryCheck[data-kind="${kind}"]`).forEach(c=>{c.checked=!!el.checked;});
  }

  function csvSplitLine(line){
    const out=[]; let cur='',q=false;
    for(let i=0;i<line.length;i++){
      const ch=line[i];
      if(ch==='"'){ if(q && line[i+1]==='"'){cur+='"'; i++;} else q=!q; }
      else if(ch===',' && !q){out.push(cur); cur='';}
      else cur+=ch;
    }
    out.push(cur); return out.map(s=>s.trim());
  }
  function parseCsv(text){
    text=String(text||'').replace(/^\uFEFF/,'').replace(/\r/g,'');
    const rawLines=text.split('\n').filter(x=>x.trim());
    if(!rawLines.length) return [];
    const rows=[]; let section=''; let head=null;
    function isSection(vals){ return vals.length===1 && /^【.+】$/.test(String(vals[0]||'').trim()); }
    function isHeader(vals){
      const joined=vals.join('|');
      return vals.length>=2 && (/対象R|対象レース|レース数|区分|カテゴリー|属性/.test(joined)) && (/回収率|的中率|軸複勝率|順位|対象R/.test(joined));
    }
    rawLines.forEach(line=>{
      const vals=csvSplitLine(line).map(x=>String(x||'').replace(/^"|"$/g,'').trim());
      if(!vals.some(Boolean)) return;
      if(isSection(vals)){ section=vals[0].replace(/^【|】$/g,''); head=null; return; }
      if(isHeader(vals)){ head=vals; return; }
      if(head){
        const o={}; head.forEach((h,i)=>o[h]=vals[i]||'');
        const r=normalizeCsvRow(o,section);
        if(r && (r.category || r.rawCategory || r.ruleText)) rows.push(r);
      }
    });
    // 単一ヘッダーCSV互換
    if(!rows.length){
      const head0=csvSplitLine(rawLines[0]).map(x=>x.trim());
      return rawLines.slice(1).map(line=>{
        const vals=csvSplitLine(line); const o={}; head0.forEach((h,i)=>o[h]=vals[i]||''); return normalizeCsvRow(o,'CSV');
      }).filter(r=>r.category || r.rawCategory);
    }
    return rows.filter(r=>{
      const hasMetric=num(r.allReturn)||num(r.axisPlace)||num(r.umarenReturn)||num(r.wideReturn)||num(r.sanrenpukuReturn)||num(r.hitRate)||num(r.races);
      return (r.category||r.rawCategory) && hasMetric;
    });
  }
  function pick(o,keys){
    for(const k of keys){ if(o[k]!==undefined && String(o[k]).trim()!=='') return o[k]; }
    return '';
  }
  function normalizeCategoryLabel(v){
    v=String(v||'').trim();
    if(!v) return '';
    return v.replace(/\s*\/\s*/g,'/').replace(/ /g,'').replace(/／/g,'/');
  }
  function categoryFromSectionTitle(section){
    const src=String(section||'').replace(/^【|】$/g,'').trim();
    const m=src.match(/カテゴリー別属性ランキング\s+(.+?)\s+(単勝|複勝|馬連|ワイド|3連複|三連複)属性ランキング/);
    if(m&&m[1]) return normalizeCategoryLabel(m[1]);
    return '';
  }
  function normalizeCsvRow(o,section){
    section=String(section||'');
    const grade=pick(o,['グレード','grade','Grade','カテゴリグレード']);
    const surface=pick(o,['馬場','surface','Surface']);
    const condition=pick(o,['条件','condition','Condition']);
    let rawCategory=pick(o,['カテゴリー','カテゴリ','category','Category','条件カテゴリ','区分']);
    const attr=pick(o,['属性']);
    if((!rawCategory || !isRealConsultCategoryLabel(rawCategory)) && attr){
      const secCat=categoryFromSectionTitle(section);
      if(secCat) rawCategory=secCat;
    }
    // 属性ランキングの「5系」「4〜9人気」などは予想ルール構成要素であり、
    // グレード/馬場/条件カテゴリーとしては扱わない。
    let category=rawCategory || [grade,surface,condition].filter(Boolean).join('/');
    category=normalizeCategoryLabel(category);
    // CSVの「カテゴリー」列に 5系・4〜9人気・馬連 などの属性/券種が入る場合がある。
    // その場合はカテゴリー名にせず、グレード/馬場/条件が取れるならそちらへ戻す。
    const strictCategory=normalizeCategoryLabel([grade,surface,condition].filter(Boolean).join('/'));
    if(strictCategory && !isRealConsultCategoryLabel(category)) category=strictCategory;
    const isAttribute=/属性ランキング/.test(section) || !!attr || (rawCategory && !isRealConsultCategoryLabel(rawCategory));
    const basis=pick(o,['判定','判定に使用する結果','basis']) || section || '';
    const ruleText=pick(o,['予想ルール','ルール','rule','Rule','内容']) || (isAttribute ? `${section}:${attr||rawCategory}` : section);
    const r={
      category, rawCategory, grade, surface, condition,
      races:int(pick(o,['対象レース','対象R','レース数','件数','raceCount','count'])),
      basis,
      axisWin:num(pick(o,['軸単勝率','軸単勝的中率','axisWinRate'])),
      axisPlace:num(pick(o,['軸複勝率','軸複勝的中率','axisPlaceRate'])),
      allReturn:num(pick(o,['全体回収率','総合回収率','allReturn'])),
      umarenReturn:num(pick(o,['馬連回収率','umarenReturn'])),
      wideReturn:num(pick(o,['ワイド回収率','wideReturn'])),
      sanrenpukuReturn:num(pick(o,['3連複回収率','三連複回収率','sanrenpukuReturn'])),
      hitRate:num(pick(o,['全体的中率','hitRate'])),
      umarenHit:num(pick(o,['馬連的中率','umarenHitRate'])),
      wideHit:num(pick(o,['ワイド的中率','wideHitRate'])),
      sanrenpukuHit:num(pick(o,['3連複的中率','三連複的中率','sanrenpukuHitRate'])),
      ruleText,
      candidateSource:'rankingCsv',
      rankingSection:section,
      isAttributeRanking:isAttribute
    };
    // 属性ランキングCSVでは、列名「回収率」「的中率」は全体ではなく、
    // セクション名の券種（馬連/ワイド/3連複/単勝/複勝）の指標を表す。
    // ここを全体回収率として読むと、4R程度の属性配当が全体719%のように誤投影されるため、券種別へ振り分ける。
    if(isAttribute){
      const genericReturn=num(pick(o,['回収率']));
      const genericHit=num(pick(o,['的中率']));
      if(/馬連/.test(section)){
        if(!r.umarenReturn) r.umarenReturn=genericReturn;
        if(!r.umarenHit) r.umarenHit=genericHit;
      }else if(/ワイド/.test(section)){
        if(!r.wideReturn) r.wideReturn=genericReturn;
        if(!r.wideHit) r.wideHit=genericHit;
      }else if(/3連複|三連複/.test(section)){
        if(!r.sanrenpukuReturn) r.sanrenpukuReturn=genericReturn;
        if(!r.sanrenpukuHit) r.sanrenpukuHit=genericHit;
      }else if(/複勝/.test(section)){
        if(!r.axisPlace) r.axisPlace=genericHit;
      }else if(/単勝/.test(section)){
        if(!r.axisWin) r.axisWin=genericHit;
      }
    }

    if(!r.races) r.races=int(pick(o,['対象数','出現','発生','的中R']));
    return r;
  }

  function isJudgeRankingSection(section){
    return /判定別ランキング|判定別/.test(String(section||''));
  }
  function isLowReturnRankingSection(section){
    return /低回収率ランキング|低回収/.test(String(section||''));
  }
  function isAxisNgRankingSection(section){
    return /軸NGランキング|軸NG|NG/.test(String(section||''));
  }
  function isRealConsultCategoryLabel(label){
    const s=normalizeCategoryLabel(label||'');
    if(!s || s==='全て') return false;
    // 「5系」「4〜9人気」「馬連」などの属性・券種ラベルをカテゴリー化しない。
    if(/人気|5系|隣|連動|印重複|軸スコア|軸条件|単勝|馬連|ワイド|3連複|三連複|馬券|相手|抜け|NG/.test(s)) return false;
    // 通常カテゴリーは「グレード/馬場/条件」または障害系の表記を持つ。
    return /\//.test(s) || /G1|G2|G3|OP|L|特別|[123]勝|障害|J-G/.test(s);
  }
  function isPrimaryRuleRankingSection(section){
    const s=String(section||'').trim();
    if(!s) return false;
    // 主候補は予想ルールランキング系。これは最優先で評価する。
    if(!/予想ルールランキング/.test(s)) return false;
    if(isJudgeRankingSection(s)) return false;
    return true;
  }
  function isAuxiliaryRuleRankingSection(section){
    const s=String(section||'').trim();
    if(!s) return false;
    // 判定別・低回収率ランキングは相談候補から除外。
    // 軸NGランキングは「軸失敗時に来た馬の属性」なので、直接提案ではなくAIカルテ/補助ヒント扱いにする。
    if(isJudgeRankingSection(s) || isLowReturnRankingSection(s) || isAxisNgRankingSection(s)) return false;
    if(isPrimaryRuleRankingSection(s)) return false;
    // 属性・改善分析・相手抜け・推奨馬券別などは補助候補として利用。
    // 5系・人気帯は属性ランキングの構成要素として含める。
    return /属性ランキング|改善分析ランキング|改善分析|相手抜けランキング|相手抜け|組み合わせ抜け|推奨馬券別ランキング|推奨馬券/.test(s);
  }
  function annotateAuxiliaryCandidate(r){
    r=Object.assign({},r||{});
    const section=String(r.rankingSection||r.basis||'');
    if(isAuxiliaryRuleRankingSection(section)){
      r.isAuxiliaryRanking=true;
      r.candidateKind='補助ランキング';
      const base=String(r.ruleText||section||'').trim();
      // 補助ランキングはそのまま固定ルールにせず、現行ルールへ変換する前提として記録する。
      r.ruleText=base.indexOf('補助候補')>=0 ? base : `補助候補を現行ルールへ変換：${base}`;
    }else if(isPrimaryRuleRankingSection(section)){
      r.isAuxiliaryRanking=false;
      r.candidateKind='予想ルールランキング';
    }
    return r;
  }
  function isSaneRuleCandidate(r){
    r=r||{};
    const races=int(r.races||r.doneR||r.totalR||0);
    const axis=num(r.axisPlace||r.axisPlaceRate);
    const hitVals=[r.hitRate,r.umarenHit,r.wideHit,r.sanrenpukuHit].map(num);
    const retVals=[r.allReturn,r.umarenReturn,r.wideReturn,r.sanrenpukuReturn].map(num);
    // 候補段階では落とし過ぎない。
    // 判定別・低回収率は保存前に除外。ここでは候補を落とし過ぎない。
    if(races<=0) return false;
    if(axis<0 || axis>100) return false;
    if(hitVals.some(v=>v<0 || v>100)) return false;
    // CSV側で高配当・少点数のランキングは大きな回収率になるため、上限で候補落ちさせない。
    if(retVals.some(v=>v<0 || !Number.isFinite(v))) return false;
    return true;
  }
  function isDirectRuleCandidate(r){
    r=r||{};
    if(r.candidateSource==='rankingCsv'){
      const section=r.rankingSection||r.basis;
      if(isJudgeRankingSection(section) || isLowReturnRankingSection(section) || isAxisNgRankingSection(section)) return false;
      if(!(isPrimaryRuleRankingSection(section) || isAuxiliaryRuleRankingSection(section))) return false;
      if(!isSaneRuleCandidate(r)) return false;
    }
    return true;
  }


  function rankingSourcePriority(r){
    const s=String((r&&r.rankingSection)||(r&&r.basis)||'');
    if(isJudgeRankingSection(s) || isLowReturnRankingSection(s) || isAxisNgRankingSection(s)) return -1;
    if(/予想ルールランキング/.test(s) && /直近30R|直近/.test(s)) return 90;
    if(/予想ルールランキング/.test(s)) return 100;
    if(/改善分析ランキング|改善分析|改善/.test(s)) return 80;
    if(/属性ランキング|属性/.test(s)) return 70;
    if(/相手抜けランキング|相手抜け|組み合わせ抜け|抜け/.test(s)) return 50;
    return isAuxiliaryRuleRankingSection(s) ? 30 : 0;
  }

  function loadCsvFile(input){
    const f=input&&input.files&&input.files[0]; if(!f) return;
    const reader=new FileReader();
    reader.onload=function(){
      try{
        const rows=parseCsv(reader.result||'');
        const stored=saveRows(rows);
        const meta={
          loadedAt:new Date().toISOString(),
          fileName:f.name||'CSV',
          fileSize:f.size||0,
          totalRows:rows.length,
          storedRows:stored.length,
          memoryOnly:true,
          files:[{name:f.name||'CSV',rows:rows.length,stored:stored.length,size:f.size||0,at:new Date().toISOString()}],
          sections:sectionCounts(stored),
          rawSections:sectionCounts(rows)
        };
        saveCsvMeta(meta);
        const sections=Object.keys(meta.sections||{}).length;
        const dbg=rankingCsvDebugSummary(stored);
        alert(`ランキングCSVを登録しました。\n読込行数：${rows.length.toLocaleString()}行\n相談対象：${stored.length.toLocaleString()}件\n直接候補対象：${dbg.direct.toLocaleString()}件\n軸NGヒント：${dbg.axisHint.toLocaleString()}件\n分類：${sections}件\n※判定別・低回収率ランキングは除外します。\n※CSV本体は容量超過防止のため端末保存せず、この画面内のメモリで使用します。`);
      }catch(e){
        console.error('rule csv load failed',e);
        alert('ランキングCSV読み込みでエラーが発生しました。\n'+(e&&e.message||e));
      }
      show('all');
      if(input) input.value='';
    };
    reader.onerror=function(){ alert('CSVファイルの読み込みに失敗しました。'); };
    reader.readAsText(f,'UTF-8');
  }
  function rebuildAiCarryByKind(prefs){
    prefs=prefs||{};
    const arr=Array.isArray(prefs.aiCarry)?prefs.aiCarry:[];
    prefs.aiCarryByKind=arr.reduce((o,h)=>{(o[h.kind]||(o[h.kind]=[])).push(h); return o;},{});
    return prefs;
  }

  function parseConsultComment(comment){
    const t=String(comment||'').trim();
    const out={raw:t,hasComment:!!t,kinds:{axis:{},umaren:{},wide:{},sanrenpuku:{}}};
    if(!t) return out;
    const kindNames={axis:['軸'],umaren:['馬連'],wide:['ワイド'],sanrenpuku:['3連複','三連複','3複']};
    const hasAny=(words)=>words.some(w=>t.indexOf(w)>=0);
    const local=(words,patterns)=>words.some(w=>patterns.some(re=>new RegExp(w+'.{0,18}'+re+'|'+re+'.{0,18}'+w).test(t)));
    Object.entries(kindNames).forEach(([kind,words])=>{
      const o=out.kinds[kind];
      if(local(words,['現状維持','維持','変更しない','変えない','固定'])) o.keep=true;
      if(local(words,['的中率','複勝率','的中重視','的中優先','安定'])) o.hit=true;
      if(local(words,['回収率','回収重視','回収優先','100%以上','100％以上'])) o.ret=true;
      if(local(words,['買い目固定','点数固定'])) o.fixed=true;
      if(local(words,['変更','見直し','提案'])) o.changeRequested=true;
      const m=t.match(new RegExp(words.join('|')+'.{0,24}(\d+(?:\.\d+)?)\s*[％%]\s*以上'));
      if(m) o.minReturn=num(m[1]);
    });
    const rangeRe=/(?:軸.{0,12})?(\d+)\s*[〜～~\-－]\s*(\d+)\s*人気.{0,18}(?:を|から|→|=>|に|へ).{0,18}(\d+)\s*[〜～~\-－]\s*(\d+)\s*人気/;
    const rm=t.match(rangeRe);
    if(rm){
      out.axisPopularityChange={fromMin:C.toInt(rm[1]),fromMax:C.toInt(rm[2]),toMin:C.toInt(rm[3]),toMax:C.toInt(rm[4])};
      out.kinds.axis.changeRequested=true;
      out.kinds.axis.hit=true;
    }else{
      const only=t.match(/軸.{0,16}人気.{0,16}(\d+)\s*[〜～~\-－]\s*(\d+)\s*人気/) || t.match(/軸.{0,16}(\d+)\s*[〜～~\-－]\s*(\d+)\s*人気/);
      if(only){ out.axisPopularityChange={fromMin:2,fromMax:6,toMin:C.toInt(only[1]),toMax:C.toInt(only[2])}; out.kinds.axis.changeRequested=true; }
    }
    // 相談コメント専用：買い目人気帯の指定を解析する。
    // 例：買い目を6〜12人気、馬連/ワイド買い目を9人気まで、3連複買い目を12人気まで
    function _ticketRangeFromText(scopeText){
      const s=String(scopeText||'');
      let m=s.match(/(?:買い目|相手).{0,16}?(\d+)\s*[〜～~\-－]\s*(\d+)\s*人気/);
      if(m) return {min:C.toInt(m[1]),max:C.toInt(m[2])};
      m=s.match(/(?:買い目|相手).{0,16}?(\d+)\s*人気\s*まで/);
      if(m) return {min:1,max:C.toInt(m[1])};
      return null;
    }
    const allTicketRange=_ticketRangeFromText(t);
    if(allTicketRange){
      out.ticketPopularityRange=allTicketRange;
      ['umaren','wide','sanrenpuku'].forEach(k=>{ out.kinds[k].changeRequested=true; out.kinds[k].ticketPopularityRange=allTicketRange; });
    }
    [
      ['umaren',['馬連']],
      ['wide',['ワイド']],
      ['sanrenpuku',['3連複','三連複','3複']]
    ].forEach(([kind,words])=>{
      words.forEach(w=>{
        const re=new RegExp(w+'.{0,24}(?:買い目|相手).{0,16}(\\d+)\\s*[〜～~\\-－]\\s*(\\d+)\\s*人気');
        const m=t.match(re);
        if(m){ const r={min:C.toInt(m[1]),max:C.toInt(m[2])}; out.kinds[kind].ticketPopularityRange=r; out.kinds[kind].changeRequested=true; }
        const re2=new RegExp(w+'.{0,24}(?:買い目|相手).{0,16}(\\d+)\\s*人気\\s*まで');
        const m2=t.match(re2);
        if(m2){ const r={min:1,max:C.toInt(m2[1])}; out.kinds[kind].ticketPopularityRange=r; out.kinds[kind].changeRequested=true; }
      });
    });
    const axisPart=commentTextAfterKeyword(t,'軸');
    const ticketPart=commentTextAfterKeyword(t,'買い目') || commentTextAfterKeyword(t,'相手');
    if(axisPart && /5系|連動|隣|印隣|◎隣|○隣|▲隣/.test(axisPart)){ out.axisAttributeRuleText=cleanConsultConditionText(axisPart); out.kinds.axis.changeRequested=true; }
    if(ticketPart && /5系|連動|隣|印隣|◎隣|○隣|▲隣/.test(ticketPart)){
      out.ticketAttributeRuleText=cleanConsultConditionText(ticketPart);
      ['umaren','wide','sanrenpuku'].forEach(k=>{ out.kinds[k].changeRequested=true; });
    }
    if(/人気.{0,8}(無視|除外しない|気にしない)|人気条件.{0,8}(無視|除外しない)/.test(t)) out.kinds.axis.ignorePopularity=true;
    if(/コメント.*優先|最優先|コメント優先/.test(t)) out.commentPriority=true;
    return out;
  }
  function mergeCommentIntentIntoPrefs(prefs){
    prefs=prefs||{};
    const intent=parseConsultComment(prefs.comment||'');
    prefs.commentIntent=intent;
    const map={axis:'axis',umaren:'umaren',wide:'wide',sanrenpuku:'sanrenpuku'};
    Object.keys(map).forEach(k=>{
      const d=(intent.kinds&&intent.kinds[k])||{};
      prefs[k]=prefs[k]||{};
      if(d.keep){ prefs[k].keep=true; prefs[k].hit=false; prefs[k].ret=false; }
      if(d.hit){ prefs[k].hit=true; if(!d.keep) prefs[k].keep=false; }
      if(d.ret){ prefs[k].ret=true; if(!d.keep) prefs[k].keep=false; }
      if(d.fixed) prefs[k].fixed=true;
      if(d.minReturn!=null) prefs[k].minReturn=d.minReturn;
      if(d.ignorePopularity) prefs[k].ignorePopularity=true;
    });
    return prefs;
  }
  function commentDirectiveLabels(prefs){
    const intent=(prefs&&prefs.commentIntent)||parseConsultComment(prefs&&prefs.comment||'');
    if(!intent.hasComment) return [];
    const labels=[];
    const names={axis:'軸',umaren:'馬連',wide:'ワイド',sanrenpuku:'3連複'};
    Object.keys(names).forEach(k=>{
      const d=(intent.kinds&&intent.kinds[k])||{};
      const a=[];
      if(d.keep) a.push('現状維持');
      if(d.hit) a.push('的中率優先');
      if(d.ret) a.push('回収率優先');
      if(d.minReturn!=null) a.push(`回収率${d.minReturn}%以上`);
      if(d.fixed) a.push('買い目固定');
      if(d.ignorePopularity) a.push('人気条件を除外しない');
      if(a.length) labels.push(`${names[k]}：${a.join(' / ')}`);
    });
    if(intent.axisPopularityChange){
      const r=intent.axisPopularityChange;
      labels.unshift(`軸人気帯：${r.fromMin}〜${r.fromMax}人気 → ${r.toMin}〜${r.toMax}人気で実測比較`);
    }
    const ticketRange=intent.ticketPopularityRange;
    if(ticketRange) labels.push(`買い目人気帯：${ticketRange.min}〜${ticketRange.max}人気で実測比較`);
    if(intent.axisAttributeRuleText) labels.push(`軸条件：${intent.axisAttributeRuleText}で実測比較`);
    if(intent.ticketAttributeRuleText) labels.push(`買い目条件：${intent.ticketAttributeRuleText}で実測比較`);
    ['umaren','wide','sanrenpuku'].forEach(k=>{
      const d=(intent.kinds&&intent.kinds[k])||{};
      const r=d.ticketPopularityRange;
      if(r && (!ticketRange || r.min!==ticketRange.min || r.max!==ticketRange.max)) labels.push(`${names[k]}買い目人気帯：${r.min}〜${r.max}人気で実測比較`);
    });
    return labels;
  }
  function isConsultCompareMode(prefs){
    const intent=(prefs&&prefs.commentIntent)||parseConsultComment(prefs&&prefs.comment||'');
    const text=String((prefs&&prefs.comment)||'');
    return !!(intent.axisPopularityChange || intent.ticketPopularityRange || /どう変わる|比較|シミュレーション|変えたら|変更したら|試したら|→|⇒/.test(text));
  }

  function commentReflectionHtml(prefs){
    const comment=String(prefs&&prefs.comment||'').trim();
    if(!comment) return '';
    const labels=commentDirectiveLabels(prefs);
    return `<div class="card commentReflection"><div class="hint" style="border:1px solid #22c55e;background:#f0fdf4;color:#166534;border-radius:10px;padding:10px;font-weight:800">✅ 相談コメントを反映して提案しました</div><div class="title">相談内容サマリー</div><table class="miniStats"><tr><td>対象カテゴリー</td><td>${safe(prefs.selectedCategoryLabel||'')}</td></tr><tr><td>相談コメント</td><td class="left"><b>${safe(comment)}</b></td></tr><tr><td>コメント反映</td><td class="improve">反映済み（最優先）</td></tr>${labels.length?`<tr><td>解釈した条件</td><td class="left">${labels.map(safe).join('<br>')}</td></tr>`:''}</table></div>`;
  }
  function commentMetricPenalty(r,current,prefs){
    const intent=(prefs&&prefs.commentIntent)||parseConsultComment(prefs&&prefs.comment||'');
    if(!intent.hasComment) return 0;
    let add=0;
    const defs={umaren:['umarenReturn','umarenHit'],wide:['wideReturn','wideHit'],sanrenpuku:['sanrenpukuReturn','sanrenpukuHit']};
    Object.entries(defs).forEach(([kind,keys])=>{
      const d=(intent.kinds&&intent.kinds[kind])||{};
      if(d.keep){
        add -= Math.abs(metricValue(r,keys[0])-metricValue(current,keys[0]))*8;
        add -= Math.abs(metricValue(r,keys[1],'hitRate')-metricValue(current,keys[1],'hitRate'))*3;
      }
      if(d.ret){ add += metricValue(r,keys[0])*1.2; }
      if(d.hit){ add += metricValue(r,keys[1],'hitRate')*1.8; }
      if(d.minReturn!=null){ add += metricValue(r,keys[0])>=d.minReturn ? 80 : -120; }
    });
    const ax=(intent.kinds&&intent.kinds.axis)||{};
    if(ax.hit) add += metricValue(r,'axisPlace','axisPlaceRate')*2.5 + metricValue(r,'hitRate')*0.8;
    if(ax.ret) add += metricValue(r,'allReturn')*1.0;
    if(ax.keep) add -= Math.abs(metricValue(r,'axisPlace','axisPlaceRate')-metricValue(current,'axisPlaceRate','axisPlace'))*10;
    if(ax.ignorePopularity) add += 20;
    return Math.round(add*10)/10;
  }
  function carryItemsToPrefs(items,source){
    return (items||[]).map(it=>({
      kind:it.kind||'other',text:it.text||'',count:int(it.count||0),score:num(it.score||0),severity:num(it.severity||0),
      categories:it.categories||{},source:source||'AIカルテ自動抽出'
    }));
  }
  function autoCarryHintsForCategories(cats,limit){
    const carry=karteCarryItems(cats,limit||12);
    return carryItemsToPrefs(carry.items||[],'AIカルテ自動抽出');
  }
  function exactCarryHintsForCategory(cat,limit){
    if(!cat || cat==='全て') return [];
    const carry=karteCarryItems(cat,limit||12);
    return carryItemsToPrefs(carry.items||[],'AIカルテカテゴリー抽出');
  }
  function collectPrefs(){
    const names=['axis','umaren','wide','sanrenpuku']; const prefs={comment:String(document.getElementById('consultComment')?.value||'')};
    names.forEach((n,i)=>prefs[n]={keep:!!document.getElementById(`chk${i}_keep`)?.checked,hit:!!document.getElementById(`chk${i}_hit`)?.checked,ret:!!document.getElementById(`chk${i}_ret`)?.checked,fixed:!!document.getElementById(`chk${i}_fixed`)?.checked});
    prefs.aiCarry=selectedCarryHints();
    mergeCommentIntentIntoPrefs(prefs);
    return rebuildAiCarryByKind(prefs);
  }
  function scoreCandidate(r,prefs,current){
    let score=0;
    score += (r.allReturn||0)*2;
    score += (r.axisPlace||0)*1.5;
    score += (r.hitRate||0)*0.8;
    score += Math.min(r.races||0,100)*0.2;
    if(prefs.axis&&prefs.axis.hit) score += (r.axisPlace||0)*1.2;
    if(prefs.umaren&&prefs.umaren.ret) score += (r.umarenReturn||0)*0.5;
    if(prefs.wide&&prefs.wide.ret) score += (r.wideReturn||0)*0.5;
    if(prefs.sanrenpuku&&prefs.sanrenpuku.ret) score += (r.sanrenpukuReturn||0)*0.5;
    const carry=(prefs&&prefs.aiCarry)||[];
    if(carry.length){
      const byKind=carry.reduce((o,h)=>{o[h.kind]=(o[h.kind]||0)+(h.score||h.count||1); return o;},{});
      const sample=(current&&(current.doneR||current.totalR))||0;
      const scale=sample<3?0.25:1;
      let add=0;
      add += Math.min(30,(byKind.axis||0))*0.8;
      if(byKind.umaren) add += (r.umarenReturn||0)*0.08 + Math.min(10,byKind.umaren)*0.6;
      if(byKind.wide) add += (r.wideReturn||0)*0.08 + Math.min(10,byKind.wide)*0.6;
      if(byKind.sanrenpuku) add += (r.sanrenpukuReturn||0)*0.08 + Math.min(10,byKind.sanrenpuku)*0.6;
      score += Math.min(sample<3?6:30,add*scale);
    }
    score += commentMetricPenalty(r,current,prefs);
    if(current && r.category===current.category) score += 5;
    return Math.round(score*10)/10;
  }
  function rowMatchesCategory(r,cat){
    if(Array.isArray(cat)) return cat.includes('全て') || cat.some(c=>rowMatchesCategory(r,c));
    if(!cat || cat==='全て') return true;
    const rowCat=normalizeCategoryLabel(r&&r.category||'');
    const target=normalizeCategoryLabel(cat);
    const strict=normalizeCategoryLabel([r&&r.grade,r&&r.surface,r&&r.condition].filter(Boolean).join('/'));
    if(!rowCat && !strict) return false;
    // グレードは完全に別扱いにする。
    // 特別1勝/特別2勝/特別3勝 と 1勝/2勝/3勝 は親子一致させない。
    // CSV候補はカテゴリー完全一致のみ。判定別以外の候補は広く使うが、別グレード混入は防ぐ。
    if(r && r.candidateSource==='rankingCsv') return rowCat===target || strict===target;
    // 保存レース由来の現状候補も基本は完全一致。全体条件だけは raceMatchesCategory 側で扱う。
    return rowCat===target || strict===target;
  }
  function clonePlain(obj){
    try{return JSON.parse(JSON.stringify(obj||{}));}
    catch(e){return Object.assign({},obj||{});}
  }
  function sameMetricSet(a,b){
    a=a||{}; b=b||{};
    const keys=['axisPlaceRate','axisPlace','allReturn','umarenReturn','wideReturn','sanrenpukuReturn','umarenHit','wideHit','sanrenpukuHit','hitRate'];
    return keys.every(k=>Math.abs(num(a[k])-num(b[k]))<0.05);
  }
  function sameCategoryKey(a,b){
    return String(a||'').replace(/\s+/g,'')===String(b||'').replace(/\s+/g,'');
  }
  function activeRuleForCategory(cat){
    try{
      const r=S.getRule&&S.getRule(cat);
      return r&&r.active?r:null;
    }catch(e){return null;}
  }
  function isAlreadyAppliedCandidate(cat,cur,row){
    const rule=activeRuleForCategory(cat);
    if(!rule) return false;
    const p=rule.proposal||{};
    // 反映済みルールと同じ候補を再度「提案」に出すと、
    // 現状と提案が同一化して比較が崩れるため除外する。
    if(sameCategoryKey(row&&row.category,p.category) && sameMetricSet(row,p)) return true;
    if(sameCategoryKey(row&&row.category,cat) && sameMetricSet(row,cur)) return true;
    return false;
  }
  function normalConsultCandidatesFor(cats,prefs,cur){
    // ランキングCSV相談時も、CSV候補だけで決めず、通常相談で出る候補と同じ土俵で比較する。
    // 通常相談候補は保存レース由来の現状/カテゴリー候補＋コメント実測候補。
    cats=Array.isArray(cats)?cats:[cats||'全て'];
    const baseCats=[...new Set(S.loadRaces().map(categoryKeyOfRace))].filter(Boolean);
    let out=baseCats.map(currentStats).filter(x=>rowMatchesCategory(x,cats)).map(x=>{
      const r=clonePlain(x);
      r.candidateSource='normalConsult';
      r.candidateKind='通常相談';
      r.rankingSection='通常相談';
      r.basis=r.basis||'通常相談';
      return r;
    });
    if(!out.length && cur){
      const r=clonePlain(cur);
      r.candidateSource='normalConsult';
      r.candidateKind='通常相談';
      r.rankingSection='通常相談';
      r.basis=r.basis||'通常相談';
      out=[r];
    }
    const sim=commentSimulationCandidates(cats,prefs,cur).map(x=>{
      const r=clonePlain(x);
      r.candidateSource=r.candidateSource||'commentSimulation';
      r.candidateKind=r.candidateKind||'相談コメント実測';
      r.rankingSection=r.rankingSection||'相談コメント';
      return r;
    });
    return [...out,...sim];
  }

  function mergeAuxiliaryCandidateWithCurrentMetrics(r,cur){
    // 属性/補助ランキングは、CSVの回収率をそのまま採用後成績として使わず、
    // 属性名を軸条件へ変換して保存レースを再予想する。
    r=Object.assign({},r||{}); cur=cur||{};
    if(!(r.isAttributeRanking || isAuxiliaryRuleRankingSection(r.rankingSection||r.basis))) return r;
    const label=attributeLabelFromConsultCandidate(r);
    const cat=r.category || cur.category;
    const sim=currentStatsWithAttributeRule(cat,label,r);
    if(sim){
      sim.candidateKind=r.isAttributeRanking?'属性ランキング実測':(r.candidateKind||'補助ランキング実測');
      sim.attributeHintOnly=false;
      sim.score=scoreCandidate(sim,{},cur);
      return sim;
    }
    // 変換不能な補助候補だけは現状値固定の参考扱いにする。
    const keepKeys=['allReturn','hitRate','axisWin','axisWinRate','axisPlace','axisPlaceRate','umarenReturn','umarenHit','wideReturn','wideHit','sanrenpukuReturn','sanrenpukuHit'];
    keepKeys.forEach(k=>{
      if(k==='axisPlace' || k==='axisPlaceRate') r[k]=metricValue(cur,'axisPlaceRate','axisPlace');
      else if(k==='axisWin' || k==='axisWinRate') r[k]=metricValue(cur,'axisWinRate','axisWin');
      else r[k]=metricValue(cur,k);
    });
    r.candidateKind=r.candidateKind||'補助ランキング参考';
    r.attributeHintOnly=true;
    if(!r.ruleText) r.ruleText='補助ランキング参考';
    return r;
  }


  function hasCommentConsult(prefs){
    const intent=(prefs&&prefs.commentIntent)||parseConsultComment(prefs&&prefs.comment||'');
    return !!(intent&&intent.hasComment);
  }
  function hasRankingCsvConsult(){
    return (loadRows()||[]).some(r=>isDirectRuleCandidate(r));
  }
  function normalizeCandidateForCompare(r,cur,sourceLabel){
    let rr=annotateAuxiliaryCandidate(clonePlain(r||{}));
    rr=mergeAuxiliaryCandidateWithCurrentMetrics(rr,cur);
    rr.consultSourceLabel=sourceLabel||rr.candidateKind||rr.candidateSource||'候補';
    rr.score=Math.round(scoreCandidate(rr,{},cur)*10)/10;
    return rr;
  }
  function bestCandidateFromRows(rows,cur,prefs,sourceLabel){
    rows=(rows||[]).filter(Boolean).map(r=>{
      let rr=normalizeCandidateForCompare(r,cur,sourceLabel);
      rr.score=Math.round(scoreCandidate(rr,prefs,cur)*10)/10;
      return rr;
    }).filter(r=>!hasTicketMetricZeroDrop(cur,r));
    if(!rows.length) return null;
    rows.sort((a,b)=>{
      const cmp=compareProposalCandidates(a,b,cur);
      if(cmp) return cmp;
      const src=rankingSourcePriority(b)-rankingSourcePriority(a);
      if(src) return src;
      const ar=allReturnDelta(cur,b)-allReturnDelta(cur,a);
      if(Math.abs(ar)>0.05) return ar;
      const ax=axisPlaceDelta(cur,b)-axisPlaceDelta(cur,a);
      if(Math.abs(ax)>0.05) return ax;
      return (b.score||0)-(a.score||0);
    });
    const best=clonePlain(rows[0]);
    best.groupRows=rows.slice(0,20);
    return best;
  }
  function normalBaseCandidatesFor(cats,prefs,cur){
    cats=Array.isArray(cats)?cats:[cats||'全て'];
    const baseCats=[...new Set(S.loadRaces().map(categoryKeyOfRace))].filter(Boolean);
    let out=baseCats.map(currentStats).filter(x=>rowMatchesCategory(x,cats)).map(x=>{
      const r=clonePlain(x);
      r.candidateSource='normalConsult';
      r.candidateKind='通常相談';
      r.rankingSection='通常相談';
      r.basis=r.basis||'AIカルテ通常相談';
      r.consultSourceLabel='通常相談';
      return r;
    });
    if(!out.length && cur){
      const r=clonePlain(cur);
      r.candidateSource='normalConsult';
      r.candidateKind='通常相談';
      r.rankingSection='通常相談';
      r.basis=r.basis||'AIカルテ通常相談';
      r.consultSourceLabel='通常相談';
      out=[r];
    }
    return out;
  }
  function csvConsultCandidatesFor(cats,prefs,cur){
    cats=Array.isArray(cats)?cats:[cats||'全て'];
    return (loadRows()||[]).filter(r=>isDirectRuleCandidate(r) && rowMatchesCategory(r,cats)).map(r=>{
      const rr=clonePlain(r);
      rr.consultSourceLabel='ランキングCSV相談';
      return rr;
    });
  }
  function commentConsultCandidatesFor(cats,prefs,cur){
    if(!hasCommentConsult(prefs)) return [];
    return commentSimulationCandidates(cats,prefs,cur).map(x=>{
      const r=clonePlain(x);
      r.candidateSource=r.candidateSource||'commentSimulation';
      r.candidateKind=r.candidateKind||'コメント相談';
      r.rankingSection=r.rankingSection||'相談コメント';
      r.consultSourceLabel='コメント相談';
      return r;
    });
  }

  function candidatesFor(cats,prefs){
    cats=Array.isArray(cats)?cats:[cats||'全て'];
    const cur=currentStats(cats);
    const groups=[];

    // 通常相談：常に作成。AIカルテ（prefs.aiCarry）をスコア/優先順位に使う。
    const normalBest=bestCandidateFromRows(normalBaseCandidatesFor(cats,prefs,cur),cur,prefs,'通常相談');
    if(normalBest) groups.push(normalBest);

    // ランキングCSV相談：CSVが読み込まれている時だけ比較対象にする。
    if(hasRankingCsvConsult()){
      const csvBest=bestCandidateFromRows(csvConsultCandidatesFor(cats,prefs,cur),cur,prefs,'ランキングCSV相談');
      if(csvBest) groups.push(csvBest);
    }

    // コメント相談：コメントがある時だけ比較対象にする。コメントが無ければ省く。
    if(hasCommentConsult(prefs)){
      const commentBest=bestCandidateFromRows(commentConsultCandidatesFor(cats,prefs,cur),cur,prefs,'コメント相談');
      if(commentBest) groups.push(commentBest);
    }

    if(!groups.length) groups.push(normalizeCandidateForCompare(cur,cur,'通常相談'));

    const primaryCat=(cats&&cats.length===1)?cats[0]:'';
    let mapped=groups.map(r=>{
      const rr=clonePlain(r);
      if(rr.candidateSource==='rankingCsv'){
        if(isPrimaryRuleRankingSection(rr.rankingSection||rr.basis)) rr.score=(rr.score||0)+60;
        else if(isAuxiliaryRuleRankingSection(rr.rankingSection||rr.basis)) rr.score=(rr.score||0)+20;
      }
      return rr;
    });

    if(primaryCat && primaryCat!=='全て'){
      const filtered=mapped.filter(r=>!isAlreadyAppliedCandidate(primaryCat,cur,r));
      if(filtered.length) mapped=filtered;
    }

    const safeMapped=mapped.filter(r=>!hasTicketMetricZeroDrop(cur,r));
    if(safeMapped.length) mapped=safeMapped;

    // 利用可能な相談だけを同じ定義で比較する。
    // CSVが無ければCSV相談を省き、コメントが無ければコメント相談を省く。
    // 最終提案は、全体回収率+5%以上、同等時は軸複勝率+1%以上または各馬券回収率+5%以上改善、0%落ちは除外。
    return mapped.sort((a,b)=>{
      const cmp=compareProposalCandidates(a,b,cur);
      if(cmp) return cmp;
      const ar=allReturnDelta(cur,b)-allReturnDelta(cur,a);
      if(Math.abs(ar)>0.05) return ar;
      const ax=axisPlaceDelta(cur,b)-axisPlaceDelta(cur,a);
      if(Math.abs(ax)>0.05) return ax;
      const td=maxTicketMetricImprovement(cur,b)-maxTicketMetricImprovement(cur,a);
      if(Math.abs(td)>0.05) return td;
      return (b.score||0)-(a.score||0);
    }).slice(0,10);
  }
  function pickBestForCat(cat,prefs){
    // 全カテゴリーで集約したAIカルテをそのまま各カテゴリーへ配ると、
    // G3の失敗候補がG1にも同じ回数で出てしまう。
    // そのため、カテゴリー別提案では対象カテゴリーから再抽出した完全一致候補を優先する。
    const checkedCarry=(prefs&&prefs.aiCarry)||[];
    const checkedExact=filterCarryForCategory(checkedCarry,cat,'exact');
    const checkedReference=filterCarryForCategory(checkedCarry,cat,'reference');
    // 相談前にユーザーがチェックしたテーマを最優先する。
    // チェック済みが無い経路だけ、旧データからカテゴリー別に再抽出する。
    const categoryExact=checkedCarry.length ? [] : exactCarryHintsForCategory(cat,12);
    const exact=checkedExact.length ? checkedExact : categoryExact;
    const reference=checkedReference;
    const scoped=Object.assign({},prefs||{}, {aiCarry: exact.length?exact:reference});
    rebuildAiCarryByKind(scoped);
    const cur=clonePlain(currentStats([cat]));
    const rows=candidatesFor([cat],scoped).map(clonePlain);
    // 表示・判定で使う同じ指標に基づき、改善条件を満たす候補を優先して best にする。
    // これにより「画面では 0%→23.7% と見えるが、別データ判定で0件になる」ズレを防ぐ。
    const improvingRow=rows.find(r=>proposalImprovesAgainst(cur,r));
    let best=improvingRow?clonePlain(improvingRow):(rows[0]?clonePlain(rows[0]):clonePlain(cur));
    // 安全策：同じ参照・同じ数値を提案として持たない。
    // 差分がない場合は「確認」として扱えるよう current/best を別オブジェクトにする。
    if(best===cur) best=clonePlain(cur);
    return {category:cat,current:cur,best,rows,prefs:scoped,exactCarry:exact,referenceCarryItems:reference,referenceCarry:!exact.length&&reference.length};
  }
  function selectedProposalIndices(){
    // 最終採用確認で「採用」を選んだカテゴリーだけ反映対象にする。
    const radios=[...document.querySelectorAll('input.proposalDecision[value=adopt]:checked')];
    if(radios.length){
      return radios.map(c=>parseInt(c.dataset.idx,10)).filter(n=>Number.isFinite(n));
    }
    // 旧DOM互換：古い採用チェックが残っている場合のみ拾う。
    const checks=[...document.querySelectorAll('.proposalAdoptCheck:checked')];
    return checks.map(c=>parseInt(c.dataset.idx,10)).filter(n=>Number.isFinite(n));
  }


  function categoryMetricDiffsForProposal(it){
    it=it||{};
    const cur=it.current||{};
    const best=it.best||it.proposal||{};
    return {
      allReturn: round1(metricValue(best,'allReturn','allReturnRate')-metricValueForSummary(cur,'allReturn')),
      axisPlaceRate: round1(metricValue(best,'axisPlaceRate','axisPlace')-metricValueForSummary(cur,'axisPlaceRate')),
      umarenReturn: round1(metricValue(best,'umarenReturn','umarenReturnRate')-metricValueForSummary(cur,'umarenReturn')),
      wideReturn: round1(metricValue(best,'wideReturn','wideReturnRate')-metricValueForSummary(cur,'wideReturn')),
      sanrenpukuReturn: round1(metricValue(best,'sanrenpukuReturn','sanrenpukuReturnRate')-metricValueForSummary(cur,'sanrenpukuReturn'))
    };
  }
  function metricDiffForPart(it, part){
    const d=categoryMetricDiffsForProposal(it);
    // 部分チェックはカテゴリー単体の改善幅で判定する。
    // 軸=軸複勝率+1%以上、各馬券=回収率+5%以上改善した項目だけに限定する。
    if(part==='axis') return d.axisPlaceRate;
    if(part==='umaren') return d.umarenReturn;
    if(part==='wide') return d.wideReturn;
    if(part==='sanrenpuku') return d.sanrenpukuReturn;
    return 0;
  }
  function requiredRacesForConsultCategory(label){
    const t=String(label||'');
    // カテゴリートータル判定：G1/J重賞は2R、その他は3R。
    // 検証結果側のカテゴリー掲載判定と同じ基準で、部分反映の手動チェック可否を決める。
    if(/(^|\s|\/)J?-?G1(\s|\/|$)|J-G2|J-G3/.test(t)) return 2;
    return 3;
  }
  function categoryHitSwitchSatisfiedForStats(st){
    st=st||{};
    const anyHit=num(st.anyHitCount||st.hitCount||st.hitRaceCount||0);
    const uh=num(st.umarenHitCount||st.umarenHitRaceCount||0);
    const wh=num(st.wideHitCount||st.wideHitRaceCount||0);
    const th=num(st.sanrenpukuHitCount||st.trioHitCount||st.sanrenpukuHitRaceCount||0);
    if(anyHit || uh || wh || th){
      return anyHit>=3 && Math.max(uh,wh,th)>=2;
    }
    // CSV候補など的中レース数を持たない場合は、対象Rと率から概算する。
    const n=Math.max(0,num(st.doneR),num(st.totalR),num(st.races));
    if(!n) return false;
    const uh2=Math.round(n*num(st.umarenHit||st.umarenHitRate||0)/100);
    const wh2=Math.round(n*num(st.wideHit||st.wideHitRate||0)/100);
    const th2=Math.round(n*num(st.sanrenpukuHit||st.sanrenpukuHitRate||0)/100);
    const any2=Math.round(n*num(st.hitRate||st.allHit||0)/100);
    return any2>=3 && Math.max(uh2,wh2,th2)>=2;
  }
  function consultActualTotalStatsForCategory(cat){
    try{
      const races=S.loadRaces().filter(r=>raceMatchesCategory(r,cat));
      const done=races.filter(r=>!C.resultMissing(r.result));
      let anyHit=0, by={umaren:0,wide:0,sanrenpuku:0};
      done.forEach(r=>{
        const p=r.prediction||{}, res=C.autoResultCombos(r.result||{});
        let any=false;
        ['umaren','wide','sanrenpuku'].forEach(k=>{
          const arr=(p[k]||[]).map(C.comboKey).filter(Boolean);
          if(!arr.length) return;
          const hit=arr.some(x=>(res[k]||[]).includes(x));
          if(hit){ by[k]++; any=true; }
        });
        if(any) anyHit++;
      });
      return {doneR:done.length,totalR:races.length,anyHitCount:anyHit,umarenHitCount:by.umaren,wideHitCount:by.wide,sanrenpukuHitCount:by.sanrenpuku};
    }catch(e){ return {}; }
  }
  function categoryTotalJudgmentSatisfied(it){
    it=it||{};
    const cat=it.category || (it.best&&it.best.category) || (it.current&&it.current.category) || '';
    const need=requiredRacesForConsultCategory(cat);
    const actual=consultActualTotalStatsForCategory(cat);
    const n=Math.max(0,
      num(actual.doneR),
      num(it.current&&it.current.totalR), num(it.current&&it.current.doneR), num(it.current&&it.current.races),
      num(it.best&&it.best.totalR), num(it.best&&it.best.doneR), num(it.best&&it.best.races),
      num(it.totalR), num(it.doneR), num(it.races),
      proposalDisplayRaceCount(it.best||{},it.current||{},it)
    );
    if(n<need) return false;
    // トータル判定の切り替え定義：的中レース3R以上、かつ1券種以上で2R以上的中。
    return categoryHitSwitchSatisfiedForStats(actual) || categoryHitSwitchSatisfiedForStats(it.current||{}) || categoryHitSwitchSatisfiedForStats(it.best||{}) || categoryHitSwitchSatisfiedForStats(it);
  }
  function partImprovementThreshold(part){
    // 部分チェック採用：軸複勝率は +1%以上、各馬券回収率は +5%以上改善が必要。
    return part==='axis' ? 1.0 : 5.0;
  }
  function defaultPartChecked(it, part){
    return metricDiffForPart(it,part)>=partImprovementThreshold(part);
  }
  function partCanManualCheck(it, part){
    // 全体採用・部分採用とも、カテゴリートータル判定必要条件を満たしたものだけ対象。
    if(!categoryTotalJudgmentSatisfied(it)) return false;
    return defaultPartChecked(it,part);
  }
  function hasPartialPartImprovement(it){
    return ['axis','umaren','wide','sanrenpuku'].some(part=>defaultPartChecked(it,part));
  }
  function ticketReturnDiffsForProposal(it, overallCurrent){
    const d=categoryMetricDiffsForProposal(it);
    return [round1(d.umarenReturn||0), round1(d.wideReturn||0), round1(d.sanrenpukuReturn||0)];
  }
  function fullAdoptCondition(it, overallCurrent){
    if(!categoryTotalJudgmentSatisfied(it)) return false;
    const catD=categoryMetricDiffsForProposal(it);
    const allD=round1(catD.allReturn||0);
    const axisD=round1(catD.axisPlaceRate||0);
    const ticketDs=[round1(catD.umarenReturn||0), round1(catD.wideReturn||0), round1(catD.sanrenpukuReturn||0)];
    const improved=ticketDs.filter(x=>x>0.05).length;
    const unchanged=ticketDs.filter(x=>Math.abs(x)<=0.05).length;
    const worsened=ticketDs.filter(x=>x<-0.05).length;
    const allTicketPlus5=ticketDs.every(x=>x>=5.0);
    // 採用判定はカテゴリー単体の改善幅だけで判定する。
    // 全体425Rへ反映した影響は参考表示のみで、判定には使わない。
    return allD>=5.0 && axisD>=0 && worsened===0 && (allTicketPlus5 || (improved>=2 && unchanged>=1));
  }
  function partialAdoptCondition(it, overallCurrent){
    if(!categoryTotalJudgmentSatisfied(it)) return false;
    const catD=categoryMetricDiffsForProposal(it);
    const allD=round1(catD.allReturn||0);
    const axisD=round1(catD.axisPlaceRate||0);
    const ticketDs=[round1(catD.umarenReturn||0), round1(catD.wideReturn||0), round1(catD.sanrenpukuReturn||0)];
    const ticketReturn5=ticketDs.some(x=>x>=5.0);
    // 保留判定もカテゴリー単体の改善幅だけで判定する。
    // 全体425Rへ反映した影響は参考表示のみで、判定には使わない。
    return allD>=-0.05 && axisD>=1.0 && ticketReturn5;
  }
  function hasZeroRiskForProposal(it){
    it=it||{};
    const cur=it.current||it.cur||{};
    const best=it.best||it.proposal||{};
    return hasProposedZeroMetric(best) || hasTicketMetricZeroDrop(cur,best);
  }
  function zeroRiskPartialProposalAllowed(it, overallCurrent){
    try{
      it=it||{};
      if(!categoryTotalJudgmentSatisfied(it)) return false;
      if(!hasZeroRiskForProposal(it)) return false;
      const proj=projectedOverallMetricsForProposal(it, overallCurrent||((loadLast()&&loadLast().current)||{}));
      const allD=proj&&proj.diff ? round1(proj.diff.allReturn||0) : round1(metricValue((it.best||{}),'allReturn')-metricValue((it.current||{}),'allReturn'));
      if(allD<=0.05) return false;
      return hasPartialPartImprovement(it);
    }catch(e){
      return false;
    }
  }
  function partLabel(part){
    return part==='axis'?'軸':(part==='umaren'?'馬連':(part==='wide'?'ワイド':'3連複'));
  }
  function partSelectionHtml(it,i,decision){
    if(!decision || decision.status!=='保留') return '';
    const totalOk=categoryTotalJudgmentSatisfied(it);
    const zeroPartial=zeroRiskPartialProposalAllowed(it);
    const parts=['axis','umaren','wide','sanrenpuku'];
    const checks=parts.map(part=>{
      const def=!!defaultPartChecked(it,part);
      const can=partCanManualCheck(it,part);
      const checked=def?'checked="checked"':'';
      const disabled=can?'':'disabled="disabled"';
      const mark=def?'☑':'☐';
      const d=metricDiffForPart(it,part);
      const title=can ? `${partLabel(part)}：${d>=0?'+':''}${d}%` : `${partLabel(part)}：改善なしまたは判定未達のため登録不可`;
      const cls=can?'checkLine partCheckLine':'checkLine partCheckLine disabled';
      return `<label class="${cls}" title="${safe(title)}"><input class="proposalPartCheck" data-idx="${i}" data-part="${part}" data-default-checked="${def?'1':'0'}" type="checkbox" ${checked} ${disabled} onchange="KV2RuleConsult.markPartialEdited(this);KV2RuleConsult.updatePartialPartCheckMarks();"> <span class="partCheckMark">${mark}</span> ${partLabel(part)}</label>`;
    }).join('');
    const modeText=zeroPartial
      ? 'カテゴリートータル判定を満たしており、全体回収率改善と部分チェック改善項目があるため提案表示しています。0%になる項目があるため全項目一括反映はせず、改善項目だけ部分チェックで反映できます。'
      : (totalOk
        ? 'カテゴリートータル判定を満たしているため、軸+1%以上・各馬券+5%以上改善した項目だけチェックして反映できます。'
        : 'カテゴリートータル判定未達のため、判定未達のため登録できません。');
    return `<div class="partialAdoptBox" data-idx="${i}" data-zero-partial="${zeroPartial?'1':'0'}" style="display:none;margin-top:8px;padding:8px;border:1px dashed #cbd5e1;border-radius:8px;background:#f8fafc;">
      <div class="subtle"><b>部分反映</b>：保留を採用する場合は、チェックした改善項目だけ反映します。軸複勝率は+1%以上、各馬券回収率は+5%以上改善した項目を自動でチェックしています。${safe(modeText)}</div>
      <div class="checkGrid partCheckGrid">${checks}</div>
    </div>`;
  }
  function markPartialEdited(el){
    try{ if(el) el.dataset.userEdited='1'; }catch(e){}
  }
  function updatePartialPartCheckMarks(){
    try{
      document.querySelectorAll('.proposalPartCheck').forEach(c=>{
        const mark=c.parentElement&&c.parentElement.querySelector ? c.parentElement.querySelector('.partCheckMark') : null;
        if(mark) mark.textContent=c.checked?'☑':'☐';
      });
    }catch(e){}
  }
  function resetPartialChecksToDefault(box){
    try{
      box.querySelectorAll('.proposalPartCheck').forEach(c=>{
        if(c.dataset.userEdited==='1') return;
        c.checked=String(c.getAttribute('data-default-checked')||'0')==='1';
      });
      updatePartialPartCheckMarks();
    }catch(e){}
  }
  function updatePartialAdoptBoxes(){
    try{
      document.querySelectorAll('.partialAdoptBox').forEach(box=>{
        const idx=box.getAttribute('data-idx');
        const adopt=document.querySelector(`input.proposalDecision[data-idx="${idx}"][value="adopt"]`);
        const show=!!(adopt&&adopt.checked);
        box.style.display=show?'block':'none';
        if(show && box.dataset.defaultApplied!=='1'){
          resetPartialChecksToDefault(box);
          box.dataset.defaultApplied='1';
        }
      });
      updatePartialPartCheckMarks();
    }catch(e){}
  }
  function selectedProposalParts(idx){
    const boxes=[...document.querySelectorAll(`.proposalPartCheck[data-idx="${idx}"]`)];
    if(!boxes.length) return ['axis','umaren','wide','sanrenpuku'];
    return boxes.filter(c=>c.checked).map(c=>c.getAttribute('data-part')).filter(Boolean);
  }
  function mergePartialBest(current,best,parts){
    current=clonePlain(current||{}); best=clonePlain(best||{}); parts=Array.isArray(parts)?parts:[];
    if(!parts.length) return Object.assign({},current,{partialParts:[],ruleText:(current.ruleText||'現状維持')+'（部分採用なし）'});
    if(parts.length>=4) return best;
    const out=Object.assign({},current);
    const has=(p)=>parts.includes(p);
    if(has('axis')){
      ['axisPlace','axisPlaceRate','score'].forEach(k=>{ if(best[k]!=null) out[k]=best[k]; });
    }
    if(has('umaren')) ['umarenReturn','umarenHit'].forEach(k=>{ if(best[k]!=null) out[k]=best[k]; });
    if(has('wide')) ['wideReturn','wideHit'].forEach(k=>{ if(best[k]!=null) out[k]=best[k]; });
    if(has('sanrenpuku')) ['sanrenpukuReturn','sanrenpukuHit'].forEach(k=>{ if(best[k]!=null) out[k]=best[k]; });
    const ticketParts=['umaren','wide','sanrenpuku'];
    const selectedTickets=ticketParts.filter(has);
    if(selectedTickets.length){
      const retKeys={umaren:'umarenReturn',wide:'wideReturn',sanrenpuku:'sanrenpukuReturn'};
      const hitKeys={umaren:'umarenHit',wide:'wideHit',sanrenpuku:'sanrenpukuHit'};
      let retDelta=0, hitDelta=0;
      selectedTickets.forEach(part=>{
        retDelta += metricValue(best,retKeys[part])-metricValue(current,retKeys[part]);
        hitDelta += metricValue(best,hitKeys[part])-metricValue(current,hitKeys[part]);
      });
      out.allReturn=round1(metricValue(current,'allReturn') + retDelta/3);
      out.hitRate=round1(metricValue(current,'hitRate') + hitDelta/3);
    }
    out.partialParts=parts.slice();
    out.ruleText=`部分採用：${parts.map(partLabel).join('・')} / ${best.ruleText||best.basis||'比較結果'}`;
    out.basis=out.ruleText;
    return out;
  }

  function proposalCardsFast(items){
    if(!items || !items.length) return '<div class="card"><div class="hint">対象カテゴリーがありません。</div></div>';
    const rows=items.map((it,i)=>{
      const cur=it.current||{}, b=it.best||{};
      const cat=optionLabel(it.category||(b&&b.category)||'全て');
      return `<tr><td>${i+1}</td><td class="left">${safe(cat)}</td><td>${b.races||b.doneR||b.totalR||cur.doneR||0}</td><td>${cur.axisPlaceRate||0}% → <b>${b.axisPlace||b.axisPlaceRate||0}%</b></td><td>${cur.allReturn||0}% → <b>${b.allReturn||0}%</b></td><td>${cur.umarenReturn||0}% → <b>${b.umarenReturn||0}%</b></td><td>${cur.wideReturn||0}% → <b>${b.wideReturn||0}%</b></td><td>${cur.sanrenpukuReturn||0}% → <b>${b.sanrenpukuReturn||0}%</b></td><td>${b.score||0}</td></tr>`;
    }).join('');
    return `<div class="card"><div class="title">カテゴリー別 比較結果</div><div class="hint">全カテゴリー相談用の軽量表示です。詳細確認が必要なカテゴリーは、対象カテゴリーを個別に選んで相談してください。</div><div class="tableWrap"><table class="consultTable"><thead><tr><th>順位</th><th>カテゴリー</th><th>対象R</th><th>軸複勝率</th><th>全体回収率</th><th>馬連</th><th>ワイド</th><th>3連複</th><th>スコア</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }
  function fastAdoptionDecision(cur,b){
    cur=cur||{}; b=b||{};
    const n=num(b.races||b.doneR||b.totalR||cur.doneR||cur.totalR||0);
    const axisNow=num(cur.axisPlaceRate);
    const axisNext=num(b.axisPlace||b.axisPlaceRate);
    const diffs=[
      {key:'axis', label:'軸複勝率', d:round1(axisNext-axisNow)},
      {key:'all', label:'全体回収率', d:round1(num(b.allReturn)-num(cur.allReturn))},
      {key:'umaren', label:'馬連回収率', d:round1(num(b.umarenReturn)-num(cur.umarenReturn))},
      {key:'wide', label:'ワイド回収率', d:round1(num(b.wideReturn)-num(cur.wideReturn))},
      {key:'tri', label:'3連複回収率', d:round1(num(b.sanrenpukuReturn)-num(cur.sanrenpukuReturn))}
    ];
    const improves=diffs.filter(x=>x.d>0.1);
    const regressions=diffs.filter(x=>x.d<-0.1);
    const sameMetrics=!improves.length && !regressions.length;
    const tooFew=n<3;
    const axisLargeDown=diffs[0].d<=-5;
    const zeroDrop=hasTicketMetricZeroDrop(cur,b);
    const ticket5=maxTicketMetricImprovement(cur,b)>=5.0;
    const proposalOk=proposalImprovesAgainst(cur,b);
    const axisOkForAdopt=axisWorsenAllowedForAdopt(diffs[0].d);
    // 自動採用は共通提案条件に統一。
    // 1) 全体回収率が5%以上改善
    // 2) 全体回収率が同等で、軸複勝率または各馬券の的中率/回収率が5%以上改善
    // ただし、各馬券どれかが的中率または回収率0%へ下がる候補は除外する。
    // さらにAI推奨「採用」は、軸複勝率の悪化が -1.0pt 未満に収まる候補だけにする。
    const adopt=(!tooFew && proposalOk && !zeroDrop && !sameMetrics && axisOkForAdopt);
    let status='条件検討';
    if(adopt) status='採用';
    else if(!tooFew && proposalOk && !zeroDrop) status='保留';
    else if(!tooFew && ticket5 && !zeroDrop) status='保留';
    const reasons=[];
    if(tooFew) reasons.push('対象R不足');
    if(zeroDrop) reasons.push('的中率/回収率0%落ちのため除外');
    if(sameMetrics) reasons.push('差分なし');
    if(diffs[1].d>=5.0) reasons.push('改善：全体回収率5%以上');
    else if(Math.abs(diffs[1].d)<=0.1 && diffs[0].d>0.1) reasons.push('全体回収率同率：軸複勝率改善');
    if(ticket5) reasons.push(adopt?'馬券別で5%以上改善':'馬券別5%以上改善');
    if(improves.length && !reasons.some(x=>/^改善/.test(x))) reasons.push('改善：'+improves.map(x=>x.label).join('・'));
    if(regressions.length) reasons.push('悪化：'+regressions.map(x=>x.label).join('・'));
    if(!axisOkForAdopt && proposalOk) reasons.push('軸複勝率が1%以上悪化するため保留');
    if(axisLargeDown && !regressions.some(x=>x.key==='axis')) reasons.push(`軸複勝率 ${Math.abs(diffs[0].d)}%低下`);
    if(!reasons.length) reasons.push('改善なし');
    return {adopt,status,n,axisD:diffs[0].d,allD:diffs[1].d,umD:diffs[2].d,wideD:diffs[3].d,triD:diffs[4].d,improves,regressions,reasons,sameMetrics,tooFew,zeroDrop,ticket5,axisOkForAdopt};
  }

  function consultMetricDefs(){
    return [
      ['全体回収率','allReturn','allReturn'],
      ['全体的中率','hitRate','hitRate'],
      ['軸単勝率','axisWinRate','axisWinRate'],
      ['軸複勝率','axisPlaceRate','axisPlaceRate','axisPlace'],
      ['馬連 的中率','umarenHit','umarenHit','hitRate'],
      ['馬連 回収率','umarenReturn','umarenReturn'],
      ['ワイド 的中率','wideHit','wideHit','hitRate'],
      ['ワイド 回収率','wideReturn','wideReturn'],
      ['3連複 的中率','sanrenpukuHit','sanrenpukuHit','hitRate'],
      ['3連複 回収率','sanrenpukuReturn','sanrenpukuReturn']
    ];
  }
  function metricValueForSummary(obj,key){
    obj=obj||{};
    if(key==='axisPlaceRate') return num(obj.axisPlaceRate!==undefined?obj.axisPlaceRate:obj.axisPlace);
    if(key==='axisWinRate') return num(obj.axisWinRate!==undefined?obj.axisWinRate:obj.axisWin);
    if(key==='hitRate') return num(obj.hitRate!==undefined?obj.hitRate:obj.allHit);
    return num(obj[key]);
  }
  function metricRaceCountForSummary(obj){
    obj=obj||{};
    return Math.max(0,num(obj.doneR||obj.totalR||obj.races||0));
  }
  function projectedSummaryFromInitialDecisions(items,current){
    // 上部サマリーは「採用候補をすべて反映した場合の全体成績（見込み）」として表示する。
    // カテゴリー単体の平均ではなく、現在の全体成績から採用ONのカテゴリー分だけ差し替える。
    current=current||{};
    items=Array.isArray(items)?items:[];
    const totalN=metricRaceCountForSummary(current);
    const out=Object.assign({},current,{summaryBasis:'initial-selection',adoptedCategories:0});
    if(!items.length || !totalN) return out;
    const defs=consultMetricDefs();
    const delta={}; defs.forEach(([,key])=>delta[key]=0);
    let adopted=0;
    let improveCount=0, worsenCount=0, refCount=0, keepCount=0;
    items.forEach(it=>{
      const cur=(it&&it.current)||{};
      const best=(it&&it.best)||{};
      const dec=consultUnifiedDecision(it,current);
      const dn=proposalDisplayRaceCount(best,cur,it)||metricRaceCountForSummary(cur)||metricRaceCountForSummary(best);
      if(dn<3) refCount++;
      else if(dec.status==='採用') improveCount++;
      else if(dec.status==='保留') worsenCount++;
      else keepCount++;
      // 上部サマリーは、初期選択が採用のカテゴリーだけを反映した見込みで計算する。
      if(dec.status!=='採用') return;
      const n=Math.min(totalN, proposalDisplayRaceCount(best,cur,it)||metricRaceCountForSummary(cur)||metricRaceCountForSummary(best));
      if(!n) return;
      adopted++;
      defs.forEach(([,key,bestKey,bestAlt])=>{
        const beforeCat=metricValueForSummary(cur,key);
        const afterCat=(bestKey==='axisPlaceRate') ? metricValue(best,'axisPlaceRate','axisPlace') : (bestKey==='hitRate'? metricValue(best,'hitRate','allHit') : metricValue(best,bestKey,bestAlt));
        delta[key]+=((afterCat-beforeCat)*n/totalN);
      });
    });
    out.adoptedCategories=adopted;
    out.improveCategories=improveCount;
    out.worsenCategories=worsenCount;
    out.referenceCategories=refCount;
    out.keepCategories=keepCount;
    out.totalCandidateCategories=items.length;
    if(!adopted) return out;
    defs.forEach(([,key])=>{ out[key]=round1(metricValueForSummary(current,key)+delta[key]); });
    out.axisPlace=out.axisPlaceRate;
    return out;
  }


  function categoryImpactPreviewHtml(it){
    const rows=categoryMetricRowsForProposal(it);
    const rowHtml=rows.map(r=>{
      const cls=r.status==='improve'?'improve':(r.status==='down'?'bad':'');
      const sign=r.diff>0?'+':'';
      return `<tr><td>${safe(r.label)}</td><td>${r.before}%</td><td>${r.after}%</td><td class="${cls}">${r.diff!==0?`${sign}${r.diff}%`:'0%'}</td></tr>`;
    }).join('');
    return `<div class="adoptionCategoryImpact" style="margin-top:8px;border:1px solid #e5e7eb;background:#fff;border-radius:8px;padding:8px;line-height:1.5;">
      <b>採用した場合のカテゴリー成績</b>
      <div class="tableWrap" style="margin-top:6px;"><table class="miniStats"><tr><th>指標</th><th>現在</th><th>採用後</th><th>差分</th></tr>${rowHtml}</table></div>
    </div>`;
  }

  function finalAdoptionChecklistFast(items){
    if(!items || !items.length) return '';
    const rows=items.map((it,i)=>{
      const cur=it.current||{}, b=it.best||{};
      const cat=optionLabel(it.category||(b&&b.category)||'全て');
      const d=consultUnifiedDecision(it, window.__kv2ConsultCurrentStats || {});
      const n=proposalDisplayRaceCount(b,cur,it)||metricRaceCountForSummary(cur)||metricRaceCountForSummary(b);
      const adoptChecked=(d.status==='採用');
      const badge=d.status==='採用'?'<span class="badge green">🟢 採用</span>':(d.status==='保留'?'<span class="badge orange">🟡 保留（初期：現状維持）</span>':'<span class="badge blue">⚪ 条件検討（初期：現状維持）</span>');
      const reasonText=(d.reasons||[]).join(' / ');
      const initialLabel=adoptChecked?'採用':'現状維持';
      const keepInput=`<label class="checkLine"><input class="proposalDecision" data-idx="${i}" name="proposalDecision${i}" value="keep" type="radio" ${adoptChecked?'':'checked="checked"'} onchange="KV2RuleConsult.updatePartialAdoptBoxes();KV2RuleConsult.updateAdoptionWarnings()"> 現状維持（変更しない）</label>`;
      const conditionFixed=(d.status==='条件検討');
      const adoptInput=conditionFixed?'':`<label class="checkLine"><input class="proposalDecision" data-idx="${i}" name="proposalDecision${i}" value="adopt" type="radio" ${adoptChecked?'checked="checked"':''} onchange="KV2RuleConsult.updatePartialAdoptBoxes();KV2RuleConsult.updateAdoptionWarnings()"> 採用（比較結果を反映）</label>`;
      // 誤採用防止のため、初期現状維持のカテゴリーは「現状維持」を先に表示する。
      const decisionInputs=conditionFixed ? keepInput : (adoptChecked ? (adoptInput+keepInput) : (keepInput+adoptInput));
      return `<div class="checkCard finalDecisionCard adoptionChoiceCard" data-initial-decision="${adoptChecked?'adopt':'keep'}">
        <div class="subTitle">${safe(cat)} ${badge}</div>
        <div class="subtle">対象R：${safe(n)} / 軸複勝率 ${cur.axisPlaceRate||0}% → ${b.axisPlace||b.axisPlaceRate||0}% / 全体回収率 ${cur.allReturn||0}% → ${b.allReturn||0}%</div>
        <div class="subtle">判定：${safe(reasonText)} / 初期選択：${safe(initialLabel)}</div>
        <div class="checkGrid decisionGrid">${decisionInputs}</div>
      </div>`;
    }).join('');
    return `<div class="card" id="finalAdoptionCheck"><div class="title">最終採用確認</div><div class="hint">🟢採用は初期状態を採用、🟡保留は初期状態を現状維持にします。⚪条件検討は現状維持固定です。採用を選んだカテゴリーだけ反映します。</div>${rows}</div>`;
  }

  function proposalRaceCount(best,cur){
    best=best||{}; cur=cur||{};
    return Math.max(0, num(best.races||0), num(best.doneR||0), num(best.totalR||0), num(cur.doneR||0), num(cur.totalR||0), num(cur.races||0));
  }
  function proposalDisplayRaceCount(best,cur,it){
    // 提案一覧・最終採用確認・判定文で同じ対象Rを使うための統一関数。
    // 一部候補では current 側の少数Rだけが入ることがあるため、best.basis の「トータル16R」「直近30R」も補助的に読む。
    best=best||{}; cur=cur||{}; it=it||{};
    const nums=[
      proposalRaceCount(best,cur),
      num(best.races), num(best.doneR), num(best.totalR), num(best.targetR), num(best.targetRaceCount),
      num(it.races), num(it.doneR), num(it.totalR), num(it.targetR), num(it.targetRaceCount),
      num(cur.doneR), num(cur.totalR), num(cur.races)
    ];
    const texts=[best.basis,best.label,best.note,it.basis,it.label,it.note].map(x=>String(x||''));
    texts.forEach(t=>{
      const m=t.match(/(?:トータル|直近)?\s*(\d+)\s*R/);
      if(m) nums.push(num(m[1]));
    });
    return Math.max.apply(null, nums.filter(n=>Number.isFinite(n)&&n>=0).concat([0]));
  }

  function proposalDisplayBasis(best,cur,it){
    // 表示上の対象Rと「判定：トータル○R / 直近30R」を必ず一致させる。
    best=best||{}; cur=cur||{}; it=it||{};
    const r=proposalDisplayRaceCount(best,cur,it);
    const raw=String(best.basis||cur.basis||it.basis||'比較');
    if(/直近/.test(raw)){
      const m=raw.match(/直近\s*(\d+)\s*R/);
      if(m) return `直近${r||num(m[1])}R`;
      return r ? `直近${r}R` : '直近30R';
    }
    if(/トータル/.test(raw)){
      return r ? `トータル${r}R` : raw.replace(/\s+/g,'');
    }
    const m=raw.match(/(\d+)\s*R/);
    if(m) return raw.replace(/(\d+)\s*R/, `${r||num(m[1])}R`);
    return r ? `${raw} ${r}R` : raw;
  }

  function proposalCards(items,overallCurrent){
    if(!items.length) return '<div class="card"><div class="hint">対象カテゴリーがありません。</div></div>';
    return `<div class="card"><div class="title">カテゴリー別 比較結果</div><div class="hint">詳細な採用判断は下の「最終採用確認」に集約しています。ここでは候補の概要だけ表示します。</div>
      ${items.map((it,i)=>proposalCard(it,i,overallCurrent)).join('')}</div>`;
  }
  function proposalCard(it,i,overallCurrent){
    const cur=it.current||{}, best=it.best||{};
    const cat=optionLabel(it.category||best.category||'全て');
    const decision=consultUnifiedDecision(it,overallCurrent||{});
    const label=decision.status==='採用'?'🟢 採用':(decision.status==='保留'?'🟡 保留':'⚪ 条件検討');
    const labels=commentDirectiveLabels(it&&it.prefs||{});
    const comment=labels.length?labels.map(x=>safe(x)).join('<br>'):'';
    return `<div class="checkCard proposalCard" id="proposalCard${i}">
      <div class="subTitle"><span class="badge orange">比較結果</span> ${safe(cat)} ${safe(label)}</div>
      <div class="subtle">対象R：${safe(proposalDisplayRaceCount(best,cur,it)||0)}　判定：${safe(proposalDisplayBasis(best,cur,it))}</div>
      ${best.ruleText?`<div class="hint"><b>候補ルール：</b>${safe(best.ruleText)}</div>`:''}
      ${comment?`<div class="hint"><b>相談コメント反映：</b><br>${comment}</div>`:''}
      <div class="hint">カテゴリー成績・全体成績への影響・採用理由は「最終採用確認」で確認してください。</div>
      <div class="aiTalk inlineAdvice">${proposalInlineComment(it,overallCurrent,i)}</div>
      <label>この比較結果への質問・別案コメント</label>
      <textarea id="proposalComment${i}" maxlength="500" placeholder="例）軸は維持してワイドだけ別案を見たい。5系を優先した場合はどうなる？"></textarea>
      <div class="bottomBar"><button class="secondary" onclick="KV2RuleConsult.askProposal(${i})">別条件で比較</button></div>
      <div id="proposalAnswer${i}" class="consultAnswer"></div>
    </div>`;
  }



  function projectedOverallMetricsForProposal(it,overallCurrent){
    const curOverall=overallCurrent||{};
    const curCat=(it&&it.current)||{};
    const best=(it&&it.best)||{};
    const totalN=Math.max(0,num(curOverall.doneR||curOverall.totalR||curOverall.races||0));
    const catN=Math.min(totalN||proposalDisplayRaceCount(best,curCat,it), proposalDisplayRaceCount(best,curCat,it));
    const out={totalN,catN,current:curOverall,after:Object.assign({},curOverall),diff:{}};
    if(!totalN || !catN) return out;
    consultMetricDefs().forEach(([name,key,bestKey,bestAlt])=>{
      const before=metricValueForSummary(curOverall,key);
      const c=metricValueForSummary(curCat,key);
      let b;
      if(bestKey==='axisPlaceRate') b=metricValue(best,'axisPlaceRate','axisPlace');
      else if(bestKey==='hitRate') b=metricValue(best,'hitRate','allHit');
      else b=metricValue(best,bestKey,bestAlt);
      const after=round1((before*totalN - c*catN + b*catN)/totalN);
      out.after[key]=after;
      out.diff[key]=round1(after-before);
    });
    return out;
  }


  function hasProposedZeroMetric(best){
    best=best||{};
    const axis=metricValue(best,'axisPlace','axisPlaceRate');
    if(axis<=0.05) return true;
    return ticketMetricPairs().some(([key,fallback])=>metricValue(best,key,fallback)<=0.05);
  }

  function maxProjectedTicketReturnImprovement(proj){
    proj=proj||{};
    const d=proj.diff||{};
    return Math.max(round1(d.umarenReturn||0), round1(d.wideReturn||0), round1(d.sanrenpukuReturn||0));
  }

  function consultUnifiedDecision(it, overallCurrent){
    it=it||{};
    const best=it.best||it.proposal||{};
    const proj=projectedOverallMetricsForProposal(it, overallCurrent||{});
    const catD=categoryMetricDiffsForProposal(it);
    const allD=round1(catD.allReturn||0);
    const axisD=round1(catD.axisPlaceRate||0);
    const ticketDs=[round1(catD.umarenReturn||0), round1(catD.wideReturn||0), round1(catD.sanrenpukuReturn||0)];
    const ticketImproved=ticketDs.filter(x=>x>0.05).length;
    const ticketUnchanged=ticketDs.filter(x=>Math.abs(x)<=0.05).length;
    const ticketWorsened=ticketDs.filter(x=>x<-0.05).length;
    const allTicketPlus5=ticketDs.every(x=>x>=5.0);
    const ticketReturn5=Math.max.apply(null,ticketDs)>=5.0;
    const totalOk=categoryTotalJudgmentSatisfied(it);
    const fullOk=fullAdoptCondition(it, overallCurrent||{});
    const partialOk=partialAdoptCondition(it, overallCurrent||{});
    const zero=hasProposedZeroMetric(best);
    const zeroDrop=hasTicketMetricZeroDrop(it.current||{}, best);
    const zeroRisk=zero || zeroDrop;
    const zeroPartialOk=zeroRiskPartialProposalAllowed(it, overallCurrent||{});
    let status='条件検討';
    const reasons=[];
    if(!totalOk){
      reasons.push('カテゴリートータル判定必要条件または切り替え定義未達');
    }else if(fullOk){
      status='採用';
      reasons.push('カテゴリー全体回収率5%以上改善');
      reasons.push('軸複勝率は同等以上');
      reasons.push(allTicketPlus5 ? '3馬券回収率が各+5%以上改善' : '2馬券回収率改善＋残り1馬券変化なし');
    }else if(partialOk){
      status='保留';
      reasons.push(Math.abs(allD)<=0.05 ? 'カテゴリー全体回収率同等' : 'カテゴリー全体回収率は悪化なし');
      reasons.push('軸複勝率1%以上改善');
      reasons.push('1馬券以上の回収率5%以上改善');
    }else{
      if(allD<-0.05) reasons.push('カテゴリー全体回収率悪化');
      else if(allD>0.05 && allD<5.0) reasons.push('カテゴリー全体回収率は+5%未満改善のため採用ではなく保留条件で判定');
      if(axisD<0) reasons.push('軸複勝率が悪化');
      else if(axisD<1.0 && ticketReturn5) reasons.push('保留条件の軸複勝率1%以上改善未達');
      if(!ticketReturn5) reasons.push('保留条件の馬券回収率+5%以上改善未達');
      if(allD>=5.0 && ticketWorsened>0) reasons.push('馬券回収率が悪化するため採用不可');
      if(allD>=5.0 && !allTicketPlus5 && !(ticketImproved>=2 && ticketUnchanged>=1)) reasons.push('採用条件の馬券改善条件未達');
      if(!reasons.length) reasons.push('採用・保留条件未達');
    }
    return {status, adopt:status==='採用', hold:status==='保留', keep:status==='条件検討', zero:zeroRisk, zeroPartialOk, allD, axisD, ticketReturn5, ticketImproved, ticketUnchanged, ticketWorsened, totalOk, fullOk, partialOk, proj, reasons};
  }


  function proposalMetricValueFromBest(best,key,bestKey,bestAlt){
    best=best||{};
    if(bestKey==='axisPlaceRate') return metricValue(best,'axisPlaceRate','axisPlace');
    if(bestKey==='hitRate') return metricValue(best,'hitRate','allHit');
    return metricValue(best,bestKey,bestAlt);
  }

  function topMetricChangesForAdvice(beforeObj,afterObj,mode){
    const rows=consultMetricDefs().map(([label,key,bestKey,bestAlt])=>{
      let before=metricValueForSummary(beforeObj,key);
      let after;
      if(mode==='best') after=proposalMetricValueFromBest(afterObj,key,bestKey,bestAlt);
      else after=metricValueForSummary(afterObj,key);
      return {label,key,before,after,d:round1(after-before)};
    });
    const good=rows.filter(x=>x.d>0).sort((a,b)=>b.d-a.d).slice(0,4);
    const bad=rows.filter(x=>x.d<0).sort((a,b)=>a.d-b.d).slice(0,3);
    return {rows,good,bad};
  }

  function formatMetricChange(x){
    return `${x.label} ${x.before}%→${x.after}%（${signedPct(x.d)}）`;
  }

  function proposalAiRecommendation(it,overallCurrent){
    const dec=consultUnifiedDecision(it,overallCurrent);
    if(dec.status==='採用') return {rank:'adopt',label:'🟢 採用',reason:'カテゴリー内の全体回収率+5%以上、軸複勝率同等以上、馬券改善条件を満たすため一括採用候補です。初期選択は採用です。'};
    if(dec.status==='保留') return {rank:'hold',label:'🟡 保留（初期選択：現状維持）',reason:'保留条件を満たすため、採用時は改善項目だけ部分チェックで反映します。'};
    return {rank:'keep',label:'⚪ 条件検討（初期選択：現状維持）',reason:(dec.reasons||[]).join(' / ')||'採用・保留条件を満たさないため条件検討です。'};
  }

  function categoryMetricRowsForProposal(it){
    const cur=(it&&it.current)||{}, best=(it&&it.best)||{};
    return consultMetricDefs().map(([label,key,bestKey,bestAlt])=>{
      const before=metricValueForSummary(cur,key);
      const after=(bestKey==='axisPlaceRate')?metricValue(best,'axisPlaceRate','axisPlace'):(bestKey==='hitRate'?metricValue(best,'hitRate','allHit'):metricValue(best,bestKey,bestAlt));
      const diff=round1(after-before);
      return {label,key,before,after,diff,status:diff>0?'improve':(diff<0?'down':'same')};
    });
  }

  function decisionReasonCompactHtml(it,overallCurrent){
    const dec=consultUnifiedDecision(it,overallCurrent||{});
    const rows=categoryMetricRowsForProposal(it);
    const byKey=(k)=>rows.find(r=>r.key===k)||{before:0,after:0,diff:0,label:k};
    const all=byKey('allReturn');
    const axis=byKey('axisPlaceRate');
    const tickets=['umarenReturn','wideReturn','sanrenpukuReturn'].map(byKey);
    const checks=[];
    const add=(ok,text)=>checks.push(`<li>${ok?'☑':'☐'} ${safe(text)}</li>`);
    if(dec.status==='採用'){
      add(all.diff>=5.0, `全体回収率：${signedPct(all.diff)}（採用条件：+5%以上）`);
      add(axis.diff>=-0.05, `軸複勝率：${signedPct(axis.diff)}（採用条件：同等以上）`);
      tickets.forEach(t=>add(t.diff>=5.0 || Math.abs(t.diff)<=0.05, `${t.label}：${signedPct(t.diff)}`));
      add(dec.totalOk, 'トータル判定必要条件・切り替え定義を満たす');
    }else if(dec.status==='保留'){
      add(all.diff>=-0.05, `全体回収率：${signedPct(all.diff)}（保留条件：同等以上）`);
      add(axis.diff>=1.0, `軸複勝率：${signedPct(axis.diff)}（保留条件：+1%以上）`);
      tickets.filter(t=>t.diff>=5.0).forEach(t=>add(true, `${t.label}：${signedPct(t.diff)}（保留条件：+5%以上）`));
      if(!tickets.some(t=>t.diff>=5.0)) add(false,'馬連/ワイド/3連複回収率：+5%以上の改善なし');
      add(dec.totalOk, 'トータル判定必要条件・切り替え定義を満たす');
    }else{
      add(all.diff>=5.0, `全体回収率：${signedPct(all.diff)}（採用条件：+5%以上）`);
      add(axis.diff>=1.0, `軸複勝率：${signedPct(axis.diff)}（保留条件：+1%以上）`);
      add(tickets.some(t=>t.diff>=5.0), '馬連/ワイド/3連複のいずれかが+5%以上改善');
      add(dec.totalOk, 'トータル判定必要条件・切り替え定義を満たす');
      (dec.reasons||[]).slice(0,4).forEach(r=>checks.push(`<li>・${safe(r)}</li>`));
    }
    const title=dec.status==='採用'?'採用理由':(dec.status==='保留'?'保留理由':'条件検討理由');
    return `<div class="aiMiniBlock aiDecisionBlock"><b>${safe(title)}</b><ul class="aiReasonList">${checks.join('')}</ul></div>`;
  }

  function proposalAutoAdviceHtml(it,overallCurrent){
    const rec=proposalAiRecommendation(it,overallCurrent);
    return `<div class="aiMiniBlock aiDecisionBlock"><b>${safe(rec.label)}</b></div>${decisionReasonCompactHtml(it,overallCurrent)}`;
  }

  function nextCompareOptionsHtml(it,i){
    const prefs=(it&&it.prefs)||{};
    const labels=commentDirectiveLabels(prefs);
    const themes=sortCarryThemesForCompare(groupCarryThemes(((prefs&&prefs.aiCarry)||[])));
    const fromThemes=themes.map(h=>comparePlanLabel(h.theme,h.kind)).filter(Boolean);
    const base=['軸人気帯だけ変更','軸条件だけ変更','馬連だけ変更','ワイドだけ変更','3連複だけ変更','人気帯変更','5系重み変更','印重複優先変更','ランキング上位ルールで比較'];
    const opts=uniq((labels.length?labels:[]).concat(fromThemes).concat(base)).slice(0,9);
    const name=`proposalNextCompare${i}`;
    const checks=opts.map((x,idx)=>`<label class="checkLine nextCompareCheck"><input type="checkbox" name="${name}" value="${safeAttr(x)}"> ${safe(x)}</label>`).join('');
    return `<div class="aiMiniBlock nextCompareBlock"><b>おすすめ比較</b><div class="hint">気になる条件にチェックを入れて再比較できます。</div>${checks}<div class="bottomBar"><button type="button" class="secondary" onclick="KV2RuleConsult.runRecommendedCompare(${i})">比較する</button></div></div>`;
  }

  function proposalOnlyOverallSummaryHtml(it,overallCurrent){
    // 各提案を1件だけ採用した場合の全体見込み成績。
    const curOverall=overallCurrent||{};
    const curCat=(it&&it.current)||{};
    const best=(it&&it.best)||{};
    const totalN=Math.max(0,num(curOverall.doneR||curOverall.totalR||curOverall.races||0));
    const catN=Math.min(totalN||proposalDisplayRaceCount(best,curCat,it), proposalDisplayRaceCount(best,curCat,it));
    if(!totalN || !catN){
      return `<div class="hint"><b>② 採用した場合の全体成績への影響</b><br><span class="subtle">全体対象Rが取得できないため、全体見込みは表示できません。</span></div>`;
    }
    const proj=projectedOverallMetricsForProposal(it,overallCurrent);
    const rowHtml=consultMetricDefs().map(([name,key,bestKey,bestAlt])=>{
      const before=metricValueForSummary(curOverall,key);
      const after=metricValueForSummary(proj.after,key);
      const d=round1(after-before);
      const cls=d>0?'improve':(d<0?'bad':'');
      return `<tr><td>${safe(name)}</td><td>${before}%</td><td>${after}%</td><td class="${cls}">${d>0?'+':''}${d}%</td></tr>`;
    }).join('');
    return `<details class="proposalOverallImpact" open><summary><b>② 採用した場合の全体成績への影響</b></summary>
      <div class="subtle">全体${safe(totalN)}Rのうち、このカテゴリー${safe(catN)}Rを見直し後の値に差し替えた見込みです。</div>
      <div class="tableWrap"><table class="miniStats"><tr><th>区分</th><th>現在の全体</th><th>採用後（見込み）</th><th>差分</th></tr>${rowHtml}</table></div>
    </details>`;
  }

  function aiScoreBadge(score,isRef){
    score=num(score);
    if(isRef) return '<span class="badge orange">🟡参考提案</span>';
    if(score>=30) return '<span class="badge green">採用推奨</span>';
    if(score<15) return '<span class="badge red">非推奨</span>';
    return '<span class="badge blue">🔴 悪化</span>';
  }
  function aiScoreClass(score,isRef){
    score=num(score);
    if(isRef) return 'orange';
    if(score>=30) return 'green';
    if(score<15) return 'red';
    return 'blue';
  }

  function finalAdoptionChecklist(items){
    if(!items || !items.length) return '';
    const nums=['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩'];
    return `<div class="card" id="finalAdoptionCheck"><div class="title">最終採用確認</div>
      <div class="hint">各カテゴリーの比較結果を採用するか、現状維持にするか選択してください。<br>🟢採用は初期状態を採用、🟡保留は初期状態を現状維持にします。⚪条件検討は現状維持固定です。採用を選んだカテゴリーだけ反映します。</div>
      ${items.map((it,i)=>{
        const cat=optionLabel(it.category||(it.best&&it.best.category)||'全て');
        const b=it.best||{};
        // 最終採用確認も、提案一覧と同じ対象Rを使う。
        // 現状側やAIカルテ側の少数Rだけで参考扱いにしない。
        const currentN=proposalDisplayRaceCount(b,it.current,it);
        const decision=consultUnifiedDecision(it, window.__kv2ConsultCurrentStats || {});
        const isRef=currentN<3;
        const compareMode=isConsultCompareMode(it&&it.prefs);
        const themes=compareMode?[]:sortCarryThemesForCompare(groupCarryThemes(((it&&it.prefs&&it.prefs.aiCarry)||[])));
        const axisThemes=themes.filter(h=>h.kind==='axis');
        const priList=(axisThemes.length?axisThemes:themes).slice(0,7);
        const top3=priList.slice(0,3);
        const bd=carryScoreBreakdown(((it&&it.prefs&&it.prefs.aiCarry)||[]), currentN);
        const scoreBadge=isRef ? '<span class="badge orange">🟡参考提案</span>' : (decision.status==='採用' ? '<span class="badge green">🟢 採用</span>' : (decision.status==='保留' ? '<span class="badge orange">🟡 保留（初期：現状維持）</span>' : '<span class="badge blue">⚪ 条件検討（初期：現状維持）</span>'));
        const priorityHtml=priList.length
          ? `<div class="adoptPriority"><b>AI優先順位</b><br>${priList.map((h,idx)=>`<span class="aiRank aiRank${idx<2?'High':(idx<5?'Mid':'Low')}">${nums[idx]||String(idx+1)+'.'} ${safe(h.theme)}${h.count?`（${h.count}回）`:''}</span>`).join('<br>')}</div>`
          : `<div class="adoptPriority">${b.ruleText?`候補ルール：${safe(b.ruleText)}`:'比較結果を確認してください。'}</div>`;
        const memoParts=[];
        if(isRef) memoParts.push('対象R不足（参考）');
        if(!compareMode && bd.total) memoParts.push(`一致度 ${bd.total}点${(isRef&&bd.samplePenalty)?'（参考）':''}`);
        if(!compareMode && top3.length) memoParts.push(`優先テーマ：${top3.map(h=>safe(h.theme)).join('・')}`);
        if(isRef) memoParts.push('採用しても参考扱いになります');
        const memoTitle=isRef?'参考情報':'採用判断メモ';
        const memoHtml=memoParts.length?`<div class="adoptMemo"><b>${memoTitle}</b><br>${memoParts.map(x=>`・${x}`).join('<br>')}</div>`:'';
        return `<div class="checkCard finalDecisionCard adoptionChoiceCard">
          <div class="adoptCardHead">
            <div><div class="subTitle">${safe(cat)} ${scoreBadge}</div><div class="subtle">対象R：${safe(currentN||0)}${isRef?'（参考）':''}${compareMode?'':` / 一致度：${safe(bd.total||0)}点${(isRef&&bd.samplePenalty)?'（参考）':''}`}</div></div>
            ${top3.length?`<div class="adoptTopThemes">優先：${top3.map(h=>safe(h.theme)).join('・')}</div>`:''}
          </div>
          ${priorityHtml}
          ${memoHtml}
          ${decisionReasonCompactHtml(it, window.__kv2ConsultCurrentStats || {})}
          ${categoryImpactPreviewHtml(it)}
          ${adoptionImpactPreviewHtml(it,i)}
          <div class="checkGrid decisionGrid">
            ${decision.status==='条件検討'?'':`<label class="checkLine"><input class="proposalDecision" data-idx="${i}" name="proposalDecision${i}" value="adopt" type="radio" ${decision.status==='採用'?'checked':''} onchange="KV2RuleConsult.updatePartialAdoptBoxes();KV2RuleConsult.updateAdoptionWarnings()"> 採用（比較結果を反映）</label>`}
            <label class="checkLine"><input class="proposalDecision" data-idx="${i}" name="proposalDecision${i}" value="keep" type="radio" ${decision.status==='採用'?'':'checked'} onchange="KV2RuleConsult.updatePartialAdoptBoxes();KV2RuleConsult.updateAdoptionWarnings()"> 現状維持（変更しない）</label>
          </div>
          ${partSelectionHtml(it,i,decision)}
        </div>`;
      }).join('')}
    </div>`;
  }

  function adoptionImpactRows(it){
    const proj=projectedOverallMetricsForProposal(it, (loadLast()&&loadLast().current)||{});
    if(!proj || !proj.after) return [];
    return consultMetricDefs().map(([label,key])=>{
      const before=metricValueForSummary(proj.current||{},key);
      const after=metricValueForSummary(proj.after||{},key);
      const diff=round1(after-before);
      const status=diff>0?'improve':(diff<0?'down':'same');
      return {name:label,cur:before,best:after,diff,status};
    });
  }
  function adoptionImpactPreviewHtml(it,i){
    // 最終採用確認でも、カテゴリー内成績ではなく「このカテゴリーを採用した場合の全体成績への影響」を常時表示する。
    const rows=adoptionImpactRows(it);
    const proj=projectedOverallMetricsForProposal(it, (loadLast()&&loadLast().current)||{});
    const totalN=proj&&proj.totalN?proj.totalN:0;
    const catN=proj&&proj.catN?proj.catN:0;
    if(!rows.length){
      return `<div id="adoptionReturnWarning${i}" class="adoptionReturnWarning" style="display:block;margin-top:8px;border:1px solid #dbeafe;background:#eff6ff;border-radius:8px;padding:8px;line-height:1.5;">
        <b>採用した場合の全体成績への影響</b><br>
        <div class="hint"><span class="badge orange">🟡参考</span><br>全体対象Rが取得できないため、全体影響は表示できません。</div>
      </div>`;
    }
    const counts={improve:rows.filter(r=>r.status==='improve').length,down:rows.filter(r=>r.status==='down').length,same:rows.filter(r=>r.status==='same').length};
    const summary=`<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:8px;">
      <div style="color:#2563eb;font-weight:900;">🔵改善 ${counts.improve}件</div>
      <div style="color:#dc2626;font-weight:900;">🔴悪化 ${counts.down}件</div>
      <div style="color:#111827;font-weight:900;">⚫変化なし ${counts.same}件</div>
    </div>`;
    const rowHtml=rows.map(r=>{
      const color=r.status==='improve'?'#2563eb':(r.status==='down'?'#dc2626':'#111827');
      const icon=r.status==='improve'?'🔵':(r.status==='down'?'🔴':'⚫');
      const sign=r.diff>0?'+':'';
      return `<tr style="color:${color};font-weight:800;"><td>${icon} ${safe(r.name)}</td><td>${r.cur}%</td><td>${r.best}%</td><td>${r.diff!==0?`${sign}${r.diff}%`:'0%'}</td></tr>`;
    }).join('');
    const downs=rows.filter(r=>r.status==='down');
    const warning=downs.length?`<div style="margin-top:8px;color:#dc2626;font-weight:900;line-height:1.6;">
      ${downs.map(r=>`${safe(r.name)}が${Math.abs(r.diff)}%低下`).join('。')}。採用条件を満たしています。
悪化項目を確認した上で採用してください。
    </div>`:'';
    return `<div id="adoptionReturnWarning${i}" class="adoptionReturnWarning" style="display:block;margin-top:8px;border:1px solid #dbeafe;background:#eff6ff;border-radius:8px;padding:8px;line-height:1.5;">
      <b>採用した場合の全体成績への影響</b><br><span class="subtle">全体${safe(totalN)}Rのうち、このカテゴリー${safe(catN)}Rを見直し後の値に差し替えた見込みです。</span>
      ${summary}<div class="tableWrap" style="margin-top:6px;"><table class="miniStats"><tr><th>指標</th><th>現在の全体</th><th>採用後</th><th>差分</th></tr>${rowHtml}</table></div>${warning}
    </div>`;
  }
  function updateAdoptionWarnings(){
    // Ver2-153: 最終採用確認の全体影響は、採用/現状維持の判断材料として常時表示する。
    document.querySelectorAll('.adoptionReturnWarning').forEach(el=>{ el.style.display='block'; el.hidden=false; });
  }

  function metricRow(name,cur,best){
    cur=num(cur); best=num(best); const d=Math.round((best-cur)*10)/10;
    const cls=d>0?'improve':(d<0?'bad':'');
    return `<tr><td>${safe(name)}</td><td>${cur}%</td><td>${best}%</td><td class="${cls}">${d>0?'+':''}${d}%</td></tr>`;
  }

  function metricValue(o, key, fallbackKey){
    if(!o) return 0;
    const raw=o[key];
    if(raw!==undefined && raw!==null && raw!=='') return num(raw);
    if(fallbackKey){
      const fb=o[fallbackKey];
      if(fb!==undefined && fb!==null && fb!=='') return num(fb);
    }
    return 0;
  }
  function proposalImprovesAgainst(cur,best){
    cur=cur||{}; best=best||{};
    if(!best || !Object.keys(best).length) return false;
    const section=String(best.rankingSection||best.basis||'');
    if(best.candidateSource==='rankingCsv' && (isJudgeRankingSection(section) || isLowReturnRankingSection(section) || isAxisNgRankingSection(section))) return false;

    const allD=metricValue(best,'allReturn')-metricValue(cur,'allReturn');
    const axisD=metricValue(best,'axisPlace','axisPlaceRate')-metricValue(cur,'axisPlaceRate','axisPlace');
    const ticketReturnD=maxTicketReturnImprovement(cur,best);

    // 表示候補：採用または保留条件に乗る可能性がある候補だけ表示する。
    // 保留は全体回収率が悪化しない候補まで残す。
    if(allD<-0.05) return false;
    if(allD>=5.0) return true;
    if(allD>=-0.05 && axisD>=1.0 && ticketReturnD>=5.0) return true;
    return false;
  }

  function ticketMetricPairs(){
    return [
      ['umarenHit','umarenHitRate','馬連的中率'],
      ['umarenReturn','umarenReturnRate','馬連回収率'],
      ['wideHit','wideHitRate','ワイド的中率'],
      ['wideReturn','wideReturnRate','ワイド回収率'],
      ['sanrenpukuHit','sanrenpukuHitRate','3連複的中率'],
      ['sanrenpukuReturn','sanrenpukuReturnRate','3連複回収率']
    ];
  }
  function axisWorsenAllowedForAdopt(delta){
    // AI推奨の自動採用では、軸複勝率の悪化は -1.0pt 未満まで許容する。
    // -1.0ptを超えて悪化する候補は、表示は残すが初期状態は現状維持（保留）にする。
    return round1(num(delta)) >= -1.0;
  }
  function projectedAxisDeltaForItem(it, overallCurrent){
    try{
      const impact=projectedOverallImpactForProposal(it, overallCurrent);
      if(impact && impact.axis) return round1(impact.axis.diff);
    }catch(e){}
    const cur=(it&&it.current)||{}, best=(it&&it.best)||{};
    return round1(metricValue(best,'axisPlace','axisPlaceRate')-metricValue(cur,'axisPlaceRate','axisPlace'));
  }

  function hasTicketMetricZeroDrop(cur,best){
    return ticketMetricPairs().some(([key,fallback])=>{
      const current=metricValue(cur,key,fallback);
      const proposed=metricValue(best,key,fallback);
      return current>0.05 && proposed<=0.05;
    });
  }
  function maxTicketMetricImprovement(cur,best){
    let mx=-9999;
    ticketMetricPairs().forEach(([key,fallback])=>{
      const d=metricValue(best,key,fallback)-metricValue(cur,key,fallback);
      if(d>mx) mx=d;
    });
    return mx;
  }
  function maxTicketReturnImprovement(cur,best){
    return Math.max(
      metricValue(best,'umarenReturn')-metricValue(cur,'umarenReturn'),
      metricValue(best,'wideReturn')-metricValue(cur,'wideReturn'),
      metricValue(best,'sanrenpukuReturn')-metricValue(cur,'sanrenpukuReturn')
    );
  }
  function allReturnDelta(cur,best){ return metricValue(best,'allReturn')-metricValue(cur,'allReturn'); }
  function axisPlaceDelta(cur,best){ return metricValue(best,'axisPlace','axisPlaceRate')-metricValue(cur,'axisPlaceRate','axisPlace'); }
  function isCategoryAttributeCandidate(r){
    const s=String((r&&r.rankingSection)||(r&&r.basis)||'');
    return /カテゴリー別属性ランキング|属性ランキング/.test(s) || !!(r&&r.isAttributeRanking);
  }
  function proposalDecisionRank(cur,r){
    if(!proposalImprovesAgainst(cur,r)) return 0;
    const allD=allReturnDelta(cur,r);
    const axisD=axisPlaceDelta(cur,r);
    const ticketD=maxTicketReturnImprovement(cur,r);
    if(allD<-0.05) return 0;
    if(allD>=5.0) return 300000 + allD*1000 + axisD*10 + Math.max(0,ticketD);
    if(axisD>=1.0 || ticketD>=5.0) return 200000 + axisD*1000 + Math.max(0,ticketD);
    return 0;
  }
  function compareProposalCandidates(a,b,cur){
    const ra=proposalDecisionRank(cur,a), rb=proposalDecisionRank(cur,b);
    if(Math.abs(rb-ra)>0.05) return rb-ra;
    const attr=(isCategoryAttributeCandidate(b)?1:0)-(isCategoryAttributeCandidate(a)?1:0);
    if(attr) return attr;
    const ar=allReturnDelta(cur,b)-allReturnDelta(cur,a);
    if(Math.abs(ar)>0.05) return ar;
    const ax=axisPlaceDelta(cur,b)-axisPlaceDelta(cur,a);
    if(Math.abs(ax)>0.05) return ax;
    const td=maxTicketMetricImprovement(cur,b)-maxTicketMetricImprovement(cur,a);
    if(Math.abs(td)>0.05) return td;
    return 0;
  }

  function meaningfulCandidateRows(it){
    const cur=it.current||{};
    const rows=(it.rows||[]).filter(Boolean);
    return rows.filter(r=>{
      const hasRule=String(r.ruleText||r.rule||r.ruleName||r.pattern||'').trim().length>0;
      const metricDiff=Math.abs(deltaVal(r.axisPlace||r.axisPlaceRate,cur.axisPlaceRate))>0.05
        || Math.abs(deltaVal(r.allReturn,cur.allReturn))>0.05
        || Math.abs(deltaVal(r.umarenReturn,cur.umarenReturn))>0.05
        || Math.abs(deltaVal(r.wideReturn,cur.wideReturn))>0.05
        || Math.abs(deltaVal(r.sanrenpukuReturn,cur.sanrenpukuReturn))>0.05
        || Math.abs(deltaVal(metricValue(r,'umarenHit','hitRate'),metricValue(cur,'umarenHit','hitRate')))>0.05
        || Math.abs(deltaVal(metricValue(r,'wideHit','hitRate'),metricValue(cur,'wideHit','hitRate')))>0.05
        || Math.abs(deltaVal(metricValue(r,'sanrenpukuHit','hitRate'),metricValue(cur,'sanrenpukuHit','hitRate')))>0.05;
      return hasRule || metricDiff;
    });
  }
  function hasRealCandidateComparison(it){
    const rows=meaningfulCandidateRows(it);
    return rows.length>=2 || ((loadRows()||[]).length>0 && rows.length>=1);
  }
  function noComparisonNotice(it){
    const cat=optionLabel(it.category||(it.best&&it.best.category)||'対象カテゴリー');
    const r=(it.best&& (it.best.races||it.best.doneR||it.best.totalR)) || (it.current&&it.current.doneR) || 0;
    return `<div class="candidateRanking"><p><b>候補ランキング：</b>今回は候補ルール別の実測比較はまだ作れていません。</p>
      <p>今表示している数値は、${safe(cat)}の保存済み成績を確認したものです。対象Rは${num(r)}Rなので、ここで「5系優先が良い」「連動優先が良い」と断定すると、1レースの結果に引っ張られやすいです。</p>
      <p><b>今できる判断：</b>現状ルールのまま保存を続けるか、ランキングCSVを読み込んで候補ルール別の軸複勝率・馬連/ワイド/3連複回収率を比較してから変更するのが安全です。</p>
      <p><b>次に比較したい案：</b>軸だけ変更、5系優先、連動優先、隣±1優先、相手条件だけ変更。この5案はCSV候補または再計算データが入った時点で順位付きで比較します。</p></div>`;
  }
  function candidateRankingsHtml(it){
    const cur=it.current||{};
    const rows=meaningfulCandidateRows(it).sort((a,b)=>(b.score||0)-(a.score||0) || (b.allReturn||0)-(a.allReturn||0) || (b.axisPlace||b.axisPlaceRate||0)-(a.axisPlace||a.axisPlaceRate||0)).slice(0,3);
    if(!hasRealCandidateComparison(it)) return '';
    const medals=['🥇 第1候補','🥈 第2候補','🥉 第3候補'];
    return `<div class="candidateRanking"><p><b>候補ランキング：</b>実測できた候補をスコア順に並べると以下です。</p>${rows.map((r,i)=>{
      const aD=deltaVal(r.axisPlace||r.axisPlaceRate,cur.axisPlaceRate);
      const uHitD=deltaVal(metricValue(r,'umarenHit','hitRate'),metricValue(cur,'umarenHit','hitRate'));
      const wHitD=deltaVal(metricValue(r,'wideHit','hitRate'),metricValue(cur,'wideHit','hitRate'));
      const tHitD=deltaVal(metricValue(r,'sanrenpukuHit','hitRate'),metricValue(cur,'sanrenpukuHit','hitRate'));
      const uD=deltaVal(r.umarenReturn,cur.umarenReturn);
      const wD=deltaVal(r.wideReturn,cur.wideReturn);
      const tD=deltaVal(r.sanrenpukuReturn,cur.sanrenpukuReturn);
      const allD=deltaVal(r.allReturn,cur.allReturn);
      return `<div class="rankCandidate"><b>${medals[i]}</b> <span class="badge blue">スコア ${num(r.score)}</span><br>
        <span>軸：${safe(ruleShort(r,'axis'))}</span><br>
        <span>馬連：${safe(ruleShort(r,'umaren'))}</span><br>
        <span>ワイド：${safe(ruleShort(r,'wide'))}</span><br>
        <span>3連複：${safe(ruleShort(r,'sanrenpuku'))}</span><br>
        <span class="subtle">変化：軸複勝 ${signedPct(aD)} / 全体 ${signedPct(allD)} / 馬連 的中${signedPct(uHitD)}・回収${signedPct(uD)} / ワイド 的中${signedPct(wHitD)}・回収${signedPct(wD)} / 3連複 的中${signedPct(tHitD)}・回収${signedPct(tD)}</span><br>
        <span>${safe(candidateReason(r,cur,i))}</span>
      </div>`;
    }).join('')}</div>`;
  }
  function signedPct(v){ v=num(v); return (v>0?'+':'')+v+'%'; }
  function ruleShort(r,kind){
    const txt=String(r&& (r.ruleText||r.rule||r.ruleName||r.pattern||'') || '').trim();
    if(txt){
      if(kind==='axis') return txt.replace(/\s+/g,' ').slice(0,38);
      return txt.replace(/\s+/g,' ').slice(0,38);
    }
    if(kind==='axis') return '2〜6人気＋連動＋隣±1＋5系から軸スコア上位';
    if(kind==='umaren') return '軸から相手条件に合う2点';
    if(kind==='wide') return '軸から相手条件に合う2点';
    return '軸を含む4点。足りない場合は無理に固定候補を入れない';
  }
  function candidateReason(r,cur,rank){
    const aD=deltaVal(r.axisPlace||r.axisPlaceRate,cur.axisPlaceRate);
    const allD=deltaVal(r.allReturn,cur.allReturn);
    const uD=deltaVal(r.umarenReturn,cur.umarenReturn);
    const wD=deltaVal(r.wideReturn,cur.wideReturn);
    const tD=deltaVal(r.sanrenpukuReturn,cur.sanrenpukuReturn);
    if(aD>0 && allD>=0) return '軸の安定を上げつつ全体を崩しにくいため、総合評価が高い候補です。';
    if(wD>0 && uD<0) return 'ワイドは改善しますが馬連が下がるため、ワイド重視なら候補、馬連重視なら注意です。';
    if(tD>0 && aD<=0) return '3連複は改善していますが、軸の安定が伸びないため部分採用向きです。';
    if(allD>0) return '全体回収率は改善しています。券種別の悪化が小さければ🟢採用です。';
    if(rank===0) return '現状を大きく上回る数字ではありませんが、候補内では一番バランスが良い案です。';
    return '現状との差が小さいため、優先度は高くありません。次回比較用の参考候補です。';
  }
  function compareResultText(it){
    const cur=it.current||{};
    const rows=meaningfulCandidateRows(it).sort((a,b)=>(b.score||0)-(a.score||0) || (b.allReturn||0)-(a.allReturn||0)).slice(0,3);
    if(!hasRealCandidateComparison(it)){
      return '今回は候補ルール別の実測比較がまだ無いため、「5系優先が良い」「連動優先が良い」とは判断していません。保存済みレースの現状成績だけを見ると、対象Rが少なく、ルール変更よりデータ追加またはCSV候補の読み込みを優先した方が安全です。';
    }
    const parts=rows.map((r,i)=>{
      const label=['第1候補','第2候補','第3候補'][i];
      const aD=deltaVal(r.axisPlace||r.axisPlaceRate,cur.axisPlaceRate);
      const allD=deltaVal(r.allReturn,cur.allReturn);
      const uD=deltaVal(r.umarenReturn,cur.umarenReturn);
      const wD=deltaVal(r.wideReturn,cur.wideReturn);
      const tD=deltaVal(r.sanrenpukuReturn,cur.sanrenpukuReturn);
      const best=[]; const weak=[];
      if(aD>0) best.push(`軸複勝${signedPct(aD)}`); else if(aD<0) weak.push(`軸複勝${signedPct(aD)}`);
      if(allD>0) best.push(`全体${signedPct(allD)}`); else if(allD<0) weak.push(`全体${signedPct(allD)}`);
      if(uD>0) best.push(`馬連${signedPct(uD)}`); else if(uD<0) weak.push(`馬連${signedPct(uD)}`);
      if(wD>0) best.push(`ワイド${signedPct(wD)}`); else if(wD<0) weak.push(`ワイド${signedPct(wD)}`);
      if(tD>0) best.push(`3連複${signedPct(tD)}`); else if(tD<0) weak.push(`3連複${signedPct(tD)}`);
      let text=`${label}は`;
      if(best.length) text+=`${best.join('、')}が改善`;
      else text+='大きな改善なし';
      if(weak.length) text+=`、一方で${weak.join('、')}が悪化`;
      return text;
    });
    const best=rows[0]||{};
    const axisD=deltaVal(best.axisPlace||best.axisPlaceRate,cur.axisPlaceRate);
    const uD=deltaVal(best.umarenReturn,cur.umarenReturn);
    const wD=deltaVal(best.wideReturn,cur.wideReturn);
    const tD=deltaVal(best.sanrenpukuReturn,cur.sanrenpukuReturn);
    let conclusion='';
    if(axisD<=0 && (uD>0 || wD>0 || tD>0)) conclusion=' このカテゴリーでは軸を変えるより、相手条件や券種別条件を見直した方が効果が出ています。';
    else if(axisD>0 && uD<0) conclusion=' 軸は良くなっていますが、馬連の相手が噛み合わなくなるため、軸だけ採用して馬連は現状維持にする判断もあります。';
    else if(axisD>0) conclusion=' 軸複勝率が改善しているので、馬券全体の土台を上げる候補として見られます。';
    else conclusion=' 現状を明確に超える候補は弱く、無理な変更は不要です。';
    return parts.join('。')+'。'+conclusion;
  }
  function proposalInlineComment(it,overallCurrent,i){
    const cur=it.current||{}, best=it.best||{};
    const comment=String(it&&it.prefs&&it.prefs.comment||'').trim();
    const labels=commentDirectiveLabels(it&&it.prefs||{});
    const commentHtml=comment?`<div class="aiMiniBlock" style="border-color:#22c55e;background:#f0fdf4"><b>■相談コメント反映</b><br>「${safe(comment)}」<br>${labels.length?labels.map(safe).join('<br>'):'コメント内容を優先して候補を評価しました。'}</div>`:'';
    const themes=sortCarryThemesForCompare(groupCarryThemes(((it&&it.prefs&&it.prefs.aiCarry)||[])));
    const currentN=(cur.doneR||cur.totalR||best.doneR||best.totalR||0);
    const realCompare=hasRealCandidateComparison(it);
    const hold=themes.length?themes:[];
    const nums=['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩'];
    const holdTop=hold.slice(0,7);
    const topKeep=holdTop.slice(0,3);
    const holdHtml=topKeep.length?topKeep.map(h=>`・${safe(h.theme)}${h.count?`（${h.count}回）`:''}`).join('<br>'):'・保持テーマなし';
    const plans=uniq(holdTop.map(h=>comparePlanLabel(h.theme,h.kind))).filter(Boolean);
    const nextTop=(plans.length?plans:['人気帯変更','5系重み変更','印重複優先変更']).slice(0,3);
    const nextExtra=Math.max(0,(plans.length?plans.length:holdTop.length)-nextTop.length);
    const next=nextTop.map(x=>`・${safe(x)}`).join('<br>')+(nextExtra?`<br>・ほか${nextExtra}テーマ`:'' );
    if(!realCompare && !it.best){
      return `<details class="aiConsultSummary" open><summary><b></b></summary>
        ${commentHtml}<div class="aiMiniBlock"><b>AI提案</b><br>変更なし（${currentN<3?'対象R不足':'実測比較未作成'}）</div>
        <div class="aiMiniBlock"><b>保持テーマ</b><br>${holdHtml}</div>
        <div class="aiMiniBlock"><b>おすすめ比較</b><br>${next}<br><br>CSV候補または保存レース追加後に比較します。</div>
        <p class="subtle">「別条件で比較」を押すと、別案や部分採用の確認ができます。</p>
      </details>`;
    }
    return `<details class="aiConsultSummary" open><summary><b></b></summary>
      ${commentHtml}${proposalAutoAdviceHtml(it,overallCurrent)}
    </details>
    <details class="aiConsultSummary nextCompareSummary" open><summary><b>別条件で比較</b></summary>
      ${nextCompareOptionsHtml(it,i)}
      <p class="subtle">改善が出た券種を中心に、軸維持・軸変更・券種別変更を追加確認できます。</p>
    </details>`;
  }

  function runRecommendedCompare(i){
    const checks=Array.from(document.querySelectorAll(`input[name="proposalNextCompare${i}"]:checked`)).map(x=>x.value).filter(Boolean);
    const ta=document.getElementById('proposalComment'+i);
    if(ta){
      const base=String(ta.value||'').trim();
      const add=checks.length ? `別条件で比較：${checks.join('、')}` : '別条件で比較したい。';
      ta.value=base ? `${base}\n${add}` : add;
    }
    askProposal(i);
  }

  function askProposal(i){
    const prop=loadLast(); const it=(prop.items||[])[i];
    if(!it){alert('提案データがありません'); return;}
    const comment=String(document.getElementById('proposalComment'+i)?.value||'').trim();
    const ans=document.getElementById('proposalAnswer'+i);
    if(!ans) return;
    ans.innerHTML=proposalAnswerHtml(it,comment,i);
  }
  function proposalAnswerHtml(it,comment,idx){
    const cur=it.current||{}, best=it.best||{};
    const alts=proposalAlternatives(it,comment);
    const lead=narrativeAnswer(it,comment,alts);
    return `<div class="card answerCard"><div class="title">相談回答</div>
      <div class="aiTalk">${lead}</div>
      <div class="title" style="margin-top:12px">比較案</div>
      <div class="hint">気に入った案があれば「この案を採用」にチェックしてください。上のカテゴリー採用チェックも自動でONになります。</div>
      ${alts.map((a,j)=>altCard(a,idx,j)).join('')}
      <div class="title" style="margin-top:12px">現状→候補の確認</div>
      <div class="tableWrap"><table class="miniStats"><tr><th>区分</th><th>現状</th><th>候補</th><th>判断</th></tr>
        ${judgeRow('軸複勝率',cur.axisPlaceRate,best.axisPlace||best.axisPlaceRate)}
        ${judgeRow('全体回収率',cur.allReturn,best.allReturn)}
        ${judgeRow('馬連 的中率',metricValue(cur,'umarenHit','hitRate'),metricValue(best,'umarenHit','hitRate'))}
        ${judgeRow('馬連 回収率',cur.umarenReturn,best.umarenReturn)}
        ${judgeRow('ワイド 的中率',metricValue(cur,'wideHit','hitRate'),metricValue(best,'wideHit','hitRate'))}
        ${judgeRow('ワイド 回収率',cur.wideReturn,best.wideReturn)}
        ${judgeRow('3連複 的中率',metricValue(cur,'sanrenpukuHit','hitRate'),metricValue(best,'sanrenpukuHit','hitRate'))}
        ${judgeRow('3連複 回収率',cur.sanrenpukuReturn,best.sanrenpukuReturn)}
      </table></div>
      <label>続けて相談する</label>
      <textarea id="proposalComment${idx}" maxlength="500" placeholder="例）馬連は維持して、ワイドだけ回収率重視で再提案して"></textarea>
      <div class="bottomBar"><button class="secondary" onclick="KV2RuleConsult.askProposal(${idx})">再相談</button></div>
    </div>`;
  }
  function proposalAlternatives(it,comment){
    const cur=it.current||{}, best=it.best||{};
    const rows=(it.rows||[]).filter(Boolean);
    const safeAlt=Object.assign({},best,{altType:'safe',altLabel:'提案A（安全）',altDesc:'現状から大きく変えず、改善が見込める部分だけ採用する案です。'});
    const retAlt=Object.assign({},rows.find(r=>(r.allReturn||0)>=(best.allReturn||0))||best,{altType:'return',altLabel:'提案B（回収率重視）',altDesc:'全体回収率・券種別回収率を優先する案です。的中率は少し下がる可能性があります。'});
    const hitAlt=Object.assign({},rows.find(r=>(r.axisPlace||r.axisPlaceRate||0)>=(best.axisPlace||best.axisPlaceRate||0))||best,{altType:'hit',altLabel:'提案C（的中率重視）',altDesc:'軸複勝率と的中率を優先する案です。回収率より安定性を見ます。'});
    if(/軸だけ|軸のみ/.test(comment||'')) safeAlt.altDesc='軸だけ変更する前提で、馬連・ワイド・3連複への影響を確認する案です。';
    if(/ワイド/.test(comment||'')) retAlt.altDesc='ワイドの的中率・回収率を優先して見る案です。馬連や3連複が下がる場合は注意します。';
    if(/馬連.*維持|馬連は現状/.test(comment||'')) hitAlt.altDesc='馬連を大きく崩さず、軸とワイド側だけ改善できるかを見る案です。';
    return [safeAlt,retAlt,hitAlt].map((a,i)=>Object.assign({altIdx:i},a));
  }
  function narrativeAnswer(it,comment,alts){
    const cur=it.current||{}, best=it.best||{};
    const cat=optionLabel(it.category||best.category||'対象カテゴリー');
    const q=String(comment||'').trim();
    const ruleNow=plainRuleName(cur,'現状ルール');
    const ruleBest=plainRuleName(best,'提案ルール');
    const axisNow=num(cur.axisPlaceRate), axisBest=num(best.axisPlace||best.axisPlaceRate);
    const allNow=num(cur.allReturn), allBest=num(best.allReturn);
    const umHitNow=metricValue(cur,'umarenHit','hitRate'), umHitBest=metricValue(best,'umarenHit','hitRate');
    const wideHitNow=metricValue(cur,'wideHit','hitRate'), wideHitBest=metricValue(best,'wideHit','hitRate');
    const triHitNow=metricValue(cur,'sanrenpukuHit','hitRate'), triHitBest=metricValue(best,'sanrenpukuHit','hitRate');
    const umNow=num(cur.umarenReturn), umBest=num(best.umarenReturn);
    const wideNow=num(cur.wideReturn), wideBest=num(best.wideReturn);
    const triNow=num(cur.sanrenpukuReturn), triBest=num(best.sanrenpukuReturn);
    const axisD=deltaVal(axisBest,axisNow), allD=deltaVal(allBest,allNow), umD=deltaVal(umBest,umNow), wideD=deltaVal(wideBest,wideNow), triD=deltaVal(triBest,triNow);
    const asked=q?`「${safe(q)}」という相談内容も踏まえて見ます。`:'';
    const realCompare=hasRealCandidateComparison(it);
    const analysis= realCompare
      ? `今回は<b>${safe(cat)}</b>を見直しました。${asked} 現状ルールを維持した場合と、候補ルールへ寄せた場合で、軸・馬連・ワイド・3連複の的中率/回収率を比較しています。`
      : `今回は<b>${safe(cat)}</b>の現状成績を確認しました。${asked} ただし候補ルール別の再計算値がまだ無いので、今は「比較した結果」ではなく「現状から見た安全判断」として回答します。`;
    let reason='';
    const positives=[];
    if(axisD>0) positives.push(`軸複勝率が${axisNow}%→${axisBest}%に上がる`);
    if(allD>0) positives.push(`全体回収率が${allNow}%→${allBest}%に上がる`);
    if(umD>0) positives.push(`馬連回収率が${umNow}%→${umBest}%に上がる`);
    if(wideD>0) positives.push(`ワイド回収率が${wideNow}%→${wideBest}%に上がる`);
    if(triD>0) positives.push(`3連複回収率が${triNow}%→${triBest}%に上がる`);
    if(positives.length){
      reason=`この提案になった理由は、${safe(positives.join('、'))}ためです。単に数値が高いものを選ぶだけではなく、今の運用で重視している「軸の安定」と「ワイド/3連複の回収」を崩しにくい候補を優先しています。`;
    }else{
      reason='この提案になった理由は、現時点では現状ルールを上回る明確な候補が見つかっていないためです。対象Rが少ないカテゴリーでは、1レースの結果だけでルールを動かすとブレやすいので、無理に変更しない判断も候補に入れています。';
    }
    if(!realCompare){
      reason='今回の回答で一番大事なのは、まだ候補別の実測比較が無い点です。保存済みレースの現状成績だけでは、5系優先・連動優先・隣±1優先のどれが本当に良いかは判断できません。';
    }
    const ruleChange = !realCompare
      ? `今回はルールを変える案ではなく、現状維持を前提にした確認です。次にCSV候補か再計算データを読み込めば、軸だけ変更・5系優先・連動優先・隣±1優先・相手条件だけ変更を実測比較できます。`
      : (ruleNow!==ruleBest
        ? `予想ルールは、現状の「${safe(ruleNow)}」から、候補の「${safe(ruleBest)}」へ変更する案です。変更の狙いは、当たり方が弱い部分だけを補正し、軸や相手の選び方を少し寄せることです。`
        : `予想ルール自体は「${safe(ruleNow)}」を大きく変えない案です。今はルール変更よりも、対象カテゴリーを絞って本当に改善差が出るかを確認する段階です。`);
    const numbers=`数値では、軸複勝率は${axisNow}%→${axisBest}%、全体回収率は${allNow}%→${allBest}%です。馬連は的中率${umHitNow}%→${umHitBest}%・回収率${umNow}%→${umBest}%、ワイドは的中率${wideHitNow}%→${wideHitBest}%・回収率${wideNow}%→${wideBest}%、3連複は的中率${triHitNow}%→${triHitBest}%・回収率${triNow}%→${triBest}%です。`;
    let merit='';
    if(axisD>0 && wideD>=0) merit='メリットは、軸の安定を上げながらワイドの崩れを抑えられる点です。軸が馬券内に残りやすくなるなら、馬連・ワイド・3連複すべての土台が良くなります。';
    else if(wideD>0) merit='メリットは、ワイド側の改善が見込める点です。馬連よりもワイド回収率を優先したいカテゴリーでは🟢 改善になります。';
    else if(allD>0) merit='メリットは、券種単体ではなく全体回収率を押し上げる点です。総合成績を優先するなら検討できます。';
    else merit='メリットは限定的です。現状維持を選んでも大きな損はなく、次のデータが増えるまで待つ判断ができます。';
    let caution='';
    if(umD<0 && wideD>0) caution='注意点は、ワイドが良くなる一方で馬連回収率が下がる可能性がある点です。馬連を守りたいなら「馬連は現状維持」で再相談した方が安全です。';
    else if(axisD<=0 && allD<=0) caution='注意点は、今の数字だけでは改善根拠が弱い点です。対象Rが少ない場合、変更しても再現性が低い可能性があります。';
    else caution='注意点は、改善している項目だけでなく、下がっている券種がないかを確認することです。特に馬連と3連複は配当の影響が大きいので、回収率だけで即採用しない方が安全です。';
    let recommend='';
    if(!realCompare) recommend='私なら、今回は採用せず現状維持にします。候補別の数値が無い状態でルールを変えると、良くなった理由・悪くなった理由が切り分けできないためです。';
    else if(/軸だけ|軸のみ/.test(q)) recommend='私なら、まず軸だけ変更する案を小さく試します。馬券条件まで同時に変えると、良くなった理由・悪くなった理由が分かりにくくなるためです。';
    else if(/ワイド/.test(q)) recommend= wideD>0 ? '私なら、ワイド重視なら🟢採用にします。ただし馬連が下がるなら、ワイドだけ変更・馬連維持の別案を次に確認します。' : '私なら、ワイド重視でも今回は採用を急ぎません。ワイド回収率に改善が出ていないため、別条件で再相談します。';
    else if(positives.length && (allD>0 || axisD>0)) recommend='私なら、提案A（安全）を第一候補にします。現状を壊し過ぎず、改善が出た部分だけ取り込めるため、週末運用でもリスクが低いです。';
    else recommend='私なら、今回は見送りにします。現状より明確に良い数字が出ていないので、保存レースやCSVが増えてから再相談する方が安全です。';
    const next=[];
    if(!realCompare) next.push('CSV候補を読み込んで候補ランキングを作る');
    if(realCompare && umD<0) next.push('馬連は現状維持で再相談');
    if(realCompare && wideD<=0) next.push('ワイド回収率重視で別案を確認');
    if(realCompare && axisD<=0) next.push('軸だけ変更した場合を確認');
    if(!next.length) next.push('提案Aを採用して再計算');
    return `<div class="consultNarrative">
      <h4>1. 今回分析した内容</h4><p>${analysis}</p>
      <h4>2. 比較した候補ランキング</h4>${candidateRankingsHtml(it)}
      <h4>3. 比較した結果</h4><p>${safe(compareResultText(it))}</p>
      <h4>4. なぜその提案になったか</h4><p>${reason}</p>
      <h4>5. 変更した予想ルール</h4><p>${ruleChange}</p>
      <h4>6. 変更後に数値がどう変わったか</h4><p>${numbers}</p>
      <h4>7. メリット</h4><p>${merit}</p>
      <h4>8. デメリット・注意点</h4><p>${caution}</p>
      <h4>9. 私ならこうする</h4><p>${recommend}</p>
      <h4>10. 次に試すなら</h4><p>${safe(next.join('、'))} が良いです。</p>
    </div>`;
  }

  function describeRuleSet(r, label){
    const txt=String(r&& (r.ruleText||r.rule||r.ruleName||r.pattern||r.conditionText) || '').trim();
    if(txt) return safe(txt);
    const cat=String(r&&r.category||'');
    const parts=[];
    if(/G1|G2|G3|OP|L|全体|芝|ダ|障|ハンデ|定量|別定/.test(cat)) parts.push(cat.replace(/[|_]/g,' / '));
    const base=[
      '軸：2〜6人気＋連動＋隣±1＋5系の中で軸スコア上位',
      '馬連：軸から相手条件に合う2点',
      'ワイド：軸から相手条件に合う2点',
      '3連複：軸を含む4点。軸に合う相手が足りない場合は無理に固定候補を入れない'
    ];
    if(parts.length) base.unshift(`カテゴリー：${parts.join(' / ')}`);
    return safe(base.join(' / '));
  }
  function comparedPatternsText(it){
    const rows=meaningfulCandidateRows(it);
    const labels=[];
    rows.slice(0,5).forEach(r=>{
      const n=String(r.ruleText||r.rule||r.ruleName||r.pattern||'').trim();
      if(n && !labels.includes(n)) labels.push(n);
    });
    if(labels.length) return safe(labels.join('、'));
    if(!hasRealCandidateComparison(it)) return '候補ルール別の数値はまだ未算出です。CSV候補または再計算データが入ったら、軸だけ変更・5系優先・連動優先・隣±1優先・相手条件だけ変更を比較します。';
    return '軸だけ変更、5系優先、連動優先、隣±1優先、人気条件変更、相手条件変更を比較しました。';
  }
  function explainEffect(axisD,allD,umD,wideD,triD){
    if(axisD<=0 && allD<=0 && umD<=0 && wideD<=0 && triD<=0){
      return '今回の比較では、軸・馬連・ワイド・3連複のどれも現状を上回るほどの改善が出ていません。';
    }
    if(axisD>0 && (wideD>0 || triD>0)) return '軸が安定することで、ワイドまたは3連複まで連動して改善する形です。';
    if(wideD>0 && umD<0) return 'ワイドは改善しますが、馬連は下がるため、ワイド重視か馬連維持かで判断が分かれます。';
    if(triD>0 && axisD<=0) return '3連複だけは改善していますが、軸の安定が伸びていないため、採用は慎重に見た方が良いです。';
    if(allD>0) return '全体回収率を押し上げる候補ですが、券種別に悪化している部分がないか確認が必要です。';
    return '一部の券種だけ改善しているため、全体採用ではなく券種指定での再相談が向いています。';
  }
  function focusPoint(axisD,allD,umD,wideD,triD){
    if(axisD<=0 && (wideD>0 || triD>0)) return '軸よりも相手選択の影響が大きい可能性があります。軸は維持して相手条件だけ見直す価値があります。';
    if(axisD>0 && umD<0) return '軸は良くなっていますが、馬連の相手が噛み合わなくなる可能性があります。馬連は現状維持の別案も確認したいです。';
    if(wideD<=0 && triD<=0 && umD<=0) return '馬券側の改善が出ていないので、今回はルール変更より対象Rを増やす方が安全です。';
    if(wideD>0) return 'ワイド改善が一番分かりやすいので、ワイド重視なら🟢採用です。';
    return '改善している券種と悪化している券種の差を見て、全体反映ではなく部分反映を検討したいです。';
  }

  function plainRuleName(r,fallback){
    return String(r&& (r.ruleText||r.rule||r.ruleName||r.pattern||r.conditionText||r.category) || fallback || 'ルール');
  }
  function deltaVal(a,b){
    return Math.round((num(a)-num(b))*10)/10;
  }
  function inlineRecommendation(axisD,allD,umD,wideD,triD){
    if(axisD<=0 && allD<=0 && umD<=0 && wideD<=0 && triD<=0) return '今回は採用せず、対象RやCSV候補が増えてから再相談します。';
    if(wideD>0 && umD<0) return 'ワイド重視なら相談を続けます。馬連も守りたいなら、馬連現状維持で別案を確認します。';
    if(axisD>0 && allD>=0) return '軸の安定を優先して、まず安全案として🟢採用にします。';
    if(allD>0) return '総合回収率重視なら🟢採用にします。';
    return '改善している券種だけを指定して再相談します。';
  }
  function ruleName(r,fallback){
    return safe(r.ruleText||r.rule||r.ruleName||r.pattern||r.conditionText||r.category||fallback||'ルール');
  }
  function changePhrase(label,a,b){
    a=num(a); b=num(b); const d=Math.round((b-a)*10)/10;
    if(Math.abs(d)<0.1) return `${label}は${a}%で同等`;
    return `${label}は${a}%→${b}%（${d>0?'+':''}${d}%）`;
  }
  function explainAlt(a){
    const axis=num(a.axisPlace||a.axisPlaceRate), all=num(a.allReturn), um=num(a.umarenReturn), wide=num(a.wideReturn), tri=num(a.sanrenpukuReturn);
    let focus='';
    if(a.altType==='safe') focus='現状ルールを大きく崩さず、改善が見込める部分だけを取り込む案です。原因切り分けがしやすいので、最初に試すならこの案です。';
    else if(a.altType==='return') focus='回収率を優先する案です。的中率が多少下がっても、払戻の大きい形を拾える候補を優先します。';
    else focus='軸複勝率や的中率を優先する案です。大きな配当よりも、まず馬券内に軸を置く安定性を見ます。';
    let reason=`この案では、軸複勝率${axis}%、全体回収率${all}%、馬連${um}%、ワイド${wide}%、3連複${tri}%を見ています。`;
    if(wide>=100 && um<100) reason+=' ワイドはプラス圏ですが馬連は弱いため、ワイド中心で採用するかを判断します。';
    else if(um>=100 && wide<100) reason+=' 馬連はプラス圏ですがワイドが弱いため、ワイド改善目的なら別案を見た方が良いです。';
    else if(all>=100) reason+=' 全体回収率がプラス圏なので、総合成績を重視するなら🟢採用です。';
    else reason+=' まだプラス材料は弱いため、対象Rが少ない場合は様子見でも良いです。';
    return `<p>${safe(focus)}</p><p>${safe(reason)}</p>`;
  }
  function altCard(a,proposalIdx,altIdx){
    const rule=a.ruleText?`<div class="hint"><b>候補ルール：</b>${safe(a.ruleText)}</div>`:'';
    return `<div class="answerOption">
      <label class="checkLine"><input type="radio" name="answerAlt${proposalIdx}" onchange="KV2RuleConsult.chooseAnswerProposal(${proposalIdx},${altIdx})"> <b>${safe(a.altLabel)}</b></label>
      <p>${safe(a.altDesc)}</p>${rule}
      <div class="aiTalk smallTalk">${explainAlt(a)}</div>
      <div class="tableWrap"><table class="miniStats"><tr><th>区分</th><th>数値</th></tr>
        <tr><td>軸複勝率</td><td>${num(a.axisPlace||a.axisPlaceRate)}%</td></tr>
        <tr><td>全体回収率</td><td>${num(a.allReturn)}%</td></tr>
        <tr><td>馬連 的中率 / 回収率</td><td>${num(a.umarenHit||a.hitRate)}% / ${num(a.umarenReturn)}%</td></tr>
        <tr><td>ワイド 的中率 / 回収率</td><td>${num(a.wideHit||a.hitRate)}% / ${num(a.wideReturn)}%</td></tr>
        <tr><td>3連複 的中率 / 回収率</td><td>${num(a.sanrenpukuHit||a.hitRate)}% / ${num(a.sanrenpukuReturn)}%</td></tr>
      </table></div>
      <div class="subtle">この案を採用すると、反映時はこの相談後提案が対象になります。</div>
    </div>`;
  }
  function chooseAnswerProposal(proposalIdx,altIdx){
    const prop=loadLast(); const item=(prop.items||[])[proposalIdx];
    if(!item) return;
    const comment=String(document.getElementById('proposalComment'+proposalIdx)?.value||'').trim();
    const alt=proposalAlternatives(item,comment)[altIdx];
    if(!alt) return;
    item.best=Object.assign({},alt,{fromConversation:true,selectedAlt:alt.altLabel});
    prop.best=item.best;
    saveLast(prop);
    const main=document.querySelector(`.proposalAdoptCheck[data-idx="${proposalIdx}"]`);
    if(main) main.checked=true;
    const memo=document.getElementById('proposalMemo');
    if(memo){
      const add=`${optionLabel(item.category)}：${alt.altLabel}を採用`;
      if(!memo.value.includes(add)) memo.value=(memo.value?memo.value+'\n':'')+add;
    }
  }
  function judgeRow(name,cur,best){
    cur=num(cur); best=num(best); const d=Math.round((best-cur)*10)/10;
    const judge=d>0?'改善':d<0?'悪化':'同等';
    const cls=d>0?'improve':d<0?'bad':'';
    return `<tr><td>${safe(name)}</td><td>${cur}%</td><td>${best}%</td><td class="${cls}">${judge}</td></tr>`;
  }
  function aiCarryResultSummary(prefs){
    const arr=(prefs&&prefs.aiCarry)||[];
    if(!arr.length) return `<div class="card hint"><b>相談内容連携</b><br>今回の相談に引き継いだAIカルテ候補はありません。</div>`;
    const themes=groupCarryThemes(arr);
    const by=themes.reduce((o,h)=>{(o[h.kind]||(o[h.kind]=[])).push(h); return o;},{});
    const countLine=['axis','umaren','wide','sanrenpuku','other'].map(k=>({k,n:(by[k]||[]).length})).filter(x=>x.n).map(x=>`${hintKindLabel(x.k)} ${x.n}件`).join(' / ');
    const selectedLabel=(prefs&&prefs.selectedCategoryLabel)||'全て';
    return `<div class="card aiCarry"><div class="title">相談内容連携</div>`+
      `<div class="hint"><b>相談前から引き継ぎ</b><br>対象カテゴリー：${safe(selectedLabel)}<br>改善テーマ：${themes.length}件${countLine?`（${safe(countLine)}）`:''}<br><span class="subtle">相談前でチェックした改善テーマのみを比較対象にしています。採用時は「相談内容からの変更」として記録します。</span></div></div>`;
  }
  function aiCarryInlineForItem(it){
    const arr=((it&&it.prefs&&it.prefs.aiCarry)||[]);
    if(!arr.length) return '';
    const cat=it.category||'';
    const exact=(it&&it.exactCarry&&it.exactCarry.length)?it.exactCarry:arr.filter(h=>carryRelationToCategory(h,cat)==='exact'||carryRelationToCategory(h,cat)==='all');
    const ref=(it&&it.referenceCarryItems)||arr.filter(h=>carryRelationToCategory(h,cat)==='reference');
    const useRaw=(exact.length?exact:ref);
    const themes=groupCarryThemes(useRaw);
    if(!themes.length) return '';
    const sample=(it&&it.current&&(it.current.doneR||it.current.totalR))||0;
    const priority=sortCarryThemesForCompare(themes);
    const title=exact.length?'AIカルテ改善テーマ':'カテゴリー外の参考改善テーマ';
    const note=exact.length?'カテゴリー一致候補です。':'カテゴリー完全一致ではないため、参考扱いです。';
    const bd=carryScoreBreakdown(useRaw,sample);
    const bdText=bd.total>0?`AIカルテ一致度：${bd.total}点${bd.samplePenalty?'（参考）':''}`:'';
    const by=themes.reduce((o,h)=>{(o[h.kind]||(o[h.kind]=[])).push(h); return o;},{});
    const sectionHtml=['axis','umaren','wide','sanrenpuku','other'].map(k=>{
      const a=sortCarryThemesForCompare(by[k]||[]);
      if(!a.length) return '';
      return `<details class="carryCheckedKind" open><summary>${safe(hintKindLabel(k))}改善（${a.length}）</summary><ol class="compactList">${a.map((h,i)=>`<li>${i+1}. ☑ ${safe(h.theme)} <span class="subtle">${h.count||0}回</span></li>`).join('')}</ol></details>`;
    }).join('');
    const checkedHtml=`<details class="carryCheckedDetails"><summary>今回比較するテーマ（AI優先順位順 / ${themes.length}件）</summary>${sectionHtml}<div class="subtle">発生回数・重要度・カテゴリー一致度から優先順位を決定します。</div></details>`;
    const refHtml=(exact.length && ref.length)?`<details><summary>カテゴリー外の参考候補を見る</summary><ul class="compactList">${groupCarryThemes(ref).slice(0,4).map(h=>`<li>${safe(hintKindLabel(h.kind))}：${safe(h.theme)} <span class="subtle">参考 / ${h.count||0}回</span></li>`).join('')}</ul></details>`:'';
    return `<div class="hint aiCarryInline"><b>${title}</b><div class="subtle">${note}${sample<3?' 対象Rが少ないため、🟢採用ではなく条件検討です。':''}</div>`+
      checkedHtml+
      `${bdText?`<div class="subtle"><span class="badge ${aiScoreClass(bd.total,bd.samplePenalty)}">${safe(bdText)}</span><br>発生回数・重要度・カテゴリー一致度を総合評価した参考スコアです。</div>`:''}`+refHtml+`</div>`;
  }


  function aiCarryNarrative(it){
    const arr=((it&&it.prefs&&it.prefs.aiCarry)||[]).slice().sort((a,b)=>(b.score||0)-(a.score||0)||(b.count||0)-(a.count||0));
    if(!arr.length) return '';
    const themes=groupCarryThemes(arr).slice(0,3);
    const top=themes.map(h=>`${hintKindLabel(h.kind)}「${h.theme}」`).join('、');
    const n=(it&&it.current&&(it.current.doneR||it.current.totalR))||0;
    if(n<3) return `<p><b>AIカルテから見た優先比較：</b>${safe(top)}。対象Rが少ないため、今回は変更判断ではなく次回比較リストとして残します。</p>`;
    return `<p><b>AIカルテから見た優先比較：</b>${safe(top)}。最終判断は候補ルールの軸複勝率・回収率が実際に改善するかを優先します。</p>`;
  }


  let consultCancelToken=null;
  function prepareConsult(cats){
    cats=Array.isArray(cats)?cats:[cats||'全て'];
    const prefs=collectPrefs();
    prefs.selectedCategoryLabel=categoryDisplay(cats);
    // フォーム上のチェック候補が取得できない経路（直接実行・旧画面・DOM再描画後）でも、
    // 保存済みレースのAIカルテから候補を自動抽出して相談結果へ渡す。
    if(!prefs.aiCarry || !prefs.aiCarry.length){
      prefs.aiCarry=autoCarryHintsForCategories(cats,12);
      rebuildAiCarryByKind(prefs);
    }
    let actualCats=[];
    if(cats.includes('全て')){
      const savedCats=S.loadRaces().map(categoryKeyOfRace).filter(Boolean).map(normalizeCategoryLabel);
      // ランキングCSVは保存レース側にまだ存在しない/表記が微妙に違うカテゴリーも持つ。
      // 全カテゴリー相談ではCSV側のカテゴリーも比較対象に含める。
      // ただし、判定別ランキングは相談候補から除外し、グレード親子一致は行わない。
      const csvCats=loadRows()
        .filter(r=>isDirectRuleCandidate(r))
        .map(r=>normalizeCategoryLabel(r&&r.category||''))
        .filter(c=>isRealConsultCategoryLabel(c));
      actualCats=[...new Set([...savedCats,...csvCats])];
    }else{
      actualCats=cats.map(normalizeCategoryLabel).filter(Boolean);
    }
    return {cats,prefs,actualCats};
  }

  // 現状と提案の有効差分判定。
  // 反映済み・同値候補を比較候補に残さないため、表示で使う主要成績に実差分がある場合だけ true にする。
  function hasEffectiveProposalDiff(it){
    try{
      if(!it) return false;
      const cur=it.current||it.cur||{};
      const best=it.best||it.proposal||{};
      if(!best || !Object.keys(best).length) return false;
      const pairs=[
        ['axisPlace','axisPlaceRate'],
        ['allReturn','returnRate'],
        ['umarenHit','umarenHitRate'],
        ['umarenReturn','umarenReturnRate'],
        ['wideHit','wideHitRate'],
        ['wideReturn','wideReturnRate'],
        ['sanrenpukuHit','sanrenpukuHitRate'],
        ['sanrenpukuReturn','sanrenpukuReturnRate']
      ];
      function val(o,a,b){
        if(!o) return 0;
        if(o[a]!=null && o[a] !== '') return num(o[a]);
        if(b && o[b]!=null && o[b] !== '') return num(o[b]);
        return 0;
      }
      for(const [a,b] of pairs){
        const d=Math.abs(val(best,a,b)-val(cur,a,b));
        if(d>=0.1) return true;
      }
      // 成績が完全同値でも、明示的な変更フラグがある候補は残す。
      // ただし通常の同値再提案は除外する。
      if(best.forceCandidate===true || it.forceCandidate===true) return true;
      return false;
    }catch(e){
      console.warn('hasEffectiveProposalDiff failed', e);
      return true; // 判定失敗時は候補を消さず、画面停止を避ける
    }
  }



  // 全カテゴリー相談では「改善がある候補」だけを表示する。
  // 差分なし、悪化のみ、現状=提案の候補は表示しない。
  // 対象R不足でも改善がある場合は参考候補として残す。
  function hasProposalImprovement(it){
    try{
      if(!it) return false;
      const cur=it.current||it.cur||{};
      const best=it.best||it.proposal||{};
      if(proposalImprovesAgainst(cur,best)) return true;
      // best が古い参照で改善を拾えない場合に備え、画面候補一覧と同じ rows も確認する。
      // 最終的に表示される候補と改善判定の参照データを一致させるための保険。
      return (it.rows||[]).some(r=>proposalImprovesAgainst(cur,r));
    }catch(e){
      console.warn('hasProposalImprovement failed', e);
      return false;
    }
  }

  // 比較モード用の表示フィルタ。
  // 表示対象は「カテゴリー単体」ではなく、
  // 「この比較結果を1カテゴリーだけ採用した場合の全体成績」で判定する。
  // 1) 採用後の全体回収率が +5.0pt 以上改善
  // 2) 採用後の全体回収率の変化が ±5.0pt 未満の場合のみ、
  //    軸複勝率または各馬券回収率が +5.0pt 以上改善
  // カテゴリー別比較は作成したうえで、表示対象だけを全体見込みへの影響で絞る。
  function projectedOverallImpactForProposal(it, overallCurrent){
    const curOverall=overallCurrent||{};
    const curCat=(it&&it.current)||{};
    const best=(it&&it.best)||{};
    const totalN=Math.max(0,num(curOverall.doneR||curOverall.totalR||curOverall.races||0));
    const catN=Math.min(totalN||proposalDisplayRaceCount(best,curCat,it), proposalDisplayRaceCount(best,curCat,it));
    if(!totalN || !catN) return null;
    function project(overallKey,catCurKey,catBestKey,catBestAltKey){
      const before=metricValue(curOverall,overallKey);
      const c=metricValue(curCat,catCurKey);
      const b=metricValue(best,catBestKey,catBestAltKey);
      const after=round1((before*totalN - c*catN + b*catN)/totalN);
      return {before, after, diff:round1(after-before)};
    }
    return {
      all:project('allReturn','allReturn','allReturn'),
      axis:project('axisPlaceRate','axisPlaceRate','axisPlace','axisPlaceRate'),
      umaren:project('umarenReturn','umarenReturn','umarenReturn'),
      wide:project('wideReturn','wideReturn','wideReturn'),
      tri:project('sanrenpukuReturn','sanrenpukuReturn','sanrenpukuReturn')
    };
  }

  function consultSourceNameForItem(it){
    const b=(it&&it.best)||it||{};
    const src=b.consultSourceLabel||b.candidateKind||b.candidateSource||b.rankingSection||'不明';
    if(/ランキングCSV/.test(src) || b.candidateSource==='rankingCsv') return 'ランキングCSV相談';
    if(/コメント|相談コメント/.test(src) || b.candidateSource==='commentSimulation') return 'コメント相談';
    if(/通常|AIカルテ/.test(src) || b.candidateSource==='normalConsult') return '通常相談';
    return String(src||'不明');
  }
  function compareFilterReasonsForItem(it, overallCurrent){
    const reasons=[];
    try{
      if(!it){ reasons.push('候補データなし'); return reasons; }
      if(!hasEffectiveProposalDiff(it)) reasons.push('差分なし');
      const dec=consultUnifiedDecision(it, overallCurrent||{});
      if(dec.status==='条件検討') reasons.push.apply(reasons, dec.reasons||['採用・保留条件未達']);
      if(!reasons.length && !passesCompareDisplayFilter(it, overallCurrent)) reasons.push('表示条件未達');
    }catch(e){
      reasons.push('診断エラー');
    }
    return reasons.length?reasons:['表示対象'];
  }

  function formatDiffText(before,after){
    const b=round1(before), a=round1(after), d=round1(a-b);
    return `${b}% → ${a}% (${d>0?'+':''}${d}%)`;
  }
  function categoryMetricImpact(cur,best,key,bestKey,bestAlt){
    const before=metricValue(cur,key);
    const after=metricValue(best,bestKey||key,bestAlt);
    return {before,after,diff:round1(after-before)};
  }
  function rawRuleLabelForDebug(obj,fallback){
    obj=obj||{};
    const txt=String(obj.ruleText||obj.rule||obj.ruleName||obj.pattern||obj.conditionText||obj.basis||'').trim();
    return txt || fallback || '未設定';
  }
  function ruleConditionDebugHtml(it){
    const cur=(it&&it.current)||{};
    const best=(it&&it.best)||it.proposal||{};
    const now=rawRuleLabelForDebug(cur,'現状ルール');
    const next=rawRuleLabelForDebug(best,'提案ルール');
    const changed=(now!==next);
    const parts=[];
    parts.push(`<b>現状</b>：${safe(now)}`);
    parts.push(`<b>提案</b>：${safe(next)}`);
    const changedFields=[];
    [['axis','軸'],['umaren','馬連'],['wide','ワイド'],['sanrenpuku','3連複']].forEach(([k,label])=>{
      const before=String(cur[k+'Rule']||cur[k+'Condition']||cur[k+'Text']||'').trim();
      const after=String(best[k+'Rule']||best[k+'Condition']||best[k+'Text']||'').trim();
      if(before || after){
        if(before!==after) changedFields.push(`${label}:${before||'未設定'}→${after||'未設定'}`);
      }
    });
    if(!changedFields.length && changed) changedFields.push('ルール文変更あり');
    if(!changedFields.length) changedFields.push('変更条件なし');
    parts.push(`<b>変更条件</b>：${safe(changedFields.join(' / '))}`);
    return parts.join('<br>');
  }
  function candidateRecalcDebugHtml(it){
    const cur=(it&&it.current)||{};
    const best=(it&&it.best)||it.proposal||{};
    const recalc= num(best.recalcRaceCount||best.recalcR||best.simulatedRaceCount||best.axisCompared||best.ticketCompared||proposalDisplayRaceCount(best,cur,it)||cur.doneR||cur.totalR||0);
    const axisChanged=(best.changedAxisR!==undefined)?num(best.changedAxisR):((best.axisChanged!==undefined)?num(best.axisChanged):null);
    const ticketChanged=(best.changedTicketR!==undefined)?num(best.changedTicketR):((best.ticketChanged!==undefined)?num(best.ticketChanged):null);
    const ticketCompared=(best.ticketCompared!==undefined)?num(best.ticketCompared):null;
    const lines=[];
    lines.push(`再計算対象R：${safe(recalc||0)}R`);
    if(axisChanged!==null) lines.push(`軸変更R：${safe(axisChanged)}R`);
    else lines.push('軸変更R：未算出');
    if(ticketChanged!==null) lines.push(`買い目変更R：${safe(ticketChanged)}R${ticketCompared!==null?` / 比較${safe(ticketCompared)}R`:''}`);
    else lines.push('買い目変更R：未算出（候補CSVに買い目差分なし）');
    if((axisChanged===0 || axisChanged===null) && (ticketChanged===0 || ticketChanged===null)) lines.push('注意：変更Rが0/未算出のため、提案値が現状と同じになる可能性があります');
    return lines.join('<br>');
  }
  function candidateDiagnosticsDetailHtml(allItems, overallCurrent){
    const items=(allItems||[]).slice(0,80);
    if(!items.length) return '';
    const rows=items.map((it,i)=>{
      const cur=(it&&it.current)||{};
      const best=(it&&it.best)||it.proposal||{};
      const src=consultSourceNameForItem(it);
      const cat=optionLabel(it&&it.category||(best&&best.category)||cur.category||'全て');
      const impact=projectedOverallImpactForProposal(it, overallCurrent);
      const reasons=compareFilterReasonsForItem(it, overallCurrent).filter(r=>r!=='表示対象').join(' / ')||'表示対象';
      const allTxt=impact?formatDiffText(impact.all.before,impact.all.after):'計算不可';
      const axisTxt=impact?formatDiffText(impact.axis.before,impact.axis.after):'計算不可';
      const umRet=impact?formatDiffText(impact.umaren.before,impact.umaren.after):'計算不可';
      const wideRet=impact?formatDiffText(impact.wide.before,impact.wide.after):'計算不可';
      const triRet=impact?formatDiffText(impact.tri.before,impact.tri.after):'計算不可';
      const uh=categoryMetricImpact(cur,best,'umarenHit','umarenHit','umarenHitRate');
      const wh=categoryMetricImpact(cur,best,'wideHit','wideHit','wideHitRate');
      const th=categoryMetricImpact(cur,best,'sanrenpukuHit','sanrenpukuHit','sanrenpukuHitRate');
      const hitTxt=`馬連 ${formatDiffText(uh.before,uh.after)}<br>ワイド ${formatDiffText(wh.before,wh.after)}<br>3連複 ${formatDiffText(th.before,th.after)}`;
      const ruleTxt=ruleConditionDebugHtml(it);
      const recalcTxt=candidateRecalcDebugHtml(it);
      return `<tr><td>${i+1}</td><td>${safe(src)}</td><td class="left">${safe(cat)}</td><td class="left">${ruleTxt}</td><td class="left">${recalcTxt}</td><td>${safe(allTxt)}</td><td>${safe(axisTxt)}</td><td>${safe(umRet)}</td><td>${safe(wideRet)}</td><td>${safe(triRet)}</td><td class="left">${hitTxt}</td><td class="left">${safe(reasons)}</td></tr>`;
    }).join('');
    const more=(allItems||[]).length>items.length ? `<div class="hint">※候補が多いため先頭${items.length}件のみ表示しています。</div>` : '';
    return `<div class="card"><div class="title">候補別シミュレーション詳細</div><div class="hint">候補ごとに、現在ルール/提案ルール、変更条件、再計算対象R、買い目変更R、現在値・提案値・差分を表示しています。買い目変更Rが0Rまたは未算出なら、候補が実際の再計算に反映されていない可能性があります。</div><div class="tableWrap"><table class="consultTable"><thead><tr><th>No</th><th>相談種別</th><th>カテゴリー</th><th>現在/提案ルール・変更条件</th><th>再計算/変更R</th><th>全体回収率</th><th>軸複勝率</th><th>馬連回収率</th><th>ワイド回収率</th><th>3連複回収率</th><th>馬券的中率</th><th>除外/判定理由</th></tr></thead><tbody>${rows}</tbody></table></div>${more}</div>`;
  }
  function consultNoCandidateDiagnosticsHtml(allItems, overallCurrent, prefs){
    const items=allItems||[];
    const sourceOrder=['通常相談','ランキングCSV相談','コメント相談','不明'];
    const sourceMap={};
    const reasonMap={};
    items.forEach(it=>{
      const src=consultSourceNameForItem(it);
      sourceMap[src]=sourceMap[src]||{total:0,shown:0,excluded:0,reasons:{}};
      sourceMap[src].total++;
      const pass=hasEffectiveProposalDiff(it) && passesCompareDisplayFilter(it, overallCurrent);
      if(pass) sourceMap[src].shown++;
      else sourceMap[src].excluded++;
      compareFilterReasonsForItem(it, overallCurrent).forEach(r=>{
        if(r==='表示対象') return;
        sourceMap[src].reasons[r]=(sourceMap[src].reasons[r]||0)+1;
        reasonMap[r]=(reasonMap[r]||0)+1;
      });
    });
    const csvUsed=hasRankingCsvConsult();
    const commentUsed=hasCommentConsult(prefs);
    const lines=[];
    ['通常相談','ランキングCSV相談','コメント相談'].forEach(src=>{
      const d=sourceMap[src]||{total:0,shown:0,excluded:0,reasons:{}};
      if(src==='ランキングCSV相談' && !csvUsed){ lines.push(`<tr><td>${src}</td><td colspan="3">未使用（ランキングCSVなし）</td></tr>`); return; }
      if(src==='コメント相談' && !commentUsed){ lines.push(`<tr><td>${src}</td><td colspan="3">未使用（コメントなし）</td></tr>`); return; }
      const rs=Object.entries(d.reasons).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${safe(k)} ${v}件`).join('<br>')||'除外理由なし';
      lines.push(`<tr><td>${src}</td><td>${d.total}件</td><td>${d.excluded}件</td><td class="left">${rs}</td></tr>`);
    });
    const reasonLines=Object.entries(reasonMap).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${safe(k)}：${v}件`).join('<br>')||'除外理由なし';
    return `<div class="card"><div class="title">候補0件の内訳</div><div class="hint">通常相談・ランキングCSV相談・コメント相談のうち、利用可能な相談だけを作成し、共通の提案条件で除外理由を集計しています。</div><div class="tableWrap"><table class="consultTable"><thead><tr><th>相談種別</th><th>作成候補</th><th>除外候補</th><th>主な除外理由</th></tr></thead><tbody>${lines.join('')}</tbody></table></div><div class="hint"><b>除外理由まとめ</b><br>${reasonLines}</div></div>${candidateDiagnosticsDetailHtml(items, overallCurrent)}`;
  }

  function passesCompareDisplayFilter(it, overallCurrent){
    try{
      if(!it) return false;
      if(!hasEffectiveProposalDiff(it)) return false;
      const dec=consultUnifiedDecision(it, overallCurrent||{});
      return dec.status==='採用' || dec.status==='保留';
    }catch(e){
      console.warn('passesCompareDisplayFilter failed', e);
      return false;
    }
  }


  function renderConsultResult(cats,prefs,actualCats,items){
    const started=Date.now();
    try{
      updateProgress(actualCats&&actualCats.length||0, actualCats&&actualCats.length||0, '結果を作成中：集計');
      const cur=currentStats(cats);
      // 全カテゴリー相談・個別相談とも、表示するのは「改善がある候補」だけ。
      // 差分なし、悪化のみ、現状=提案は比較候補から除外する。
      const activeItems=(items||[]).filter(it=>{
        if(!it) return false;
        // 比較モードでは、強制表示候補も含めて表示条件を統一する。
        // カテゴリー別比較は維持し、表示対象だけを採用後の全体成績基準で絞る。採用条件または保留条件を満たすものだけを残す。
        return hasEffectiveProposalDiff(it) && passesCompareDisplayFilter(it, cur);
      });
      const rows=activeItems.map(x=>x.best).sort((a,b)=>(b.score||0)-(a.score||0));
      let best=projectedSummaryFromInitialDecisions(activeItems,cur);
      const initialAdoptCount=(best&&Number.isFinite(Number(best.adoptedCategories)))?Number(best.adoptedCategories):0;
      if(!initialAdoptCount){ best=Object.assign({},cur,{summaryBasis:'initial-selection',adoptedCategories:0}); }
      const proposal={targetCategory:categoryDisplay(cats),targetCategories:cats,actualCategories:actualCats,current:cur,best,items:activeItems,prefs,createdAt:new Date().toISOString()};
      saveLast(proposal);
      const many=(activeItems||[]).length>20;
      const noCandidates=!activeItems.length;
      const proposalHtml=noCandidates
        ? `<div class="card"><div class="title">比較表示対象なし</div><div class="hint">採用後の全体成績で、カテゴリートータル判定必要条件を満たし、採用条件または保留条件を満たすカテゴリーはありません。</div></div>${consultNoCandidateDiagnosticsHtml(items,cur,prefs)}`
        : (many ? proposalCardsFast(activeItems) : proposalCards(activeItems,cur));
      window.__kv2ConsultCurrentStats = cur;
      const adoptHtml=noCandidates ? '' : (many ? finalAdoptionChecklistFast(activeItems) : finalAdoptionChecklist(activeItems));
      const elapsed=Date.now()-started;
      const resultHint=noCandidates
        ? ((prefs&&prefs.commentIntent&&prefs.commentIntent.axisPopularityChange)?'相談コメントの軸人気帯変更を実測しましたが、表示条件を満たす比較結果はありません。':'表示条件を満たす比較結果はありません。')
        : (many?'全カテゴリー相談のため、改善・確認候補を軽量一覧で表示しています。':'改善候補または相談コメントの実測確認候補を表示しています。採用するか現状維持にするか選択できます。<div class="compare-note">※比較シミュレーションです。改善・悪化の両方を表示します。採用したカテゴリーのみ反映されます。</div>');
      const actionHtml=noCandidates
        ? `<div class="card"><div class="title">反映操作</div><div class="hint">変更候補がないため、反映操作は不要です。</div><div class="bottomBar"><button class="secondary" onclick="KV2RuleConsult.show('all')">戻る</button></div></div>`
        : `<div class="card"><div class="title">反映操作</div><div class="hint">採用したカテゴリーのみ反映します。<br>現状維持は変更しません。</div><textarea id="proposalMemo" placeholder="反映メモ（任意）">${safe(prefs.comment)}</textarea><div class="bottomBar"><button class="green" type="button" data-rule-apply="1" data-recalc="0">この比較結果を採用</button><button class="green" type="button" data-rule-apply="1" data-recalc="1">採用＋再計算</button><button class="secondary" onclick="KV2RuleConsult.show('all')">戻る</button></div></div>`;
      document.getElementById('app').innerHTML=header('予想ルール比較結果')+screen(`
        <div class="card"><div class="title">予想ルール比較結果</div><div class="grid3"><div><b>比較候補：</b><span style="color:#075bb5;font-weight:800">${rows.length}件</span></div><div><b>相談モード：</b><span class="improve">全体回収率優先 → 軸複勝率優先</span></div><div><b>対象カテゴリー：</b>${safe(categoryDisplay(cats))}</div></div><div class="hint">${resultHint} 結果作成 ${elapsed}ms</div><div class="bottomBar">${C.copyButtonHtml ? C.copyButtonHtml('比較結果全文コピー','予想ルール比較結果全文') : ''}</div></div>
        ${commentReflectionHtml(prefs)}${consultDataStatusHtml(activeItems)}${summary(cur,best)}${isConsultCompareMode(prefs)?'':aiCarryResultSummary(prefs)}${proposalHtml}${adoptHtml}${actionHtml}`);
      if(!noCandidates) setTimeout(updateAdoptionWarnings,0);
    }catch(e){
      console.error('rule consult render error',e);
      document.getElementById('app').innerHTML=header('予想ルール相談')+screen(`<div class="card"><div class="title">相談結果の作成でエラー</div><div class="hint">カテゴリー比較は完了しましたが、結果表示で停止しました。<br>${safe(e&&e.message||e)}</div><div class="bottomBar">${C.copyButtonHtml ? C.copyButtonHtml('エラー詳細コピー','予想ルール相談エラー詳細') : ''}<button class="secondary" onclick="KV2RuleConsult.show('all')">戻る</button></div></div>`);
    }
  }
  function progressHtml(done,total,current,percent){
    const pct=Math.max(0,Math.min(100,Math.round(percent||0)));
    return header('予想ルール相談')+screen(`
      <div class="card">
        <div class="title">予想ルール相談中…</div>
        <div class="hint">カテゴリーごとに分割して比較しています。画面が固まらないよう、進捗を更新しながら処理します。</div>
        <div style="margin:14px 0 8px;height:18px;background:#e5e7eb;border-radius:999px;overflow:hidden"><div style="height:100%;width:${pct}%;background:#16a34a"></div></div>
        <div style="font-size:26px;font-weight:800;color:#075bb5">${pct}%</div>
        <p><b>${done} / ${total}</b> カテゴリー完了</p>
        <p class="subtle">現在：${safe(current||'準備中')}</p>
        <div class="bottomBar"><button class="secondary" onclick="KV2RuleConsult.cancelRun()">中止</button></div>
      </div>`);
  }
  function updateProgress(done,total,current){
    const app=document.getElementById('app');
    if(app) app.innerHTML=progressHtml(done,total,current,total?done/total*100:0);
  }
  function cancelRun(){
    if(consultCancelToken) consultCancelToken.cancelled=true;
    consultCancelToken=null;
    show('all');
  }
  function run(cats){
    const ctx=prepareConsult(cats);
    const items=ctx.actualCats.map(cat=>pickBestForCat(cat,ctx.prefs));
    renderConsultResult(ctx.cats,ctx.prefs,ctx.actualCats,items);
  }
  function runAsync(cats){
    const ctx=prepareConsult(cats);
    const total=ctx.actualCats.length;
    const items=[];
    const token={cancelled:false};
    consultCancelToken=token;
    updateProgress(0,total,ctx.actualCats[0]||'全体');
    let i=0;
    function step(){
      if(token.cancelled) return;
      if(i>=total){
        consultCancelToken=null;
        updateProgress(total,total,'結果を作成中');
        setTimeout(()=>{ if(!token.cancelled) renderConsultResult(ctx.cats,ctx.prefs,ctx.actualCats,items); },20);
        return;
      }
      const cat=ctx.actualCats[i];
      updateProgress(i,total,cat);
      setTimeout(()=>{
        if(token.cancelled) return;
        try{ items.push(pickBestForCat(cat,ctx.prefs)); }
        catch(e){ console.error('rule consult category error',cat,e); items.push({category:cat,current:currentStats(cat),best:currentStats(cat),error:String(e&&e.message||e)}); }
        i++;
        updateProgress(i,total,ctx.actualCats[i]||'結果を作成中');
        setTimeout(step,0);
      },0);
    }
    setTimeout(step,30);
  }
  function summary(cur,best){
    cur=cur||{}; best=best||cur;
    const adopted=Number(best.adoptedCategories||0);
    if(best.summaryBasis==='initial-selection' && !adopted){ best=cur; }
    const countsHtml=(best&&best.totalCandidateCategories!==undefined)
      ? `<div class="hint"><b>採用候補内訳</b><br>採用：${safe(best.improveCategories||0)}件 / 保留：${safe(best.worsenCategories||0)}件 / 参考：${safe(best.referenceCategories||0)}件 / 条件検討：${safe(best.keepCategories||0)}件 / 表示候補：${safe(best.totalCandidateCategories||0)}件</div>`
      : '';
    const note=(adopted>0)
      ? `<div class="hint">採用候補 ${adopted}件をすべて反映した場合の全体成績（見込み）です。実際の反映は、下の採用判断で「採用」を選んだカテゴリーだけ行います。</div>${countsHtml}`
      : `<div class="hint">初期採用0件のため、見直し後サマリーは現状と同値です。</div>${countsHtml}`;
    const rows=consultMetricDefs().map(([label,key])=>{
      const before=metricValueForSummary(cur,key);
      const after=metricValueForSummary(best,key);
      const d=round1(after-before);
      const cls=d>0?'improve':(d<0?'bad':'');
      return `<tr><td>${safe(label)}</td><td>${before}%</td><td>${after}%</td><td class="${cls}">${d>0?'+':''}${d}%</td><td>${d>0?'改善 ↗':(d<0?'悪化 ↘':'変化なし')}</td></tr>`;
    }).join('');
    return `<div class="card"><div class="title">採用候補をすべて反映した場合の全体成績（見込み）</div>${note}<table class="miniStats"><tr><th>指標</th><th>現在の全体成績</th><th>見直し後の全体成績</th><th>差分</th><th>判定</th></tr>${rows}</table></div>`;
  }

  function resultTable(rows,best){
    return `<div class="card"><div class="tableWrap"><table class="consultTable"><thead><tr><th>カテゴリー</th><th>対象R</th><th>判定</th><th>軸複勝率</th><th>全体回収率</th><th>馬連</th><th>ワイド</th><th>3連複</th><th>スコア</th></tr></thead><tbody>${rows.map(r=>`<tr><td class="left">${r===best?'<span class="badge orange">比較結果</span> ':''}${safe(r.category)}</td><td style="color:#075bb5;font-weight:800">${r.races||r.doneR||r.totalR||0}</td><td><span class="badge blue">${safe(r.basis||'比較')}</span></td><td class="improve">${r.axisPlace||r.axisPlaceRate||0}%</td><td class="improve">${r.allReturn||0}%</td><td>${r.umarenReturn||0}%</td><td>${r.wideReturn||0}%</td><td>${r.sanrenpukuReturn||0}%</td><td>${r.score||0}</td></tr>`).join('')}</tbody></table></div></div>`;
  }
  function proposalText(cur,best,prefs){
    const items=[];
    if((best.allReturn||0)>(cur.allReturn||0)) items.push('全体回収率が現状より高い候補を優先。');
    if((best.axisPlace||best.axisPlaceRate||0)>(cur.axisPlaceRate||0)) items.push('軸複勝率が改善するため、軸条件の見直し候補。');
    if(best.ruleText) items.push('CSVルール：'+safe(best.ruleText));
    const comment=String(prefs&&prefs.comment||'').trim();
    if(comment) items.unshift('相談コメント反映：「'+safe(comment)+'」を最優先条件として評価。');
    const labels=commentDirectiveLabels(prefs);
    if(labels.length) items.push('コメント解釈：'+labels.map(safe).join(' / '));
    if(!items.length) items.push('現状ルールと大きな差がないため、反映は任意。');
    return `<ul>${items.map(x=>`<li>${x}</li>`).join('')}</ul><p class="subtle">買い目固定：${prefs.umaren.fixed&&prefs.wide.fixed&&prefs.sanrenpuku.fixed?'維持':'一部変更可'}</p>`;
  }
  function loadApplyHistory(){try{const a=JSON.parse(localStorage.getItem('keibaPredictionV2.ruleConsultApplyHistory')||'[]'); return Array.isArray(a)?a:[]}catch(e){return []}}
  function saveApplyHistory(a){localStorage.setItem('keibaPredictionV2.ruleConsultApplyHistory',JSON.stringify((a||[]).slice(-200)))}
  function saveConsultApplyHistory(targets,prop,memo,recalc){
    const carry=(prop&&prop.prefs&&prop.prefs.aiCarry)||[];
    const hist=loadApplyHistory();
    (targets||[]).forEach(t=>hist.push({
      at:new Date().toISOString(),category:t.key,memo:String(memo||''),recalc:!!recalc,
      source:carry.length?'AIカルテ由来':'予想ルール相談',aiKarteCarry:carry,
      proposal:compactBest(t.best),current:compactBest(t.current)
    }));
    saveApplyHistory(hist);
  }

  function latestOverallSummaryHtml(stats){
    stats=stats||{};
    const rows=consultMetricDefs().map(([label,key])=>`<tr><td>${safe(label)}</td><td>${metricValueForSummary(stats,key)}%</td></tr>`).join('');
    return `<div class="tableWrap"><table class="miniStats"><tr><th>指標</th><th>最新成績</th></tr>${rows}</table></div>`;
  }
  function showApplyResultBanner(adoptedCount, remainingCount, latest, recalc, recalced, fail){
    const app=document.getElementById('app');
    if(!app) return;
    const banner=`<div class="card applyResultBanner" style="border:2px solid #16a34a;background:#f0fdf4;">
      <div class="title">採用＋再計算後サマリー</div>
      <div class="grid3">
        <div><b>採用済み：</b><span class="improve" style="font-weight:900">${safe(adoptedCount)}カテゴリー</span></div>
        <div><b>残り比較候補：</b>${safe(remainingCount)}カテゴリー</div>
        <div><b>再計算：</b>${recalc?`${safe(recalced||0)}件${fail?` / 失敗${safe(fail)}件`:''}`:'未実行'}</div>
      </div>
      <div class="hint">採用したカテゴリーだけ反映しました。続けて残り候補を確認し、必要なカテゴリーだけ追加採用できます。</div>
      ${latestOverallSummaryHtml(latest)}
    </div>`;
    const screenBody=app.querySelector('.screen') || app;
    screenBody.insertAdjacentHTML('afterbegin', banner);
    try{ window.scrollTo({top:0,behavior:'smooth'}); }catch(e){ window.scrollTo(0,0); }
  }

  function applyRule(recalc){
    try{
      const prop=loadLast(); if(!prop.best){alert('提案がありません'); return;}
      const memo=String(document.getElementById('proposalMemo')?.value||'');
      const selected=selectedProposalIndices();
      const rawItems=prop.items||[];
      const items=rawItems.map((it,i)=>Object.assign({__idx:i},it)).filter((_,i)=>selected.includes(i));
      if(prop.items && prop.items.length && !items.length){alert('最終採用確認で「採用」を選んだカテゴリーがありません'); return;}
      const targets=items.length?items.map(it=>{
        const parts=selectedProposalParts(it.__idx);
        return {key:it.category,best:mergePartialBest(it.current,it.best,parts),current:it.current,parts};
      }):[{key:prop.targetCategory||prop.best.category||'全て',best:prop.best,current:prop.current,parts:['axis','umaren','wide','sanrenpuku']}];
      const compactPrefs={
        comment:prop.prefs&&prop.prefs.comment||'',
        selectedCategoryLabel:prop.prefs&&prop.prefs.selectedCategoryLabel||'',
        axis:prop.prefs&&prop.prefs.axis,
        umaren:prop.prefs&&prop.prefs.umaren,
        wide:prop.prefs&&prop.prefs.wide,
        sanrenpuku:prop.prefs&&prop.prefs.sanrenpuku,
        commentIntent:prop.prefs&&prop.prefs.commentIntent
      };
      targets.forEach(t=>S.setRule(t.key,{
        type:'ruleConsultProposal',
        category:t.key,
        proposal:compactBest(t.best),
        current:compactBest(t.current),
        prefs:compactPrefs,
        memo:String(memo||'').slice(0,500),
        partialParts:t.parts||['axis','umaren','wide','sanrenpuku'],
        aiKarteCarryCount:((prop.prefs&&prop.prefs.aiCarry)||[]).length,
        source:(prop.prefs&&prop.prefs.aiCarry&&prop.prefs.aiCarry.length)?'AIカルテ由来':'予想ルール相談',
        active:true,
        updatedAt:new Date().toISOString()
      }));
      saveConsultApplyHistory(targets.map(t=>({key:t.key,best:compactBest(t.best),current:compactBest(t.current)})),{prefs:compactPrefs},memo,recalc);
      if(recalc){
        if(!window.KV2Prediction || typeof window.KV2Prediction.generate !== 'function'){
          throw new Error('予想再計算エンジン（KV2Prediction.generate）が読み込まれていません。ページを再読み込みしてください。');
        }
        const races=S.loadRaces(); let count=0; let fail=0; const errors=[];
        const keys=targets.map(t=>t.key);
        const updated=races.map(r=>{
          if(!raceMatchesCategory(r,keys)) return r;
          try{
            const nr=window.KV2Prediction.generate(r,races);
            if(!nr || typeof nr !== 'object') throw new Error('再計算結果が空です');
            nr.aiReview=Object.assign({},nr.aiReview||{},{manualComment:memo,ruleConsultApplied:true,updatedAt:new Date().toISOString()});
            count++; return nr;
          }catch(e){
            fail++;
            if(errors.length<5){
              errors.push(`${r.date||''} ${r.place||''} ${r.raceNo||''}R: ${e && e.message ? e.message : e}`);
            }
            return r;
          }
        });
        S.saveRaces(updated);
        if(fail){
          alert(`最終採用確認で採用した${targets.length}カテゴリーへ予想ルールを反映しました。
再計算成功 ${count}件 / 失敗 ${fail}件。

${errors.join('\n')}`);
        }else{
          alert(`最終採用確認で採用した${targets.length}カテゴリーへ予想ルールを反映し、${count}件を再計算しました`);
        }
        const remaining=Math.max(0, ((prop.items||[]).length||0)-targets.length);
        showApplyResultBanner(targets.length, remaining, currentStats(prop.targetCategories||prop.targetCategory||['全て']), true, count, fail);
      }else{
        alert(`最終採用確認で採用した${targets.length}カテゴリーへ予想ルールを反映しました`);
        const remaining=Math.max(0, ((prop.items||[]).length||0)-targets.length);
        showApplyResultBanner(targets.length, remaining, currentStats(prop.targetCategories||prop.targetCategory||['全て']), false, 0, 0);
      }
    }catch(e){
      console.error('rule consult apply error', e);
      alert('この比較結果を採用でエラーが発生しました。\n' + (e && e.message ? e.message : e));
    }
  }
  function runFromForm(){runAsync(selectedCategories())}

  function installApplyButtonHandler(){
    if(window.__KV2_RULE_CONSULT_APPLY_HANDLER_V104) return;
    window.__KV2_RULE_CONSULT_APPLY_HANDLER_V104=true;
    document.addEventListener('click', function(ev){
      const btn=ev.target && ev.target.closest ? ev.target.closest('[data-rule-apply]') : null;
      if(!btn) return;
      ev.preventDefault();
      ev.stopPropagation();
      const recalc=String(btn.getAttribute('data-recalc')||'0')==='1';
      try{
        btn.disabled=true;
        btn.dataset.busy='1';
        setTimeout(()=>{
          try{ applyRule(recalc); }
          finally{ btn.disabled=false; delete btn.dataset.busy; }
        }, 0);
      }catch(e){
        btn.disabled=false; delete btn.dataset.busy;
        console.error('rule consult apply click error', e);
        alert('反映ボタン処理でエラーが発生しました。\n' + (e && e.message ? e.message : e));
      }
    }, false);
  }
  installApplyButtonHandler();
  window.KV2RuleConsult={show,run,runAsync,runFromForm,cancelRun,loadCsvFile,clearCsv:clearRows,applyRule,onCategoryCheck,toggleCarryKind,askProposal,runRecommendedCompare,chooseAnswerProposal,updateAdoptionWarnings,updatePartialAdoptBoxes,markPartialEdited,updatePartialPartCheckMarks};
})();
