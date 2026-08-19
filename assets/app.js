/* KT 검수 도구 — 1차 웹 검수 + KT전산 이관 파일 생성 */
(function () {
  'use strict';
  var R = window.Rules, X = window.XlsxWriter, T = window.KosTemplates;
  var STATE = { rows: [], keep: [], drop: [], checks: null, fileName: '' };
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
    var html = td.innerHTML.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr)>/gi, '\n');
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

  function runChecks(all, keep) {
    var mk = R.mobileKtCustomers(all);
    var findings = { bundle: [], dueDate: [], sangbu: [], seller: [], oss: [], product: [], subNo: [] };

    // 접점코드 → 상부점 매핑을 데이터에서 학습 (다수결)
    var map = {};
    keep.forEach(function (r) {
      var k = r['접점코드'] || '(미기재)';
      (map[k] = map[k] || {})[r['상부점']] = (map[k][r['상부점']] || 0) + 1;
    });
    var major = {};
    Object.keys(map).forEach(function (k) {
      major[k] = Object.keys(map[k]).sort(function (a, b) { return map[k][b] - map[k][a]; })[0];
    });

    // OSS: 고객명 태그 ↔ 원스톱해지 라인
    var tagged = {}, hasLine = {};
    keep.forEach(function (r) {
      if (R.nameTags(r).some(function (t) { return t.toUpperCase() === 'OSS'; })) tagged[R.customerKey(r)] = r;
      if (R.normalizeProduct(r['상품옵션']) === '원스톱해지') hasLine[R.customerKey(r)] = r;
    });

    keep.forEach(function (r) {
      r._bundle = R.judgeBundle(r, mk);
      if (r._bundle.verdict !== '해당없음') findings.bundle.push(r);

      var s = parseDate(r['접수일']), p = parseDate(r['개통기한']);
      if (s && p) {
        var exp = eomNextMonth(s);
        if (ymd(p) !== ymd(exp)) {
          r._dueDate = '개통기한 ' + ymd(p) + ' ≠ 익월말일 ' + ymd(exp);
          findings.dueDate.push(r);
        }
      }

      var k = r['접점코드'] || '(미기재)';
      if (major[k] && r['상부점'] !== major[k]) {
        r._sangbu = '접점코드 ' + k + ' 의 통상 상부점은 "' + major[k] + '"';
        findings.sangbu.push(r);
      }

      if (/[□■]/.test(r['협력점'] || '') && (r['접수경로'] || '').trim() !== '5.판매점☆') {
        r._seller = '협력점에 판매점 표기가 있는데 접수경로가 "' + (r['접수경로'] || '(빈값)') + '"';
        findings.seller.push(r);
      }

      r._norm = R.normalizeProduct(r['상품옵션']);
      if (!r._norm) { r._product = '상품옵션을 KT 상품명으로 매핑할 수 없음'; findings.product.push(r); }

      r._svc = R.serviceNo(r['가입.번호']);
      if (!r._svc) {
        if (['접수완료', '개통완료', '실적확인중', '개통대기'].indexOf(r['개통상태']) >= 0) {
          r._subNo = '가입.번호가 비어있는데 개통상태가 "' + r['개통상태'] + '"';
          findings.subNo.push(r);
        }
      } else if (r._svc.length !== 11) {
        r._subNo = '서비스번호가 ' + r._svc.length + '자리 (' + r._svc + ') — 11자리여야 함';
        findings.subNo.push(r);
      }
    });

    Object.keys(tagged).forEach(function (ck) {
      if (!hasLine[ck]) {
        var r = tagged[ck];
        r._oss = '고객명에 OSS 태그가 있는데 원스톱해지(OSS) 라인이 없음';
        findings.oss.push(r);
      }
    });
    Object.keys(hasLine).forEach(function (ck) {
      if (!tagged[ck]) {
        var r = hasLine[ck];
        r._oss = '원스톱해지(OSS) 라인이 있는데 고객명에 OSS 태그가 없음';
        findings.oss.push(r);
      }
    });

    return findings;
  }

  window.KtCheck = { parseWebRaw: parseWebRaw, runChecks: runChecks, STATE: STATE, $: $,
                     parseDate: parseDate, ymd: ymd };
})();
