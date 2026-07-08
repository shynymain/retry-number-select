/* ==========================================
   03-prediction.js Ver.2 rev2-025
   印定義修正 + 軸候補2〜6人気 / 軸スコア・相手・買い目生成はver1準拠で固定
========================================== */
(function(){
  'use strict';
  const C = window.KV2Common;
  const PREDICTION_VERSION='ver2-026-prevday-result-category-count';

  function pastVals(h){
    return ['past1','past2','past3'].map(k=>C.toInt(h[k])).filter(v=>v!==null && v!==undefined && !Number.isNaN(v) && v>0);
  }
  function lastDigit(v){ v=C.toInt(v); return v?Math.abs(v)%10:null; }
  function pastDigits(h){ return pastVals(h).map(lastDigit); }
  function sameLastDigit(h){
    const ds=pastDigits(h);
    return ds.length===3 && ds[0]===ds[1] && ds[1]===ds[2];
  }
  function tokenMatch(token, val, exactSpecial){
    val=C.toInt(val); if(!val) return false;
    const d=lastDigit(val);
    if(exactSpecial) return d===token;
    if(token===5) return d===5 || val===14;
    if(token===9) return d===9 || val===18;
    return d===token;
  }
  function seqMatch(h, seq, exactSpecial){
    const vs=pastVals(h);
    return vs.length===3 && seq.every((token,i)=>tokenMatch(token, vs[i], exactSpecial));
  }
  function hasSpecifiedSequence(h){
    const normal=[[1,4,9],[1,4,6],[1,8,5],[8,1,4],[9,1,4],[6,1,4],[8,1,5],[5,1,8],[4,1,9],[4,1,6]];
    if(normal.some(seq=>seqMatch(h,seq,false))) return true;
    return seqMatch(h,[1,4,5],true) || seqMatch(h,[1,5,4],true);
  }
  function hasComposition(h, comp){
    const vs=pastVals(h);
    if(vs.length!==3) return false;
    return comp.every(token=>vs.some(v=>tokenMatch(token,v,false)));
  }
  function isAceMark(h){
    return sameLastDigit(h) || hasSpecifiedSequence(h) || hasComposition(h,[1,5,9]) || hasComposition(h,[1,5,6]);
  }
  function sumLastDigit(h){
    const ds=pastDigits(h);
    if(ds.length!==3) return null;
    return ds.reduce((a,b)=>a+b,0)%10;
  }
  function makeMarks(race){
    const marks={};
    (race.horses||[]).forEach(h=>{
      if(h.cancelled) return;
      if(isAceMark(h)) marks[h.no]='◎';
      else {
        const s=sumLastDigit(h);
        if(s===5) marks[h.no]='○';
        else if(s===9) marks[h.no]='▲';
      }
    });
    return marks;
  }

  function pastFinishVals(h){
    return ['past1','past2','past3'].map(k=>C.toInt(h&&h[k])).filter(v=>v!==null && v!==undefined && !Number.isNaN(v) && v>0);
  }
  function pastFinishDigits(h){ return pastFinishVals(h).map(lastDigit); }
  function sumLastDigitFromDigits(ds){ return (ds||[]).reduce((a,b)=>a+(C.toInt(b)||0),0)%10; }
  function allOddDigits(ds){ return ds.length===3 && ds.every(d=>d%2===1); }
  function allEvenDigits(ds){ return ds.length===3 && ds.every(d=>d!==0 && d%2===0); }
  function allPastOneDigit(vs){ return vs.length===3 && vs.every(v=>v>=1 && v<=9); }
  function allPastTwoDigit(vs){ return vs.length===3 && vs.every(v=>v>=10); }
  function sameSetDigits(ds,need){
    if(ds.length!==3) return false;
    return ds.slice().sort().join(',')===need.slice().sort().join(',');
  }
  function anySeq(vals,seqs){
    if(vals.length!==3) return false;
    const s=vals.join(',');
    return seqs.some(seq=>seq.join(',')===s);
  }
  function isRisingPast(vs){
    if(vs.length!==3) return false;
    const p1=vs[0], p2=vs[1], p3=vs[2];
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

    const sum32=(past3+past2)%10; // 前3走＋前2走
    const sum21=(past2+past1)%10; // 前2走＋前走

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
  function horseByNoLocal(r,no){ return (r&&r.horses||[]).find(h=>String(h&&h.no)===String(no))||null; }
  function neighborHorseDigitsForPast1(r,h){
    const no=C.toInt(h&&h.no); if(!r || !no) return [];
    const horses=(r.horses||[]);
    const maxNo=Math.max.apply(null, horses.map(x=>C.toInt(x&&x.no)).filter(Boolean));
    const nums=[];
    if(no>1) nums.push(no-1);
    if(no<maxNo) nums.push(no+1);
    return nums.map(n=>horseByNoLocal(r,n)).filter(Boolean).map(x=>lastDigit(C.toInt(x&&x.past1))).filter(v=>v!==null);
  }
  function commonMarkPatternNames(h,r){
    const vs=pastFinishVals(h), ds=pastFinishDigits(h), labels=[];
    const add=name=>{ if(name && !labels.includes(name)) labels.push(name); };
    const p1=ds.length>=1 ? ds[0] : null;
    const rawP1=vs.length>=1 ? vs[0] : null;

    if(p1===5 || rawP1===14) add('5着');
    if(p1===6) add('6着');
    if(p1===9) add('9着');
    if(p1===2 && neighborHorseDigitsForPast1(r,h).includes(3)) add('23');
    if(p1===3 && neighborHorseDigitsForPast1(r,h).includes(2)) add('32');

    // ゾロ目だけは前走・前2走の2走で成立可
    if(ds.length>=2 && ds[0]===ds[1]) add('ゾロ目');
  if(ds.length>=3 && ds[1]===ds[2]) add('ゾロ目');

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
  function markClassLabels(mark,h,r){
    const vs=pastFinishVals(h), ds=pastFinishDigits(h), labels=[];
    const add=name=>{ if(name && !labels.includes(`${mark} ${name}`)) labels.push(`${mark} ${name}`); };
    if(!mark) return [];
    commonMarkPatternNames(h,r).filter(x=>x!=='定義なし').forEach(add);
    if(ds.length!==3 || vs.length!==3) return labels.length ? labels : [mark];
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
  function makeMarkClasses(race, marks){
    const out={};
    (race.horses||[]).forEach(h=>{
      const no=String(h&&h.no||'');
      const mark=(marks&&marks[no]) || (marks&&marks[h&&h.no]) || '';
      if(!no || !mark) return;
      out[no]={mark, labels:markClassLabels(mark,h,race)};
    });
    return out;
  }

  function isFiveKeiHorse(h, race){
    if(!h) return false;
    const no=C.toInt(h.no); if(!no) return false;
    const head=C.toInt(race&&race.headCount)||18;
    const frame=C.toInt(h.frame)||C.frameOf(no,head);
    return no===5 || no===14 || no===15 || frame===5 || ((frame+no)%10)===5;
  }
  function isFiveKei(no){
    no=C.toInt(no); if(!no) return false;
    const frame=C.frameOf(no,18);
    return no===5 || no===14 || no===15 || frame===5 || ((frame+no)%10)===5;
  }
  // 軸スコアは、2〜6人気の候補内で「連動・隣±1・5系」だけを評価する。
  // 前走5人気以内・人気順位そのものは軸スコアに入れない。
  function hasLinkedMark(h, marks){
    return !!(h && marks && marks[h.no]);
  }
  function hasNeighborLink(h, marks){
    const no=C.toInt(h&&h.no);
    if(!no || !marks) return false;
    return !!(marks[no-1] || marks[no+1]);
  }
  function scoreHorse(h, mark, race, marks){
    let score=0;
    if(hasLinkedMark(h,marks)) score+=30;
    if(hasNeighborLink(h,marks)) score+=20;
    if(isFiveKeiHorse(h,race)) score+=25;
    return score;
  }
  function chooseAxis(race, marks){
    race.__marksForReason=marks||{};
    const horses=(race.horses||[]).filter(h=>!h.cancelled && C.toInt(h.no));
    let cand=horses.filter(h=>{const p=C.toInt(h.popularity); return p>=2 && p<=6;});
    if(!cand.length) cand=horses.filter(h=>marks[h.no]);
    if(!cand.length) cand=horses;
    if(!cand.length) return null;
    cand.forEach(h=>h.__score=scoreHorse(h, marks[h.no], race, marks));
    cand.sort((a,b)=>b.__score-a.__score || (C.toInt(a.popularity)||99)-(C.toInt(b.popularity)||99) || (C.toInt(a.no)||999)-(C.toInt(b.no)||999));
    const h=cand[0];
    return {no:h.no,name:h.name||'',mark:marks[h.no]||'',score:h.__score,reason:axisReason(h, marks[h.no], race)};
  }
  function axisReason(h, mark, race){
    const marks=(race&&race.__marksForReason)||{};
    const score=C.toInt(h&&h.__score)||0;
    const pop=C.toInt(h&&h.popularity)||'';
    const name=(h&&h.name)?` ${h.name}`:'';
    const good=[];
    if(hasLinkedMark(h,marks)) good.push('相手候補とのつながり');
    if(hasNeighborLink(h,marks)) good.push('隣±1の後押し');
    if(isFiveKeiHorse(h,race)) good.push('5系');
    const base=`今回は${h.no}${name}を軸にしました。${pop?pop+'人気で、':''}軸スコアは${score}。`;
    return base+(good.length?`${good.join('・')}を評価し、候補内では一番バランスが良いと判断しました。`:'条件の強さは控えめですが、候補内では最も安定していると判断しました。');
  }
  function byPop(horses){
    return horses.slice().sort((a,b)=>(C.toInt(a.popularity)||99)-(C.toInt(b.popularity)||99) || a.no-b.no);
  }
  function makeTickets(race, axis, marks){
    if(!axis) return {umaren:[],wide:[],sanrenpuku:[]};
    const axisNo=String(axis.no);
    const valid=(race.horses||[]).filter(h=>!h.cancelled && String(h.no)!==axisNo);
    const keyNo=h=>String(h&&h.no);
    const uniqHorses=(arr)=>{
      const seen=new Set(), out=[];
      arr.forEach(h=>{
        const k=keyNo(h);
        if(!h || !k || seen.has(k)) return;
        seen.add(k); out.push(h);
      });
      return out;
    };
    const uniq=(arr)=>[...new Set(arr.filter(Boolean))];

    // ver1の相手抽出順を維持しつつ、◎は「ライン発生源」なので3連複4点目へ特別優先しない。
    // 4点目は、未使用の非◎候補（▲/○・5系・人気順）を優先し、非◎が無い時だけ◎を補完に使う。
    const nonAceMarked=valid.filter(h=>marks[h.no] && marks[h.no]!=='◎');
    const nonAceFive=valid.filter(h=>marks[h.no]!=='◎' && isFiveKeiHorse(h,race));
    const nonAcePop=byPop(valid.filter(h=>marks[h.no]!=='◎'));
    const aceMarked=valid.filter(h=>marks[h.no]==='◎');
    const acePop=byPop(valid.filter(h=>marks[h.no]==='◎'));
    const ordered=uniqHorses([...nonAceMarked, ...nonAceFive, ...nonAcePop, ...aceMarked, ...acePop]);

    const p1=ordered[0]&&ordered[0].no;
    const p2=ordered[1]&&ordered[1].no;
    const p3=ordered[2]&&ordered[2].no;
    const first3=new Set([String(p1||''),String(p2||''),String(p3||'')]);
    const p4Horse=ordered.find(h=>!first3.has(String(h.no)) && marks[h.no]!=='◎') || ordered.find(h=>!first3.has(String(h.no)));
    const p4=p4Horse&&p4Horse.no;

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
  function gradeNeed(grade,surface){
    const g=String(grade||''), sf=String(surface||'');
    if(/障|J-G/.test(g) || /障/.test(sf)) return 10;
    if(g==='G1' && sf==='ダート') return 3;
    if(g==='G1' && sf==='芝') return 10;
    if(['G2','G3','OP','L','特別1勝','特別2勝','特別3勝'].includes(g)) return 20;
    if(['1勝','2勝','3勝'].includes(g)) return 30;
    return 30;
  }
  function categoryKey(race,mode){
    const surface=race.surface||''; const cond=race.condition||'定量';
    if(/障/.test(surface)||/^J-G/.test(race.grade||'')) return '全障害';
    if(mode==='g1TurfFallback') return 'G1+G2+G3/芝/定量';
    if(mode==='g1DirtFallback') return 'G1+G2+G3/ダート/定量';
    if(mode==='overall') return '全体/'+surface+'/'+cond;
    return (race.grade||'全体')+'/'+surface+'/'+cond;
  }
  function keyParts(key){ return String(key||'').split('/'); }
  function raceMatchesKey(r,key){
    if(!r) return false;
    key=String(key||'');
    if(key==='全障害') return /障/.test(r.surface||'') || /^J-G/.test(r.grade||'');
    const p=keyParts(key), g=p[0], s=p[1], c=p[2]||'定量';
    if(g==='全体') return (r.surface||'')===s && (r.condition||'定量')===c;
    if(g==='G1+G2+G3') return ['G1','G2','G3'].includes(r.grade||'') && (r.surface||'')===s && (r.condition||'定量')===c;
    return (r.grade||'')===g && (r.surface||'')===s && (r.condition||'定量')===c;
  }
  function resultDoneForCat(r){
    const res=r&&r.result||{};
    return (res.firsts&&res.firsts.length) || (res.seconds&&res.seconds.length) || (res.thirds&&res.thirds.length);
  }
  function raceSortAsc(a,b){
    const da=C.normDate(a&&a.date||'');
    const db=C.normDate(b&&b.date||'');
    return da.localeCompare(db)
      || C.placeGroup(a&&a.place,a&&a.date) - C.placeGroup(b&&b.place,b&&b.date)
      || C.placeOrder(a&&a.place,a&&a.date) - C.placeOrder(b&&b.place,b&&b.date)
      || C.raceNoNum(a&&a.raceNo) - C.raceNoNum(b&&b.raceNo);
  }
  function isBeforeTargetDate(r,targetRace){
    const rd=C.normDate(r&&r.date||'');
    const td=C.normDate(targetRace&&targetRace.date||'');
    if(!rd || !td) return true;
    return rd < td;
  }
  function categoryHistoryRows(targetRace,races,key){
    // 各カテゴリーのトータルR・直近R・的中数は、予想対象日の前日までに結果入力済みのレースだけで集計する。
    // 当日予想中レースや同日で結果入力済みの別レースは、判定の母数に含めない。
    return (races||[])
      .filter(r=>raceMatchesKey(r,key))
      .filter(r=>isBeforeTargetDate(r,targetRace))
      .filter(resultDoneForCat)
      .sort(raceSortAsc);
  }
  function countByKey(key,races,targetRace){
    return categoryHistoryRows(targetRace||{},races,key).length;
  }
  function countCategory(race, races){
    return countByKey(categoryKey(race), races, race);
  }
  function hitCountForRows(rows){
    let total=0, by={umaren:0,wide:0,sanrenpuku:0};
    (rows||[]).forEach(r=>{
      if(!resultDoneForCat(r)) return;
      const p=r.prediction||{}, res=C.autoResultCombos(r.result||{});
      let any=false;
      ['umaren','wide','sanrenpuku'].forEach(k=>{
        const hit=(p[k]||[]).some(x=>(res[k]||[]).includes(C.comboKey(x)));
        if(hit){by[k]++; any=true;}
      });
      if(any) total++;
    });
    return {total,by};
  }
  function hitEnough(hit){
    hit=hit||{total:0,by:{}};
    return (hit.total||0)>=3 && Math.max(hit.by&&hit.by.umaren||0, hit.by&&hit.by.wide||0, hit.by&&hit.by.sanrenpuku||0)>=2;
  }
  function hitCountCategory(race,races){
    const key=categoryKey(race);
    return hitCountForRows(categoryHistoryRows(race,races,key));
  }
  function fallbackKeyForRace(race){
    if(/障/.test(race.surface||'')||/^J-G/.test(race.grade||'')) return '全障害';
    if(race.grade==='G1' && race.surface==='芝') return categoryKey(race,'g1TurfFallback');
    if(race.grade==='G1' && race.surface==='ダート') return categoryKey(race,'g1DirtFallback');
    return categoryKey(race,'overall');
  }
  function recentRangeInfo(total,need,rows){
    if(total<=need) return {useRecent:false,start:0,count:0,range:'',hit:{total:0,by:{umaren:0,wide:0,sanrenpuku:0}}};
    const start=Math.max(need, total-30); // 0-based slice start. 表示は start+1 R目から。
    const target=(rows||[]).slice(start);
    const hit=hitCountForRows(target);
    const count=target.length;
    const forced = total > need + 20;
    const useRecent = forced || hitEnough(hit);
    return {useRecent,start,count,range:`${start+1}〜${total}R`,hit};
  }
  function categoryInfo(race,races){
    const primary=categoryKey(race);
    const need=gradeNeed(race.grade,race.surface);
    const rows=categoryHistoryRows(race,races,primary);
    const cnt=rows.length;
    const fallback=fallbackKeyForRace(race);
    const totalHit=hitCountForRows(rows);
    const earlyReady=hitEnough(totalHit);
    const recent=recentRangeInfo(cnt,need,rows);
    const isObstacle = /障/.test(race.surface||'') || /^J-G/.test(race.grade||'');
    let ready=false, used=fallback, extra='', basis='仮判定', judgmentBasis='fallback';
    if(isObstacle){
      ready=true; used='全障害'; basis = recent.useRecent ? `直近${recent.count}R（${recent.range}）` : `トータル${cnt}R`; judgmentBasis = recent.useRecent?'recent':'total';
    }else if(cnt < need && earlyReady){
      ready=true; used=primary; basis=`トータル${cnt}R（的中条件でカテゴリー判定）`; judgmentBasis='total-early';
    }else if(cnt < need){
      ready=false; used=fallback; extra=fallback; basis=`仮判定（必要${need}R / 現在${cnt}R）`; judgmentBasis='fallback';
    }else if(recent.useRecent){
      ready=true; used=primary; basis=`直近${recent.count}R（${recent.range}）`; judgmentBasis='recent';
    }else{
      ready=true; used=primary; basis=`トータル${cnt}R`; judgmentBasis='total';
    }
    return {primary,used,extra,ready,need,count:cnt,basis,judgmentBasis,fallback,recentRange:recent.range,recentCount:recent.count,recentStart:recent.start+1,totalHitCount:totalHit.total,totalTicketHitMax:Math.max(totalHit.by.umaren,totalHit.by.wide,totalHit.by.sanrenpuku)};
  }
  function basisLabel(count,hit){
    if(count>=50) return '直近30R';
    if(count>=31 && hit && hit.total>=3 && Math.max(hit.by.umaren,hit.by.wide,hit.by.sanrenpuku)>=2) return '直近'+(count-30)+'R';
    return 'トータル'+count+'R';
  }
  function dummyRates(axis){
    if(!axis) return {all:0,umaren:0,wide:0,sanrenpuku:0,hit:0,axis:0};
    return {all:112.4,axis:121.6,umaren:116.2,wide:128.7,sanrenpuku:103.8,hit:42.1};
  }
  function judgeFromRates(rates, catReady){
    if(rates.all<100) return '見送り';
    const n=['umaren','wide','sanrenpuku'].filter(k=>rates[k]>=100).length;
    let j=n===3?'勝負':n===2?'抑え':n===1?'保留':'見送り';
    if(!catReady){ if(j==='勝負') j='抑え'; else if(j==='抑え') j='保留'; }
    return j;
  }

  function snapshotCategory(cat){
    cat = cat || {};
    return {
      primary:cat.primary || '', used:cat.used || '', extra:cat.extra || '',
      ready:!!cat.ready, need:cat.need || 0, count:cat.count || 0,
      basis:cat.basis || '', savedAt:new Date().toISOString()
    };
  }
  function judgmentSnapshot(cat,rates,judge){
    rates = rates || {};
    return {
      basis:rates.basis || '',
      category:snapshotCategory(cat),
      rates:{all:rates.all||'', hit:rates.hit||'', axis:rates.axis||'', umaren:rates.umaren||'', wide:rates.wide||'', sanrenpuku:rates.sanrenpuku||''},
      total:{raceCount:cat&&cat.count||0, hitCount:0, axisHitCount:0, returnRate:rates.all||'', hitRate:rates.hit||''},
      recent:{range:rates.basis||'', raceCount:0, hitCount:0, axisHitCount:0, returnRate:'', hitRate:''},
      judge:judge || '',
      savedAt:new Date().toISOString()
    };
  }

  function generate(race, allRaces){
    race=JSON.parse(JSON.stringify(race||{}));
    C.calcPopularity(race.horses||[]);
    const marks=makeMarks(race);
    const hasMark=Object.keys(marks).length>0;
    if(!hasMark){
      const cat0=categoryInfo(race,allRaces||[]); const rates0=dummyRates(null); race.prediction={version:PREDICTION_VERSION,marks,axis:null,axisScore:0,judge:'見送り',recommend:[],umaren:[],wide:[],sanrenpuku:[],reason:['印が無いため見送り。'],category:cat0,rates:rates0}; race.predictionCategory=snapshotCategory(cat0); race.judgmentStats=judgmentSnapshot(cat0,rates0,'見送り');
      return race;
    }
    const axis=chooseAxis(race,marks);
    const tickets=makeTickets(race,axis,marks);
    const cat=categoryInfo(race,allRaces||[]);
    const hit=hitCountCategory(race,allRaces||[]);
    const rates=dummyRates(axis);
    rates.basis=cat.basis || basisLabel(cat.count||0,hit);
    const judge=judgeFromRates(rates,cat.ready);
    const recommend=['umaren','wide','sanrenpuku'].filter(k=>rates[k]>=100);
    race.prediction={version:PREDICTION_VERSION,marks,axis,axisScore:axis?axis.score:0,judge,recommend,umaren:tickets.umaren,wide:tickets.wide,sanrenpuku:tickets.sanrenpuku,reason:[axis?axis.reason:''],category:cat,rates}; race.predictionCategory=snapshotCategory(cat); race.judgmentStats=judgmentSnapshot(cat,rates,judge);
    return race;
  }
  window.KV2Prediction={generate,categoryInfo,categoryKey,gradeNeed,dummyRates,isFiveKei,markClassLabels,makeMarkClasses,version:PREDICTION_VERSION};
})();
