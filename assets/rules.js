/* KT 검수 규칙 — tools/*.py 프로토타입의 JS 판.
   판정 근거를 바꿀 일이 생기면 이 파일만 고치면 된다. */
(function (global) {
  'use strict';

  // ══ W-0. KT전산 이관 필터 ═══════════════════════════════════════════
  var INCLUDE_PRODUCTS = ['KT_인터넷', 'KT_TV', 'KT_부가상품',
    '유선기타_(KT-biz)인터넷', '유선기타_(KT-biz)TV', 'KT_인터넷전화', 'KT_일반전화'];
  /* 이관에서 빼는 상부점·접점.
     대성은 지점이 계속 늘어나(평택·수원·경기서부지사·무선 등) 정확한 값 목록으로는
     새 지점이 생길 때마다 놓친다. 그래서 이름 패턴으로 잡는다. */
  var EXCLUDE_PATTERNS = [
    { re: /대성/, label: '대성 상권사업부' }
  ];

  function excludeMatch(row) {
    var sangbu = (row['상부점'] || '').trim();
    var jeomjeom = (row['접점코드'] || '').trim();
    for (var i = 0; i < EXCLUDE_PATTERNS.length; i++) {
      var p = EXCLUDE_PATTERNS[i];
      if (p.re.test(sangbu)) return { label: p.label, where: '상부점', value: sangbu };
      if (p.re.test(jeomjeom)) return { label: p.label, where: '접점코드', value: jeomjeom };
    }
    return null;
  }

  function transferReason(row) {
    var p = (row['상품명'] || '').trim();
    if (INCLUDE_PRODUCTS.indexOf(p) < 0) return '이관 대상 상품명 아님(' + (p || '미기재') + ')';
    var ex = excludeMatch(row);
    if (ex) return '제외 대상 ' + ex.label + ' — ' + ex.where + '="' + ex.value + '"';
    return null;
  }

  // ══ 공용 ════════════════════════════════════════════════════════════
  function digits(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }

  function customerKey(row) {
    var d = digits(row['주민번호']);
    return d.length >= 13 ? d.slice(0, 13) : 'P' + digits(row['명의자 연락처']);
  }

  /* 가입.번호에서 실제 서비스번호를 뽑는다.
     'z!' 가 붙은 숫자뭉치가 진짜 서비스번호다 (없으면 첫 숫자뭉치). */
  function serviceNo(raw) {
    var s = String(raw || '');
    var m = s.match(/[zZ]!\s*(\d{6,})/);
    if (m) return m[1];
    var all = s.match(/\d{6,}/g);
    return all ? all[0] : '';
  }

  function phoneHead(v) {
    var d = String(v || '').replace(/[-\s*]/g, '').replace(/\D/g, '');
    return d.slice(0, 5);
  }

  // ══ 상품 정규화 ═════════════════════════════════════════════════════
  var SPEED = [['2.5G', '프리미엄'], ['1G', '에센스'], ['500M', '베이직'],
    ['200M', '플러스'], ['100M', '슬림']];
  var TV_GRADES = ['모든G', '베이직', '에센스', '초이스', '라이트', '스탠다드', 'All', '일반'];

  /* KOS 접수 AK열은 수식으로 '지니'·'인터넷'·공백을 지워 비교한다.
     예) '지니 TV 베이직' → 'TV베이직' / '인터넷 패밀리 슬림' → '패밀리슬림' */
  /* KT_부가상품 → KOS 상품명(AK) 매핑.
     복수AP 계열은 KOS 에서 상품구분=홈IoT / 상품군=복수AP 로 같지만
     상품명이 갈리므로 상품명 기준으로 맞춘다.
     여기에 없는 부가상품은 빈값을 돌려 1차 '상품 매핑' 탭에 뜨게 한다. */
  var ADDON_MAP = [
    // 웹 상품옵션에 이 말이 들어가면          → KOS 상품명(공백 제거)
    ['버디', 'GiGAWiFiBuddyax'],   // 100M+버디AX / 500+버디AX / 1G↑+버디AX → GiGA WiFi Buddy ax
    ['복수AP', 'WiFi패키지플러스'],  // 복수AP                              → WiFi패키지 플러스
    ['원스톱해지', '원스톱해지']     // 원스톱은 접수리스트가 아니라 원스톱 리스트로 대사한다
  ];

  function normalizeProduct(opt, productName) {
    var s = String(opt || '').trim()
      .replace(/^\((추단|하브|협력|자체|소호|일반|안심\/일반|안심)\)/, '')
      .replace(/\s/g, '');
    if (!s) return '';
    for (var a = 0; a < ADDON_MAP.length; a++) {
      if (s.indexOf(ADDON_MAP[a][0]) >= 0) return ADDON_MAP[a][1];
    }
    // 부가상품인데 위 목록에 없으면 매핑 미정 → 속도만 보고 인터넷 상품으로 오인하지 않는다
    if (String(productName || '').indexOf('부가상품') >= 0) return '';
    if (s.indexOf('일반전화') >= 0) return '일반전화';
    if (s.indexOf('인터넷전화') >= 0) return '인터넷전화';
    if (s.indexOf('TV') >= 0 || /^T[가-힣]/.test(s)) {
      for (var i = 0; i < TV_GRADES.length; i++) {
        if (s.indexOf(TV_GRADES[i]) >= 0) return 'TV' + TV_GRADES[i];
      }
    }
    if (s.indexOf('오피스넷') >= 0) {
      for (var j = 0; j < SPEED.length; j++) if (s.indexOf(SPEED[j][0]) >= 0) return '오피스넷' + SPEED[j][1];
      return '오피스넷';
    }
    var fam = s.indexOf('패밀리') >= 0 ? '패밀리' : '';
    for (var k = 0; k < SPEED.length; k++) if (s.indexOf(SPEED[k][0]) >= 0) return fam + SPEED[k][1];
    return '';
  }

  // ══ W-1. 결합 요청 판정 ═════════════════════════════════════════════
  var NOISE = ['월요금/모바일 결합 할인금액', '모바일 결합 할인', '모바일결합 할인',
    '청구매체: 모바일', '청구매체:모바일', '모바일청구', '모바일 청구',
    '본인인증: 모바일 인증', '모바일 인증',
    '이마트모바일', '이마트 모바일', '모바일 상품권', '모바일 다이소',
    '결합전', '결합 전', '결합후', '결합 후'];
  var NEG_PHRASE = ['결합불가', '결합 불가', '결합안됨', '결합 안됨'];
  var NEG_VALUE = /^(x|X|없음|미신청|불가|해당없음|무|-)\s*$/;
  var SELF_SERVE = ['고객별도진행', '고객별도 진행', '고객센터안내', '고객센터 문의', '본인진행', '고객직접'];
  var FAMILY = ['패밀리', '팸'];
  /* 동판(유선+무선 동시판매)은 보통 유선 개통 후 무선을 진행하고 그다음 결합한다.
     "지금 쓰고 있는 KT 회선을 묶어달라" 와는 별개 건이라 결합 검수에서 뺀다. */
  var DONGPAN = /동판/;
  var OTHER_CARRIER_BUNDLE = ['요즘가족결합', '요가결', '참쉬운가족결합', '가족무한사랑', '투게더'];
  var WIRELESS_BUNDLE = ['프리미엄싱글', '프리미엄 싱글', '프싱',
    '프리미엄가족결합', '프리미엄가족', '프가결',
    '총액결합할인', '총액결합', '총액 결합', '정액결합',
    '모바일결합', '머바일결합', '모결'];
  var NAME_TAGS = ['모', '(모)', '모결', '결'];

  /* 서식지 보기목록: '결합유형 (프가=1/ 프싱=2/ 총액=3/ 정액=4/ 신혼미리결합=5) :1'
     → 목록을 지우고 뒤의 번호만 값으로 해석한다. */
  var CHOICE_LIST = /결합유형\s*\([^)]*=\s*\d[^)]*\)\s*[:：]?\s*([0-9]?)/g;
  var CHOICE_MAP = { '1': '프리미엄가족결합', '2': '프리미엄싱글', '3': '총액결합', '4': '정액결합', '5': '신혼미리결합' };

  var FIELD = /결합\s*(?:여부)?\s*[:：]\s*([^\n■□ㅁ●★]{0,25})/g;
  var FUTURE = /(나중에|추후|이후에|다음에)[^\n]{0,20}결합|결합[^\n]{0,12}(예정|하기로)/;
  var KT_MOBILE = /01[016-9][-\s.]?\d{3,4}[-\s.]?\d{4}[^\n]{0,12}?(KT|kt|Kt)/;
  var MVNO = /알뜰/;

  // 유형2: 기존 유선전화 결합
  var LANDLINE_KW = /전화\s*[12]\s*[:：]|기존\s*번호|기존번호|팩스용|일반전화|인터넷전화|집전화/;
  var LANDLINE_NO = /(070[-\s.]?\d{3,4}[-\s.]?\d{4}|0(?:2|3[1-3]|4[1-4]|5[1-5]|6[1-4])[-\s.]?\d{3,4}[-\s.]?\d{4})/g;
  var PREV_CARRIER_LINE = /전\s*통신사|이전\s*통신사|기존\s*통신사/;
  var FEE_DIFF = /결합\s*전\s*[:：]?\s*[\d,.]+\s*원?\s*\/?\s*결합\s*후/;

  function stripNoise(text) {
    var t = String(text || '').replace(CHOICE_LIST, function (_, n) {
      return n ? '결합: ' + (CHOICE_MAP[n] || '') : '';
    });
    NOISE.forEach(function (n) { t = t.split(n).join(''); });
    return t;
  }

  function nameTags(row) {
    return String(row['고객명'] || '').split('/').slice(1).map(function (t) { return t.trim(); });
  }

  /* 속성은 고객명 뒤 '/' 태그와 기타(BA)의 '속성:' 필드 두 군데에 적힌다. */
  function attrTokens(row) {
    var out = nameTags(row);
    var m = /속성\s*[:：]\s*([^\n■□ㅁ●★]{0,30})/.exec(String(row['기타'] || ''));
    if (m) {
      m[1].split(/[\/,\s]+/).forEach(function (t) { if (t.trim()) out.push(t.trim()); });
    }
    return out.filter(function (t, i) { return t && out.indexOf(t) === i; });
  }

  function dongpanTag(row) {
    var hit = attrTokens(row).filter(function (t) { return DONGPAN.test(t); });
    return hit.length ? hit[0] : null;
  }

  function fieldValues(text) {
    var out = [], m;
    FIELD.lastIndex = 0;
    while ((m = FIELD.exec(text)) !== null) {
      var v = m[1].trim().replace(/[,.]+$/, '');
      if (v && !NEG_VALUE.test(v)) out.push(v);
    }
    return out;
  }

  /* '결합' 이 적힌 줄의 KT 휴대폰 번호를 우선한다.
     (연락처 줄의 알뜰폰 번호가 아니라 실제 결합 대상 번호를 집기 위함) */
  function ktMobileNearBundle(text) {
    var lines = String(text).split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].indexOf('결합') >= 0) {
        var m = lines[i].match(KT_MOBILE);
        if (m) return m[0].trim();
      }
    }
    var g = String(text).match(KT_MOBILE);
    return g ? g[0].trim() : null;
  }

  function landlineEvidence(raw) {
    var explicit = [], listed = [];
    String(raw || '').split('\n').forEach(function (line) {
      if (PREV_CARRIER_LINE.test(line)) return;   // 해지 대상 회선
      LANDLINE_NO.lastIndex = 0;
      var nums = line.match(LANDLINE_NO);
      if (!nums) return;
      if (line.indexOf('결합') >= 0) explicit = explicit.concat(nums);
      else if (LANDLINE_KW.test(line)) listed = listed.concat(nums);
    });
    var uniq = function (a) { return a.filter(function (v, i) { return a.indexOf(v) === i; }); };
    var out = [];
    if (explicit.length) out.push('기존 유선전화 결합 요청(' + uniq(explicit).join(', ') + ')');
    if (listed.length) out.push('기존 유선전화 번호 표기(' + uniq(listed).join(', ') + ')');
    if (out.length && FEE_DIFF.test(raw)) out.push('결합 전/후 요금 차이 기재');
    return out;
  }

  function carrierOfCustomer(row, text) {
    var lines = String(text).split('\n').filter(function (l) {
      return /기존\s*통신사|연락처.*통신사|인증통신사/.test(l);
    });
    var hay = (row['고객인증(값)'] || '') + '\n' + lines.join('\n');
    if (/KT|kt|Kt/.test(hay)) return 'KT';
    if (/SK|sk|Sk|LG|lg|엘지|U\+/.test(hay)) return '타사';
    return '불명';
  }

  function has(hay, list) {
    var flat = hay.replace(/\s/g, '');
    for (var i = 0; i < list.length; i++) if (flat.indexOf(list[i].replace(/\s/g, '')) >= 0) return list[i];
    return null;
  }

  // ══ W-10. 상품권 등록 메모 ═════════════════════════════════════════
  /* 휴대폰이 KT 가 아니면 상품권 본인인증이 안 돼서 나중에 등록한다.
     그때 가입.번호(H)에 '(★상품권,문자)' 같은 메모를 남기는데 가끔 빠뜨린다.
     고객이력에 'ㅇ상품권: 등록예정' 인데 그 메모가 없는 고객을 찾는다.
     ※ 고객이력은 '해피콜 전체고객상품목록' 에만 있는 컬럼이다. */
  var GIFT_LINE = /^[ㅇoO0*●■□·\-\s]*상품권\s*[:：]\s*(.*)$/;
  var GIFT_PENDING = /^(예정|등록예정|일괄등록예정|추후등록|추후|미등록|대기)$/;
  var GIFT_STAR = /상품권/;

  /* 고객이력의 상품권 항목 상태. '등록' = 모이6·신세계1 처럼 실제 상품권명이 적힌 것. */
  function giftStatus(history) {
    var vals = [];
    String(history || '').split('\n').forEach(function (line) {
      var m = GIFT_LINE.exec(line.trim());
      if (!m) return;
      var v = m[1].replace(/\(\d{4}-\d{2}-\d{2}.*$/, '').trim();
      if (/^[ㅇoO]?기타\s*[:：]/.test(v)) v = '';     // 값이 비고 다음 항목이 붙은 경우
      vals.push(v);
    });
    if (!vals.length) return null;
    var done = vals.filter(function (v) { return v && !GIFT_PENDING.test(v.replace(/\s/g, '')); });
    return { state: done.length ? '등록' : '예정', values: vals };
  }

  function hasGiftMemo(row) { return GIFT_STAR.test(row['가입.번호'] || ''); }

  function mobileKtCustomers(rows) {
    var set = {};
    rows.forEach(function (r) { if (r['상품명'] === '모바일_KT') set[customerKey(r)] = true; });
    return set;
  }

  function judgeBundle(row, mobileKtKeys) {
    var raw = String(row['기타'] || '');
    var opt = String(row['상품옵션'] || '');
    var auth = String(row['고객인증(값)'] || '');
    var standalone = String(row['셋트유형'] || '').indexOf('단독') === 0;
    var skip = function (why) { return { verdict: '해당없음', type: null, reasons: [], excludedBy: why, standalone: standalone }; };

    if (mobileKtKeys[customerKey(row)]) return skip('모바일_KT 동시가입(별도 검수)');
    if (has(opt, FAMILY)) return skip('패밀리 상품(' + opt + ') — 유선+유선결합');
    var dp = dongpanTag(row);
    if (dp) return skip('동판 건(속성 "' + dp + '") — 유선 개통 후 무선·결합 진행');

    var text = stripNoise(raw);
    var neg = has(text, NEG_PHRASE);
    if (neg) return skip('명시적 부정(' + neg + ')');

    var fields = fieldValues(text);
    for (var i = 0; i < fields.length; i++) {
      if (has(fields[i], FAMILY)) return skip('결합 필드값이 패밀리 — 유선+유선결합');
      if (has(fields[i], SELF_SERVE)) return skip('고객이 직접 진행 — 우리가 안 걸어줌');
      var o = has(fields[i], OTHER_CARRIER_BUNDLE);
      if (o) return skip('타사 결합상품(' + fields[i] + ') — KT 결합 아님');
    }

    var reasons = [], btype = null;

    // 유형1: 유무선결합
    fields.forEach(function (v) {
      if (has(v, WIRELESS_BUNDLE)) { reasons.push("결합 필드 '" + v + "'"); btype = '유무선결합'; }
    });
    var matched = WIRELESS_BUNDLE.filter(function (k) { return has(text, [k]); });
    if (matched.length) {
      matched.sort(function (a, b) { return b.replace(/\s/g, '').length - a.replace(/\s/g, '').length; });
      reasons.push("키워드 '" + matched[0] + "'");
      btype = btype || '유무선결합';
    }
    nameTags(row).forEach(function (t) {
      if (NAME_TAGS.indexOf(t) >= 0) { reasons.push("고객명 속성 '" + t + "'"); btype = btype || '유무선결합'; }
    });
    if (btype === '유무선결합') {
      var no = ktMobileNearBundle(text);
      if (no) reasons.push('KT 휴대폰 번호 명시(' + no + ')');
      if (MVNO.test(auth) || MVNO.test(text)) reasons.push('KT망 알뜰폰 — 우리가 묶어줘야 함');
    }

    // 유형2: 유선전화 결합 (휴대폰 통신사와 무관)
    var land = landlineEvidence(raw);
    if (land.length) {
      reasons = reasons.concat(land);
      btype = btype === '유무선결합' ? '유무선+유선전화결합' : '유선전화결합';
    }

    // 향후 가입 후 결합 예정 → 지금은 대상 아님
    var onlyFuture = fields.length ? fields.every(function (v) { return /예정|추후|나중/.test(v); }) : true;
    if (FUTURE.test(text) && onlyFuture && !ktMobileNearBundle(text)) {
      return { verdict: '해당없음', type: null, reasons: reasons, excludedBy: '향후 가입 후 결합 예정 — 현재 대상 아님', standalone: standalone };
    }

    var leftover = fields.filter(function (v) { return !has(v, WIRELESS_BUNDLE); });
    if (leftover.length && !btype) {
      return {
        verdict: '확인필요', type: null, standalone: standalone, excludedBy: null,
        reasons: leftover.map(function (v) { return "결합 필드 '" + v + "'"; })
      };
    }
    if (!reasons.length) return skip(null);

    // 명의자 통신사가 KT가 아니면 유무선결합 불가 (유선전화 결합은 무관)
    if (btype === '유무선결합' && !ktMobileNearBundle(text) && carrierOfCustomer(row, text) === '타사') {
      return {
        verdict: '해당없음', type: btype, reasons: reasons, standalone: standalone,
        excludedBy: '명의자 통신사가 KT 아님(' + (auth || '미기재') + ') — KT 유무선결합 불가'
      };
    }
    return { verdict: '결합대상', type: btype, reasons: reasons, excludedBy: null, standalone: standalone };
  }

  global.Rules = {
    INCLUDE_PRODUCTS: INCLUDE_PRODUCTS, EXCLUDE_PATTERNS: EXCLUDE_PATTERNS,
    transferReason: transferReason, customerKey: customerKey, serviceNo: serviceNo,
    phoneHead: phoneHead, digits: digits, normalizeProduct: normalizeProduct,
    mobileKtCustomers: mobileKtCustomers, judgeBundle: judgeBundle,
    nameTags: nameTags, attrTokens: attrTokens, dongpanTag: dongpanTag,
    giftStatus: giftStatus, hasGiftMemo: hasGiftMemo
  };
})(window);
