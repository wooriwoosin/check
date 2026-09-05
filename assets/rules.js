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
    ['원스톱해지', '원스톱해지'],    // 원스톱은 접수리스트가 아니라 원스톱 리스트로 대사한다
    ['홈캠', 'KOS없음']              // IOT홈캠은 KOS 에서 조회되는 리스트가 없어 대사에서 뺀다
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
    // 상품명이 KT_TV 면 옵션에 'TV' 글자가 없어도 TV 등급이다 — 예: '(추단)모든G'
    if (s.indexOf('TV') >= 0 || /^T[가-힣]/.test(s) || String(productName || '').indexOf('TV') >= 0) {
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
  /* 고객이 직접 / 고객센터로 안내한 건 → 우리가 안 걸어준다.
     '고센'·'고샌' 은 현장에서 쓰는 고객센터 줄임말(오타 포함)이다. */
  var SELF_SERVE = ['고객별도진행', '고객별도 진행', '고객별도요청', '고객별도',
    '별도고객진행', '별도고객', '별도진행', '별도요청',
    '고객센터안내', '고객센터 문의', '본인진행', '고객직접', '고객센터', '고센', '고샌'];
  var FAMILY = ['패밀리', '팸'];
  /* '자회선완' '팸 자회선등록완료' '패밀리 등록완료' — 유선+유선결합을 이미 걸었다는 멘트.
     이런 말이 있으면 결합을 확인할 게 없다. '자회선등록진행' 처럼 진행중인 건은 제외. */
  var BUNDLE_DONE = /(자회선|패밀리|팸)\s*(결합)?\s*(등록)?\s*(완료|완)(?![가-힣])/;
  /* 동판(유선+무선 동시판매)은 보통 유선 개통 후 무선을 진행하고 그다음 결합한다.
     "지금 쓰고 있는 KT 회선을 묶어달라" 와는 별개 건이라 결합 검수에서 뺀다. */
  var DONGPAN = /동판/;
  /* 타사 결합상품 — KT 건에 적혀 있어도 우리 결합 대상이 아니다. */
  var OTHER_CARRIER_BUNDLE = [
    '요즘가족결합', '요즘 가족 결합', '요가결',
    '요즘우리집결합', '요즘 우리집 결합', '우리집결합',              // SKT
    '참쉬운결합', '참쉬운 결합', '참쉬운가족결합', '가족무한사랑',   // LG U+
    '투게더'];
  var WIRELESS_BUNDLE = ['프리미엄싱글', '프리미엄 싱글', '프싱',
    '프리미엄가족결합', '프리미엄가족', '프가결',
    '총액결합할인', '총액결합', '총액 결합', '정액결합',
    '따로살아도가족결합', '따로살아도가족', '따살결', '따가결',
    '모바일결합', '머바일결합', '모결'];
  var NAME_TAGS = ['모', '(모)', '모결', '결', '따살결', '따가결'];
  /* 판매자·고객이 알아서 하는 결합. 본사(KT)를 통해 신청하는 것도 우리 몫이 아니다. */
  var NOT_OURS = ['직접결합', '결합직접', '본사통한결합', '본사통해', '본사를통해', '본사결합',
    '미결합', '미결', '결합안함', '결합X', '결합없이'];
  /* 홈결합(인터넷+TV 기본결합)은 접수 시 기본으로 들어가는 것이라 검수 대상이 아니다. */
  var HOME_BUNDLE = /^[ㅇoO0*\s]*(인티)?홈\s*결?(합)?\s*(TM)?\s*(등록)?\s*$/;
  /* 결합란에 적혀 있어도 결합 내용이 아닌 값 — 요금 안내·약정·상품권 안내문 */
  var NOT_BUNDLE_VALUE = [
    /^[\s\d,.\-원>+]*$/,          // 금액·기호만
    /쿠폰\s*적용/, /위약금/, /^약정/, /상품권/
  ];
  /* 결합란 안에서만 인정하는 결합 이름 — 본문 전체에서 찾으면 요금 '총액' 등과 섞인다. */
  var FIELD_BUNDLE = [
    { re: /총액/, name: '총액결합' },
    { re: /정액/, name: '정액결합' },
    { re: /프\s*[리미]\s*미\s*엄|프가|프싱/, name: '프리미엄결합' },
    { re: /신혼\s*미리/, name: '신혼미리결합' },
    { re: /따로\s*살아도|따살결|따가결/, name: '따로살아도가족결합' }
  ];

  function ignorableValue(v) {
    if (HOME_BUNDLE.test(v)) return '홈결합(기본결합)';
    for (var i = 0; i < NOT_BUNDLE_VALUE.length; i++) {
      if (NOT_BUNDLE_VALUE[i].test(v)) return '결합 내용 아님';
    }
    return null;
  }

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
  /* '결합' 이 적힌 줄의 KT 휴대폰 번호만 인정한다.
     전체 텍스트에서 찾으면 '명의자연락처&인증통신사: 010-… KT' 같은 줄이 걸려서
     "우리한테 결합해달라" 가 아닌 건까지 결합 요청으로 오인한다. */
  function ktMobileNearBundle(text) {
    var lines = String(text).split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].indexOf('결합') >= 0) {
        var m = lines[i].match(KT_MOBILE);
        if (m) return m[0].trim();
      }
    }
    return null;
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

  // ══ W-10. 상품권 등록 ══════════════════════════════════════════════
  /* 상품권은 두 가지를 본다.
       ① 비KT 고객 — 본인인증이 필요해 나중에 등록한다.
          그때 가입.번호(H)에 '(★상품권,문자)' 메모를 남기는데 가끔 빠뜨린다.
       ② KT 고객 — 인증 없이 바로 등록할 수 있어 접수자가 등록하는 게 정석인데
          '등록예정' 으로만 남아 있는 건이 있다.

     고객이력은 최신이 위에 쌓이고, 등록을 마치면 'ㅇ상품권 : 등록예정' 아래가 아니라
     그보다 나중 시각에 '모이3' '농지6' 같은 상품권 코드 메모를 따로 남긴다.
     그래서 값이 아니라 **가장 최근 상품권 신호**로 판정한다.
     ※ 고객이력은 '해피콜 전체고객상품목록' 에만 있는 컬럼이다. */

  // 이력 한 건: 작성자 / :유형:내용 (YYYY-MM-DD HH:MM)
  var HIST_TS = /\((\d{4}-\d{2}-\d{2} \d{2}:\d{2})\)/g;
  var GIFT_FIELD = /^[ㅇoO0*●■□·\-\s]*상품권\s*[:：]\s*(.*)$/m;
  var GIFT_PENDING = /^(예정|등록예정|일괄등록예정|추후등록|추후|미등록|대기)$/;
  var GIFT_STAR = /상품권/;

  /* 상품권 브랜드 약어 — 종류·금액은 https://wooriwoosin.github.io/giftcardlist 기준.
     ① 코드형: 브랜드 약어라 금액만 붙어 있어도 상품권 등록 메모로 본다.
        모이4 · 이모4 · 모농4 · 농모6 · 모롯7 · 로못4 · 롯마4 · 농지5 · 농금3 · 농4 ·
        모다4 · 농협금액3 · 신세계6 · GS칼모5 …
     ② 낱말형: 주소·계좌에도 나오는 흔한 낱말이라 '등록/발송/완' 같은 말이 같이 있어야 본다.
        모바일롯데7등록 · 농협지류상품권 4만원 … */
  var GIFT_BRAND_CODE = /(모이|이모|모농|농모|모현|모롯|로못|롯마|롯모|롯|모다|모KT|농협금액|농협지류|농지|지류|농금|다이소|칼모|GS칼|신세계|롯데마트|이마트|농)/;
  var GIFT_BRAND_WORD = /(농협|농촌사랑|이마트|현대|롯데|하나로|SSG|쓱|신세계|칼텍스|GS주유|KT통합|통합상품권)/;
  /* '다6' '현10' 처럼 한 글자로만 줄여 쓴 경우 — 문장에 섞이면 오인하므로
     짧은 메모에서 브랜드 글자 바로 뒤에 금액이 붙은 것만 인정한다. */
  var GIFT_BRAND_TIGHT = /(^|[\s+\/(])(다|이|현)\s?(10|[3-9])\s*(만원|만)?(?![\d,\-])/;
  var GIFT_CTX = /상품권|등록|발송|지급|완/;
  /* 금액은 3~10만원이다. '농협 356-0662-1665-03' 같은 계좌번호와 섞이지 않게
     숫자 뒤에 숫자·쉼표·하이픈이 더 오면 금액으로 보지 않는다. */
  var GIFT_AMOUNT = /^[가-힣\s]{0,6}(10|[3-9])\s*(만원|만|장)?(?![\d,\-])/;
  /* 브랜드 없이 '상품권 등록완' '상품권발송완' 처럼만 적는 경우 */
  var GIFT_DONE = /상품권[^\n]{0,20}(등록|발송|지급)\s*(완|했|됐|되었)|상품권\s*완|(등록|발송)\s*완[^\n]{0,10}상품권/;
  /* 등록이 아니라 '해달라'·'하겠다' 는 요청·예정 메모 */
  var GIFT_NOT_YET = /요청(?!\s*완)|부탁|주세요|해주십|예정|추후|확인중|부재|ㅂㅈ|취소|미등록|미지급|반송|안내|안왔|되어\s*있지\s*않|없어|없음|진행\s*중|진행하겠|진행한다|됩니다|바랍니다/;

  function giftAmount(seg, brandRe) {
    var m = brandRe.exec(seg);
    if (!m) return null;
    var a = GIFT_AMOUNT.exec(seg.slice(m.index + m[0].length));
    return a ? m[0] + a[1] : null;
  }

  /* 한 메모에 '농협지류상품권 4만원 요청 / 농지4등록완료' 처럼
     요청과 등록이 같이 적히므로 '/' 와 줄바꿈으로 잘라 조각별로 본다. */
  function giftDoneMemo(content) {
    var segs = String(content).split(/[\/\n]/);
    for (var i = 0; i < segs.length; i++) {
      var seg = segs[i].trim();
      if (!seg || GIFT_NOT_YET.test(seg)) continue;
      var hit = giftAmount(seg, GIFT_BRAND_CODE);
      if (!hit && GIFT_CTX.test(seg)) hit = giftAmount(seg, GIFT_BRAND_WORD);
      if (!hit && seg.length <= 12 && GIFT_BRAND_TIGHT.test(seg)) hit = seg;
      if (!hit && GIFT_DONE.test(seg)) hit = seg;
      if (hit) return seg;
    }
    return null;
  }

  /* 한 건은 '작성자 :유형:내용 (일시)' 형태다.
     작성자/유형 사이 개행은 원본 HTML 에 따라 살아 있기도 하고 아니기도 해서
     개행이 아니라 ':유형:' 패턴으로 자른다. */
  var HIST_HEAD = /^([\s\S]*?):([^:\n]{1,10}):([\s\S]*)$/;

  function historyEntries(history) {
    var text = String(history || ''), out = [], pos = 0, m;
    HIST_TS.lastIndex = 0;
    while ((m = HIST_TS.exec(text)) !== null) {
      var chunk = text.slice(pos, m.index).trim();
      pos = m.index + m[0].length;
      if (!chunk) continue;
      var h = HIST_HEAD.exec(chunk);
      out.push({
        ts: m[1],
        author: h ? h[1].trim() : '',
        kind: h ? h[2] : '',
        content: (h ? h[3] : chunk).trim()
      });
    }
    return out;
  }

  /* 가장 최근 상품권 신호. { state:'예정'|'등록', ts, note } 또는 null */
  function giftStatus(history) {
    var latest = null;
    historyEntries(history).forEach(function (e) {
      var sig = null;
      var f = GIFT_FIELD.exec(e.content);
      if (f) {
        var v = f[1].trim();
        var pending = !v || GIFT_PENDING.test(v.replace(/\s/g, ''));
        /* 같은 메모 안에서 'ㅇ상품권 : 예정' 아래 'ㅇ기타 : … 상품권 발송완' 처럼
           다른 줄에 등록·발송 사실을 적어 두는 경우가 있다. 그 줄이 우선이다. */
        var other = pending ? giftDoneMemo(e.content.replace(f[0], '')) : null;
        sig = other
          ? { state: '등록', note: '상품권 등록 메모 "' + other.slice(0, 40) + '"' }
          : { state: pending ? '예정' : '등록', note: '상품권: ' + (v || '(빈값)') };
      } else {
        var done = giftDoneMemo(e.content);
        if (done) sig = { state: '등록', note: '상품권 등록 메모 "' + done.slice(0, 40) + '"' };
      }
      if (sig && (!latest || e.ts > latest.ts)) { sig.ts = e.ts; latest = sig; }
    });
    return latest;
  }

  function hasGiftMemo(row) { return GIFT_STAR.test(row['가입.번호'] || ''); }

  /* 서비스번호 자릿수는 상품에 따라 다르다.
     버디AX·복수AP 는 12자리(예: 9999 0382 3033), 그 외 유선은 11자리. */
  var PHONE_PRODUCTS = ['일반전화', '인터넷전화'];
  var AP_PRODUCTS = ['GiGAWiFiBuddyax', 'WiFi패키지플러스'];
  // 지역번호 / 070 형태의 유선번호
  var LANDLINE_IN_H = /(070|0\d{1,2})[-\s.]\d{1,4}[-\s.]\d{3,4}/;

  /* 가입.번호 형식 점검. 문제가 없으면 null.
       전화 상품      : 유선번호(031-123-1234 · 02-… · 070-…)만 있어도 된다
       버디AX·복수AP  : 9999 로 시작하는 12자리
       인터넷·TV      : z! 서비스번호 11자리 + 유선번호 둘 다 */
  function checkServiceNo(rawH, normalizedProduct) {
    var raw = String(rawH || '').trim();
    var m = /[zZ]!\s*(\d{6,})/.exec(raw);
    var runs = raw.match(/\d{6,}/g) || [];
    var svc = m ? m[1] : (runs[0] || '');
    var hasLand = LANDLINE_IN_H.test(raw);

    if (!raw || (!svc && !hasLand)) return '가입.번호가 비어있음';

    if (PHONE_PRODUCTS.indexOf(normalizedProduct) >= 0) {
      return hasLand || svc ? null : '전화번호가 없음';
    }
    if (AP_PRODUCTS.indexOf(normalizedProduct) >= 0) {
      if (svc.length !== 12) return '서비스번호가 ' + svc.length + '자리 (' + svc + ') — 버디AX·복수AP 는 12자리';
      if (svc.slice(0, 4) !== '9999') return '버디AX·복수AP 서비스번호가 9999 로 시작하지 않음 (' + svc + ')';
      return null;
    }
    if (!svc) return '서비스번호(z!…)가 없음';
    if (svc.length !== 11) return '서비스번호가 ' + svc.length + '자리 (' + svc + ') — 11자리여야 함';
    if (!hasLand) return '서비스번호는 있는데 전화번호(031·02·070…)가 없음';
    return null;
  }

  /* 진행 중이거나 완료된 건. 취소·보류 건은 검수해도 의미가 없다. */
  var ACTIVE_STATUS = ['접수완료', '실적확인중', '개통완료'];
  function isActive(row) { return ACTIVE_STATUS.indexOf((row['개통상태'] || '').trim()) >= 0; }

  /* 본인인증에 쓴 휴대폰이 KT 직영인가.
     KT 직영이면 인증 없이 상품권을 바로 등록할 수 있다.
     ※ KT망 알뜰폰(MVNO)은 인증이 필요하므로 타사와 같이 취급한다.
     ※ 'SKT' 안에 'KT' 가 들어있으므로 타사를 먼저 걸러야 한다. */
  function isKtAuth(row) {
    var v = String(row['고객인증(값)'] || '');
    if (!v) return false;
    if (/SK|엘지|LG|U\+/i.test(v)) return false;
    if (MVNO.test(v)) return false;          // KT알뜰 · KT알뜰폰 → 인증 필요
    return /KT/i.test(v);
  }

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
      var nm = has(fields[i], NOT_OURS);
      if (nm) return skip('판매자·고객이 직접 진행(' + fields[i] + ') — 우리 결합 아님');
      var o = has(fields[i], OTHER_CARRIER_BUNDLE);
      if (o) return skip('타사 결합상품(' + fields[i] + ') — KT 결합 아님');
    }
    // 홈결합(기본결합)·요금 안내처럼 결합 내용이 아닌 값은 빼고 본다
    var dropped = null;
    fields = fields.filter(function (v) {
      var why = ignorableValue(v);
      if (why) { dropped = dropped || why + '(' + v + ')'; return false; }
      return true;
    });

    var reasons = [], btype = null;

    // 유형1: 유무선결합
    fields.forEach(function (v) {
      if (has(v, WIRELESS_BUNDLE)) { reasons.push("결합 필드 '" + v + "'"); btype = '유무선결합'; return; }
      for (var f = 0; f < FIELD_BUNDLE.length; f++) {
        if (FIELD_BUNDLE[f].re.test(v.replace(/\s/g, ''))) {
          reasons.push("결합 필드 '" + v + "' — " + FIELD_BUNDLE[f].name);
          btype = '유무선결합';
          return;
        }
      }
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
    if (!fields.length && !reasons.length && dropped) return skip(dropped);
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
    mobileKtCustomers: mobileKtCustomers, judgeBundle: judgeBundle, BUNDLE_DONE: BUNDLE_DONE,
    nameTags: nameTags, attrTokens: attrTokens, dongpanTag: dongpanTag,
    giftStatus: giftStatus, hasGiftMemo: hasGiftMemo, historyEntries: historyEntries,
    checkServiceNo: checkServiceNo, isActive: isActive, ACTIVE_STATUS: ACTIVE_STATUS,
    isKtAuth: isKtAuth
  };
})(window);
