/* ==========================================
   02-parser.js Ver.2 parser / ver2-055 filly-sex-detect fix
   基本・出馬表・前走 / オッズ / 結果
========================================== */
(function(){
  'use strict';
  const C=window.KV2Common;

  function rawText(t){return String(t||'').replace(/\r/g,'')}
  function textLines(t){return rawText(t).split('\n').map(s=>s.trim()).filter(Boolean)}
  function z2h(s){return String(s||'').replace(/[０-９]/g,ch=>String.fromCharCode(ch.charCodeAt(0)-0xFEE0)).replace(/３連複/g,'3連複').replace(/[－ー―]/g,'-')}
  function money(s){return String(s||'').replace(/[^0-9]/g,'')}
  function normalizeCondition(t){return /別定/.test(t)?'別定':/ハンデ/.test(t)?'ハンデ':'定量'}

  function entryArea(text){
    let s=rawText(text);
    const cuts=[
      s.search(/\n\s*オッズ\s*\n\s*オッズ\s*単勝/),
      s.search(/\n\s*結果\s*\n\s*レース結果/),
      s.search(/\n\s*レース結果\(着順\)/)
    ].filter(i=>i>0);
    if(cuts.length) s=s.slice(0, Math.min(...cuts));
    return s;
  }


  function oddsArea(text){
    let s=rawText(text);
    const z=z2h(s);
    const starts=[
      z.search(/オッズ\s*単勝/),
      z.search(/\[印\].*?馬名/s),
      z.search(/人気順\s*\n\s*馬番順/)
    ].filter(i=>i>=0);
    if(starts.length) s=s.slice(Math.min(...starts));
    const zcut=z2h(s);
    const cuts=[
      zcut.search(/\n\s*結果\s*\n\s*レース結果/),
      zcut.search(/\n\s*レース結果\(着順\)/),
      zcut.search(/\n\s*着順\s*\n/),
      zcut.search(/\n\s*払戻金\s*\n/)
    ].filter(i=>i>0);
    if(cuts.length) s=s.slice(0, Math.min(...cuts));
    return s;
  }

  function headerText(text){
    const lines=textLines(entryArea(text));
    let end=lines.findIndex(l=>/オッズ\s*馬名|馬齢|脚質|戦績\s*前走|払戻金|着順\s*$/.test(l));
    if(end<0) end=Math.min(lines.length, 45);
    return lines.slice(0,end).join('\n');
  }

  function detectRaceName(text){
    const lines=textLines(entryArea(text));
    for(let i=0;i<lines.length;i++){
      if(/20\d{2}[\/年\-.]\d{1,2}[\/月\-.]\d{1,2}.*?\d{1,2}\s*R/.test(lines[i])){
        for(let j=i+1;j<Math.min(i+8,lines.length);j++){
          const l=lines[j];
          if(!l || /^\d+R$/.test(l) || /^\d{1,2}$/.test(l)) continue;
          if(/^(出馬表|オッズ|レース結果|着順|払戻金|Copyright|パドック|レース動画|レース|本賞金|｢消｣|番|印|■)/.test(l)) continue;
          if(/馬体重発表前|オッズ発表前|馬非表示|頭|発走|動画/.test(l)) continue;
          if(/クラス|ｸﾗｽ/.test(l)){
            const cls=l.replace(/３/g,'3').replace(/２/g,'2').replace(/１/g,'1').replace(/ｸﾗｽ/g,'クラス').match(/(?:3歳上|3歳以上|4歳上|4歳以上)?\s*[123]勝クラス/);
            return (cls?cls[0]:l).replace(/\s+/g,'').slice(0,24);
          }
          return l.trim().replace(/\s*(?:J[-・]?G\s*[1-3]|G\s*[1-3]|Ｇ[ⅠⅡⅢ]|GI|GII|GIII)\s*$/i,'').trim().slice(0,24);
        }
      }
    }
    for(const l of lines){
      if(/^(出馬表|オッズ|レース結果|着順|払戻金|Copyright|パドック|レース動画|レース結果)/.test(l)) continue;
      if(/記念|賞|ステークス|Ｓ|S|特別|カップ|ジャンプ/.test(l) && !/この画面|メニュー|トップ|見る/.test(l)){
        if(!/^\d+R$/.test(l)) return l.replace(/^[\d\sR]+/,'').trim().replace(/\s*(?:J[-・]?G\s*[1-3]|G\s*[1-3]|Ｇ[ⅠⅡⅢ]|GI|GII|GIII)\s*$/i,'').trim().slice(0,24);
      }
    }
    return '';
  }

  function detectGrade(text){
    const all=z2h(rawText(text)).replace(/ｸﾗｽ/g,'クラス');
    const head=headerText(all).replace(/ｸﾗｽ/g,'クラス');
    const raceName=detectRaceName(all)||'';
    const isSpecial=!!raceName && !/1勝|2勝|3勝/.test(raceName);
    if(/J[・\-]?G\s*1|J-G1|JG1|障害.*G1/.test(head)) return 'J-G1';
    if(/J[・\-]?G\s*2|J-G2|JG2|障害.*G2/.test(head)) return 'J-G2';
    if(/J[・\-]?G\s*3|J-G3|JG3|障害.*G3/.test(head)) return 'J-G3';
    if(/G\s*1|ＧⅠ|GI/.test(head)) return 'G1';
    if(/G\s*2|ＧⅡ|GII/.test(head)) return 'G2';
    if(/G\s*3|ＧⅢ|GIII/.test(head)) return 'G3';
    if(/3歳上3勝クラス|3勝クラス|３勝/.test(head)) return isSpecial?'特別3勝':'3勝';
    if(/3歳上2勝クラス|2勝クラス|２勝/.test(head)) return isSpecial?'特別2勝':'2勝';
    if(/3歳上1勝クラス|1勝クラス|１勝/.test(head)) return isSpecial?'特別1勝':'1勝';
    if(/リステッド|\bL\b|Ｌ/.test(head)) return 'L';
    if(/オープン|OP|ｵｰﾌﾟﾝ/.test(head)) return 'OP';
    return '';
  }

  function detectPlace(text){
    const places=C.JRA_PLACES.concat(['門別','大井','川崎','船橋','浦和','園田','姫路','高知','佐賀','金沢','名古屋','笠松','盛岡','水沢']);
    const src=entryArea(text);
    const line=(z2h(src).match(/20\d{2}[\/年\-.]\d{1,2}[\/月\-.]\d{1,2}[^\n]*/) || [])[0] || '';
    const pm=line.match(/\d+回\s*([^\s\d]+?)\s*\d+日/);
    if(pm) return pm[1];
    const lines=textLines(src).slice(0,45);
    for(const l of lines){ const exact=places.find(p=>l===p); if(exact) return exact; }
    for(const l of lines.slice(0,15)){ const hit=places.find(p=>l.includes(p)); if(hit) return hit; }
    return places.find(p=>lines.join('\n').includes(p))||'';
  }

  function parseBasic(text){
    const out={};
    const src=entryArea(rawText(text));
    const ntext=z2h(src).replace(/ｸﾗｽ/g,'クラス');
    const dateRace=ntext.match(/(20\d{2})[\/年\-.](\d{1,2})[\/月\-.](\d{1,2}).*?(\d{1,2})\s*R/);
    if(dateRace){
      out.date=C.normDate(`${dateRace[1]}-${dateRace[2]}-${dateRace[3]}`);
      out.raceNo=dateRace[4]+'R';
    }else{
      const dm=ntext.match(/(20\d{2})[\/年\-.](\d{1,2})[\/月\-.](\d{1,2})/); if(dm) out.date=C.normDate(`${dm[1]}-${dm[2]}-${dm[3]}`);
      const rm=ntext.match(/(\d{1,2})\s*R/i); if(rm) out.raceNo=rm[1]+'R';
    }
    out.place=detectPlace(src);
    const dist=ntext.match(/(芝|ダート|ダ|障害)\s*(?:右|左|外|内|直線|芝|ダート|障害)*\s*(\d{3,4})\s*m/);
    if(dist){out.surface=dist[1]==='ダ'?'ダート':dist[1]; out.distance=dist[2]+'m'}
    const head=ntext.match(/(\d{1,2})\s*頭/); if(head) out.headCount=C.toInt(head[1]);
    out.condition=normalizeCondition(ntext);
    out.grade=detectGrade(ntext);
    const age=ntext.match(/(\d歳上|\d歳以上|\d歳|古馬|障害\d歳以上)/); if(age) out.age=age[1].replace('歳上','歳以上');
    const htxt=headerText(ntext).replace(/[（）]/g, m=>m==='（'?'(':')').replace(/[［］]/g, m=>m==='［'?'[':']');
    // 性別判定は馬ごとの「牡/牝」ではなく、基本情報ヘッダーだけを見る。
    // JRA詳細版は牝馬限定を「(牝)」「牝馬限定」「牝 [指定]」などで表すため、混合より先に牝を優先する。
    out.sex=/(?:\(\s*牝\s*\)|牝馬限定|牝馬\s*(?:限定|\[|\(|$)|(?:^|[\s\[\(])牝(?:[\s\[\]\)]|限定|$))/.test(htxt)?'牝':'混合';
    out.raceName=detectRaceName(ntext)||'';
    return out;
  }

  function cleanNameLine(l){ return String(l||'').trim().replace(/[\t　]+$/g,''); }
  function isJockeyLike(l){ return /(隆一|裕信|一樹|温心|極|皇成|典弘|雅|秀|瑠星|誠人|優介|津村|戸崎|丸山|菊沢|田辺|小崎|三浦|坂井|武藤|原優|荻野|横山|杉原|木幡|佐々木|松山|鮫島|北村|西村|斎藤|亀田|高杉|小林|大野|富田|菱田|武豊|レーン|ルメール|デム|ゴンサル|プーシャ|マーカン)/.test(l); }
  function isBadHorseNameLine(l){
    l=cleanNameLine(l);
    return !l
      || /人気|倍|父 |母 |牡|牝|kg|週|替|全 |ダ |芝 |登録|予想|印|DM|ﾀｲﾑ|対戦|騎手|調教師|馬主|生産者/.test(l)
      || /^[()（）]/.test(l) || /^　/.test(l) || /^\d+(\.\d+)?$/.test(l)
      || /^[①-⑯\s]+$/.test(l) || /[0-9]{2}\/\d{2}/.test(l)
      || /^(中\d+週|\d+ヶ月|\d+ヶ月半|中\d+日|連闘)$/.test(l)
      || isJockeyLike(l);
  }

  function splitHorseBlocks(text){
    const src=entryArea(text);
    const lines=src.split('\n').map(x=>String(x).trim());

    // 出馬表冒頭には「1 2 3...」の番号一覧があるため、
    // そこからブロックを切ると全馬が1番馬扱いになる。
    // 実馬データは「戦績 前走 前々走...」見出しの後から始まるため、
    // その位置以降だけを馬ブロック候補にする。
    let start=lines.findIndex(l=>/戦績/.test(l) && /前走/.test(l));
    if(start<0) start=lines.findIndex(l=>/^オッズ$/.test(l) || /オッズ.*馬名/.test(l));
    if(start<0) start=0;

    const blocks=[];
    function horseStartTail(line,no){
      const l=String(line||'').trim();
      if(l===String(no)) return '';
      // JRA-VAN詳細版はコピー状態により「1    16人気」のように
      // 馬番と人気が同一行に連結される。馬番完全一致だけにすると
      // 出馬表0頭になるため、人気/倍が続く行だけ馬ブロック起点として許可する。
      const m=l.match(new RegExp('^'+no+'(?:[\t 　]+)(.+)$'));
      if(!m) return null;
      const tail=String(m[1]||'').trim();
      if(/(?:\d{1,2}|\*\*)\s*人気|(?:\d+\.\d+|\*\*)\s*倍/.test(tail)) return tail;
      return null;
    }
    for(let no=1; no<=18; no++){
      let best=null;
      for(let i=start;i<lines.length;i++){
        const tail=horseStartTail(lines[i],no);
        if(tail===null) continue;

        const partLines=[];
        if(tail) partLines.push(tail);
        for(let j=i+1;j<Math.min(lines.length,i+260);j++){
          if(/^登録$/.test(lines[j])) break;
          partLines.push(lines[j]);
        }
        const head=partLines.slice(0,30).join('\n');

        // 実馬ブロック条件：馬番直後の近い範囲に「人気」「倍」「父」があること。
        // オッズ発表前は「**人気」「**倍」になるため、数値オッズを必須にしない。
        // 既走欄の着順数字を馬番開始として誤検出しないため、
        // 260行全体ではなく先頭30行だけで判定する。
        const hasPopularity = /(?:\d{1,2}|\*\*)\s*人気/.test(head);
        const hasOdds = /(?:\d+\.\d+|\*\*)\s*倍/.test(head);
        if(hasPopularity && hasOdds && /(^|\n)\s*父\s/.test(head)){
          best=partLines;
          break;
        }
      }
      if(best) blocks.push({no, lines:best});
    }
    return blocks;
  }

  function extractNameFromBlock(block){
    const joined=block.lines.join('\n');
    // 通常: 14.0倍 の次行に馬名。オッズ発表前は **倍 の次行に馬名。
    let m=joined.match(/(?:\d+\.\d+|\*\*)\s*倍[^\n]*\n[ \t　]*([^\n]+?)\n[ \t　]*父\s/);
    if(m && !isBadHorseNameLine(m[1])) return cleanNameLine(m[1]).slice(0,9);
    // 詳細版のコピー状態により「14.0倍 <馬名>」「**倍 <馬名>」が同一行になる場合がある
    m=joined.match(/(?:\d+\.\d+|\*\*)\s*倍[ \t　]+([^\n]+?)\n[ \t　]*父\s/);
    if(m && !isBadHorseNameLine(m[1])) return cleanNameLine(m[1]).slice(0,9);
    const lines=block.lines.map(cleanNameLine).filter(Boolean);
    let afterOdds=false;
    for(const l of lines){
      const same=l.match(/(?:\d+\.\d+|\*\*)\s*倍[ \t　]+(.+)$/);
      if(same && !isBadHorseNameLine(same[1])) return cleanNameLine(same[1]).slice(0,9);
      if(/(?:\d+\.\d+|\*\*)\s*倍/.test(l)){ afterOdds=true; continue; }
      if(!afterOdds) continue;
      if(/^父\s/.test(l)) break;
      if(isBadHorseNameLine(l)) continue;
      return l.slice(0,9);
    }
    return '';
  }

  function parseEntryNameList(text){
    const map={};
    const lines=entryArea(text).split('\n').map(x=>String(x||'').trim()).filter(Boolean);
    // 詳細版の冒頭にある「馬名」列つき一覧を読む。投票前でもここは取得できる。
    const starts=[];
    lines.forEach((l,i)=>{ if(l==='馬名') starts.push(i); });
    for(const st of starts){
      let found=0;
      for(let i=st+1;i<lines.length;i++){
        const l=lines[i];
        if(found>0 && (/^番$/.test(l) || /^オッズ$/.test(l) || /オッズ.*馬名/.test(l))) break;
        const m=l.match(/^(\d{1,2})$/);
        if(!m) continue;
        const no=C.toInt(m[1]);
        if(!no || no<1 || no>18) continue;
        let name='';
        for(let j=i+1;j<Math.min(lines.length,i+7);j++){
          const cand=cleanNameLine(lines[j]);
          if(!cand || cand==='　' || cand===' ' || /^[_＿-]+$/.test(cand)) continue;
          if(/^\d{1,2}$/.test(cand)) break;
          if(/^番$/.test(cand) || /^オッズ$/.test(cand) || /オッズ.*馬名/.test(cand)) break;
          if(isBadHorseNameLine(cand)) continue;
          name=cand;
          break;
        }
        if(name){ map[no]={no:no,name:name.slice(0,9)}; found++; }
      }
      if(found>=3) break;
    }
    return map;
  }

  function parseEntry(text){
    const by=parseEntryNameList(text);
    splitHorseBlocks(text).forEach(b=>{
      const name=extractNameFromBlock(b);
      if(name) by[b.no]={no:b.no,name};
    });
    return {horses:Object.values(by).sort((a,b)=>(a.no||0)-(b.no||0))};
  }

  function normalizePastToken(l){
    l=String(l||'').replace(/[\t　 ]+/g,'').trim();
    if(!l) return '';
    // 取消・中止系は「前走として存在した結果」なのでスキップしない。
    // 例：13着→11着→止→11着 の場合、前3は止で保持し、前4の11着を読まない。
    if(/^(止|中止|競走中止)$/.test(l) || /競走中止|中止/.test(l)) return '止';
    if(/^(取|取消|出走取消)$/.test(l) || /取消|出走取消/.test(l)) return '取';
    if(/^(除|除外)$/.test(l) || /除外/.test(l)) return '除';
    if(/^(消|失)$/.test(l)) return l.charAt(0);
    if(/^\d{1,2}$/.test(l)){
      const n=C.toInt(l);
      if(n>=1 && n<=18) return String(n);
      return '';
    }
    return '';
  }

  function parsePast(text){
    const map={};
    splitHorseBlocks(text).forEach(b=>{
      const joined=b.lines.join('\n');
      const idx=joined.search(/全\s*\d|ダ\s*\d|芝\s*\d/);
      const part=idx>=0?joined.slice(idx):joined;
      const vals=[];
      part.split('\n').map(s=>s.trim()).forEach(l=>{
        const v=normalizePastToken(l);
        if(v && vals.length<3) vals.push(v);
      });
      map[b.no]={past1:vals[0]||'',past2:vals[1]||'',past3:vals[2]||''};
    });
    return {pastMap:map};
  }

  function parseOdds(text){
    const map={};
    const lines=oddsArea(text).split('\n').map(s=>s.trim()).filter(Boolean);
    function goodOddsName(name){
      name=cleanNameLine(name);
      return !!name && !isBadHorseNameLine(name) && !/^(選択|印|番|馬名|人気順|馬番順|オッズ|確定|Copyright|登録)$/.test(name);
    }
    function put(no, patch){
      if(!no) return;
      map[no]=Object.assign(map[no]||{}, patch||{});
    }
    for(let i=0;i<lines.length;i++){
      // 同一行: 8 ディールメーカー 14.0
      let m=lines[i].match(/^(\d{1,2})\s+([^\n]+?)\s+(\d+\.\d)\s*(?:倍)?$/);
      if(m){
        const patch={odds:m[3]};
        // 馬名は出馬表詳細版だけを正とするため、オッズ欄からは補完しない。
        put(m[1],patch);
        continue;
      }

      // 同一行に馬番＋馬名、数行内にオッズ: 8 ディールメーカー / 14.0
      m=lines[i].match(/^(\d{1,2})\s+(.+)$/);
      if(m){
        const no=m[1];
        const nm=cleanNameLine(m[2]);
        for(let j=i+1;j<Math.min(i+6,lines.length);j++){
          const o=lines[j].match(/^(\d+\.\d)\s*(?:倍)?$/);
          if(o){
            const patch={odds:o[1]};
            // 馬名は出馬表詳細版だけを正とするため、オッズ欄からは補完しない。
            put(no,patch);
            break;
          }
        }
        continue;
      }

      // 馬番・馬名・オッズが別行: 8 / ディールメーカー / 14.0
      m=lines[i].match(/^(\d{1,2})$/);
      if(m){
        const no=m[1];
        let nm='';
        for(let j=i+1;j<Math.min(i+7,lines.length);j++){
          if(!nm && goodOddsName(lines[j])){ nm=cleanNameLine(lines[j]); continue; }
          const o=lines[j].match(/^(\d+\.\d)\s*(?:倍)?$/);
          if(o){
            const patch={odds:o[1]};
            // 馬名は出馬表詳細版だけを正とするため、オッズ欄からは補完しない。
            put(no,patch);
            break;
          }
        }
      }
    }
    return {oddsMap:map};
  }

  function parseCombined(text){
    const basic=parseBasic(text);
    const entry=parseEntry(text);
    const past=parsePast(text);
    const by={};
    (entry.horses||[]).forEach(h=>{ by[h.no]=Object.assign(by[h.no]||{no:h.no},{name:h.name}); });
    Object.keys(past.pastMap||{}).forEach(no=>{ by[no]=Object.assign(by[no]||{no:C.toInt(no)},past.pastMap[no]); });
    return Object.assign({}, basic, {horses:Object.values(by).sort((a,b)=>(a.no||0)-(b.no||0)), pastMap:past.pastMap||{}});
  }

  function parsePayCombos(section){
    const out=[]; section=z2h(section);
    const re=/(\d{1,2}(?:-\d{1,2}){0,2})\s+([\d,]+)\s*円/g; let m;
    while((m=re.exec(section))) out.push({combo:C.comboKey(m[1]),pay:money(m[2])});
    return out;
  }
  function sectionBetween(text,start,endRe){ const s=text.search(start); if(s<0)return ''; const rest=text.slice(s); const e=rest.search(endRe); return e>0?rest.slice(0,e):rest; }
  function parseResult(text){
    text=z2h(rawText(text));
    const result={firsts:[],seconds:[],thirds:[],tansho:[],umaren:[],wide:[],sanrenpuku:[]};
    const addFinish=(rank,no)=>{
      no=String(no||'').trim();
      if(!/^[1-9]$|^1[0-8]$/.test(no)) return;
      const k=rank==='1'?'firsts':rank==='2'?'seconds':'thirds';
      if(!result[k].includes(no)) result[k].push(no);
    };
    const lines=text.split('\n').map(s=>s.replace(/[\t　]+/g,' ').trim()).filter(Boolean);
    lines.forEach((line,i)=>{
      // JRAスマホ結果は「1着  3」のように「番」が付かない行がある。
      // 旧形式の「1着 ... 3番」も維持して読む。
      let m=line.match(/^([123])着.*?(\d{1,2})番/);
      if(m){ addFinish(m[1],m[2]); return; }
      m=line.match(/^([123])着\s+(?:[^0-9]{0,8}\s+)?(\d{1,2})(?:\s|$)/);
      if(m){ addFinish(m[1],m[2]); return; }
      // OCR/貼り付けで「1着」行と馬番行が分かれる場合の保険。
      m=line.match(/^([123])着\s*$/);
      if(m){
        for(let j=i+1;j<Math.min(i+5,lines.length);j++){
          const n=lines[j].match(/^(\d{1,2})(?:\s|$)/);
          if(n){ addFinish(m[1],n[1]); break; }
          if(/^[123]着/.test(lines[j]) || /^(単勝|複勝|枠連|馬連|馬単|ワイド|3連複|3連単)/.test(lines[j])) break;
        }
      }
    });
    const payArea=sectionBetween(text,/払戻金/,/出馬表を見る|オッズを見る|この画面|Copyright/);
    const area=payArea||text;
    result.tansho=parsePayCombos(sectionBetween(area,/単勝/,/複勝|枠連|馬連|馬単|ワイド|3連複|3連単/));
    result.umaren=parsePayCombos(sectionBetween(area,/馬連/,/馬単|ワイド|3連複|3連単/));
    result.wide=parsePayCombos(sectionBetween(area,/ワイド/,/3連複|3連単/));
    result.sanrenpuku=parsePayCombos(sectionBetween(area,/3連複/,/3連単|出馬表|オッズ|この画面/));
    return {result};
  }

  window.KV2Parser={parseBasic,parseEntry,parseOdds,parsePast,parseCombined,parseResult,normalizeCondition,detectGrade};
})();
