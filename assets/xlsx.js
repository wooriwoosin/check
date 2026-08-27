/* 의존성 없는 최소 XLSX 생성기.
   KT전산 PC는 외부 스크립트를 못 받아올 수 있어 라이브러리를 쓰지 않는다.
   ZIP 은 무압축(store) 방식 — Excel 이 정상적으로 읽는다. */
(function (global) {
  'use strict';

  // ── CRC32 ────────────────────────────────────────────────────────────
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  var utf8 = new TextEncoder();

  // ── ZIP ──────────────────────────────────────────────────────────────
  /* 가능하면 deflate 로 압축한다. 일반 xlsx 와 같은 형식이고 파일이 훨씬 작아져서
     사내망 반입이 수월하다. 브라우저가 CompressionStream 을 지원하지 않으면
     무압축(store)으로 떨어진다 — 그래도 Excel 은 정상적으로 읽는다. */
  function deflateRaw(bytes) {
    if (typeof CompressionStream !== 'function') return Promise.resolve(null);
    try {
      var cs = new CompressionStream('deflate-raw');
      var w = cs.writable.getWriter();
      w.write(bytes); w.close();
      return new Response(cs.readable).arrayBuffer()
        .then(function (buf) { return new Uint8Array(buf); })
        .catch(function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }

  function zipStore(entries) {
    var locals = [], central = [], offset = 0;

    entries.forEach(function (e) {
      var name = utf8.encode(e.name);
      var raw = typeof e.data === 'string' ? utf8.encode(e.data) : e.data;
      var data = e.deflated || raw;
      var method = e.deflated ? 8 : 0;
      var crc = crc32(raw);

      var lh = new Uint8Array(30 + name.length);
      var lv = new DataView(lh.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);          // version needed
      lv.setUint16(6, 0x0800, true);      // UTF-8 filename
      lv.setUint16(8, method, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true);      // 압축 크기
      lv.setUint32(22, raw.length, true);       // 원본 크기
      lv.setUint16(26, name.length, true);
      lh.set(name, 30);
      locals.push(lh, data);

      var ch = new Uint8Array(46 + name.length);
      var cv = new DataView(ch.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, method, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, raw.length, true);
      cv.setUint16(28, name.length, true);
      cv.setUint32(42, offset, true);
      ch.set(name, 46);
      central.push(ch);

      offset += lh.length + data.length;
    });

    var centralSize = central.reduce(function (a, b) { return a + b.length; }, 0);
    var end = new Uint8Array(22);
    var ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);

    return new Blob(locals.concat(central, [end]), { type: 'application/octet-stream' });
  }

  // ── XML helpers ──────────────────────────────────────────────────────
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c];
    }).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  }

  function colName(n) {                    // 1 → A
    var s = '';
    while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; }
    return s;
  }

  /* 셀 값 표기
     { f: '=수식' } → 수식 / 숫자 → n / 그 외 → inlineStr
     styleIndex: 0 기본, 1 헤더(굵게), 2 안내(회색) */
  function cellXml(ref, v, style) {
    var s = style ? ' s="' + style + '"' : '';
    if (v === null || v === undefined || v === '') return '<c r="' + ref + '"' + s + '/>';
    if (typeof v === 'object' && v.f !== undefined) {
      return '<c r="' + ref + '"' + s + '><f>' + esc(v.f.replace(/^=/, '')) + '</f></c>';
    }
    if (typeof v === 'number' && isFinite(v)) return '<c r="' + ref + '"' + s + '><v>' + v + '</v></c>';
    return '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t xml:space="preserve">' + esc(v) + '</t></is></c>';
  }

  function sheetXml(sheet) {
    var rows = sheet.rows || [];
    var out = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'];

    if (sheet.cols && sheet.cols.length) {
      out.push('<cols>');
      sheet.cols.forEach(function (w, i) {
        // 폭을 0 으로 주면 숨김 열 (매칭 키처럼 볼 일 없는 열)
        out.push('<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (w || 9) + '"' +
          (w ? ' customWidth="1"' : ' hidden="1"') + '/>');
      });
      out.push('</cols>');
    }
    out.push('<sheetData>');
    rows.forEach(function (row, ri) {
      if (!row || !row.length) return;
      var r = ri + 1, cells = [];
      for (var ci = 0; ci < row.length; ci++) {
        var v = row[ci];
        if (v === null || v === undefined || v === '') continue;
        var style = (sheet.headerRows && r <= sheet.headerRows) ? 1 : 0;
        cells.push(cellXml(colName(ci + 1) + r, v, style));
      }
      if (cells.length) out.push('<row r="' + r + '">' + cells.join('') + '</row>');
    });
    out.push('</sheetData>');
    if (sheet.autoFilter) out.push('<autoFilter ref="' + sheet.autoFilter + '"/>');
    out.push('</worksheet>');
    return out.join('');
  }

  var STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="2"><font><sz val="10"/><name val="맑은 고딕"/></font>' +
    '<font><b/><sz val="10"/><name val="맑은 고딕"/></font></fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFE8EEF7"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="2">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
    '</cellXfs></styleSheet>';

  /* sheets: [{ name, rows, cols?, headerRows?, autoFilter? }] */
  function buildXlsx(sheets) {
    var files = [];

    files.push({
      name: '[Content_Types].xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        sheets.map(function (s, i) {
          return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ' +
            'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
        }).join('') +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '</Types>'
    });

    files.push({
      name: '_rels/.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>'
    });

    files.push({
      name: 'xl/workbook.xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheets>' + sheets.map(function (s, i) {
          return '<sheet name="' + esc(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
        }).join('') + '</sheets>' +
        /* calcId="0" 으로 두면 Excel 이 "더 오래된 버전이 만든 파일" 로 보고
           열 때 반드시 전체 재계산한다. 계산 모드도 자동으로 못 박는다. */
        '<calcPr calcId="0" calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>' +
        '</workbook>'
    });

    files.push({
      name: 'xl/_rels/workbook.xml.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets.map(function (s, i) {
          return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>';
        }).join('') +
        '<Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>'
    });

    files.push({ name: 'xl/styles.xml', data: STYLES });
    sheets.forEach(function (s, i) {
      files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: sheetXml(s) });
    });

    return Promise.all(files.map(function (f) {
      var raw = typeof f.data === 'string' ? utf8.encode(f.data) : f.data;
      return deflateRaw(raw).then(function (z) {
        // 압축 결과가 더 크면 무압축으로 둔다
        if (z && z.length < raw.length) f.deflated = z;
        return f;
      });
    })).then(zipStore);
  }

  global.XlsxWriter = { build: buildXlsx, colName: colName };
})(window);
