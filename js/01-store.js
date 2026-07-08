/* ==========================================
   競馬予想検証アプリ Ver.2
   01-store.js
========================================== */
(function(){
  'use strict';
  const C = window.KV2Common;
  const STORE_KEY = 'keibaPredictionV2.races';
  const RULE_KEY  = 'keibaPredictionV2.rules';
  const META_KEY  = 'keibaPredictionV2.meta';
  const AUTO_BACKUP_KEY = 'keibaPredictionV2.autoBackups';
  const AUTO_BACKUP_KEEP = 10;
  const DATA_SCHEMA_VERSION = '2.004';
  let __raceCacheRaw = null;
  let __raceCacheList = null;
  function invalidateRaceCache(){
    __raceCacheRaw = null;
    __raceCacheList = null;
  }
  try{
    window.addEventListener('storage', function(ev){
      if(ev && ev.key === STORE_KEY) invalidateRaceCache();
    });
  }catch(e){}
  function now(){
    return new Date().toISOString();
  }
  function normalizeMigration(raw){
    raw = raw || {};
    return {
      source:String(raw.source || raw.sourceVersion || ''),
      ver1Id:String(raw.ver1Id || raw.legacyId || ''),
      ver1Key:String(raw.ver1Key || raw.legacyKey || ''),
      importedAt:String(raw.importedAt || ''),
      migratedAt:String(raw.migratedAt || ''),
      original:raw.original || null,
      notes:String(raw.notes || '')
    };
  }
  function normalizePredictionCategory(raw){
    raw = raw || {};
    return {
      primary:String(raw.primary || ''),
      used:String(raw.used || ''),
      extra:String(raw.extra || ''),
      ready:!!raw.ready,
      need:C.toInt(raw.need) || 0,
      count:C.toInt(raw.count) || 0,
      basis:String(raw.basis || ''),
      savedAt:String(raw.savedAt || '')
    };
  }
  function normalizeJudgmentStats(raw, prediction){
    raw = raw || {};
    prediction = prediction || {};
    const rates = prediction.rates || raw.rates || {};
    const cat = prediction.category || raw.category || {};
    return {
      basis:String(raw.basis || rates.basis || ''),
      category:normalizePredictionCategory(raw.category || cat),
      rates:{
        all:rates.all ?? raw.rates?.all ?? '',
        hit:rates.hit ?? raw.rates?.hit ?? '',
        axis:rates.axis ?? raw.rates?.axis ?? '',
        umaren:rates.umaren ?? raw.rates?.umaren ?? '',
        wide:rates.wide ?? raw.rates?.wide ?? '',
        sanrenpuku:rates.sanrenpuku ?? raw.rates?.sanrenpuku ?? ''
      },
      total:Object.assign({raceCount:0, hitCount:0, axisHitCount:0, returnRate:'', hitRate:''}, raw.total || {}),
      recent:Object.assign({range:'', raceCount:0, hitCount:0, axisHitCount:0, returnRate:'', hitRate:''}, raw.recent || {}),
      judge:String(raw.judge || prediction.judge || ''),
      savedAt:String(raw.savedAt || '')
    };
  }
  function normalizeAIReview(raw, reflection){
    raw = raw || {};
    reflection = reflection || raw.reflection || {};
    return {
      version:String(raw.version || reflection.version || ''),
      summary:raw.summary || reflection.summary || null,
      points:Array.isArray(raw.points) ? raw.points : (Array.isArray(reflection.points) ? reflection.points : []),
      pointSummary:raw.pointSummary || reflection.pointSummary || null,
      axis:String(raw.axis || reflection.axis || ''),
      umaren:String(raw.umaren || reflection.umaren || ''),
      wide:String(raw.wide || reflection.wide || ''),
      sanrenpuku:String(raw.sanrenpuku || reflection.sanrenpuku || ''),
      improveAxis:String(raw.improveAxis || reflection.improveAxis || ''),
      improveUmaren:String(raw.improveUmaren || reflection.improveUmaren || ''),
      improveWide:String(raw.improveWide || reflection.improveWide || ''),
      improveSanrenpuku:String(raw.improveSanrenpuku || reflection.improveSanrenpuku || ''),
      improvement:String(raw.improvement || raw.next || reflection.next || reflection.improvement || ''),
      overall:String(raw.overall || reflection.overall || ''),
      priority:String(raw.priority || reflection.priority || ''),
      confidence:C.toInt(raw.confidence ?? reflection.confidence) || '',
      reasons:Array.isArray(raw.reasons) ? raw.reasons : (Array.isArray(reflection.reasons) ? reflection.reasons : []),
      ruleConsultHints:Array.isArray(raw.ruleConsultHints) ? raw.ruleConsultHints : (Array.isArray(reflection.ruleConsultHints) ? reflection.ruleConsultHints : []),
      manualComment:String(raw.manualComment || raw.comment || reflection.manualComment || reflection.comment || ''),
      ruleConsultApplied:!!(raw.ruleConsultApplied || reflection.ruleConsultApplied),
      updatedAt:String(raw.updatedAt || reflection.updatedAt || '')
    };
  }
  function makeRaceId(race){
    const date = C.normDate(race.date);
    const place = String(race.place || '');
    const raceNo = C.normRaceNo(race.raceNo);
    return `${date}_${place}_${raceNo}`;
  }
  function blankRace(seed){
    const race = {
      id:'',
      schemaVersion:DATA_SCHEMA_VERSION,
      migration:normalizeMigration(seed && seed.migration),
      date:C.normDate(seed && seed.date || ''),
      place:seed && seed.place || '',
      raceNo:C.normRaceNo(seed && seed.raceNo || ''),
      raceName:'',
      grade:'',
      surface:'',
      distance:'',
      condition:'',
      age:'',
      sex:'',
      headCount:18,
      horses:[],
      result:{
        firsts:[],
        seconds:[],
        thirds:[],
        tansho:[],
        umaren:[],
        wide:[],
        sanrenpuku:[]
      },
      prediction:{
        marks:{},
        axis:null,
        axisScore:null,
        judge:'見送り',
        recommend:[],
        umaren:[],
        wide:[],
        sanrenpuku:[],
        reason:[],
        category:normalizePredictionCategory(),
        rates:{}
      },
      predictionCategory:normalizePredictionCategory(),
      judgmentStats:normalizeJudgmentStats(),
      aiReview:normalizeAIReview(),
      reflection:normalizeAIReview(),
      warnings:[],
      createdAt:now(),
      updatedAt:now()
    };
    race.id = makeRaceId(race);
    return race;
  }
  function normalizeHorse(h, index, headCount){
    const rawNo = h && h.no;
    const no = String(rawNo ?? '').trim() === '' ? '' : (C.toInt(rawNo) || '');
    const odds = String(h && h.odds || '').trim();
    return {
      no,
      frame:no ? C.frameOf(no, headCount) : '',
      name:String(h && h.name || ''),
      odds,
      popularity:C.toInt(h && h.popularity) || '',
      past1:String(h && h.past1 || ''),
      past2:String(h && h.past2 || ''),
      past3:String(h && h.past3 || ''),
      mark:String(h && h.mark || ''),
      cancelled:C.isCancelledByOdds(odds)
    };
  }
  function normalizeTicketArray(v){
    if(!v) return [];
    if(Array.isArray(v)) return v.map(x=>{
      if(Array.isArray(x)) return x.join('-');
      if(x && typeof x === 'object') return x.combo || x.numbers || x.me || '';
      return String(x || '');
    }).filter(Boolean);
    if(typeof v === 'object') return Object.keys(v).filter(Boolean);
    return String(v).split(/[\n,、/]+/).map(x=>x.trim()).filter(Boolean);
  }

  function normalizeRecommendArray(v){
    const add = (out, k)=>{ if(k && !out.includes(k)) out.push(k); };
    const mapOne = (x)=>{
      if(!x) return '';
      if(typeof x === 'object'){
        return mapOne(x.ticket || x.key || x.type || x.name || x.label || x.value);
      }
      const t = String(x).trim();
      if(!t) return '';
      if(t === 'umaren' || t === '馬連') return 'umaren';
      if(t === 'wide' || t === 'ワイド') return 'wide';
      if(t === 'sanrenpuku' || t === '3連複' || t === '三連複') return 'sanrenpuku';
      return '';
    };
    let src=[];
    if(Array.isArray(v)) src=v;
    else if(v && typeof v === 'object'){
      src=[];
      ['umaren','wide','sanrenpuku','馬連','ワイド','3連複','三連複'].forEach(k=>{
        if(v[k]) src.push(k);
      });
      if(!src.length && (v.ticket || v.key || v.type || v.name || v.label || v.value)) src=[v];
    }else if(typeof v === 'string'){
      const sv = v.trim();
      if(/^(全部|全て|すべて|全券種)$/.test(sv)) src=['馬連','ワイド','3連複'];
      else src=sv.split(/[\n,、/・+＋]+/).map(x=>x.trim()).filter(Boolean);
    }
    const out=[];
    src.forEach(x=>{
      if(typeof x === 'string' && /^(全部|全て|すべて|全券種)$/.test(x.trim())){
        add(out,'umaren'); add(out,'wide'); add(out,'sanrenpuku');
        return;
      }
      const k=mapOne(x); add(out,k);
    });
    return out;
  }

  function inferRecommendFromTickets(prediction){
    prediction = prediction || {};
    const out = [];
    if(normalizeTicketArray(prediction.umaren).length) out.push('umaren');
    if(normalizeTicketArray(prediction.wide).length) out.push('wide');
    if(normalizeTicketArray(prediction.sanrenpuku).length) out.push('sanrenpuku');
    return out;
  }

  function normalizeResult(result){
    result = result || {};
    return {
      firsts:Array.isArray(result.firsts) ? result.firsts.map(String).filter(Boolean) : [],
      seconds:Array.isArray(result.seconds) ? result.seconds.map(String).filter(Boolean) : [],
      thirds:Array.isArray(result.thirds) ? result.thirds.map(String).filter(Boolean) : [],
      tansho:Array.isArray(result.tansho) ? result.tansho : [],
      umaren:Array.isArray(result.umaren) ? result.umaren : [],
      wide:Array.isArray(result.wide) ? result.wide : [],
      sanrenpuku:Array.isArray(result.sanrenpuku) ? result.sanrenpuku : []
    };
  }
  function normalizeRace(raw){
    raw = raw || {};
    const headCount = C.toInt(raw.headCount || raw.headcount) || 18;
    let horses = Array.isArray(raw.horses) ? raw.horses : [];
    horses = horses
      .map((h,i)=>normalizeHorse(h,i,headCount))
      .sort((a,b)=>(C.toInt(a.no)||999)-(C.toInt(b.no)||999));
    C.calcPopularity(horses);
    const prediction = raw.prediction || {
      marks:{}, axis:null, axisScore:null, judge:'見送り', recommend:[],
      umaren:[], wide:[], sanrenpuku:[], reason:[], category:normalizePredictionCategory(), rates:{}
    };
    prediction.umaren = normalizeTicketArray(prediction.umaren);
    prediction.wide = normalizeTicketArray(prediction.wide);
    prediction.sanrenpuku = normalizeTicketArray(prediction.sanrenpuku);
    prediction.recommend = normalizeRecommendArray(prediction.recommend);
    if(!prediction.recommend.length){
      prediction.recommend = inferRecommendFromTickets(prediction);
    }
    if(!prediction.axis && (raw.axis || raw.axisNo)) prediction.axis = raw.axis || {no:raw.axisNo};
    if(prediction.category) prediction.category = normalizePredictionCategory(prediction.category);
    const race = {
      id:String(raw.id || ''),
      schemaVersion:String(raw.schemaVersion || DATA_SCHEMA_VERSION),
      migration:normalizeMigration(raw.migration),
      date:C.normDate(raw.date),
      place:String(raw.place || ''),
      raceNo:C.normRaceNo(raw.raceNo),
      raceName:String(raw.raceName || ''),
      grade:String(raw.grade || ''),
      surface:String(raw.surface || ''),
      distance:String(raw.distance || ''),
      condition:String(raw.condition || ''),
      age:String(raw.age || ''),
      sex:String(raw.sex || ''),
      headCount,
      horses,
      result:normalizeResult(raw.result),
      prediction,
      predictionCategory:normalizePredictionCategory(raw.predictionCategory || prediction.category),
      judgmentStats:normalizeJudgmentStats(raw.judgmentStats, prediction),
      aiReview:normalizeAIReview(raw.aiReview, raw.reflection),
      reflection:normalizeAIReview(raw.reflection || raw.aiReview),
      warnings:Array.isArray(raw.warnings) ? raw.warnings : [],
      createdAt:raw.createdAt || now(),
      updatedAt:raw.updatedAt || now()
    };
    race.id = race.id || makeRaceId(race);
    return race;
  }
  function loadRaces(){
    try{
      const raw = localStorage.getItem(STORE_KEY) || '[]';
      if(__raceCacheList && raw === __raceCacheRaw){
        return __raceCacheList.slice();
      }
      const list = JSON.parse(raw);
      if(!Array.isArray(list)){
        invalidateRaceCache();
        return [];
      }
      const normalized = [];
      list.forEach((item, idx)=>{
        try{
          normalized.push(normalizeRace(item));
        }catch(err){
          console.error('loadRaces normalize item skipped', idx, err, item);
        }
      });
      const sorted = C.sortSavedRaces(normalized);
      __raceCacheRaw = raw;
      __raceCacheList = sorted;
      return sorted.slice();
    }catch(e){
      console.error('loadRaces error', e);
      invalidateRaceCache();
      return [];
    }
  }

  function rawRaceCount(raw){
    try{
      const arr = JSON.parse(raw || '[]');
      return Array.isArray(arr) ? arr.length : 0;
    }catch(e){ return 0; }
  }
  function loadAutoBackups(){
    try{
      const arr = JSON.parse(localStorage.getItem(AUTO_BACKUP_KEY) || '[]');
      return Array.isArray(arr) ? arr.filter(x=>x && x.raw) : [];
    }catch(e){ return []; }
  }
  function saveAutoBackups(list){
    list = (Array.isArray(list) ? list : []).filter(x=>x && x.raw).slice(0, AUTO_BACKUP_KEEP);
    let n = list.length;
    while(n >= 0){
      try{
        localStorage.setItem(AUTO_BACKUP_KEY, JSON.stringify(list.slice(0, n)));
        return list.slice(0, n);
      }catch(e){
        n--;
      }
    }
    return [];
  }
  function createAutoBackup(reason, rawOverride){
    try{
      const currentRaw = (rawOverride !== undefined && rawOverride !== null) ? String(rawOverride) : (localStorage.getItem(STORE_KEY) || '[]');
      const count = rawRaceCount(currentRaw);
      if(count <= 0) return null;
      let raw = currentRaw;
      // 容量を抑えるため、可能なら軽量形式で自動バックアップする。
      // rawOverride指定時は、保存直後の内容をそのまま使い、キャッシュ不一致を避ける。
      if(rawOverride === undefined || rawOverride === null){
        try{
          const compact = loadRaces().map(compactImportedRace);
          raw = JSON.stringify(C.sortSavedRaces(compact));
        }catch(_compactErr){
          raw = currentRaw;
        }
      }
      const backups = loadAutoBackups();
      if(backups.length && backups[0].raw === raw) return backups[0];
      const d = now();
      const item = {
        id:'auto_'+d.replace(/[^0-9]/g,'')+'_'+Math.random().toString(36).slice(2,7),
        createdAt:d,
        reason:String(reason || '自動バックアップ'),
        count:count,
        bytes:raw.length,
        raw:raw
      };
      saveAutoBackups([item].concat(backups));
      return item;
    }catch(e){
      console.warn('createAutoBackup skipped', e);
      return null;
    }
  }
  function listAutoBackups(){
    return loadAutoBackups().map(x=>({id:x.id, createdAt:x.createdAt, reason:x.reason, count:x.count, bytes:x.bytes || (x.raw?x.raw.length:0)}));
  }
  function restoreAutoBackup(id){
    const backups = loadAutoBackups();
    const b = backups.find(x=>String(x.id)===String(id));
    if(!b) throw new Error('指定された自動バックアップが見つかりません。');
    createAutoBackup('復元前');
    const arr = JSON.parse(b.raw || '[]');
    if(!Array.isArray(arr)) throw new Error('バックアップ形式が不正です。');
    const normalized = C.sortSavedRaces(arr.map(normalizeRace));
    const raw = JSON.stringify(normalized);
    localStorage.setItem(STORE_KEY, raw);
    __raceCacheRaw = raw;
    __raceCacheList = normalized;
    touchMeta();
    // 新規保存直後にもバックアップを作る。
    // これにより1レース登録した時点で「自動バックアップ復元」に必ず候補が出る。
    try{ createAutoBackup('保存後', raw); }catch(_postBackupErr){}
    return normalized.slice();
  }
  function deleteAutoBackup(id){
    const backups = loadAutoBackups().filter(x=>String(x.id)!==String(id));
    saveAutoBackups(backups);
    return true;
  }

  function cleanupLargeLegacyKeys(){
    const keys=[
      'keibaPredictionV2.ruleConsultCsvRows',
      'keibaPredictionV2.ruleConsultLastProposal',
      'keibaPredictionV2.ruleConsultApplyHistory',
      'keibaPredictionV2.validationCsvCache',
      'keibaPredictionV2.validationRankingRows'
    ];
    keys.forEach(k=>{try{localStorage.removeItem(k);}catch(e){}});
  }
  function saveRaces(list){
    const normalized = C.sortSavedRaces((Array.isArray(list) ? list : []).map(normalizeRace));
    let raw = JSON.stringify(normalized);
    const previousRaw = localStorage.getItem(STORE_KEY);
    if(previousRaw && previousRaw !== raw && rawRaceCount(previousRaw) > 0){
      createAutoBackup('保存・編集・削除前');
    }
    try{
      localStorage.setItem(STORE_KEY, raw);
    }catch(e){
      // Android Chromeでは、ランキングCSVや相談履歴の残骸で容量上限に達し、
      // レース保存だけ失敗することがある。不要な大容量キーを削除して再試行する。
      // 既存保存レースを消してから書くと、容量超過時に0件化するため、removeItemしない。
      cleanupLargeLegacyKeys();
      try{
        localStorage.setItem(STORE_KEY, raw);
      }catch(e2){
        // それでも失敗する場合は保存レースを軽量形式へ圧縮して保存する。
        const compact = C.sortSavedRaces(normalized.map(compactImportedRace));
        raw = JSON.stringify(compact);
        try{
          localStorage.setItem(STORE_KEY, raw);
          __raceCacheRaw = raw;
          __raceCacheList = compact;
          touchMeta();
          return compact.slice();
        }catch(e3){
          if(previousRaw !== null && previousRaw !== undefined){
            try{ localStorage.setItem(STORE_KEY, previousRaw); }catch(_restoreErr){}
          }
          console.error('saveRaces failed', e3);
          throw e3;
        }
      }
    }
    __raceCacheRaw = raw;
    __raceCacheList = normalized;
    touchMeta();
    return normalized.slice();
  }
  function getRace(id){
    return loadRaces().find(r => r.id === id || makeRaceId(r) === id) || null;
  }
  function upsertRace(race){
    const normalized = normalizeRace(race);
    normalized.id = makeRaceId(normalized);
    normalized.updatedAt = now();
    const list = loadRaces().filter(r => r.id !== normalized.id && makeRaceId(r) !== normalized.id);
    list.push(normalized);
    saveRaces(list);
    return normalized;
  }
  function deleteRace(id){
    const list = loadRaces().filter(r => r.id !== id && makeRaceId(r) !== id);
    saveRaces(list);
    return true;
  }
  function mergeRace(existing, incoming, options){
    options = options || {};
    existing = existing ? normalizeRace(existing) : blankRace(incoming);
    incoming = normalizeRace(Object.assign({}, existing, incoming));
    const out = normalizeRace(existing);
    const keepExisting = options.keepExisting !== false;
    const oddsAlwaysUpdate = options.oddsAlwaysUpdate !== false;
    [
      'date','place','raceNo',
      'raceName','grade','surface','distance',
      'condition','age','sex','headCount'
    ].forEach(key=>{
      const val = incoming[key];
      if(!keepExisting || !out[key]){
        if(val !== undefined && val !== null && String(val).trim() !== '') out[key] = val;
      }
    });
    if(incoming.horses && incoming.horses.length){
      const byNo = new Map(out.horses.map(h => [String(h.no), h]));
      incoming.horses.forEach(h=>{
        const no = String(h.no);
        const base = byNo.get(no) || {
          no:h.no,
          frame:C.frameOf(h.no, out.headCount),
          name:'',
          odds:'',
          popularity:'',
          past1:'',
          past2:'',
          past3:'',
          mark:'',
          cancelled:false
        };
        if(!keepExisting || !base.name) base.name = h.name || base.name;
        if(!keepExisting || !base.past1) base.past1 = h.past1 || base.past1;
        if(!keepExisting || !base.past2) base.past2 = h.past2 || base.past2;
        if(!keepExisting || !base.past3) base.past3 = h.past3 || base.past3;
        if(oddsAlwaysUpdate){
          base.odds = h.odds !== undefined ? String(h.odds || '') : base.odds;
        }else if(!base.odds){
          base.odds = h.odds || base.odds;
        }
        base.frame = C.frameOf(base.no, out.headCount);
        base.cancelled = C.isCancelledByOdds(base.odds);
        byNo.set(no, base);
      });
      out.horses = Array.from(byNo.values()).sort((a,b)=>(C.toInt(a.no)||999)-(C.toInt(b.no)||999));
      C.calcPopularity(out.horses);
    }
    if(incoming.result){
      const hasExistingResult = !C.resultMissing(out.result);
      if(!keepExisting || !hasExistingResult){
        out.result = normalizeResult(incoming.result);
      }
    }
    out.predictionCategory = normalizePredictionCategory(incoming.predictionCategory || incoming.prediction?.category || out.predictionCategory);
    out.judgmentStats = normalizeJudgmentStats(incoming.judgmentStats || out.judgmentStats, incoming.prediction || out.prediction);
    out.aiReview = normalizeAIReview(incoming.aiReview || out.aiReview, incoming.reflection || out.reflection);
    out.reflection = normalizeAIReview(incoming.reflection || out.reflection || out.aiReview);
    out.id = makeRaceId(out);
    out.updatedAt = now();
    return normalizeRace(out);
  }
  function loadRules(){
    try{
      const obj = JSON.parse(localStorage.getItem(RULE_KEY) || '{}');
      return obj && typeof obj === 'object' ? obj : {};
    }catch(e){
      console.error('loadRules error', e);
      return {};
    }
  }
  function compactRuleForStorage(rule){
    if(!rule || typeof rule !== 'object') return rule || {};
    const pick=(obj,keys)=>{
      obj=obj||{}; const out={};
      keys.forEach(k=>{ if(obj[k]!==undefined && obj[k]!==null && obj[k]!=='' ) out[k]=obj[k]; });
      return out;
    };
    const statKeys=['category','ruleText','basis','score','races','doneR','totalR','axisPlace','axisPlaceRate','allReturn','umarenReturn','wideReturn','sanrenpukuReturn','umarenHit','wideHit','sanrenpukuHit','hitRate','altType','altLabel','altDesc','partialParts'];
    const out={
      type:rule.type||'ruleConsultProposal',
      category:rule.category||'',
      active:rule.active!==false,
      updatedAt:rule.updatedAt||now()
    };
    if(rule.proposal) out.proposal=pick(rule.proposal, statKeys);
    if(rule.current) out.current=pick(rule.current, statKeys);
    if(rule.memo) out.memo=String(rule.memo).slice(0,200);
    if(rule.source) out.source=String(rule.source).slice(0,40);
    if(rule.aiKarteCarryCount!=null) out.aiKarteCarryCount=Number(rule.aiKarteCarryCount)||0;
    // prefsやAIカルテ詳細、コメント全文は容量が大きいため保存しない。
    return out;
  }
  function compactRulesForStorage(rules){
    const out={};
    Object.keys(rules||{}).forEach(k=>{
      const key=String(k||'').slice(0,80);
      if(!key) return;
      out[key]=compactRuleForStorage((rules||{})[k]);
    });
    return out;
  }
  function saveRules(rules){
    const compact=compactRulesForStorage(rules || {});
    const raw=JSON.stringify(compact);
    try{
      // 既存の巨大rulesが残っている場合、上書きでは容量不足になることがあるため一度削除してから保存する。
      localStorage.removeItem(RULE_KEY);
      localStorage.setItem(RULE_KEY, raw);
    }catch(e){
      try{
        // さらに厳しい場合は履歴を削除して再試行。
        localStorage.removeItem('keibaPredictionV2.ruleConsultApplyHistory');
        localStorage.removeItem('keibaPredictionV2.ruleConsultLastProposal');
        localStorage.removeItem(RULE_KEY);
        localStorage.setItem(RULE_KEY, raw);
      }catch(e2){
        console.error('saveRules quota error', e2);
        throw e2;
      }
    }
    touchMeta();
    return compact;
  }
  function getRule(categoryKey){
    const rules = loadRules();
    return rules[categoryKey] || null;
  }
  function setRule(categoryKey, rule){
    const rules = loadRules();
    rules[categoryKey] = Object.assign({}, rule || {}, {
      updatedAt:now()
    });
    saveRules(rules);
    return rules[categoryKey];
  }
  function loadMeta(){
    try{
      const obj = JSON.parse(localStorage.getItem(META_KEY) || '{}');
      return obj && typeof obj === 'object' ? obj : {};
    }catch(e){
      return {};
    }
  }
  function saveMeta(meta){
    meta = Object.assign({schemaVersion:DATA_SCHEMA_VERSION}, meta || {});
    localStorage.setItem(META_KEY, JSON.stringify(meta));
    return meta;
  }
  function touchMeta(){
    const meta = loadMeta();
    meta.updatedAt = now();
    saveMeta(meta);
  }
  function exportJson(){
    return JSON.stringify({
      races:loadRaces(),
      rules:loadRules(),
      schemaVersion:DATA_SCHEMA_VERSION,
      meta:Object.assign({schemaVersion:DATA_SCHEMA_VERSION}, loadMeta())
    }, null, 2);
  }
  function importJson(text){
    const data = JSON.parse(text);
    if(data.races) createAutoBackup('JSON取込前');
    if(data.races) saveRaces(data.races);
    if(data.rules) saveRules(data.rules);
    if(data.meta) saveMeta(data.meta);
    return true;
  }

  function pickDeep(obj, paths, fallback){
    obj = obj || {};
    for(const path of paths){
      const parts = String(path).split('.');
      let cur = obj;
      let ok = true;
      for(const part of parts){
        if(cur && typeof cur === 'object' && cur[part] !== undefined && cur[part] !== null){
          cur = cur[part];
        }else{ ok = false; break; }
      }
      if(ok && String(cur).trim() !== '') return cur;
    }
    return fallback;
  }
  function normalizeVer1DateValue(v){
    const s = String(v || '').trim();
    if(!s) return '';
    const m = s.match(/(20\d{2})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})/);
    if(m) return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
    return C.normDate(s);
  }
  function normalizeVer1RaceNoValue(v){
    const s = String(v || '').trim();
    const m = s.match(/(\d{1,2})\s*R/i);
    return C.normRaceNo(m ? m[1] : s);
  }
  function asArrayMaybe(v){
    if(Array.isArray(v)) return v;
    if(v && typeof v === 'object') return Object.values(v);
    return [];
  }

  function compactPredictionForStorage(prediction){
    prediction = prediction || {};
    const axis = prediction.axis || {};
    const out = {
      version: prediction.version || '',
      marks: prediction.marks || {},
      // 印分類は保存容量を増やさないため保存しない。検証時に前走3走と印から再計算する。
      axis: axis && axis.no ? {no:String(axis.no||''), name:String(axis.name||''), score:C.toInt(axis.score||prediction.axisScore)||0} : null,
      axisScore: C.toInt(prediction.axisScore || (axis&&axis.score) || 0),
      judge: String(prediction.judge || '見送り'),
      recommend: normalizeRecommendArray(prediction.recommend || []),
      umaren: normalizeTicketArray(prediction.umaren || []),
      wide: normalizeTicketArray(prediction.wide || []),
      sanrenpuku: normalizeTicketArray(prediction.sanrenpuku || []),
      category: normalizePredictionCategory(prediction.category || {}),
      rates: prediction.rates ? {
        basis: String(prediction.rates.basis || ''),
        all: prediction.rates.all || '', hit: prediction.rates.hit || '',
        umaren: prediction.rates.umaren || '', wide: prediction.rates.wide || '', sanrenpuku: prediction.rates.sanrenpuku || ''
      } : {}
    };
    if(!out.axis) delete out.axis;
    if(!Object.keys(out.marks||{}).length) delete out.marks;
    return out;
  }
  function compactImportedRace(race){
    race = normalizeRace(race);
    return {
      id:makeRaceId(race), schemaVersion:DATA_SCHEMA_VERSION, migration:race.migration,
      date:race.date, place:race.place, raceNo:race.raceNo, raceName:race.raceName,
      grade:race.grade, surface:race.surface, distance:race.distance, condition:race.condition,
      age:race.age, sex:race.sex, headCount:race.headCount,
      horses:(race.horses||[]).map(h=>({no:h.no, frame:h.frame, name:h.name, odds:h.odds, popularity:h.popularity, past1:h.past1, past2:h.past2, past3:h.past3, mark:h.mark, cancelled:!!h.cancelled})),
      result:normalizeResult(race.result), prediction:compactPredictionForStorage(race.prediction),
      predictionCategory:normalizePredictionCategory(race.predictionCategory || race.prediction?.category),
      judgmentStats:normalizeJudgmentStats(race.judgmentStats, race.prediction),
      aiReview:[], reflection:[],
      warnings:[], createdAt:race.createdAt || now(), updatedAt:now()
    };
  }

  function firstValue(obj, keys, fallback){
    obj = obj || {};
    for(const k of keys){
      if(obj[k] !== undefined && obj[k] !== null && String(obj[k]).trim() !== '') return obj[k];
    }
    return fallback;
  }
  function normalizeVer1PayRows(v){
    if(!v) return [];
    const parseText = (text)=>{
      const s = String(text || '').replace(/[円￥]/g,'').trim();
      const m = s.match(/([0-9]+\s*[-ー－]\s*[0-9]+(?:\s*[-ー－]\s*[0-9]+)?)\D*([0-9][0-9,]*)?/);
      if(m) return {combo:m[1].replace(/[ー－]/g,'-').replace(/\s+/g,''), pay:m[2] ? m[2] : ''};
      const n = s.match(/([0-9][0-9,]*)/);
      return {combo:'', pay:n ? n[1] : s};
    };
    if(Array.isArray(v)){
      return v.map(x=>{
        if(x && typeof x === 'object'){
          const combo = firstValue(x, ['combo','kime','numbers','me','組み合わせ','決まり目','combination','result','決定目'], '');
          const pay = firstValue(x, ['pay','payout','return','amount','払い戻し','払戻','払戻金','price','yen'], '');
          if(combo || pay) return {combo:String(combo||'').replace(/[ー－]/g,'-').replace(/\s+/g,''), pay:String(pay||'').replace(/[^0-9,]/g,'')};
          return parseText(JSON.stringify(x));
        }
        return parseText(x);
      }).filter(x=>x.combo || x.pay);
    }
    if(typeof v === 'object'){
      const combo = firstValue(v, ['combo','kime','numbers','me','組み合わせ','決まり目','combination','result','決定目'], '');
      const pay = firstValue(v, ['pay','payout','return','amount','払い戻し','払戻','払戻金','price','yen'], '');
      if(combo || pay) return [{combo:String(combo||'').replace(/[ー－]/g,'-').replace(/\s+/g,''), pay:String(pay||'').replace(/[^0-9,]/g,'')}].filter(x=>x.combo || x.pay);
      return Object.keys(v).map(k=>{
        const val = v[k];
        if(val && typeof val === 'object'){
          const rows = normalizeVer1PayRows(val);
          if(rows.length === 1 && !rows[0].combo) rows[0].combo = String(k).replace(/[ー－]/g,'-').replace(/\s+/g,'');
          return rows;
        }
        return {combo:String(k).replace(/[ー－]/g,'-').replace(/\s+/g,''), pay:String(val || '').replace(/[^0-9,]/g,'')};
      }).flat().filter(x=>x.combo || x.pay);
    }
    return normalizeVer1PayRows(String(v).split(/[\n/]+/));
  }
  function deepFirstValue(obj, keys, fallback, depth){
    depth = depth || 0;
    if(!obj || typeof obj !== 'object' || depth > 5) return fallback;
    for(const k of keys){
      if(obj[k] !== undefined && obj[k] !== null && String(obj[k]).trim() !== '') return obj[k];
    }
    for(const v of Object.values(obj)){
      if(v && typeof v === 'object'){
        const found = deepFirstValue(v, keys, undefined, depth + 1);
        if(found !== undefined && found !== null && String(found).trim() !== '') return found;
      }
    }
    return fallback;
  }
  function splitNums(v){
    if(v === undefined || v === null) return [];
    if(Array.isArray(v)) return v.map(x=>{
      if(x && typeof x === 'object') return firstValue(x, ['no','number','horseNo','umaban','馬番','num','value'], '');
      return x;
    }).map(String).map(x=>x.trim()).filter(Boolean);
    if(v && typeof v === 'object') return Object.values(v).map(String).map(x=>x.trim()).filter(Boolean);
    return String(v).split(/[\n,、\/・\s]+/).map(x=>x.trim()).filter(Boolean);
  }
  function normalizeRankLabel(v){
    const s = String(v || '').trim();
    if(/^(1|１|一|1着|１着)$/.test(s)) return 1;
    if(/^(2|２|二|2着|２着)$/.test(s)) return 2;
    if(/^(3|３|三|3着|３着)$/.test(s)) return 3;
    const n = C.toInt(s);
    return n || 0;
  }
  function extractFinishRows(obj){
    const out = {firsts:[], seconds:[], thirds:[]};
    const seen = new Set();
    function add(rank,no){
      rank = normalizeRankLabel(rank); no = C.toInt(no);
      if(!no || rank < 1 || rank > 3) return;
      const key = rank + ':' + no;
      if(seen.has(key)) return; seen.add(key);
      if(rank === 1) out.firsts.push(String(no));
      if(rank === 2) out.seconds.push(String(no));
      if(rank === 3) out.thirds.push(String(no));
    }
    function addSeq(val){
      const nums = splitNums(val).map(C.toInt).filter(Boolean);
      if(nums.length >= 2) nums.slice(0,3).forEach((no,i)=>add(i+1,no));
    }
    function walk(v, depth, parentKey){
      if(!v || depth > 7) return;
      if(Array.isArray(v)){
        if(v.length && v.every(x=>!(x && typeof x === 'object')) && /(?:finish|order|arrival|着順|入線|着|result|kakutei|確定)/i.test(parentKey||'')){
          addSeq(v); return;
        }
        v.forEach(x=>walk(x, depth+1, parentKey)); return;
      }
      if(typeof v !== 'object') return;
      const rank = firstValue(v, ['rank','order','place','finish','finishing','着順','着','順位','arrival'], '');
      const no = firstValue(v, ['no','number','horseNo','umaban','馬番','馬','num','horse_number'], '');
      if(rank !== '' && no !== '') add(rank,no);
      Object.entries(v).forEach(([k,val])=>{
        const key = String(k);
        const km = key.match(/(?:^|[^0-9])([123１２３一二三])\s*(?:着|st|nd|rd|位)?(?:馬番|馬|no|number|horse)?$/i) ||
                   key.match(/(?:first|winner|win|second|third|着順_?)([123])?/i);
        if(km){
          let rankNo = km[1];
          if(!rankNo){
            if(/first|winner|win/i.test(key)) rankNo = 1;
            else if(/second/i.test(key)) rankNo = 2;
            else if(/third/i.test(key)) rankNo = 3;
          }
          if(rankNo) splitNums(val).forEach(no=>add(rankNo,no));
        }
        if(/(?:finish|order|arrival|着順|入線|確定|top3|resultNums|resultNos)/i.test(key)) addSeq(val);
      });
      Object.entries(v).forEach(([k,x])=>{ if(x && typeof x === 'object') walk(x, depth+1, k); });
    }
    walk(obj, 0, '');
    return out;
  }
  function normalizeVer1PayRowsDeep(raw, keys){
    function keyMatch(text){
      const s = String(text || '').toLowerCase();
      return keys.some(k=>s === String(k).toLowerCase() || s.includes(String(k).toLowerCase()));
    }
    const direct = deepFirstValue(raw, keys, []);
    let rows = normalizeVer1PayRows(direct);
    if(rows.length) return rows;
    const all = [];
    function maybePush(v, inherited){
      const type = String(firstValue(v, ['type','ticket','kind','bet','券種','name','label'], '') || '');
      const matched = inherited || keyMatch(type);
      const combo = firstValue(v, ['combo','kime','numbers','me','組み合わせ','決まり目','combination','result','決定目'], '');
      const pay = firstValue(v, ['pay','payout','return','amount','払い戻し','払戻','払戻金','price','yen'], '');
      if(matched && (combo || pay)) all.push({combo:String(combo), pay:String(pay)});
    }
    function walk(v, depth, parentMatched, parentKey){
      if(!v || depth > 7) return;
      if(Array.isArray(v)){
        if(parentMatched){ normalizeVer1PayRows(v).forEach(x=>all.push(x)); return; }
        v.forEach(x=>walk(x, depth+1, parentMatched, parentKey)); return;
      }
      if(typeof v !== 'object'){
        if(parentMatched) normalizeVer1PayRows(v).forEach(x=>all.push(x));
        return;
      }
      maybePush(v, parentMatched);
      Object.entries(v).forEach(([k,val])=>{
        const matched = parentMatched || keyMatch(k);
        if(matched){
          if(val && typeof val === 'object') normalizeVer1PayRows(val).forEach(x=>all.push(x));
          else normalizeVer1PayRows(val).forEach(x=>all.push(x));
        }
        walk(val, depth+1, matched, k);
      });
    }
    walk(raw,0,false,'');
    const cleaned = normalizeVer1PayRows(all).filter(x=>x.combo || x.pay);
    const seen = new Set();
    return cleaned.filter(x=>{ const k=(x.combo||'')+'|'+(x.pay||''); if(seen.has(k)) return false; seen.add(k); return true; });
  }
  function normalizeVer1Result(raw){
    raw = raw || {};
    const r = raw.result || raw.results || raw.raceResult || raw.payoff || raw.payout || raw.harais || raw.refund || raw;
    function arr(keys){
      const v = deepFirstValue(r, keys, '');
      return splitNums(v);
    }
    const rowFinish = extractFinishRows(r);
    const firsts = arr(['firsts','first','rank1','firstNo','winNo','winner','winningNo','着順1','一着','1着','１着','着順_1','finish1','arrival1','result1']).concat(rowFinish.firsts);
    const seconds = arr(['seconds','second','rank2','secondNo','place2','着順2','二着','2着','２着','着順_2','finish2','arrival2','result2']).concat(rowFinish.seconds);
    const thirds = arr(['thirds','third','rank3','thirdNo','place3','着順3','三着','3着','３着','着順_3','finish3','arrival3','result3']).concat(rowFinish.thirds);
    return normalizeResult({
      firsts:[...new Set(firsts.map(x=>String(C.toInt(x)||'')).filter(Boolean))],
      seconds:[...new Set(seconds.map(x=>String(C.toInt(x)||'')).filter(Boolean))],
      thirds:[...new Set(thirds.map(x=>String(C.toInt(x)||'')).filter(Boolean))],
      tansho:normalizeVer1PayRowsDeep(r, ['tansho','tan','win','単勝']),
      umaren:normalizeVer1PayRowsDeep(r, ['umaren','馬連']),
      wide:normalizeVer1PayRowsDeep(r, ['wide','ワイド']),
      sanrenpuku:normalizeVer1PayRowsDeep(r, ['sanrenpuku','trio','three','3連複','三連複'])
    });
  }
  function normalizeVer1Horse(h, i, headCount){
    h = h || {};
    const rawNo = firstValue(h, ['no','number','horseNo','umaban','馬番','馬','num'], i+1);
    return normalizeHorse({
      no:rawNo,
      name:firstValue(h, ['name','horseName','馬名','horse'], ''),
      odds:firstValue(h, ['odds','winOdds','単勝','オッズ'], ''),
      popularity:firstValue(h, ['popularity','popular','rank','人気','ninki'], ''),
      past1:firstValue(h, ['past1','prev1','last1','前走','zenso'], ''),
      past2:firstValue(h, ['past2','prev2','last2','前2','前走2'], ''),
      past3:firstValue(h, ['past3','prev3','last3','前3','前走3'], ''),
      mark:firstValue(h, ['mark','印'], '')
    }, i, headCount);
  }
  function normalizeVer1JudgeLabel(v){
    const s = String(v || '').trim();
    if(!s) return '';
    if(/勝負/.test(s)) return '勝負';
    if(/抑え/.test(s)) return '抑え';
    if(/保留/.test(s)) return '保留';
    if(/見送り/.test(s)) return '見送り';
    // Ver1の一部保存データは判定欄に「全部」「馬連+3連複」など推奨馬券名を保存している。
    // Ver2の判定は勝負/抑え/保留/見送りで統一するため、推奨馬券名は勝負扱いに変換する。
    if(/^(全部|全て|すべて|馬連|ワイド|3連複|三連複|馬連[+＋・、/,\s].*|ワイド[+＋・、/,\s].*|3連複[+＋・、/,\s].*|三連複[+＋・、/,\s].*)$/.test(s)) return '勝負';
    return '';
  }
  function normalizeVer1Prediction(raw){
    raw = raw || {};
    let p = raw.prediction || raw.predict || raw.yoso || raw.forecast || {};
    const rawTickets = p.tickets || raw.tickets || raw.buyTickets || raw.betTickets || {};
    const axisRaw = p.axis || raw.axis || raw.axisHorse || raw.jiku || null;
    const axisNo = firstValue(p, ['axisNo','jikuNo','軸'], firstValue(raw, ['axisNo','jikuNo','軸'], ''));
    const out = Object.assign({}, p, {
      marks:p.marks || raw.marks || {},
      axis:axisRaw || (axisNo ? {no:axisNo} : null),
      axisScore:p.axisScore || raw.axisScore || null,
      judge:normalizeVer1JudgeLabel(firstValue(p, ['judge','judgment','判定'], firstValue(raw, ['judge','judgment','判定'], ''))) || '見送り',
      recommend:p.recommend || p.recommended || raw.recommend || raw.recommended || raw['推奨馬券'] || [],
      umaren:p.umaren || raw.umaren || raw.umarenTickets || rawTickets.umaren || rawTickets['馬連'] || [],
      wide:p.wide || raw.wide || raw.wideTickets || rawTickets.wide || rawTickets['ワイド'] || [],
      sanrenpuku:p.sanrenpuku || raw.sanrenpuku || raw.sanrenpukuTickets || raw.trio || rawTickets.sanrenpuku || rawTickets['3連複'] || rawTickets['三連複'] || []
    });
    out.umaren = normalizeTicketArray(out.umaren);
    out.wide = normalizeTicketArray(out.wide);
    out.sanrenpuku = normalizeTicketArray(out.sanrenpuku);
    out.recommend = normalizeRecommendArray(out.recommend);
    if(!out.recommend.length){
      out.recommend = inferRecommendFromTickets(out);
    }
    return out;
  }
  function convertVer1Race(raw){
    raw = raw || {};
    const meta = raw.meta || raw.race || raw.info || raw.basic || {};
    const headCount = C.toInt(pickDeep(raw, ['headCount','headcount','heads','頭数','info.headCount','race.headCount','basic.headCount'], pickDeep(meta, ['headCount','headcount','heads','頭数'], 18))) || 18;
    let rawHorses = [];
    for(const k of ['horses','entries','runners','raceHorses','出馬表','umalist']){
      const v = raw[k] || meta[k];
      if(Array.isArray(v) || (v && typeof v === 'object')){ rawHorses = asArrayMaybe(v); break; }
    }
    const date = normalizeVer1DateValue(pickDeep(raw, ['date','raceDate','年月日','info.date','race.date','basic.date'], pickDeep(meta, ['date','raceDate','年月日'], '')));
    const place = String(pickDeep(raw, ['place','venue','開催地','info.place','race.place','basic.place'], pickDeep(meta, ['place','venue','開催地'], '')) || '');
    const raceNo = normalizeVer1RaceNoValue(pickDeep(raw, ['raceNo','raceNumber','R','レース数','info.raceNo','race.raceNo','basic.raceNo'], pickDeep(meta, ['raceNo','raceNumber','R','レース数'], '')));
    const prediction = normalizeVer1Prediction(raw);
    const race = {
      id:'',
      schemaVersion:DATA_SCHEMA_VERSION,
      migration:normalizeMigration({source:'ver1', ver1Id:raw.id || '', ver1Key:makeRaceId({date, place, raceNo}), importedAt:now(), migratedAt:now(), original:null}),
      date,
      place,
      raceNo,
      raceName:String(pickDeep(raw, ['raceName','name','title','レース名','info.raceName','race.name','basic.raceName'], pickDeep(meta, ['raceName','name','title','レース名'], '')) || ''),
      grade:String(pickDeep(raw, ['grade','class','グレード','info.grade','race.grade','basic.grade'], pickDeep(meta, ['grade','class','グレード'], '')) || ''),
      surface:String(pickDeep(raw, ['surface','track','馬場','info.surface','race.surface','basic.surface'], pickDeep(meta, ['surface','track','馬場'], '')) || ''),
      distance:String(pickDeep(raw, ['distance','距離','info.distance','race.distance','basic.distance'], pickDeep(meta, ['distance','距離'], '')) || ''),
      condition:String(pickDeep(raw, ['condition','weight','条件','info.condition','race.condition','basic.condition'], pickDeep(meta, ['condition','weight','条件'], '')) || ''),
      age:String(pickDeep(raw, ['age','年齢','info.age','race.age','basic.age'], pickDeep(meta, ['age','年齢'], '')) || ''),
      sex:String(pickDeep(raw, ['sex','gender','性別','info.sex','race.sex','basic.sex'], pickDeep(meta, ['sex','gender','性別'], '')) || ''),
      headCount,
      horses:rawHorses.map((h,i)=>normalizeVer1Horse(h,i,headCount)),
      result:normalizeVer1Result(raw),
      prediction,
      predictionCategory:normalizePredictionCategory(raw.predictionCategory || prediction.category),
      judgmentStats:normalizeJudgmentStats(raw.judgmentStats, prediction),
      aiReview:normalizeAIReview(raw.aiReview, raw.reflection),
      reflection:normalizeAIReview(raw.reflection || raw.aiReview),
      warnings:Array.isArray(raw.warnings) ? raw.warnings : [],
      createdAt:raw.createdAt || now(),
      updatedAt:now()
    };
    return compactImportedRace(race);
  }
  function extractRaceArrayFromData(data){
    if(Array.isArray(data)) return data;
    if(!data || typeof data !== 'object') return [];
    for(const k of ['races','savedRaces','raceList','items','data','records','list']){
      if(Array.isArray(data[k])) return data[k];
      if(data[k] && typeof data[k] === 'object'){
        const vals = Object.values(data[k]);
        if(looksLikeRaceArray(vals)) return vals;
      }
    }
    const vals = Object.values(data);
    if(looksLikeRaceArray(vals)) return vals;
    return [];
  }
  function looksLikeRaceArray(arr){
    return Array.isArray(arr) && arr.some(x=>x && typeof x === 'object' && ((x.date || x.raceDate || x.年月日) && (x.raceNo || x.raceNumber || x.R || x.レース数 || x.place || x.venue || x.開催地 || x.raceName || x.レース名 || x.horses || x.entries || x.runners) || (x.horses || x.entries || x.runners || x.raceHorses || x.出馬表))); 
  }

  function looksLikeRaceObject(x){
    if(!x || typeof x !== 'object') return false;
    if(x.horses || x.entries || x.runners || x.raceHorses || x['出馬表'] || x.umalist) return true;
    return !!((x.date || x.raceDate || x['年月日']) && (x.raceNo || x.raceNumber || x.R || x['レース数']) && (x.place || x.venue || x['開催地']));
  }

  function collectRaceObjectsDeep(data, out, seen, depth){
    out = out || [];
    seen = seen || new Set();
    if(!data || depth > 6 || out.length > 20000) return out;
    if(typeof data !== 'object') return out;
    if(seen.has(data)) return out;
    seen.add(data);

    if(Array.isArray(data)){
      if(looksLikeRaceArray(data)){
        data.forEach(x=>{ if(looksLikeRaceObject(x)) out.push(x); });
      }
      data.slice(0, 2000).forEach(x=>collectRaceObjectsDeep(x, out, seen, depth+1));
      return out;
    }

    if(looksLikeRaceObject(data)) out.push(data);

    for(const k of Object.keys(data).slice(0, 300)){
      const v = data[k];
      if(v && typeof v === 'object') collectRaceObjectsDeep(v, out, seen, depth+1);
    }
    return out;
  }

  function extractRaceObjectsAny(data){
    const direct = extractRaceArrayFromData(data);
    const out = [];
    const ids = new Set();
    function add(r){
      if(!r || typeof r !== 'object') return;
      const k = raceOddsKey(r) + '|' + String(r.id || r.raceName || r.name || '');
      if(ids.has(k)) return;
      ids.add(k);
      out.push(r);
    }
    if(looksLikeRaceArray(direct)) direct.forEach(add);
    collectRaceObjectsDeep(data, [], new Set(), 0).forEach(add);
    return out;
  }
  function scanVer1Storage(){
    const out=[];
    try{
      for(let i=0;i<localStorage.length;i++){
        const key=localStorage.key(i);
        if(!key || key===STORE_KEY || key===RULE_KEY || key===META_KEY) continue;
        let data=null;
        try{ data=JSON.parse(localStorage.getItem(key) || ''); }catch(e){ continue; }
        const arr=extractRaceArrayFromData(data);
        if(looksLikeRaceArray(arr)) out.push({key, count:arr.length});
      }
    }catch(e){ console.error('scanVer1Storage error', e); }
    return out.sort((a,b)=>b.count-a.count);
  }

  function horseOddsValue(h){
    if(!h) return '';
    return String(h.odds ?? h.winOdds ?? h['単勝'] ?? h['オッズ'] ?? '').trim();
  }
  function raceOddsKey(r){
    r = r || {};
    const meta = r.meta || r.race || r.info || r.basic || {};
    const date = normalizeVer1DateValue(pickDeep(r, ['date','raceDate','年月日','info.date','race.date','basic.date'], pickDeep(meta, ['date','raceDate','年月日'], '')));
    const place = String(pickDeep(r, ['place','venue','開催地','info.place','race.place','basic.place'], pickDeep(meta, ['place','venue','開催地'], '')) || '');
    const raceNo = normalizeVer1RaceNoValue(pickDeep(r, ['raceNo','raceNumber','R','レース数','info.raceNo','race.raceNo','basic.raceNo'], pickDeep(meta, ['raceNo','raceNumber','R','レース数'], '')));
    return makeRaceId({date, place, raceNo});
  }
  function rawHorseArrayForOdds(r){
    r = r || {};
    const meta = r.meta || r.race || r.info || r.basic || {};
    for(const k of ['horses','entries','runners','raceHorses','出馬表','umalist']){
      const v = r[k] || meta[k];
      if(Array.isArray(v) || (v && typeof v === 'object')) return asArrayMaybe(v);
    }
    return [];
  }
  function addRaceOddsToIndex(index, race){
    const key = raceOddsKey(race);
    if(!key || key === '__') return;
    const horses = rawHorseArrayForOdds(race);
    horses.forEach((h,i)=>{
      const odds = horseOddsValue(h);
      if(!odds) return;
      const no = String(firstValue(h, ['no','number','horseNo','umaban','馬番','馬','num'], i+1) || '').trim();
      const name = String(firstValue(h, ['name','horseName','馬名','horse'], '') || '').trim();
      if(no) index.set(key+'|no|'+no, odds);
      if(name) index.set(key+'|name|'+name, odds);
    });
  }
  function buildOddsSupplementIndex(sourceArr){
    const index = new Map();
    const sources = {current:0, source:0, storage:0};
    try{
      (loadRaces() || []).forEach(r=>{
        const before = index.size;
        addRaceOddsToIndex(index, r);
        if(index.size > before) sources.current++;
      });
    }catch(e){}
    try{
      (sourceArr || []).forEach(r=>{
        const before = index.size;
        addRaceOddsToIndex(index, r);
        if(index.size > before) sources.source++;
      });
    }catch(e){}
    try{
      for(let i=0;i<localStorage.length;i++){
        const key = localStorage.key(i);
        if(!key) continue;
        let data=null;
        try{ data = JSON.parse(localStorage.getItem(key) || ''); }catch(e){ continue; }
        const arr = extractRaceObjectsAny(data);
        arr.forEach(r=>{
          const before = index.size;
          addRaceOddsToIndex(index, r);
          if(index.size > before) sources.storage++;
        });
      }
    }catch(e){}
    index._sources = sources;
    return index;
  }
  function supplementRaceOddsFromIndex(race, index){
    let filled = 0;
    const key = makeRaceId(race);
    (race.horses || []).forEach(h=>{
      if(String(h.odds || '').trim()) return;
      const byNo = index.get(key+'|no|'+String(h.no || '').trim());
      const byName = h.name ? index.get(key+'|name|'+String(h.name || '').trim()) : '';
      const odds = byNo || byName || '';
      if(odds){ h.odds = odds; filled++; }
    });
    if(filled) C.calcPopularity(race.horses || []);
    return filled;
  }


  function csvSplitLineLocal(line){
    const out=[]; let cur=''; let q=false;
    line = String(line || '');
    for(let i=0;i<line.length;i++){
      const ch=line[i];
      if(ch==='"'){
        if(q && line[i+1]==='"'){ cur+='"'; i++; }
        else q=!q;
      }else if((ch===',' || ch==='\t') && !q){
        out.push(cur); cur='';
      }else cur+=ch;
    }
    out.push(cur);
    return out.map(x=>String(x||'').trim());
  }
  function normHeaderName(s){
    return String(s || '').replace(/^\ufeff/,'').replace(/[\s　_\-／\/（）()［］\[\]：:]/g,'').toLowerCase();
  }
  function pickCsvValue(row, aliases){
    for(const a of aliases){
      const key = normHeaderName(a);
      if(row[key] !== undefined && String(row[key]).trim() !== '') return row[key];
    }
    return '';
  }
  function normalizeOddsCsvValue(v){
    let s = String(v || '').trim();
    if(!s) return '';
    s = s.replace(/[円￥]/g,'').replace(/,/g,'').replace(/[倍]/g,'').trim();
    const m = s.match(/\d+(?:\.\d+)?/);
    if(!m) return '';
    const n = Number(m[0]);
    if(!isFinite(n) || n <= 0) return '';
    return String(Math.round(n * 10) / 10);
  }
  function detectCsvMeta(lines){
    const meta = {date:'', place:'', raceNo:''};
    const places = ['札幌','函館','福島','新潟','東京','中山','中京','京都','阪神','小倉'];
    for(const line of lines.slice(0, 40)){
      const s = String(line || '');
      if(!meta.date){
        const dm = s.match(/(20\d{2})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})/);
        if(dm) meta.date = `${dm[1]}-${String(dm[2]).padStart(2,'0')}-${String(dm[3]).padStart(2,'0')}`;
      }
      if(!meta.place){
        for(const pl of places){ if(s.includes(pl)){ meta.place = pl; break; } }
      }
      if(!meta.raceNo){
        const rm = s.match(/(?:^|[^\d])(\d{1,2})\s*R(?:[^\d]|$)/i);
        if(rm) meta.raceNo = C.normRaceNo(rm[1]);
      }
      if(meta.date && meta.place && meta.raceNo) break;
    }
    return meta;
  }
  function csvHeaderScore(cells){
    const joined = cells.map(normHeaderName).join('|');
    let score = 0;
    if(/年月日|日付|date|racedate/.test(joined)) score++;
    if(/開催地|場|競馬場|place|venue/.test(joined)) score++;
    if(/レース数|レース番号|raceno|racenumber|r/.test(joined)) score++;
    if(/馬番|番号|no|horseno|umaban/.test(joined)) score += 2;
    if(/馬名|name|horsename/.test(joined)) score++;
    if(/単勝|オッズ|odds|winodds/.test(joined)) score += 2;
    return score;
  }
  function parseOddsCsvText(text){
    const rawLines = String(text || '').replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n').filter(x=>String(x).trim() !== '');
    const meta = detectCsvMeta(rawLines);
    if(!rawLines.length) return {entries:[], message:'CSVが空です。'};
    const parsed = rawLines.map(csvSplitLineLocal);
    let headerIdx = 0, bestScore = -1;
    parsed.forEach((cells,i)=>{
      const sc = csvHeaderScore(cells);
      if(sc > bestScore){ bestScore = sc; headerIdx = i; }
    });
    const hasHeader = bestScore >= 3;
    const headers = hasHeader ? parsed[headerIdx].map(normHeaderName) : [];
    const start = hasHeader ? headerIdx + 1 : 0;
    const entries = [];
    for(let i=start;i<parsed.length;i++){
      const cells = parsed[i];
      if(!cells || cells.every(x=>!String(x||'').trim())) continue;
      let row = {};
      if(hasHeader){ headers.forEach((h,j)=>{ if(h) row[h] = cells[j] || ''; }); }
      else{
        // ヘッダー無しの簡易形式：馬番,馬名,単勝 または 馬番,単勝
        row = {馬番:cells[0]||'', 馬名:cells.length>=3?cells[1]:'', 単勝:cells.length>=3?cells[2]:(cells[1]||'')};
      }
      const date = normalizeVer1DateValue(pickCsvValue(row, ['年月日','日付','開催日','date','raceDate']) || meta.date);
      const place = String(pickCsvValue(row, ['開催地','競馬場','場','place','venue']) || meta.place || '').trim();
      const raceNo = normalizeVer1RaceNoValue(pickCsvValue(row, ['レース数','レース番号','R','raceNo','raceNumber']) || meta.raceNo);
      const noRaw = pickCsvValue(row, ['馬番','番号','馬','no','horseNo','umaban','num']);
      const no = String(noRaw || '').replace(/[^0-9]/g,'').trim();
      const name = String(pickCsvValue(row, ['馬名','name','horseName','horse']) || '').trim();
      const odds = normalizeOddsCsvValue(pickCsvValue(row, ['単勝','単勝オッズ','オッズ','odds','winOdds','win']));
      if(!date || !place || !raceNo || (!no && !name) || !odds) continue;
      entries.push({date, place, raceNo, no, name, odds});
    }
    return {entries, message:`CSV読込 ${entries.length}件`};
  }
  function supplementExistingRacesOddsFromCsvText(text, options){
    options = options || {};
    const parsed = parseOddsCsvText(text);
    if(!parsed.entries.length) return {ok:false, filled:0, rows:0, message:'単勝を読み取れるCSV行がありませんでした。日付・開催地・R・馬番・単勝の列を確認してください。'};
    const index = new Map();
    parsed.entries.forEach(e=>{
      const key = makeRaceId(e);
      if(!key || key === '__') return;
      if(e.no) index.set(key+'|no|'+String(e.no), e.odds);
      if(e.name) index.set(key+'|name|'+String(e.name), e.odds);
    });
    const races = loadRaces();
    let filled = 0, matchedRaces = 0, matchedRows = 0;
    races.forEach(r=>{
      let raceFilled = 0;
      const key = makeRaceId(r);
      (r.horses || []).forEach(h=>{
        if(!h) return;
        if(!options.overwrite && String(h.odds || '').trim()) return;
        const no = String(h.no || '').trim();
        const byNo = no ? index.get(key+'|no|'+no) : '';
        const byName = h.name ? index.get(key+'|name|'+String(h.name || '').trim()) : '';
        const odds = byNo || byName || '';
        if(odds){ h.odds = odds; raceFilled++; filled++; matchedRows++; }
      });
      if(raceFilled){ matchedRaces++; C.calcPopularity(r.horses || []); r.updatedAt = now(); }
    });
    if(!filled) return {ok:false, filled:0, rows:parsed.entries.length, message:`CSVから単勝 ${parsed.entries.length}件を読み取りましたが、既存レースと一致しませんでした。日付・開催地・R・馬番を確認してください。`};
    saveRaces(races.map(compactImportedRace));
    return {ok:true, filled, rows:parsed.entries.length, matchedRaces, matchedRows, message:`単勝CSV補完完了：単勝補完 ${filled}件、対象レース ${matchedRaces}件、CSV読込 ${parsed.entries.length}件。既存の予想・結果・判定・払戻は変更していません。`};
  }


  function getOddsSupplementStats(){
    const index = buildOddsSupplementIndex([]);
    const src = index && index._sources ? index._sources : {};
    return {
      candidates: index && typeof index.size === 'number' ? index.size : 0,
      current: src.current || 0,
      source: src.source || 0,
      storage: src.storage || 0
    };
  }
  function supplementExistingRacesOdds(){
    const races = loadRaces();
    const index = buildOddsSupplementIndex([]);
    let filled = 0;
    races.forEach(r=>{ filled += supplementRaceOddsFromIndex(r, index); });
    saveRaces(races.map(compactImportedRace));
    const st = getOddsSupplementStats();
    return {ok:true, filled, message:`単勝補完 ${filled}件。補完元候補 ${st.candidates}件（現Ver2 ${st.current}件 / localStorage内 ${st.storage}件）。`};
  }


  function recalcExistingTanshoPayFromFirstOdds(options){
    options = options || {};
    const races = loadRaces();
    let updatedRaces = 0, added = 0, filledPay = 0, skippedNoOdds = 0, skippedNoFirst = 0;
    races.forEach(r=>{
      const result = r.result || {};
      const firsts = (result.firsts || []).map(x=>String(x || '').trim()).filter(Boolean);
      if(!firsts.length){ skippedNoFirst++; return; }
      result.tansho = Array.isArray(result.tansho) ? result.tansho : [];
      const oddsByNo = {};
      (r.horses || []).forEach(h=>{
        const no = String(h && h.no || '').trim();
        const odds = C.toNum(h && (h.odds ?? h.winOdds ?? h['単勝'] ?? h['オッズ']));
        if(no && odds !== null) oddsByNo[no] = Math.round(odds * 100);
      });
      let changed = false;
      firsts.forEach(no=>{
        const pay = oddsByNo[no];
        if(!pay){ skippedNoOdds++; return; }
        let row = result.tansho.find(x=>String(x && x.combo || '').trim() === no);
        if(row){
          // 手入力済みの払戻は上書きしない。空欄だけオッズ×100で補完する。
          if(!String(row.pay || '').trim()){
            row.pay = String(pay);
            row.auto = true;
            filledPay++;
            changed = true;
          }
        }else{
          result.tansho.push({combo:no, pay:String(pay), auto:true});
          added++;
          changed = true;
        }
      });
      if(changed){
        r.result = result;
        r.updatedAt = now();
        updatedRaces++;
      }
    });
    if(updatedRaces) saveRaces(races.map(compactImportedRace));
    return {ok:true, updatedRaces, added, filledPay, skippedNoOdds, skippedNoFirst,
      message:`単勝払戻一括再計算完了：更新レース ${updatedRaces}件、単勝追加 ${added}件、空欄補完 ${filledPay}件。単勝オッズなし ${skippedNoOdds}件、1着未入力 ${skippedNoFirst}件。手入力済み払戻は上書きしていません。`};
  }

  function importVer1Data(data, options){
    options = options || {};
    try{
      const arr = extractRaceArrayFromData(data);
      if(!looksLikeRaceArray(arr)) return {ok:false, message:'保存レース配列を検出できませんでした。', imported:0, updated:0, skipped:0, total:0};
      const current = loadRaces().map(compactImportedRace);
      const byId = new Map(current.map(r=>[makeRaceId(r), r]));
      const oddsIndex = buildOddsSupplementIndex(arr);
      let imported=0, updated=0, skipped=0, completed=0, oddsFilled=0, firstError='';
      arr.forEach(raw=>{
        try{
          let race = convertVer1Race(raw);
          if(!race.date || !race.place || !race.raceNo){ skipped++; return; }
          oddsFilled += supplementRaceOddsFromIndex(race, oddsIndex);
          if(!C.resultMissing(race.result||{})) completed++;
          const id = makeRaceId(race);
          const existing = byId.get(id);
          if(existing){
            const merged = mergeRace(existing, race, {keepExisting:false, oddsAlwaysUpdate:false});
            oddsFilled += supplementRaceOddsFromIndex(merged, oddsIndex);
            byId.set(id, compactImportedRace(merged));
            updated++;
          }else{
            byId.set(id, compactImportedRace(race));
            imported++;
          }
        }catch(e){
          if(!firstError) firstError = e && e.message ? e.message : String(e);
          console.error('importVer1Data race error', e, raw);
          skipped++;
        }
      });
      try{
        saveRaces(Array.from(byId.values()).map(compactImportedRace));
      }catch(e){
        const msg = e && e.name === 'QuotaExceededError' ? '保存容量上限に達しました。Ver2-069では移行データを軽量化していますが、まだ出る場合は旧Ver1キーが大きすぎます。Ver1側でJSON出力してからファイル移行を試してください。' : (e && e.message ? e.message : String(e));
        return {ok:false, message:msg, imported, updated, skipped, total:arr.length};
      }
      const oddsCandidate = oddsIndex && typeof oddsIndex.size === 'number' ? oddsIndex.size : 0;
      const src = oddsIndex && oddsIndex._sources ? oddsIndex._sources : {};
      return {ok:true, imported, updated, skipped, completed, oddsFilled, total:arr.length, message:(`結果入力済み ${completed}件。単勝補完 ${oddsFilled}件。補完元候補 ${oddsCandidate}件（現Ver2 ${src.current||0}件 / 移行元 ${src.source||0}件 / localStorage内 ${src.storage||0}件）。` + (oddsCandidate===0 ? ' 単勝付き出馬表が見つからないため補完できません。' : '') + (firstError ? ' 一部スキップ: '+firstError : ''))};
    }catch(e){
      return {ok:false, message:e && e.message ? e.message : String(e), imported:0, updated:0, skipped:0, total:0};
    }
  }
  function importVer1FromStorage(key){
    try{
      const text = localStorage.getItem(key || '');
      if(!text) return {ok:false, message:'指定キーのデータがありません。', imported:0, updated:0, skipped:0, total:0};
      let data;
      try{ data=JSON.parse(text); }catch(e){ return {ok:false, message:'JSON解析に失敗しました: '+(e.message||e), imported:0, updated:0, skipped:0, total:0}; }
      return importVer1Data(data, {sourceKey:key});
    }catch(e){
      return {ok:false, message:e && e.message ? e.message : String(e), imported:0, updated:0, skipped:0, total:0};
    }
  }
    window.KV2Store = {
    STORE_KEY,
    RULE_KEY,
    META_KEY,
    DATA_SCHEMA_VERSION,
    now,
    makeRaceId,
    blankRace,
    normalizeHorse,
    normalizeResult,
    normalizeTicketArray,
    normalizeMigration,
    normalizePredictionCategory,
    normalizeJudgmentStats,
    normalizeAIReview,
    normalizeRace,
    loadRaces,
    saveRaces,
    getRace,
    upsertRace,
    deleteRace,
    mergeRace,
    loadRules,
    saveRules,
    getRule,
    setRule,
    loadMeta,
    saveMeta,
    touchMeta,
    invalidateRaceCache,
    exportJson,
    importJson,
    createAutoBackup,
    listAutoBackups,
    restoreAutoBackup,
    deleteAutoBackup,
    convertVer1Race,
    scanVer1Storage,
    importVer1Data,
    importVer1FromStorage,
    getOddsSupplementStats,
    supplementExistingRacesOdds,
    supplementExistingRacesOddsFromCsvText,
    recalcExistingTanshoPayFromFirstOdds
  };
})();
