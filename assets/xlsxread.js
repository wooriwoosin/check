/* 의존성 없는 최소 XLSX 리더.
   웹 어드민이 내려주는 xlsx 를 읽는다. 외부 라이브러리를 쓰지 않는다. */
(function (global) {
  'use strict';

  var utf8 = new TextDecoder('utf-8');

  // ── ZIP 읽기 ─────────────────────────────────────────────────────────
  function findEOCD(dv, len) {
    var max = Math.min(len, 66000);
    for (var i = len - 22; i >= len - max && i >= 0; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) return i;
    }
    return -1;
  }

  /* {이름: {offset, method, compSize}} 목록을 만든다. */
  function readEntries(buf) {
    var bytes = new Uint8Array(buf), dv = new DataView(buf);
    var eocd = findEOCD(dv, bytes.length);
    if (eocd < 0) throw new Error('ZIP 구조를 읽지 못했습니다. 파일이 손상됐을 수 있습니다.');

    var count = dv.getUint16(eocd + 10, true);
    var pos = dv.getUint32(eocd + 16, true);
    var out = {};
    for (var i = 0; i < count; i++) {
      if (dv.getUint32(pos, true) !== 0x02014b50) break;
      var method = dv.getUint16(pos + 10, true);
      var compSize = dv.getUint32(pos + 20, true);
      var nameLen = dv.getUint16(pos + 28, true);
      var extraLen = dv.getUint16(pos + 30, true);
      var cmtLen = dv.getUint16(pos + 32, true);
      var local = dv.getUint32(pos + 42, true);
      var name = utf8.decode(bytes.subarray(pos + 46, pos + 46 + nameLen));
      out[name] = { local: local, method: method, compSize: compSize };
      pos += 46 + nameLen + extraLen + cmtLen;
    }
    return { bytes: bytes, dv: dv, entries: out };
  }

  function inflate(bytes) {
    if (typeof DecompressionStream !== 'function') {
      return Promise.reject(new Error('이 브라우저는 xlsx 를 열 수 없습니다. 최신 Chrome 이나 Edge 를 써주세요.'));
    }
    var ds = new DecompressionStream('deflate-raw');
    var w = ds.writable.getWriter();
    w.write(bytes); w.close();
    return new Response(ds.readable).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }

  /* 엔트리 하나를 텍스트로 꺼낸다. */
  function readText(zip, name) {
    var e = zip.entries[name];
    if (!e) return Promise.resolve(null);
    // 로컬 헤더에서 실제 데이터 시작 위치를 계산 (extra 길이가 중앙 목록과 다를 수 있다)
    var nameLen = zip.dv.getUint16(e.local + 26, true);
    var extraLen = zip.dv.getUint16(e.local + 28, true);
    var start = e.local + 30 + nameLen + extraLen;
    var raw = zip.bytes.subarray(start, start + e.compSize);
    if (e.method === 0) return Promise.resolve(utf8.decode(raw));
    return inflate(raw).then(function (b) { return utf8.decode(b); });
  }

  // ── XLSX 파싱 ────────────────────────────────────────────────────────
  function colIndex(ref) {                       // 'BB12' → 54
    var n = 0;
    for (var i = 0; i < ref.length; i++) {
      var c = ref.charCodeAt(i);
      if (c < 65 || c > 90) break;
      n = n * 26 + (c - 64);
    }
    return n;
  }

  function parse(xml) { return new DOMParser().parseFromString(xml, 'application/xml'); }

  function sheetPath(zip) {
    return readText(zip, 'xl/workbook.xml').then(function (wbXml) {
      if (!wbXml) throw new Error('xlsx 안에 workbook.xml 이 없습니다.');
      var wb = parse(wbXml);
      var sheets = Array.prototype.slice.call(wb.getElementsByTagName('sheet'));
      if (!sheets.length) throw new Error('시트를 찾지 못했습니다.');
      // '고객목록' 이 있으면 그걸, 없으면 첫 시트
      var pick = sheets.filter(function (s) { return s.getAttribute('name') === '고객목록'; })[0] || sheets[0];
      var rid = pick.getAttribute('r:id') ||
        pick.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');

      return readText(zip, 'xl/_rels/workbook.xml.rels').then(function (relXml) {
        var target = 'worksheets/sheet1.xml';
        if (relXml) {
          var rels = parse(relXml).getElementsByTagName('Relationship');
          for (var i = 0; i < rels.length; i++) {
            if (rels[i].getAttribute('Id') === rid) { target = rels[i].getAttribute('Target'); break; }
          }
        }
        return { path: 'xl/' + target.replace(/^\/?xl\//, ''), name: pick.getAttribute('name') };
      });
    });
  }

  function sharedStrings(zip) {
    return readText(zip, 'xl/sharedStrings.xml').then(function (xml) {
      if (!xml) return [];
      var si = parse(xml).getElementsByTagName('si'), out = [];
      for (var i = 0; i < si.length; i++) {
        // <si> 안의 모든 <t> 를 이어붙인다 (서식이 섞이면 조각난다)
        var ts = si[i].getElementsByTagName('t'), s = '';
        for (var j = 0; j < ts.length; j++) s += ts[j].textContent;
        out.push(s);
      }
      return out;
    });
  }

  function cellValue(c, sst) {
    var t = c.getAttribute('t');
    if (t === 'inlineStr') {
      var is = c.getElementsByTagName('t'), s = '';
      for (var i = 0; i < is.length; i++) s += is[i].textContent;
      return s;
    }
    var v = c.getElementsByTagName('v')[0];
    if (!v) return '';
    if (t === 's') { var n = +v.textContent; return sst[n] === undefined ? '' : sst[n]; }
    return v.textContent;
  }

  /* xlsx 를 {header, rows} 로 읽는다. 1행이 머리글. */
  function readRows(buffer) {
    var zip = readEntries(buffer);
    return Promise.all([sheetPath(zip), sharedStrings(zip)]).then(function (r) {
      return readText(zip, r[0].path).then(function (xml) {
        if (!xml) throw new Error('시트 XML 을 찾지 못했습니다: ' + r[0].path);
        var sst = r[1];
        var rowEls = parse(xml).getElementsByTagName('row');
        var header = [], rows = [];
        for (var i = 0; i < rowEls.length; i++) {
          var cells = rowEls[i].getElementsByTagName('c');
          var vals = [];
          for (var j = 0; j < cells.length; j++) {
            var idx = colIndex(cells[j].getAttribute('r') || '');
            if (!idx) continue;
            while (vals.length < idx - 1) vals.push('');
            vals[idx - 1] = (cellValue(cells[j], sst) || '').replace(/\r\n?/g, '\n').trim();
          }
          if (!header.length) {
            header = vals.map(function (v) { return String(v).replace(/\s+/g, ' ').trim(); });
            continue;
          }
          if (!vals.some(function (v) { return v !== ''; })) continue;
          var o = {};
          for (var k = 0; k < header.length; k++) o[header[k]] = vals[k] === undefined ? '' : vals[k];
          o._r = rows.length + 2;
          rows.push(o);
        }
        if (!header.length) throw new Error('머리글 행을 읽지 못했습니다.');
        return { header: header, rows: rows, sheetName: r[0].name };
      });
    });
  }

  global.XlsxReader = { readRows: readRows };
})(window);
