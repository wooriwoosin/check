/* 화면 구성 */
(function () {
  'use strict';
  var K = window.KtCheck, R = window.Rules, E = window.Exporter, $ = K.$;
  var S = K.STATE, TABS = [], active = 0;

  var drop = $('#drop'), file = $('#file'), err = $('#err');
  drop.addEventListener('click', function () { file.click(); });
  drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') file.click(); });
  ['dragenter', 'dragover'].forEach(function (t) {
    drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('over'); });
  });
  ['dragleave', 'drop'].forEach(function (t) {
    drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove('over'); });
  });
  drop.addEventListener('drop', function (e) { if (e.dataTransfer.files[0]) load(e.dataTransfer.files[0]); });
  file.addEventListener('change', function () { if (file.files[0]) load(file.files[0]); });

  function fail(msg) { err.textContent = msg; err.classList.remove('hidden'); }

  function load(f) {
    err.classList.add('hidden');
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var parsed = K.parseWebRaw(fr.result);
        S.rows = parsed.rows;
        S.fileName = f.name;
        S.keep = []; S.drop = [];
        S.rows.forEach(function (r) {
          var why = R.transferReason(r);
          if (why) S.drop.push({ row: r, reason: why }); else S.keep.push(r);
        });
        S.checks = K.runChecks(S.rows, S.keep);
        render();
      } catch (e) { fail(e.message || String(e)); }
    };
    fr.onerror = function () { fail('파일을 읽지 못했습니다.'); };
    fr.readAsArrayBuffer(f);
  }

  // ── 표 정의 ────────────────────────────────────────────────────────
  function bundleRows(list, verdict) {
    return list.filter(function (r) { return r._bundle.verdict === verdict; });
  }

  /* 결합 판정은 고객 단위로 보는 게 읽기 쉽다.
     DPS 는 한 고객이 인터넷+TV 로 여러 줄이라 그대로 두면 같은 근거가 반복된다. */
  function byCustomer(rows) {
    var order = [], map = {};
    rows.forEach(function (r) {
      var k = R.customerKey(r);
      if (!map[k]) { map[k] = { head: r, lines: [] }; order.push(k); }
      map[k].lines.push(r);
    });
    return order.map(function (k) { return map[k]; });
  }

  function lineSummary(g) {
    return g.lines.map(function (r) {
      return '· ' + (r['상품명'] || '').replace('KT_', '') + ' / ' + (r['상품옵션'] || '') +
        '  (' + r._r + '행, ' + (r['개통상태'] || '') + ')';
    }).join('\n');
  }

  function buildTabs() {
    var c = S.checks;
    TABS = [
      {
        key: 'bt', label: '결합대상', rows: byCustomer(bundleRows(c.bundle, '결합대상')), tone: 't',
        cols: [['행', function (g) { return g.head._r; }], ['고객명', function (g) { return g.head['고객명']; }],
          ['셋트유형', function (g) { return g.head['셋트유형']; }],
          ['유형', function (g) { return g.head._bundle.type || '-'; }],
          ['가입 라인', lineSummary, 'wrap'],
          ['근거', function (g) { return g.head._bundle.reasons.join('\n'); }, 'wrap']]
      },
      {
        key: 'bc', label: '결합 확인필요', rows: byCustomer(bundleRows(c.bundle, '확인필요')), tone: 'c',
        cols: [['행', function (g) { return g.head._r; }], ['고객명', function (g) { return g.head['고객명']; }],
          ['셋트유형', function (g) { return g.head['셋트유형']; }],
          ['인증통신사', function (g) { return g.head['고객인증(값)']; }],
          ['가입 라인', lineSummary, 'wrap'],
          ['근거', function (g) { return g.head._bundle.reasons.join('\n'); }, 'wrap']]
      },
      {
        key: 'due', label: '개통기한', rows: c.dueDate, tone: 'c',
        cols: [['행', function (r) { return r._r; }], ['고객명', '고객명'], ['접수일', '접수일'],
          ['개통기한', '개통기한'], ['사유', '_dueDate', 'wrap']]
      },
      {
        key: 'sb', label: '상부점', rows: c.sangbu, tone: 'c',
        cols: [['행', function (r) { return r._r; }], ['고객명', '고객명'], ['접점코드', '접점코드'],
          ['상부점', '상부점'], ['사유', '_sangbu', 'wrap']]
      },
      {
        key: 'sl', label: '판매점 접수경로', rows: c.seller, tone: 'c',
        cols: [['행', function (r) { return r._r; }], ['고객명', '고객명'], ['협력점', '협력점'],
          ['접수경로', '접수경로'], ['사유', '_seller', 'wrap']]
      },
      {
        key: 'oss', label: 'OSS 정합', rows: c.oss, tone: 'c',
        cols: [['행', function (r) { return r._r; }], ['고객명', '고객명'], ['상품옵션', '상품옵션'],
          ['개통상태', '개통상태'], ['사유', '_oss', 'wrap']]
      },
      {
        key: 'pd', label: '상품 매핑', rows: c.product, tone: 't',
        cols: [['행', function (r) { return r._r; }], ['고객명', '고객명'], ['상품명', '상품명'],
          ['상품옵션', '상품옵션'], ['사유', '_product', 'wrap']]
      },
      {
        key: 'sn', label: '가입번호', rows: c.subNo, tone: 'c',
        cols: [['행', function (r) { return r._r; }], ['고객명', '고객명'], ['가입.번호', '가입.번호'],
          ['개통상태', '개통상태'], ['사유', '_subNo', 'wrap']]
      },
      {
        key: 'ex', label: '이관 제외', rows: S.drop, tone: 'c', plain: true,
        cols: [['행', function (d) { return d.row._r; }], ['고객명', function (d) { return d.row['고객명']; }],
          ['상품명', function (d) { return d.row['상품명']; }], ['상품옵션', function (d) { return d.row['상품옵션']; }],
          ['사유', function (d) { return d.reason; }, 'wrap']]
      }
    ];
  }

  function render() {
    buildTabs();
    var c = S.checks;
    var webErr = c.dueDate.length + c.sangbu.length + c.seller.length + c.product.length + c.subNo.length + c.oss.length;

    $('#fileinfo').textContent = S.fileName + ' — 전체 ' + S.rows.length + '행';
    $('#cards').innerHTML = [
      card(S.rows.length, '전체 행', ''),
      card(S.keep.length, 'KT전산 이관 대상', 'ok'),
      card(S.drop.length, '이관 제외', ''),
      card(byCustomer(bundleRows(c.bundle, '결합대상')).length, '결합대상 (고객)', 'danger'),
      card(byCustomer(bundleRows(c.bundle, '확인필요')).length, '결합 확인필요 (고객)', 'warn'),
      card(webErr, '1차 검수 지적', webErr ? 'warn' : 'ok')
    ].join('');

    $('#tabs').innerHTML = TABS.map(function (t, i) {
      return '<button class="tab" role="tab" data-i="' + i + '" aria-selected="' + (i === active) + '">' +
        t.label + '<span class="b">' + t.rows.length + '</span></button>';
    }).join('');
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (b) {
      b.addEventListener('click', function () { active = +b.dataset.i; render(); });
    });

    drawTable(TABS[active]);
    $('#result').classList.remove('hidden');
  }

  function card(n, label, tone) {
    return '<div class="card ' + (tone || '') + '"><div class="n">' + n + '</div><div class="l">' + label + '</div></div>';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m];
    });
  }

  function drawTable(tab) {
    if (!tab.rows.length) {
      $('#tablearea').innerHTML = '<div class="empty">해당 건이 없습니다.</div>';
      return;
    }
    var head = '<tr>' + tab.cols.map(function (c) { return '<th>' + esc(c[0]) + '</th>'; }).join('') + '</tr>';
    var body = tab.rows.slice(0, 500).map(function (r) {
      return '<tr>' + tab.cols.map(function (c) {
        var v = typeof c[1] === 'function' ? c[1](r) : r[c[1]];
        return '<td class="' + (c[2] || '') + '">' + esc(v) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    var more = tab.rows.length > 500 ? '<div class="empty">앞 500건만 표시했습니다. 전체는 다운로드 파일에서 확인하세요.</div>' : '';
    $('#tablearea').innerHTML = '<div class="tablewrap"><table><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>' + more;
  }

  // ── 다운로드 ───────────────────────────────────────────────────────
  function save(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function stamp() {
    var d = new Date(), p = function (n) { return ('0' + n).slice(-2); };
    return String(d.getFullYear()).slice(2) + p(d.getMonth() + 1) + p(d.getDate()) + p(d.getHours()) + p(d.getMinutes());
  }

  $('#dl').addEventListener('click', function () {
    var c = S.checks;
    var blob = E.build(S.keep, {
      keep: S.keep.length, drop: S.drop.length,
      bundleTarget: byCustomer(bundleRows(c.bundle, '결합대상')).length,
      bundleCheck: byCustomer(bundleRows(c.bundle, '확인필요')).length,
      webError: c.dueDate.length + c.sangbu.length + c.seller.length + c.product.length + c.subNo.length + c.oss.length,
      now: new Date().toLocaleString('ko-KR'), fileName: S.fileName
    });
    save(blob, 'KT검수_이관_' + stamp() + '.xlsx');
  });

  $('#dlx').addEventListener('click', function () {
    save(E.buildExcluded(S.drop), 'KT검수_이관제외_' + stamp() + '.xlsx');
  });
})();
