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

  // ── 해피콜 목록(고객이력) — 선택 업로드 ──────────────────────────
  var drop2 = $('#drop2'), file2 = $('#file2'), err2 = $('#err2'), ok2 = $('#ok2');
  drop2.addEventListener('click', function () { file2.click(); });
  drop2.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') file2.click(); });
  ['dragenter', 'dragover'].forEach(function (t) {
    drop2.addEventListener(t, function (e) { e.preventDefault(); drop2.classList.add('over'); });
  });
  ['dragleave', 'drop'].forEach(function (t) {
    drop2.addEventListener(t, function (e) { e.preventDefault(); drop2.classList.remove('over'); });
  });
  drop2.addEventListener('drop', function (e) { if (e.dataTransfer.files[0]) loadHistory(e.dataTransfer.files[0]); });
  file2.addEventListener('change', function () { if (file2.files[0]) loadHistory(file2.files[0]); });

  function loadHistory(f) {
    err2.classList.add('hidden'); ok2.classList.add('hidden');
    var fr = new FileReader();
    fr.onload = function () {
      K.parseHistory(fr.result).then(function (h) {
        S.history = h.map;
        ok2.textContent = f.name + ' — ' + h.rows + '행 중 고객이력 ' + h.filled + '건 (고객 ' + h.customers + '명) 을 읽었습니다.';
        ok2.classList.remove('hidden');
        if (S.rows.length) { S.checks = K.runChecks(S.rows, S.keep, S.history); render(); }
      }).catch(function (e) {
        err2.textContent = e.message || String(e);
        err2.classList.remove('hidden');
      });
    };
    fr.readAsArrayBuffer(f);
  }

  function load(f) {
    err.classList.add('hidden');
    var fr = new FileReader();
    fr.onload = function () {
      K.parseWebRaw(fr.result).then(function (parsed) {
        S.rows = parsed.rows;
        S.fileName = f.name;
        S.hasSangbu = parsed.header.indexOf('접점코드') >= 0;
        S.hasHistory = parsed.header.indexOf('고객이력') >= 0;
        /* 고객이력이 같은 파일에 있으면 해피콜 목록을 따로 올릴 필요가 없다. */
        if (S.hasHistory) S.history = K.historyFromRows(parsed.rows).map;
        /* 접점코드가 없으면(예전 해피콜 목록) 상부점 검수와 이관 파일 생성만 빠진다. */
        S.historyOnly = !S.hasSangbu && S.hasHistory;
        S.keep = []; S.drop = [];
        S.rows.forEach(function (r) {
          var why = R.transferReason(r);
          if (why) S.drop.push({ row: r, reason: why }); else S.keep.push(r);
        });
        S.checks = K.runChecks(S.rows, S.keep, S.history);
        render();
      }).catch(function (e) { fail(e.message || String(e)); });
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

  /* 주민번호 앞 6자리. KOS 결합리스트의 생년월일과 같은 형태라 눈으로 대조하기 좋다. */
  function birth(r) { return R.digits(r['주민번호']).slice(0, 6); }

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
          ['생년월일', function (g) { return birth(g.head); }],
          ['셋트유형', function (g) { return g.head['셋트유형']; }],
          ['개통상태', function (g) { return g.head['개통상태']; }],
          ['유형', function (g) { return g.head._bundle.type || '-'; }],
          ['속성', function (g) { return R.attrTokens(g.head).join(' / '); }],
          ['가입 라인', lineSummary, 'wrap'],
          ['근거', function (g) { return g.head._bundle.reasons.join('\n'); }, 'wrap']]
      },
      {
        key: 'bc', label: '결합 확인필요', rows: byCustomer(bundleRows(c.bundle, '확인필요')), tone: 'c',
        cols: [['행', function (g) { return g.head._r; }], ['고객명', function (g) { return g.head['고객명']; }],
          ['생년월일', function (g) { return birth(g.head); }],
          ['셋트유형', function (g) { return g.head['셋트유형']; }],
          ['개통상태', function (g) { return g.head['개통상태']; }],
          ['인증통신사', function (g) { return g.head['고객인증(값)']; }],
          ['가입 라인', lineSummary, 'wrap'],
          ['근거', function (g) { return g.head._bundle.reasons.join('\n'); }, 'wrap']]
      },
      {
        key: 'due', label: '개통기한', rows: c.dueDate, tone: 'c',
        cols: [['행', function (r) { return r._r; }], ['고객명', '고객명'], ['생년월일', birth], ['개통상태', '개통상태'], ['접수일', '접수일'],
          ['개통기한', '개통기한'], ['사유', '_dueDate', 'wrap']]
      },
      S.hasSangbu ? {
        key: 'sb', label: '상부점', rows: c.sangbu, tone: 'c',
        cols: [['행', function (r) { return r._r; }], ['고객명', '고객명'], ['생년월일', birth], ['개통상태', '개통상태'], ['접점코드', '접점코드'],
          ['상부점', '상부점'], ['사유', '_sangbu', 'wrap']]
      } : null,
      {
        key: 'sl', label: '판매점 접수경로', rows: c.seller, tone: 'c',
        cols: [['행', function (r) { return r._r; }], ['고객명', '고객명'], ['생년월일', birth], ['개통상태', '개통상태'], ['협력점', '협력점'],
          ['접수경로', '접수경로'], ['사유', '_seller', 'wrap']]
      },
      {
        key: 'ossl', label: 'OSS(원스톱전환)', rows: c.ossList, tone: 'c',
        cols: [['행', function (r) { return r._r; }], ['고객명', '고객명'], ['생년월일', birth],
          ['가입.번호', '가입.번호'], ['원스톱키', '_ossKey'], ['개통상태', '개통상태'],
          ['비고', '_ossNote', 'wrap']]
      },
      {
        key: 'pd', label: '상품 매핑', rows: c.product, tone: 't',
        cols: [['행', function (r) { return r._r; }], ['고객명', '고객명'], ['생년월일', birth], ['개통상태', '개통상태'], ['상품명', '상품명'],
          ['상품옵션', '상품옵션'], ['사유', '_product', 'wrap']]
      },
      {
        key: 'sn', label: '가입번호', rows: c.subNo, tone: 'c',
        cols: [['행', function (r) { return r._r; }], ['고객명', '고객명'], ['생년월일', birth], ['가입.번호', '가입.번호'],
          ['개통상태', '개통상태'], ['사유', '_subNo', 'wrap']]
      },
      {
        key: 'giftkt', label: 'KT 상품권 미등록', rows: c.giftKt, tone: 't',
        cols: [['행', function (r) { return r._r; }], ['고객명', '고객명'], ['생년월일', birth],
          ['인증', '고객인증(값)'], ['최근 상품권 이력', '_giftNote', 'wrap'],
          ['가입 라인', '_giftLines', 'wrap']]
      },
      {
        key: 'gift', label: '상품권 메모누락', rows: c.gift, tone: 't',
        cols: [['행', function (r) { return r._r; }], ['고객명', '고객명'], ['생년월일', birth],
          ['인증', '고객인증(값)'], ['최근 상품권 이력', '_giftNote', 'wrap'],
          ['이 고객의 가입 라인 — ★상품권 표기 없음', '_giftLines', 'wrap']]
      },
      {
        key: 'ex', label: '이관 제외', rows: S.drop, tone: 'c', plain: true,
        cols: [['행', function (d) { return d.row._r; }], ['고객명', function (d) { return d.row['고객명']; }],
          ['생년월일', function (d) { return birth(d.row); }],
          ['상품명', function (d) { return d.row['상품명']; }], ['상품옵션', function (d) { return d.row['상품옵션']; }],
          ['사유', function (d) { return d.reason; }, 'wrap']]
      }
    ].filter(Boolean);
  }

  function render() {
    buildTabs();
    var c = S.checks;
    var webErr = c.dueDate.length + c.sangbu.length + c.seller.length + c.product.length + c.subNo.length + c.gift.length + c.giftKt.length;

    $('#fileinfo').textContent = S.fileName + ' — 전체 ' + S.rows.length + '행' +
      (S.historyOnly ? '  (해피콜 목록)' : '');
    /* 요즘 로우데이터에는 고객이력이 들어있어서 해피콜 목록을 따로 올릴 일이 없다.
       고객이력이 없는 예전 형식일 때만 업로드 칸을 꺼내 보여준다. */
    var step2 = $('#step2');
    if (S.hasHistory || S.historyOnly) {
      step2.classList.add('hidden');
    } else {
      $('#step2note').innerHTML = '올리신 파일에 <b>고객이력</b> 열이 없어서 <b>상품권 검수가 빠졌습니다</b>. ' +
        '해피콜 전체고객상품목록이 따로 있으면 올려주세요.';
      step2.classList.remove('hidden');
    }
    var warn = $('#modewarn');
    if (S.historyOnly) {
      warn.innerHTML = '<b>해피콜 목록만 올리셨습니다.</b> 고객이력이 있어서 <b>상품권 검수는 됩니다.</b><br>' +
        '다만 이 파일에는 <code>접점코드</code>·<code>사업자번호</code> 가 없어서 ' +
        '<b>상부점 검수와 KT전산 이관 파일 생성은 안 됩니다.</b><br>' +
        '두 가지가 필요하면 <code>전체고객상품</code> 을 올려주세요.';
      warn.classList.remove('hidden');
    } else warn.classList.add('hidden');
    $('#dl').disabled = S.historyOnly;
    $('#dlx').disabled = S.historyOnly;
    $('#cards').innerHTML = [
      card(S.rows.length, '전체 행', ''),
      card(S.keep.length, 'KT전산 이관 대상', 'ok'),
      card(S.drop.length, '이관 제외', ''),
      card(byCustomer(bundleRows(c.bundle, '결합대상')).length, '결합대상 (고객)', 'danger'),
      card(byCustomer(bundleRows(c.bundle, '확인필요')).length, '결합 확인필요 (고객)', 'warn'),
      card(c.ossList.length, 'OSS 라인 (수량대사)', ''),
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
    E.build(S.keep, S.checks.ossList, {
      keep: S.keep.length, drop: S.drop.length,
      bundleTarget: byCustomer(bundleRows(c.bundle, '결합대상')).length,
      bundleCheck: byCustomer(bundleRows(c.bundle, '확인필요')).length,
      webError: c.dueDate.length + c.sangbu.length + c.seller.length + c.product.length + c.subNo.length + c.gift.length + c.giftKt.length,
      ossLines: c.ossList.length, gift: S.history ? c.gift.length : null, giftKt: S.history ? c.giftKt.length : null, now: new Date().toLocaleString('ko-KR'), fileName: S.fileName
    }).then(function (blob) {
      save(blob, 'KT검수_이관_' + stamp() + '.xlsx');
    });
  });

  $('#dlx').addEventListener('click', function () {
    E.buildExcluded(S.drop).then(function (blob) {
      save(blob, 'KT검수_이관제외_' + stamp() + '.xlsx');
    });
  });
})();
