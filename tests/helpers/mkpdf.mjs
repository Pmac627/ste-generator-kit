// Build small synthetic PDFs (invented content only) for reader and interpreter tests.
// Output uses an xref stream, FlateDecode, and optionally an object stream, like Issue 9.

import { deflateSync } from 'node:zlib';

/** Serialize a JS value as a PDF object. Strings starting with '/' are names; {ref:n} is "n 0 R". */
export function pdfValue(v) {
  if (v === null) {
    return 'null';
  }
  if (typeof v === 'boolean' || typeof v === 'number') {
    return String(v);
  }
  if (typeof v === 'string') {
    return v.startsWith('/') ? v : `(${v.replace(/([()\\])/g, '\\$1')})`;
  }
  if (Buffer.isBuffer(v)) {
    return `<${v.toString('hex')}>`;
  }
  if (Array.isArray(v)) {
    return `[${v.map(pdfValue).join(' ')}]`;
  }
  if (v.ref !== undefined) {
    return `${v.ref} 0 R`;
  }
  return `<<${Object.entries(v)
    .map(([k, x]) => `/${k} ${pdfValue(x)}`)
    .join(' ')}>>`;
}

/**
 * Build a PDF. objects: Map num -> { dict, stream? (Buffer|string), inObjStm? }.
 * Streams are Flate-compressed. Returns a Buffer.
 */
