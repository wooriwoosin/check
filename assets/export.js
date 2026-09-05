/* KT전산 이관 파일 생성.
   1차 검수를 통과한 행만 '웹' 시트에 넣고, 붙여넣기용 KOS 시트 3종과
   2차 검수 수식을 미리 채워둔다. 붙여넣으면 바로 판정이 뜬다. */
(function () {
  'use strict';
  var R = window.Rules, X = window.XlsxWriter, T = window.KosTemplates;

  var PASTE_ROWS = 2000;                 // 붙여넣기 여유 행

  /* 열 순서 = 보는 순서.
     왼쪽에 판정 결과를 몰아두고, 대조용 원본과 매칭 키는 오른쪽으로 뺐다.
     폭이 0 인 열은 숨김 처리된다(매칭 키 — 수식만 쓰고 볼 일이 없다). */
  var WEB_COLS = [
    // ── 누구인지 ──
    ['No', 6], ['고객명', 18], ['생년월일', 10], ['상품명', 14], ['상품옵션', 18],
    ['셋트유형', 9], ['개통상태', 11],
    // ── 판정 (여기만 보면 된다) ──
    ['2차판정', 10], ['2차오류사유', 30],
    ['접수검수', 11], ['접수상태', 12], ['개통상태검수', 13], ['업체검수', 10],
    ['결합검수', 10], ['원스톱상태', 14],
    ['1차판정', 11], ['상품권', 10],
    // ── 대조용 원본 ──
    ['가입.번호', 26], ['접점코드', 16], ['접수접점명', 18], ['상부점', 24],
    ['접수경로', 14], ['협력점', 16], ['주민번호', 15], ['명의자 연락처', 15],
    ['사업자번호', 13], ['접수일', 17], ['개통기한', 12], ['1차사유', 40],
    // ── 매칭 키 (숨김) ──
    ['서비스번호', 0], ['키8', 0], ['전화앞5', 0], ['결합키(생년월일6)', 0],
    ['원스톱키', 0], ['상품정규화', 0]
  ];
  // 열 문자 (1-based index 로 계산)
  var C = {};
  WEB_COLS.forEach(function (c, i) { C[c[0]] = X.colName(i + 1); });

  /* 취소·보류 건은 KT전산에 접수 자체가 없거나 의미가 없어 대사 대상이 아니다.
     활성 = 접수완료 · 실적확인중 · 개통완료 */
  function notActive(n) {
    var g = '$' + C['개통상태'] + n;
    return 'AND(' + g + '<>"접수완료",' + g + '<>"실적확인중",' + g + '<>"개통완료")';
  }

  function webRow(r, n) {
    var svc = r._svc || R.serviceNo(r['가입.번호']);
    var norm = r._norm || R.normalizeProduct(r['상품옵션'], r['상품명']);
    var oss = norm === '원스톱해지' && svc.length >= 8 ? svc.slice(0, 4) + svc.slice(-4) : '';
    var b = r._bundle || { verdict: '해당없음', reasons: [] };
    var f = function (s) { return { f: s.replace(/#/g, n) }; };
    var C_ = function (name) { return '$' + C[name] + n; };

    return [
      r['No'] || '', r['고객명'] || '', R.digits(r['주민번호']).slice(0, 6),
      r['상품명'] || '', r['상품옵션'] || '', r['셋트유형'] || '', r['개통상태'] || '',

      // ── 2차판정 / 오류사유 ──
      f('=IF($' + C['2차오류사유'] + '#="","정상","확인필요")'),
      f('=TRIM(IF(OR($' + C['접수검수'] + '#="O",$' + C['접수검수'] + '#="OSS별도",' +
        '$' + C['접수검수'] + '#="대사제외",$' + C['접수검수'] + '#="대사불가(전화)",' +
        '$' + C['접수검수'] + '#="대사불가(KOS없음)"),"",$' + C['접수검수'] + '#&" ")' +
        '&IF($' + C['개통상태검수'] + '#="불일치","개통상태불일치 ","")' +
        '&IF($' + C['업체검수'] + '#="상이","업체상이 ","")' +
        '&IF(AND($' + C['결합검수'] + '#="결합X",$' + C['1차판정'] + '#="결합대상"),"결합누락 ","")' +
        '&IF($' + C['원스톱상태'] + '#="원스톱없음","원스톱미접수 ",""))'),

      // ── 접수검수 / 접수상태 ──
      f('=IF(' + notActive('#') + ',"대사제외",' +
        'IF($' + C['상품정규화'] + '#="원스톱해지","OSS별도",' +
        'IF(OR($' + C['상품정규화'] + '#="일반전화",$' + C['상품정규화'] + '#="인터넷전화"),"대사불가(전화)",' +
        'IF($' + C['상품정규화'] + '#="KOS없음","대사불가(KOS없음)",' +
        'IF($' + C['키8'] + '#="","키없음",' +
        'IF(COUNTIFS(접수!$AV:$AV,$' + C['키8'] + '#,접수!$AX:$AX,$' + C['상품정규화'] + '#)>0,"O",' +
        'IF(COUNTIF(접수!$AV:$AV,$' + C['키8'] + '#)>0,"상품상이","접수없음")))))))'),
      f('=IFERROR(INDEX(접수!$U:$U,MATCH($' + C['키8'] + '#&"|"&$' + C['상품정규화'] + '#,접수!$AY:$AY,0)),"")'),

      // ── 개통상태 대조 ──
      f('=IF($' + C['접수상태'] + '#="","",' +
        'IF($' + C['접수상태'] + '#="사용중",IF($' + C['개통상태'] + '#="개통완료","O","불일치"),' +
        'IF($' + C['접수상태'] + '#="가설중(예약)",IF(OR($' + C['개통상태'] + '#="접수완료",$' + C['개통상태'] + '#="실적확인중",$' + C['개통상태'] + '#="접수대기"),"O","불일치"),' +
        'IF($' + C['접수상태'] + '#="해지",IF(OR($' + C['개통상태'] + '#="해지(철회)완료",$' + C['개통상태'] + '#="해지(철회)중",$' + C['개통상태'] + '#="취소완료"),"O","불일치"),"확인"))))'),

      /* 업체 대조 — 웹 접점코드에서 (KT) 를 떼고, KOS 접점명에서 '우리정보통신_' 을 뗀 뒤 비교.
         (KT)다성통신 ↔ 다성통신 / (KT)온라인 ↔ 우리정보통신_온라인 */
      f('=IF(OR($' + C['접수접점명'] + '#="",$' + C['접점코드'] + '#=""),"",' +
        'IF(SUBSTITUTE(SUBSTITUTE($' + C['접점코드'] + '#,"(KT)",""),"_","")' +
        '=SUBSTITUTE(SUBSTITUTE($' + C['접수접점명'] + '#,"우리정보통신_",""),"_",""),"O","상이"))'),

      // ── 결합 / 원스톱 ──
      f('=IF(OR($' + C['결합키(생년월일6)'] + '#="",' + notActive('#') + '),"",' +
        'IF(AND(LEFT($' + C['셋트유형'] + '#,2)="단독",$' + C['1차판정'] + '#<>"결합대상"),"해당없음",' +
        'IF(COUNTIF(결합!$U:$U,$' + C['결합키(생년월일6)'] + '#)>0,"O","결합X")))'),
      f('=IF(OR($' + C['원스톱키'] + '#="",' + notActive('#') + '),"",' +
        'IFERROR(INDEX(원스톱!$I:$I,MATCH($' + C['원스톱키'] + '#,원스톱!$Q:$Q,0)),"원스톱없음"))'),

      // ── 1차 결과 ──
      b.verdict === '해당없음' ? '' : b.verdict,
      r._giftKind || r._gift || '',

      // ── 대조용 원본 ──
      r['가입.번호'] || '', r['접점코드'] || '',
      f('=IFERROR(INDEX(접수!$I:$I,MATCH($' + C['키8'] + '#&"|"&$' + C['상품정규화'] + '#,접수!$AY:$AY,0)),"")'),
      r['상부점'] || '', r['접수경로'] || '', r['협력점'] || '',
      r['주민번호'] || '', r['명의자 연락처'] || '', r['사업자번호'] || '',
      r['접수일'] || '', r['개통기한'] || '', b.reasons.join(' ; '),

      // ── 매칭 키 (숨김) ──
      svc, svc.slice(0, 8), R.phoneHead(r['명의자 연락처']),
      R.digits(r['주민번호']).slice(0, 6), oss, norm
    ];
  }

  /* KOS 붙여넣기용 시트 + 보조열 수식 */
  function kosSheet(name, helpers) {
    var tpl = T[name];
    var rows = tpl.header.map(function (h) { return h.slice(); });
    while (rows.length < tpl.dataRow - 1) rows.push([]);

    // 보조열 헤더 (마지막 헤더 행에)
    var hdrRow = rows[rows.length - 1];
    helpers.forEach(function (h) {
      while (hdrRow.length < h.col - 1) hdrRow.push(null);
      hdrRow[h.col - 1] = h.title;
    });

    // 보조열 수식
    for (var n = tpl.dataRow; n < tpl.dataRow + PASTE_ROWS; n++) {
      var row = [];
      helpers.forEach(function (h) {
        while (row.length < h.col - 1) row.push(null);
        row[h.col - 1] = { f: h.formula.replace(/#/g, n) };
      });
      rows.push(row);
    }
    return { name: name, rows: rows, headerRows: tpl.dataRow - 1 };
  }

  /* OSS(원스톱전환) 대사 시트 — 신규 검수 항목.
     웹의 원스톱해지 라인과 KOS 원스톱 로우데이터를 1:1 로 맞춰본다. */
  function ossSheet(ossLines) {
    var rows = [
      ['OSS(원스톱전환) 수량 대사'],
      ['웹 원스톱해지(OSS) 라인', ossLines.length, '건'],
      ['KOS 원스톱 붙여넣은 행', { f: '=COUNTIF(원스톱!$Q$2:$Q$' + (1 + PASTE_ROWS) + ',"?*")' }, '건'],
      ['차이', { f: '=$B2-$B3' }, '건  ← 0 이어야 정상'],
      ['웹에만 있음 (원스톱 미접수)', { f: '=COUNTIF($F$7:$F$' + (6 + ossLines.length) + ',"원스톱없음")' }, '건'],
      [],
      ['웹 행', '고객명', '가입.번호', '원스톱키', '개통상태', '원스톱전환상태', '오더상태', '비고']
    ];
    ossLines.forEach(function (r, i) {
      var n = 8 + i;
      rows.push([
        r._r, r['고객명'] || '', r['가입.번호'] || '', r._ossKey || '', r['개통상태'] || '',
        { f: '=IF($D' + n + '="","키없음",IFERROR(INDEX(원스톱!$I:$I,MATCH($D' + n + ',원스톱!$Q:$Q,0)),"원스톱없음"))' },
        { f: '=IF($D' + n + '="","",IFERROR(INDEX(원스톱!$K:$K,MATCH($D' + n + ',원스톱!$Q:$Q,0)),""))' },
        r._ossNote || ''
      ]);
    });
    return {
      name: 'OSS대사', rows: rows, headerRows: 1,
      cols: [8, 24, 28, 11, 10, 18, 10, 30]
    };
  }

  /* 할일 시트 — KT전산에서 이것만 보면 된다.
     붙여넣기가 제대로 됐는지 먼저 확인하고, 그다음 항목을 순서대로 처리한다. */
  function todoSheet(rowCount, ossCount, stats) {
    var last = rowCount + 1;                    // 웹 시트 마지막 행
    var W = function (name, n) { return '웹!$' + C[name] + '$2:$' + C[name] + '$' + last; };
    var cnt = function (name, val) { return { f: '=COUNTIF(' + W(name) + ',"' + val + '")' }; };
    var accLast = 2 + PASTE_ROWS;

    /* 행 번호가 밀려도 수식이 어긋나지 않게, 자리표시자를 넣고 나중에 실제 행으로 바꾼다. */
    var MATCH_RATE = { placeholder: 'rate' };

    var rows = [
      ['KT전산 2차 검수 — 할일'], [],

      ['① 먼저 붙여넣기가 제대로 됐는지 확인'], [],
      ['', 'KOS 접수리스트 붙여넣은 행', { f: '=COUNTIF(접수!$AV$3:$AV$' + accLast + ',"?*")' }, '건', '3행부터 붙여넣기'],
      ['', 'KOS 결합리스트 붙여넣은 행', { f: '=COUNTIF(결합!$U$3:$U$' + accLast + ',"?*")' }, '건', '3행부터 붙여넣기'],
      ['', 'KOS 원스톱 붙여넣은 행', { f: '=COUNTIF(원스톱!$Q$2:$Q$' + (1 + PASTE_ROWS) + ',"?*")' }, '건', '2행부터 붙여넣기'],
      [],
      ['', '웹 ' + rowCount + '건 중 접수 매칭된 건', cnt('접수검수', 'O'), '건'],
      ['', '매칭률', MATCH_RATE, '', '← 0% 나 매우 낮으면 붙여넣기가 잘못된 것입니다'],
      [],
      ['', '⚠️ 매칭률이 낮으면 이것부터 보세요'],
      ['', '  · 접수리스트를 3행부터 붙여넣었나요? (1·2행은 머리글)'],
      ['', '  · A열부터 붙여넣었나요? (열이 밀리면 전부 안 맞습니다)'],
      ['', '  · 각 시트 오른쪽 끝 보조열(회색)을 지우지 않았나요?'],
      ['', '  · 붙여넣은 행이 ' + PASTE_ROWS + '행을 넘었나요? 넘으면 보조열 수식을 아래로 끌어 채우세요'],
      [], [],

      ['② 확인할 항목 — 위에서부터 순서대로'], [],
      ['', '항목', '건수', '어디서 보나', '무엇을 하나'],
      ['', '1. 접수없음', cnt('접수검수', '접수없음'), '웹 시트 [접수검수] 필터', 'KT전산에 접수가 안 된 건 — 접수하세요'],
      ['', '2. 상품상이', cnt('접수검수', '상품상이'), '웹 시트 [접수검수] 필터', '접수는 됐는데 상품이 다름 — 상품을 맞추세요'],
      ['', '3. 결합누락', { f: '=COUNTIFS(' + W('결합검수') + ',"결합X",' + W('1차판정') + ',"결합대상")' },
       '웹 시트 [2차오류사유] 필터', '1차에서 결합대상인데 전산에 결합 없음 — 결합하세요'],
      ['', '4. 개통상태 불일치', cnt('개통상태검수', '불일치'), '웹 시트 [개통상태검수] 필터', '웹 개통상태와 KOS 진행상태가 안 맞음'],
      ['', '5. 업체 상이', cnt('업체검수', '상이'), '웹 시트 [업체검수] 필터', '웹 접점코드와 KOS 접점명이 다름'],
      ['', '6. 원스톱 미접수', cnt('원스톱상태', '원스톱없음'), 'OSS대사 시트', '웹에는 OSS 라인이 있는데 KOS 원스톱에 없음'],
      ['', '7. 웹미존재 접수건', { f: '=COUNTIF(접수!$AZ$3:$AZ$' + accLast + ',"웹없음")' },
       '접수 시트 [웹 매칭여부] 필터', 'KOS 에만 있는 접수건 — 웹에 등록하거나 취소하세요'],
      ['', '8. OSS 수량 차이', { f: '=ABS(OSS대사!$B$2-OSS대사!$B$3)' }, 'OSS대사 시트', '웹 OSS 라인 수와 KOS 원스톱 행 수 차이'],
      [],
      ['', '합계 (확인필요)', cnt('2차판정', '확인필요'), '건'],
      [],
      ['', '대사 대상이 아닌 건 (오류 아님)'],
      ['', '  대사제외 (취소·보류)', cnt('접수검수', '대사제외'), '건', '전산에 접수 자체가 없거나 의미 없는 건'],
      ['', '  OSS별도', cnt('접수검수', 'OSS별도'), '건', '원스톱은 OSS대사 시트에서 확인'],
      ['', '  대사불가(전화)', cnt('접수검수', '대사불가(전화)'), '건', '일반전화·인터넷전화는 z! 서비스번호가 없어 매칭 불가'],
      ['', '  대사불가(KOS없음)', cnt('접수검수', '대사불가(KOS없음)'), '건', 'IOT홈캠처럼 KOS 에 조회되는 리스트가 없는 상품'],
      [], [],

      ['③ 웹 시트 보는 법'], [],
      ['', '· [2차판정] 을 "확인필요" 로 필터링하면 볼 것만 남습니다.'],
      ['', '· [2차오류사유] 에 무엇이 걸렸는지 글자로 적힙니다.'],
      ['', '· 매칭 키 열(서비스번호·키8 등)은 숨겨져 있습니다. 볼 필요 없습니다.'],
      ['', '· 판정 열은 모두 수식입니다. 값을 직접 고치지 마세요.'],
      [], [],

      ['⚠️ 붙여넣었는데 숫자가 안 바뀌면'], [],
      ['', '1', '보호된 보기 띠가 떠 있으면 [편집 사용] 을 누르세요.'],
      ['', '2', '수식 대신 =IF(... 글자가 보이면  Ctrl + `  (숫자 1 왼쪽 키) 를 누르세요.'],
      ['', '3', '파일 > 옵션 > 수식 > 계산 옵션 이 "자동" 인지 확인하세요.'],
      ['', '4', '그래도 안 되면  F9  (또는 Ctrl+Alt+F9) 로 강제 재계산하세요.'],
      ['', '', '이 파일은 매크로가 없습니다. 실행할 버튼이 없는 게 정상입니다.'],
      [], [],

      ['④ 붙여넣기 위치'], [],
      ['', '접수', 'KOS 접수리스트', '3행 A열부터'],
      ['', '결합', 'KOS 결합 리스트', '3행 A열부터'],
      ['', '원스톱', 'KOS 원스톱', '2행 A열부터'],
      [],
      ['', '보조열(지우지 마세요)'],
      ['', '  접수', 'AV=키8  AW=전화앞5  AX=상품정규화  AY=복합키  AZ=웹 매칭여부'],
      ['', '  결합', 'U=결합키(생년월일6)'],
      ['', '  원스톱', 'Q=서비스번호키(앞4+뒤4)  R=웹 매칭여부'],
      [], [],

      ['── 1차 웹 검수 결과 (참고) ──'], [],
      ['', '이관 대상', stats.keep + '건'],
      ['', '이관 제외', stats.drop + '건'],
      ['', '결합대상', stats.bundleTarget + '명', '← 전산 넘기기 전에 결합했어야 하는 건'],
      ['', '결합 확인필요', stats.bundleCheck + '명'],
      ['', 'OSS 라인', ossCount + '건'],
      ['', '1차 오류', stats.webError + '건'],
      [],
      ['', '생성일시', stats.now],
      ['', '원본 파일', stats.fileName]
    ];
    // 자리표시자를 실제 행 번호를 쓴 수식으로 교체
    var pasteRow = 0, matchRow = 0;
    rows.forEach(function (row, i) {
      if (row[1] === 'KOS 접수리스트 붙여넣은 행') pasteRow = i + 1;
      if (typeof row[1] === 'string' && row[1].indexOf('접수 매칭된 건') >= 0) matchRow = i + 1;
      if (row[2] === MATCH_RATE) {
        row[2] = { f: '=IF($C$' + pasteRow + '=0,"(붙여넣기 전)",TEXT($C$' + matchRow + '/' + rowCount + ',"0%"))' };
      }
    });
    return { name: '할일', rows: rows, headerRows: 1, cols: [3, 22, 12, 26, 46] };
  }

  function build(keep, ossLines, stats) {
    var web = [WEB_COLS.map(function (c) { return c[0]; })];
    keep.forEach(function (r, i) { web.push(webRow(r, i + 2)); });

    var sheets = [
      todoSheet(keep.length, ossLines.length, stats),
      {
        name: '웹', rows: web, headerRows: 1,
        cols: WEB_COLS.map(function (c) { return c[1]; }),
        autoFilter: 'A1:' + X.colName(WEB_COLS.length) + web.length
      },
      kosSheet('접수', [
        { col: 48, title: '키8', formula: '=IF($X#="","",IFERROR(MID($X#,FIND("!",$X#)+1,8),LEFT($X#,8)))' },
        { col: 49, title: '전화앞5', formula: '=IF($AF#="","",LEFT(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE($AF#,"-","")," ",""),"*",""),5))' },
        {
          col: 50, title: '상품정규화',
          // 상품명(AK)에서 '지니'·'인터넷'·공백을 지운 값.
          // 부가상품도 상품명 기준이다 (복수AP → WiFi패키지 플러스 / GiGA WiFi Buddy ax)
          formula: '=IF($AK#="","",SUBSTITUTE(SUBSTITUTE(SUBSTITUTE($AK#,"지니",""),"인터넷","")," ",""))'
        },
        { col: 51, title: '복합키', formula: '=IF($AV#="","",$AV#&"|"&$AX#)' },
        {
          col: 52, title: '웹 매칭여부',
          formula: '=IF($AV#="","",IF(COUNTIFS(웹!$R:$R,$AV#,웹!$V:$V,$AX#)>0,"O",' +
            'IF(COUNTIF(웹!$R:$R,$AV#)>0,"상품상이","웹없음")))'
        }
      ]),
      kosSheet('결합', [
        { col: 21, title: '생년월일6', formula: '=IF($R#="","",RIGHT("000000"&$R#,6))' }
      ]),
      kosSheet('원스톱', [
        { col: 17, title: '서비스번호키', formula: '=IF($H#="","",IFERROR(MID($H#,FIND("!",$H#)+1,4),LEFT($H#,4))&RIGHT($H#,4))' },
        { col: 18, title: '웹 매칭여부', formula: '=IF($Q#="","",IF(COUNTIF(OSS대사!$D:$D,$Q#)>0,"O","웹없음"))' }
      ]),
      ossSheet(ossLines)
    ];
    return X.build(sheets);
  }

  function buildExcluded(drop) {
    var rows = [['원본행', 'No', '고객명', '상품명', '상품옵션', '개통상태', '상부점', '제외 사유']];
    drop.forEach(function (d) {
      rows.push([d.row._r, d.row['No'] || '', d.row['고객명'] || '', d.row['상품명'] || '',
        d.row['상품옵션'] || '', d.row['개통상태'] || '', d.row['상부점'] || '', d.reason]);
    });
    return X.build([{
      name: '이관제외', rows: rows, headerRows: 1,
      cols: [8, 6, 18, 22, 20, 11, 26, 34], autoFilter: 'A1:H' + rows.length
    }]);
  }

  window.Exporter = { build: build, buildExcluded: buildExcluded, WEB_COLS: WEB_COLS };
})();
