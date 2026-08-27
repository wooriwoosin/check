/* KT 검수 도구 — 1차 웹 검수 + KT전산 이관 파일 생성 */
(function () {
  'use strict';
  var R = window.Rules, X = window.XlsxWriter, T = window.KosTemplates;
  var STATE = { rows: [], keep: [], drop: [], checks: null, fileName: '', history: null,
              hasSangbu: true, historyOnly: false };
  var $ = function (s) { return document.querySelector(s); };

  // ══ 웹 로우데이터 파싱 ══════════════════════════════════════════════
  /* 확장자는 .xls 지만 실제로는 cp949(euc-kr) 로 인코딩된 HTML <table> 이다. */
  function parseWebRaw(buffer) {
    var text;
    try { text = new TextDecoder('euc-kr').decode(buffer); }
    catch (e) { text = new TextDecoder('utf-8').decode(buffer); }
    if (text.indexOf('BMS DocuRay') === 0 || text.slice(0, 40).indexOf('DocuRay') >= 0) {
      throw new Error('DRM(문서보안)이 걸린 파일입니다. 엑셀로 한 번 연 뒤 "다른 이름으로 저장"해서 다시 올려주세요.');
    }
    var doc = new DOMParser().parseFromString(text, 'text/html');
    var table = doc.querySelector('table');
    if (!table) throw new Error('표를 찾지 못했습니다. 웹 어드민에서 받은 전체고객상품 파일이 맞는지 확인해주세요.');

    var trs = Array.prototype.slice.call(table.querySelectorAll('tr'));
    if (!trs.length) throw new Error('데이터 행이 없습니다.');
    var header = cells(trs[0]).map(function (c) { return c.textContent.replace(/\s+/g, ' ').trim(); });
    var rows = [];
    for (var i = 1; i < trs.length; i++) {
      var cs = cells(trs[i]);
      if (cs.length !== header.length) continue;
      var o = {};
      for (var j = 0; j < header.length; j++) o[header[j]] = textOf(cs[j]);
      o._r = rows.length + 2;
      rows.push(o);
    }
    if (!rows.length) throw new Error('데이터 행을 읽지 못했습니다.');
    return { header: header, rows: rows };
  }

  function cells(tr) { return Array.prototype.slice.call(tr.querySelectorAll('td,th')); }

  /* <br> 과 블록 태그를 줄바꿈으로 살린다 — '기타' 컬럼의 결합 필드 파싱에 필수 */
  function textOf(td) {
    var html = td.innerHTML
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
      .replace(/<(p|div|li|tr|h[1-6])\b[^>]*>/gi, '\n');
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    return (tmp.textContent || '').split('\n').map(function (l) { return l.trim(); })
      .join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  // ══ 1차 웹 검수 ════════════════════════════════════════════════════
  function eomNextMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 2, 0); }
  function parseDate(v) {
    var m = String(v || '').match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function ymd(d) {
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  function runChecks(all, keep, historyByCust) {
    var mk = R.mobileKtCustomers(all);
    // 해피콜 목록에는 접점코드가 없다 → 상부점 검수는 건너뛴다
    var hasSangbu = keep.length > 0 && keep[0]['접점코드'] !== undefined;
    var findings = { bundle: [], dueDate: [], sangbu: [], seller: [], ossList: [], product: [], subNo: [], gift: [], giftKt: [] };

    /* OSS(원스톱전환)는 신규 검수 항목.
       웹의 원스톱해지 라인과 KOS 원스톱 로우데이터의 수량이 맞아야 한다. */
    keep.forEach(function (r) {
      if (R.normalizeProduct(r['상품옵션'], r['상품명']) !== '원스톱해지') return;
      var svc = R.serviceNo(r['가입.번호']);
      r._ossKey = svc.length >= 8 ? svc.slice(0, 4) + svc.slice(-4) : '';
      if (!r._ossKey) r._ossNote = '가입.번호에서 원스톱 키를 만들 수 없음';
      else if (svc.length !== 11) r._ossNote = '서비스번호가 ' + svc.length + '자리 — 키가 어긋날 수 있음';
      else r._ossNote = '';
      findings.ossList.push(r);
    });

    /* 패밀리 상품은 유선+유선결합이라 검수 대상이 아닌데, 같은 고객이라도
       TV 라인에는 '패밀리' 가 안 붙는다. 그래서 고객 단위로 한 번에 뺀다. */
    var famCust = {};
    keep.forEach(function (r) {
      if (/패밀리|팸/.test(r['상품옵션'] || '')) famCust[R.customerKey(r)] = r['상품옵션'];
    });

    keep.forEach(function (r) {
      r._bundle = R.judgeBundle(r, mk);
      if (famCust[R.customerKey(r)] && r._bundle.verdict !== '해당없음') {
        r._bundle = { verdict: '해당없음', type: null, reasons: [], standalone: r._bundle.standalone,
                      excludedBy: '같은 고객에 패밀리 상품(' + famCust[R.customerKey(r)] + ') — 유선+유선결합' };
      }
      // 취소·보류 건은 결합을 걸 이유가 없다
      if (!R.isActive(r) && r._bundle.verdict !== '해당없음') {
        r._bundle = { verdict: '해당없음', type: null, reasons: [], standalone: r._bundle.standalone,
                      excludedBy: '개통상태 "' + (r['개통상태'] || '') + '" — 취소·보류 건' };
      }
      if (r._bundle.verdict !== '해당없음') findings.bundle.push(r);

      var s = parseDate(r['접수일']), p = parseDate(r['개통기한']);
      if (s && p) {
        var exp = eomNextMonth(s);
        if (ymd(p) !== ymd(exp)) {
          r._dueDate = '개통기한 ' + ymd(p) + ' ≠ 익월말일 ' + ymd(exp);
          findings.dueDate.push(r);
        }
      }

      /* 상부점 검수 — 접점코드가 있는 파일에서만.

         업체 접점(엠제이통신·다성통신 등)은 각자 상부점이 달라서
         '접점코드별 통상 상부점' 을 데이터에서 학습하면 오탐이 난다.
         (예: 접점코드가 (KT)도매 인데 상부점이 유선기타인 정상 건)
         그래서 확실한 대응만 본다. */
      if (hasSangbu) {
        var k = r['접점코드'] || '';
        var sb = r['상부점'] || '';
        var etcProduct = /^유선기타/.test(r['상품명'] || '');
        var etcSangbu = /유선기타/.test(sb);
        if (/온라인/.test(sb) !== /온라인/.test(k)) {
          r._sangbu = /온라인/.test(sb)
            ? '상부점이 온라인인데 접점코드가 "' + (k || '(빈값)') + '"'
            : '접점코드가 온라인인데 상부점이 "' + (sb || '(빈값)') + '"';
        } else if (etcProduct !== etcSangbu) {
          r._sangbu = etcProduct
            ? '상품명이 유선기타인데 상부점이 "' + (sb || '(빈값)') + '" — 유선기타여야 함'
            : '상부점이 유선기타인데 상품명이 "' + (r['상품명'] || '') + '"';
        } else if (!etcProduct && k === '(KT)도매' && !/도매/.test(sb)) {
          // 유선기타는 (KT)도매 접점이라도 상부점이 유선기타인 게 정상이라 위에서 이미 통과시킨다
          r._sangbu = '접점코드가 (KT)도매(우리 직영)인데 상부점이 "' + (sb || '(빈값)') + '"';
        }
        if (r._sangbu) findings.sangbu.push(r);
      }

      /* 협력점명 마커 → 접수경로
         ☆ 또는 ★ 이면 협력점, □ 또는 ■ 이면 판매점.
         마커가 없으면 온라인 유입(인스타·유튜브 등)이라 검증 대상이 아니다. */
      var q = r['협력점'] || '', ax = (r['접수경로'] || '').trim();
      var star = /[☆★]/.test(q), box = /[□■]/.test(q);
      if (!R.isActive(r)) { star = box = false; }   // 취소·보류 건은 넘어간다
      if (star && box) {
        r._seller = '협력점명에 ☆★ 와 □■ 가 함께 있음 — 협력점/판매점 구분 불가';
        findings.seller.push(r);
      } else if (star && ax.indexOf('협력점') < 0) {
        r._seller = '협력점명이 ☆★ 표기인데 접수경로가 "' + (ax || '(빈값)') + '" — 협력점이어야 함';
        findings.seller.push(r);
      } else if (box && ax.indexOf('판매점') < 0) {
        r._seller = '협력점명이 □■ 표기인데 접수경로가 "' + (ax || '(빈값)') + '" — 판매점이어야 함';
        findings.seller.push(r);
      }

      r._norm = R.normalizeProduct(r['상품옵션'], r['상품명']);
      if (!r._norm) { r._product = '상품옵션을 KT 상품명으로 매핑할 수 없음'; findings.product.push(r); }

      r._svc = R.serviceNo(r['가입.번호']);
      if (R.isActive(r)) {
        var why = R.checkServiceNo(r['가입.번호'], r._norm);
        if (why) { r._subNo = why; findings.subNo.push(r); }
      }
    });

    /* 상품권 — 해피콜 파일(고객이력)이 있을 때만 검사한다.

       ① KT 고객(본인인증 통신사가 KT)      → 인증 없이 바로 등록 가능.
                                            '등록예정' 으로 남아 있으면 등록 누락 의심.
       ② 비KT 고객                          → 나중에 등록해야 하므로
                                            가입.번호에 ★상품권 메모가 있어야 한다.

       메모는 보통 '인터넷' 라인에 남기므로 고객당 한 곳만 있으면 통과다.
       ★ 표기는 이관 제외된 라인(모바일 등)까지 포함해 전체 행에서 확인한다. */
    if (historyByCust) {
      var starByCust = {}, linesByCust = {}, giftByCust = {};
      all.forEach(function (r) {
        if (R.hasGiftMemo(r)) starByCust[R.customerKey(r)] = true;
      });
      keep.forEach(function (r) {
        var ck = R.customerKey(r);
        var g = R.giftStatus(historyByCust[ck]);
        r._gift = g ? g.state : '';
        // 취소·보류 건은 상품권을 볼 필요가 없다
        if (!R.isActive(r)) return;
        (linesByCust[ck] = linesByCust[ck] || []).push(r);
        if (g && !giftByCust[ck]) giftByCust[ck] = { r: r, g: g };
      });
      Object.keys(giftByCust).forEach(function (ck) {
        var e = giftByCust[ck], r = e.r;
        if (e.g.state !== '예정') return;
        r._giftNote = e.g.note + '  (' + e.g.ts + ')';
        r._giftLines = (linesByCust[ck] || []).map(function (x) {
          return '· ' + (x['상품명'] || '').replace('KT_', '') + '  ' + (x['가입.번호'] || '(빈값)');
        }).join('\n');
        /* 가입.번호에 ★상품권 메모가 있으면 언젠가 찾아서 등록할 건이라 문제가 아니다.
           메모조차 없이 '등록예정' 으로만 남은 건이 문제다. */
        if (starByCust[ck]) return;
        r._giftKind = R.isKtAuth(r) ? 'KT미등록' : '메모누락';
        (R.isKtAuth(r) ? findings.giftKt : findings.gift).push(r);
      });
    }

    return findings;
  }

  /* 해피콜 전체고객상품목록에서 고객이력만 뽑아 고객 단위로 모은다.
     이 파일에는 접점코드·사업자번호가 없어서 기본 로우데이터를 대체하지 못한다.

     ※ 'No' 열은 두 파일에서 정렬이 달라 조인 키로 쓸 수 없다(단순 행 번호).
        고객이력은 어차피 고객 단위 기록이므로 주민번호 기반 고객키로 묶는다. */
  function parseHistory(buffer) {
    var parsed = parseWebRaw(buffer);
    if (parsed.header.indexOf('고객이력') < 0) {
      throw new Error('이 파일에는 "고객이력" 열이 없습니다. 해피콜 전체고객상품목록이 맞는지 확인해주세요.');
    }
    return historyFromRows(parsed.rows);
  }

  function historyFromRows(rows) {
    var map = {}, filled = 0;
    rows.forEach(function (r) {
      var h = (r['고객이력'] || '').trim();
      if (!h) return;
      var ck = R.customerKey(r);
      if (map[ck] === undefined) map[ck] = h;
      else if (map[ck].indexOf(h) < 0) map[ck] += '\n' + h;   // 라인별로 다르면 합친다
      filled++;
    });
    return { map: map, rows: rows.length, filled: filled, customers: Object.keys(map).length };
  }

  window.KtCheck = { parseWebRaw: parseWebRaw, parseHistory: parseHistory, historyFromRows: historyFromRows, runChecks: runChecks, STATE: STATE, $: $,
                     parseDate: parseDate, ymd: ymd };
})();