export function buildPdf(objects, rootNum) {
  const parts = [Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  let offset = parts[0].length;
  const xref = new Map();
  const add = (buf) => {
    parts.push(buf);
    offset += buf.length;
  };
  const objStmMembers = [...objects].filter(([, o]) => o.inObjStm && o.stream === undefined);
  let nextNum = Math.max(...objects.keys()) + 1;
  for (const [num, o] of objects) {
    if (o.inObjStm && o.stream === undefined) {
      continue;
    }
    xref.set(num, { type: 1, offset });
    if (o.stream !== undefined) {
      const raw = deflateSync(Buffer.from(o.stream, 'latin1'));
      const dict = { ...o.dict, Length: raw.length, Filter: '/FlateDecode' };
      add(Buffer.concat([Buffer.from(`${num} 0 obj\n${pdfValue(dict)}\nstream\n`, 'latin1'), raw, Buffer.from('\nendstream\nendobj\n', 'latin1')]));
    } else {
      add(Buffer.from(`${num} 0 obj\n${pdfValue(o.dict)}\nendobj\n`, 'latin1'));
    }
  }
  if (objStmMembers.length) {
    const stmNum = nextNum++;
    const bodies = objStmMembers.map(([, o]) => pdfValue(o.dict) + '\n');
    let pos = 0;
    const header = objStmMembers
      .map(([num], i) => {
        const h = `${num} ${pos}`;
        pos += bodies[i].length;
        return h;
      })
      .join(' ') + '\n';
    const data = header + bodies.join('');
    objStmMembers.forEach(([num], i) => xref.set(num, { type: 2, stm: stmNum, idx: i }));
    const raw = deflateSync(Buffer.from(data, 'latin1'));
    xref.set(stmNum, { type: 1, offset });
    add(Buffer.concat([Buffer.from(`${stmNum} 0 obj\n${pdfValue({ Type: '/ObjStm', N: objStmMembers.length, First: header.length, Length: raw.length, Filter: '/FlateDecode' })}\nstream\n`, 'latin1'), raw, Buffer.from('\nendstream\nendobj\n', 'latin1')]));
  }
  const xrefNum = nextNum++;
  xref.set(xrefNum, { type: 1, offset });
  const size = xrefNum + 1;
  const rows = [];
  for (let n = 0; n < size; n++) {
    const e = xref.get(n);
    const row = Buffer.alloc(5);
    if (e?.type === 1) {
      row[0] = 1;
      row.writeUIntBE(e.offset, 1, 3);
    } else if (e?.type === 2) {
      row[0] = 2;
      row.writeUIntBE(e.stm, 1, 3);
      row[4] = e.idx;
    }
    rows.push(row);
  }
  const raw = deflateSync(Buffer.concat(rows));
  const xrefOffset = offset;
  add(Buffer.concat([Buffer.from(`${xrefNum} 0 obj\n${pdfValue({ Type: '/XRef', Size: size, W: [1, 3, 1], Root: { ref: rootNum }, Length: raw.length, Filter: '/FlateDecode' })}\nstream\n`, 'latin1'), raw, Buffer.from('\nendstream\nendobj\n', 'latin1')]));
  add(Buffer.from(`startxref\n${xrefOffset}\n%%EOF\n`, 'latin1'));
  return Buffer.concat(parts);
}

/**
 * One-page PDF with a simple WinAnsi font /F1 (all widths 500, descent -200), a Type0 Identity-H
 * font /F2 (width 600, descent -300, ToUnicode maps 1..26 to a..z), the AFM-substituted /F3
 * (BaseFont Helvetica), and an optional Form XObject /X1.
 */
export function onePage(content, { form = null, objStm = false } = {}) {
  const objs = new Map();
  objs.set(1, { dict: { Type: '/Catalog', Pages: { ref: 2 } }, inObjStm: objStm });
  objs.set(2, { dict: { Type: '/Pages', Kids: [{ ref: 3 }], Count: 1, MediaBox: [0, 0, 600, 800] }, inObjStm: objStm });
  const xobj = form ? { XObject: { X1: { ref: 20 } } } : {};
  objs.set(3, { dict: { Type: '/Page', Parent: { ref: 2 }, Contents: { ref: 4 }, Resources: { Font: { F1: { ref: 10 }, F2: { ref: 12 }, F3: { ref: 16 } }, ...xobj } } });
  objs.set(4, { dict: {}, stream: content });
  objs.set(10, { dict: { Type: '/Font', Subtype: '/TrueType', BaseFont: '/TestSans-Bold', FirstChar: 32, LastChar: 126, Widths: new Array(95).fill(500), Encoding: '/WinAnsiEncoding', FontDescriptor: { ref: 11 } }, inObjStm: objStm });
  objs.set(11, { dict: { Type: '/FontDescriptor', FontName: '/TestSans-Bold', Descent: -200, Ascent: 800, Flags: 32, FontBBox: [0, -200, 1000, 800] }, inObjStm: objStm });
  objs.set(12, { dict: { Type: '/Font', Subtype: '/Type0', BaseFont: '/TestCid', Encoding: '/Identity-H', DescendantFonts: [{ ref: 13 }], ToUnicode: { ref: 15 } } });
  objs.set(13, { dict: { Type: '/Font', Subtype: '/CIDFontType2', BaseFont: '/TestCid', DW: 1000, W: [1, 26, 600], FontDescriptor: { ref: 14 }, CIDSystemInfo: { Registry: 'Adobe', Ordering: 'Identity', Supplement: 0 } } });
  objs.set(14, { dict: { Type: '/FontDescriptor', FontName: '/TestCid', Descent: 300, FontBBox: [0, -300, 1000, 700] } });
  objs.set(15, { dict: {}, stream: '/CIDInit /ProcSet findresource begin 12 dict begin begincmap\n1 begincodespacerange <0000> <FFFF> endcodespacerange\n1 beginbfrange <0001> <001A> <0061> endbfrange\n1 beginbfchar <001B> <0020> endbfchar\nendcmap CMapName currentdict /CMap defineresource pop end end' });
  objs.set(16, { dict: { Type: '/Font', Subtype: '/TrueType', BaseFont: '/Helvetica', FirstChar: 32, LastChar: 126, Widths: new Array(95).fill(1), Encoding: '/WinAnsiEncoding', FontDescriptor: { ref: 17 } } });
  objs.set(17, { dict: { Type: '/FontDescriptor', FontName: '/NotUsed', Descent: -999, FontBBox: [0, -999, 1000, 800] } });
  if (form) {
    objs.set(20, { dict: { Type: '/XObject', Subtype: '/Form', BBox: [0, 0, 600, 800], Matrix: form.matrix ?? [1, 0, 0, 1, 0, 0], Resources: { Font: { F1: { ref: 10 } } } }, stream: form.content });
  }
  return buildPdf(objs, 1);
}

/**
 * Multi-page PDF (600 x 800) with /B (TestSans-Bold) and /R (TestSans), both WinAnsi, width 500,
 * descent -200. A char of size s whose box top is T sits on baseline 800 - T - 0.8 s.
 * @param {string[]} contents one content stream per page
 */
export function buildDoc(contents) {
  const objs = new Map();
  const n = contents.length;
  objs.set(1, { dict: { Type: '/Catalog', Pages: { ref: 2 } } });
  objs.set(2, { dict: { Type: '/Pages', Kids: contents.map((_, i) => ({ ref: 100 + 2 * i })), Count: n, MediaBox: [0, 0, 600, 800], Resources: { Font: { B: { ref: 10 }, R: { ref: 12 } } } } });
  for (const [k, name] of [
    [10, 'TestSans-Bold'],
    [12, 'TestSans'],
  ]) {
    objs.set(k, { dict: { Type: '/Font', Subtype: '/TrueType', BaseFont: `/${name}`, FirstChar: 32, LastChar: 255, Widths: new Array(224).fill(500), Encoding: '/WinAnsiEncoding', FontDescriptor: { ref: k + 1 } } });
    objs.set(k + 1, { dict: { Type: '/FontDescriptor', FontName: `/${name}`, Descent: -200, Ascent: 800, Flags: 32, FontBBox: [0, -200, 1000, 800] } });
  }
  contents.forEach((c, i) => {
    objs.set(100 + 2 * i, { dict: { Type: '/Page', Parent: { ref: 2 }, Contents: { ref: 101 + 2 * i } } });
    objs.set(101 + 2 * i, { dict: {}, stream: c });
  });
  return buildPdf(objs, 1);
}

/** Content-stream text: font 'B' or 'R', size s, left edge x, box top T. */
export function txt(font, s, x, top, text) {
  return `BT /${font} ${s} Tf ${x} ${800 - top - 0.8 * s} Td (${text.replace(/([()\\])/g, '\\$1')}) Tj ET`;
}

/** Content-stream filled rectangle with box top T and height h. */
export function rect(x, top, w, h) {
  return `${x} ${800 - top - h} ${w} ${h} re f`;
}

/** Content-stream curve whose end points span x..x+w at box top T (a "help icon"). */
export function icon(x, top, w = 20) {
  return `${x} ${800 - top - 5} m ${x + w / 2} ${800 - top} ${x + w} ${800 - top} ${x + w} ${800 - top} c f`;
}
