/* KT전산 이관 파일 생성.
   1차 검수를 통과한 행만 '웹' 시트에 넣고, 붙여넣기용 KOS 시트 3종과
   2차 검수 수식을 미리 채워둔다. 붙여넣으면 바로 판정이 뜬다. */
(function () {
  'use strict';
  var R = window.Rules, X = window.XlsxWriter, T = window.KosTemplates;

  var PASTE_ROWS = 2000;                 // 붙여넣기 여유 행

  var WEB_COLS = [
    ['No', 6], ['고객명', 18], ['상품명', 14], ['상품옵션', 18], ['셋트유형', 9],
    ['가입.번호', 26], ['개통상태', 11], ['접점코드', 16], ['상부점', 24], ['접수경로', 14],
    ['협력점', 16], ['주민번호', 15], ['명의자 연락처', 15], ['사업자번호', 13],
    ['접수일', 17], ['개통기한', 12],
    ['서비스번호', 13], ['키8', 10], ['전화앞5', 8], ['생년월일6', 10], ['원스톱키', 10], ['상품정규화', 13],
    ['1차판정', 11], ['1차사유', 40],
    ['접수검수', 10], ['접수상태', 12], ['개통상태검수', 12], ['접수접점명', 18],
    ['결합검수', 9], ['원스톱상태', 14], ['2차오류사유', 30], ['2차판정', 10]
  ];
  // 열 문자 (1-based index 로 계산)
  var C = {};
  WEB_COLS.forEach(function (c, i) { C[c[0]] = X.colName(i + 1); });

  function webRow(r, n) {
    var svc = r._svc || R.serviceNo(r['가입.번호']);
    var norm = r._norm || R.normalizeProduct(r['상품옵션'], r['상품명']);
    var oss = norm === '원스톱해지' && svc.length >= 8 ? svc.slice(0, 4) + svc.slice(-4) : '';
    var b = r._bundle || { verdict: '해당없음', reasons: [] };
    var f = function (s) { return { f: s.replace(/#/g, n) }; };

    return [
      r['No'] || '', r['고객명'] || '', r['상품명'] || '', r['상품옵션'] || '', r['셋트유형'] || '',
      r['가입.번호'] || '', r['개통상태'] || '', r['접점코드'] || '', r['상부점'] || '', r['접수경로'] || '',
      r['협력점'] || '', r['주민번호'] || '', r['명의자 연락처'] || '', r['사업자번호'] || '',
      r['접수일'] || '', r['개통기한'] || '',
      svc, svc.slice(0, 8), R.phoneHead(r['명의자 연락처']),
      R.digits(r['주민번호']).slice(0, 6), oss, norm,
      b.verdict === '해당없음' ? '' : b.verdict,
      b.reasons.join(' ; '),

      // ── 2차 검수 수식 (KT전산에서 KOS 데이터를 붙여넣으면 자동 계산) ──
      /* 원스톱해지 라인은 접수리스트가 아니라 원스톱 리스트로 대사한다 → OSS대사 시트 참고 */
      f('=IF($' + C['상품정규화'] + '#="원스톱해지","OSS별도",' +
        'IF($' + C['키8'] + '#="","키없음",' +
        'IF(COUNTIFS(접수!$AV:$AV,$' + C['키8'] + '#,접수!$AX:$AX,$' + C['상품정규화'] + '#)>0,"O",' +
        'IF(COUNTIF(접수!$AV:$AV,$' + C['키8'] + '#)>0,"상품상이","접수없음"))))'),

      f('=IFERROR(INDEX(접수!$U:$U,MATCH($' + C['키8'] + '#&"|"&$' + C['상품정규화'] + '#,접수!$AY:$AY,0)),"")'),

      f('=IF($' + C['접수상태'] + '#="","",' +
        'IF($' + C['접수상태'] + '#="사용중",IF($' + C['개통상태'] + '#="개통완료","O","불일치"),' +
        'IF($' + C['접수상태'] + '#="가설중(예약)",IF(OR($' + C['개통상태'] + '#="접수완료",$' + C['개통상태'] + '#="실적확인중",$' + C['개통상태'] + '#="접수대기"),"O","불일치"),' +
        'IF($' + C['접수상태'] + '#="해지",IF(OR($' + C['개통상태'] + '#="해지(철회)완료",$' + C['개통상태'] + '#="해지(철회)중",$' + C['개통상태'] + '#="취소완료"),"O","불일치"),"확인"))))'),

      f('=IFERROR(INDEX(접수!$I:$I,MATCH($' + C['키8'] + '#&"|"&$' + C['상품정규화'] + '#,접수!$AY:$AY,0)),"")'),

      /* 단독은 원래 결합이 없는 게 정상이라 1차에서 '결합대상' 으로 잡힌 건만 대조한다.
         DPS 는 전산에서 결합을 확인해야 하므로 전부 대조한다. */
      f('=IF($' + C['생년월일6'] + '#="","",' +
        'IF(AND(LEFT($' + C['셋트유형'] + '#,2)="단독",$' + C['1차판정'] + '#<>"결합대상"),"해당없음",' +
        'IF(COUNTIF(결합!$U:$U,$' + C['생년월일6'] + '#)>0,"O","결합X")))'),

      f('=IF($' + C['원스톱키'] + '#="","",IFERROR(INDEX(원스톱!$I:$I,MATCH($' + C['원스톱키'] + '#,원스톱!$Q:$Q,0)),"원스톱없음"))'),

      f('=TRIM(IF(OR($' + C['접수검수'] + '#="O",$' + C['접수검수'] + '#="OSS별도"),"",$' + C['접수검수'] + '#&" ")' +
        '&IF($' + C['개통상태검수'] + '#="불일치","개통상태불일치 ","")' +
        '&IF(AND($' + C['결합검수'] + '#="결합X",$' + C['1차판정'] + '#="결합대상"),"결합누락 ","")' +
        '&IF($' + C['원스톱상태'] + '#="원스톱없음","원스톱미접수 ",""))'),

      f('=IF($' + C['2차오류사유'] + '#="","정상","확인필요")')
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

  function guideSheet(stats) {
    var L = [
      ['KT전산 2차 검수 — 사용법'], [],
      ['1', '아래 3개 시트에 KOS 에서 내려받은 데이터를 붙여넣습니다.'],
      ['', '  · 접수  ← KOS 접수리스트   (3행부터 붙여넣기)'],
      ['', '  · 결합  ← KOS 결합 리스트  (3행부터 붙여넣기)'],
      ['', '  · 원스톱 ← KOS 원스톱      (2행부터 붙여넣기)'], [],
      ['2', '붙여넣으면 "웹" 시트의 2차 검수 열이 자동으로 계산됩니다. 매크로 실행 버튼이 없습니다.'], [],
      ['3', '"웹" 시트에서 [2차판정] 열을 "확인필요" 로 필터링하면 볼 것만 남습니다.'], [],
      ['4', '"접수" 시트 AZ열을 "웹없음" 으로 필터링하면 KOS 에만 있는 접수건이 나옵니다.'],
      ['', '  (기존 매크로의 "웹미존재_접수건" 시트와 같은 역할)'], [],
      ['5', '"OSS대사" 시트에서 웹 원스톱해지 라인과 KOS 원스톱 수량이 맞는지 확인합니다.'],
      ['', '  · [차이] 가 0 이 아니면 어느 한쪽이 빠진 것입니다.'],
      ['', '  · [원스톱전환상태] 가 "원스톱없음" 이면 KOS 에 접수가 안 된 건입니다.'],
      ['', '  · "원스톱" 시트 R열이 "웹없음" 이면 KOS 에만 있는 건입니다.'], [],
      ['주의', '각 시트 오른쪽 끝의 보조열(회색 머리글)은 지우지 마세요. 매칭 키를 만드는 수식입니다.'],
      ['', '  · 접수  AV=키8, AW=전화앞5, AX=상품정규화, AY=복합키, AZ=웹 매칭여부'],
      ['', '    (AX 는 상품명(AK)에서 지니·인터넷·공백을 지운 값)'],
      ['', '  · 결합  U=생년월일6'],
      ['', '  · 원스톱 Q=서비스번호키(앞4+뒤4), R=웹 매칭여부'], [],
      ['참고', '붙여넣기 여유 행은 ' + PASTE_ROWS + '행입니다. 더 많으면 보조열 수식을 아래로 끌어 채우세요.'], [],
      ['── 1차 웹 검수 결과 ──'],
      ['이관 대상', stats.keep + '건'],
      ['이관 제외', stats.drop + '건  (타 통신사 / 업셀링·약정갱신 / 대성 상부점)'],
      ['결합대상', stats.bundleTarget + '명  ← 전산 넘기기 전에 결합 처리 필요'],
      ['결합 확인필요', stats.bundleCheck + '명'],
      ['OSS 라인', stats.ossLines + '건  ← KOS 원스톱 수량과 맞아야 함'],
      ['1차 오류', stats.webError + '건  (개통기한 / 상부점 / 판매점 / 상품매핑 / 가입번호)'], [],
      ['생성일시', stats.now],
      ['원본 파일', stats.fileName]
    ];
    return { name: '사용법', rows: L, headerRows: 1, cols: [14, 70] };
  }

  function build(keep, ossLines, stats) {
    var web = [WEB_COLS.map(function (c) { return c[0]; })];
    keep.forEach(function (r, i) { web.push(webRow(r, i + 2)); });

    var sheets = [
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
      ossSheet(ossLines),
      guideSheet(stats)
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
