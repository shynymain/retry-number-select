/* ==========================================
   競馬予想検証アプリ Ver.2
   00-common.js
========================================== */

(function(){
  'use strict';

  const JRA_PLACES = ['札幌','函館','福島','新潟','東京','中山','中京','京都','阪神','小倉'];

  const NORMAL_EAST = ['東京','中山'];
  const NORMAL_WEST = ['阪神','京都','中京'];

  const SUMMER_EAST = ['福島','新潟'];
  const SUMMER_WEST = ['小倉','中京'];

  function esc(v){
    return String(v ?? '').replace(/[&<>"']/g, m => ({
      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      '"':'&quot;',
      "'":'&#39;'
    }[m]));
  }

  function toInt(v){
    const s = String(v ?? '').trim();
    if(!s) return null;
    if(/取消|除外|中止|競走中止|失格/.test(s)) return null;
    const n = parseInt(s.replace(/[^0-9-]/g,''),10);
    return Number.isFinite(n) ? n : null;
  }

  function toNum(v){
    const s = String(v ?? '').replace(/,/g,'').trim();
    if(!s) return null;
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  }

  function normDate(v){
    const s = String(v ?? '').trim().replace(/\//g,'-');
    const m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if(!m) return s;
    return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
  }

  function normRaceNo(v){
    const n = toInt(v);
    return n ? `${n}R` : '';
  }

  function raceNoNum(v){
    return toInt(String(v ?? '').replace('R','')) || 0;
  }

  function isSummerDate(date){
    const d = normDate(date);
    const m = d.match(/^\d{4}-(\d{2})-/);
    if(!m) return false;
    const month = Number(m[1]);
    return month >= 7 && month <= 9;
  }

  function placeGroup(place,date){
    place = String(place || '');
    const summer = isSummerDate(date);
    const east = summer ? SUMMER_EAST : NORMAL_EAST;
    const west = summer ? SUMMER_WEST : NORMAL_WEST;

    if(east.includes(place)) return 1;
    if(west.includes(place)) return 2;
    return 3;
  }

  function placeOrder(place,date){
    place = String(place || '');
    const summer = isSummerDate(date);
    const east = summer ? SUMMER_EAST : NORMAL_EAST;
    const west = summer ? SUMMER_WEST : NORMAL_WEST;

    let i = east.indexOf(place);
    if(i >= 0) return i;

    i = west.indexOf(place);
    if(i >= 0) return 100 + i;

    i = JRA_PLACES.indexOf(place);
    return i >= 0 ? 200 + i : 999;
  }

  function sortSavedRaces(list){
    return (Array.isArray(list) ? list : []).slice().sort((a,b)=>{
      const da = normDate(a.date);
      const db = normDate(b.date);

      return db.localeCompare(da)
        || placeGroup(a.place,a.date) - placeGroup(b.place,b.date)
        || placeOrder(a.place,a.date) - placeOrder(b.place,b.date)
        || raceNoNum(a.raceNo) - raceNoNum(b.raceNo);
    });
  }

  function frameOf(horseNo, headCount){
    const no = toInt(horseNo);
    const head = toInt(headCount) || 18;
    if(!no || no < 1) return '';

    if(head <= 8) return no <= head ? no : '';

    const caps = Array(8).fill(1);
    let extra = Math.max(0, head - 8);

    for(let i=7; extra>0; i=(i-1+8)%8){
      caps[i]++;
      extra--;
    }

    let max = 0;
    for(let f=1; f<=8; f++){
      max += caps[f-1];
      if(no <= max) return f;
    }

    return '';
  }

  function isCancelledByOdds(odds){
    return String(odds ?? '').trim() === '';
  }

  function calcPopularity(horses){
    const valid = (Array.isArray(horses) ? horses : [])
      .filter(h => !isCancelledByOdds(h.odds))
      .map(h => ({
        horse: h,
        odds: toNum(h.odds)
      }))
      .filter(x => x.odds !== null)
      .sort((a,b)=>a.odds-b.odds);

    let rank = 1;
    let prevOdds = null;
    let sameCount = 0;

    valid.forEach((x,i)=>{
      if(prevOdds !== null && x.odds === prevOdds){
        x.horse.popularity = rank;
        sameCount++;
      }else{
        rank = i + 1;
        x.horse.popularity = rank;
        sameCount = 1;
      }
      prevOdds = x.odds;
    });

    return horses;
  }

  function comboKey(combo){
    return String(combo || '')
      .split('-')
      .map(toInt)
      .filter(Boolean)
      .sort((a,b)=>a-b)
      .join('-');
  }

  function uniqueNumbers(arr){
    return [...new Set((arr || []).map(toInt).filter(Boolean))]
      .sort((a,b)=>a-b);
  }

  function pairCombos(nums){
    nums = uniqueNumbers(nums);
    const out = [];
    for(let i=0;i<nums.length;i++){
      for(let j=i+1;j<nums.length;j++){
        out.push(`${nums[i]}-${nums[j]}`);
      }
    }
    return out;
  }

  function tripleCombos(nums){
    nums = uniqueNumbers(nums);
    const out = [];
    for(let i=0;i<nums.length;i++){
      for(let j=i+1;j<nums.length;j++){
        for(let k=j+1;k<nums.length;k++){
          out.push(`${nums[i]}-${nums[j]}-${nums[k]}`);
        }
      }
    }
    return out;
  }

  function autoResultCombos(result){
    const firsts = uniqueNumbers(result.firsts);
    const seconds = uniqueNumbers(result.seconds);
    const thirds = uniqueNumbers(result.thirds);

    let umaren = [];
    let wide = [];
    let sanrenpuku = [];

    if(firsts.length >= 2){
      umaren = pairCombos(firsts);
    }else if(firsts.length === 1){
      umaren = seconds.map(s => comboKey(`${firsts[0]}-${s}`)).filter(Boolean);
    }

    wide = pairCombos([...firsts, ...seconds, ...thirds]);

    if(firsts.length >= 3){
      sanrenpuku = tripleCombos(firsts);
    }else if(firsts.length === 2){
      const group = seconds.length ? seconds : thirds;
      sanrenpuku = group.map(x => comboKey(`${firsts[0]}-${firsts[1]}-${x}`)).filter(Boolean);
    }else if(firsts.length === 1){
      if(seconds.length >= 2){
        sanrenpuku = pairCombos(seconds).map(c => comboKey(`${firsts[0]}-${c}`)).filter(Boolean);
      }else if(seconds.length === 1){
        sanrenpuku = thirds.map(t => comboKey(`${firsts[0]}-${seconds[0]}-${t}`)).filter(Boolean);
      }
    }

    return {
      umaren:[...new Set(umaren.map(comboKey).filter(Boolean))],
      wide:[...new Set(wide.map(comboKey).filter(Boolean))],
      sanrenpuku:[...new Set(sanrenpuku.map(comboKey).filter(Boolean))]
    };
  }

  function resultMissing(result){
    result = result || {};
    const hasFinish =
      (result.firsts || []).some(Boolean) ||
      (result.seconds || []).some(Boolean) ||
      (result.thirds || []).some(Boolean);

    const hasPay =
      (result.tansho || []).some(x => x.pay) ||
      (result.umaren || []).some(x => x.pay) ||
      (result.wide || []).some(x => x.pay) ||
      (result.sanrenpuku || []).some(x => x.pay);

    return !(hasFinish && hasPay);
  }

  function yen(v){
    const n = toInt(v);
    return n ? n.toLocaleString() + '円' : '';
  }

  function pct(v){
    const n = toNum(v);
    return n === null ? '-' : `${Math.round(n * 10) / 10}%`;
  }


  function copyTextToClipboard(text){
    text = String(text ?? '');
    if(navigator.clipboard && window.isSecureContext){
      return navigator.clipboard.writeText(text);
    }
    return new Promise((resolve,reject)=>{
      try{
        const ta=document.createElement('textarea');
        ta.value=text;
        ta.setAttribute('readonly','readonly');
        ta.style.position='fixed';
        ta.style.left='-9999px';
        ta.style.top='0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok=document.execCommand('copy');
        ta.remove();
        ok ? resolve() : reject(new Error('copy command failed'));
      }catch(e){ reject(e); }
    });
  }

  function collectScreenText(title){
    const app=document.getElementById('app');
    const body=app ? (app.innerText || app.textContent || '') : (document.body.innerText || '');
    const lines=[];
    lines.push(`【${title || document.title || '画面全文'}】`);
    lines.push(`コピー日時: ${new Date().toLocaleString('ja-JP')}`);
    lines.push(`URL: ${location.href}`);
    lines.push('');
    lines.push(body.replace(/\n{3,}/g,'\n\n').trim());
    try{
      if(window.__KV2_LAST_ERROR){
        lines.push(''); lines.push('【エラー詳細】'); lines.push(String(window.__KV2_LAST_ERROR));
      }
      if(window.__KV2_LAST_DEBUG_TEXT){
        lines.push(''); lines.push('【デバッグ詳細】'); lines.push(String(window.__KV2_LAST_DEBUG_TEXT));
      }
    }catch(e){}
    return lines.join('\n');
  }

  function copyScreen(title){
    const text=collectScreenText(title);
    return copyTextToClipboard(text).then(()=>{
      alert('画面全文をコピーしました');
    }).catch(e=>{
      console.error('screen copy failed', e);
      try{
        const ta=document.createElement('textarea');
        ta.value=text;
        ta.style.width='100%';
        ta.style.height='240px';
        ta.style.position='fixed';
        ta.style.left='0';
        ta.style.bottom='0';
        ta.style.zIndex='99999';
        document.body.appendChild(ta);
        ta.focus(); ta.select();
        alert('自動コピーに失敗しました。下に表示された全文を長押ししてコピーしてください。');
      }catch(_){ alert('コピーに失敗しました: '+(e&&e.message?e.message:e)); }
    });
  }

  function copyButtonHtml(label,title){
    return `<button type="button" class="secondary" data-kv2-copy-screen="${esc(title||label||'画面全文')}">${esc(label||'画面全文コピー')}</button>`;
  }

  if(!window.__KV2_COPY_HANDLER_INSTALLED){
    window.__KV2_COPY_HANDLER_INSTALLED=true;
    document.addEventListener('click', function(ev){
      const btn=ev.target && ev.target.closest ? ev.target.closest('[data-kv2-copy-screen]') : null;
      if(!btn) return;
      ev.preventDefault();
      copyScreen(btn.getAttribute('data-kv2-copy-screen') || '画面全文');
    }, false);
    window.addEventListener('error', function(ev){
      try{ window.__KV2_LAST_ERROR = `${ev.message || 'error'}\n${ev.filename || ''}:${ev.lineno || ''}:${ev.colno || ''}\n${ev.error && ev.error.stack ? ev.error.stack : ''}`; }catch(e){}
    });
    window.addEventListener('unhandledrejection', function(ev){
      try{ window.__KV2_LAST_ERROR = `UnhandledRejection\n${ev.reason && ev.reason.stack ? ev.reason.stack : ev.reason}`; }catch(e){}
    });
  }

  window.KV2Common = {
    JRA_PLACES,
    NORMAL_EAST,
    NORMAL_WEST,
    SUMMER_EAST,
    SUMMER_WEST,
    esc,
    toInt,
    toNum,
    normDate,
    normRaceNo,
    raceNoNum,
    isSummerDate,
    placeGroup,
    placeOrder,
    sortSavedRaces,
    frameOf,
    isCancelledByOdds,
    calcPopularity,
    comboKey,
    uniqueNumbers,
    pairCombos,
    tripleCombos,
    autoResultCombos,
    resultMissing,
    yen,
    pct,
    copyTextToClipboard,
    collectScreenText,
    copyScreen,
    copyButtonHtml
  };

})();
