// Content-stream interpreter that yields the same chars, rects, and curves as pdfplumber 0.11 on
// pdfminer.six 20260107 (laparams=None). Float arithmetic follows pdfminer's operation order, so
// coordinates match bit for bit. Only horizontal writing and the font types in ASD-STE100 Issue 9
// are supported; anything else throws.

import { Parser, PdfOp, PdfStream, PdfRef, isName } from './_pdf.mjs';
import { WIN_ANSI, AFM } from './_pdf_tables.mjs';

const IDENTITY = [1, 0, 0, 1, 0, 0];

function mult(m1, m0) {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a0, b0, c0, d0, e0, f0] = m0;
  return [a0 * a1 + c0 * b1, b0 * a1 + d0 * b1, a0 * c1 + c0 * d1, b0 * c1 + d0 * d1, a0 * e1 + c0 * f1 + e0, b0 * e1 + d0 * f1 + f0];
}

function translate(m, x, y) {
  const [a, b, c, d, e, f] = m;
  return [a, b, c, d, x * a + y * c + e, x * b + y * d + f];
}

function applyPt(m, x, y) {
  const [a, b, c, d, e, f] = m;
  return [a * x + c * y + e, b * x + d * y + f];
}

function applyRect(m, x0, y0, x1, y1) {
  const [l1, b1] = applyPt(m, x0, y0);
  const [r1, b2] = applyPt(m, x1, y0);
  const [r2, t1] = applyPt(m, x1, y1);
  const [l2, t2] = applyPt(m, x0, y1);
  return [Math.min(l1, l2, r1, r2), Math.min(b1, b2, t1, t2), Math.max(l1, l2, r1, r2), Math.max(b1, b2, t1, t2)];
}

// ---------- fonts ----------

function utf16be(buf) {
  let s = '';
  for (let i = 0; i + 1 < buf.length; i += 2) {
    const u = (buf[i] << 8) | buf[i + 1];
    if (u >= 0xd800 && u <= 0xdbff) {
      const lo = i + 3 < buf.length ? (buf[i + 2] << 8) | buf[i + 3] : 0;
      if (lo >= 0xdc00 && lo <= 0xdfff) {
        s += String.fromCharCode(u, lo);
        i += 2;
      }
      continue;
    }
    if (u >= 0xdc00 && u <= 0xdfff) {
      continue;
    }
    s += String.fromCharCode(u);
  }
  return s;
}

function nunpack(buf) {
  let v = 0;
  for (const b of buf) {
    v = v * 256 + b;
  }
  return v;
}

function addUni(map, cid, code) {
  const u = utf16be(code);
  if (u === '\u00a0' && map.get(cid) === ' ') {
    return;
  }
  map.set(cid, u);
}

/** Parse a ToUnicode CMap stream the way pdfminer's CMapParser does (bfchar and bfrange). */
function parseToUnicode(data) {
  const map = new Map();
  const p = new Parser(data);
  let stack = [];
  for (;;) {
    const tok = p.token();
    if (tok === null) {
      break;
    }
    if (tok.t !== 'kw') {
      stack.push(p.parseObject(tok, true));
      continue;
    }
    if (tok.v === 'endbfchar') {
      for (let i = 0; i + 1 < stack.length; i += 2) {
        if (Buffer.isBuffer(stack[i]) && Buffer.isBuffer(stack[i + 1])) {
          addUni(map, nunpack(stack[i]), stack[i + 1]);
        }
      }
    } else if (tok.v === 'endbfrange') {
      for (let i = 0; i + 2 < stack.length; i += 3) {
        const [s, e, code] = [stack[i], stack[i + 1], stack[i + 2]];
        if (!Buffer.isBuffer(s) || !Buffer.isBuffer(e) || s.length !== e.length) {
          continue;
        }
        const start = nunpack(s);
        const end = nunpack(e);
        if (Array.isArray(code)) {
          for (let k = 0; k <= end - start && k < code.length; k++) {
            if (Buffer.isBuffer(code[k])) {
              addUni(map, start + k, code[k]);
            } else {
              throw new Error('PDF: ToUnicode glyph-name destinations are not supported');
            }
          }
        } else {
          const v = code.subarray(Math.max(0, code.length - 4));
          const prefix = code.subarray(0, code.length - v.length);
          const base = nunpack(v);
          for (let k = 0; k <= end - start; k++) {
            const x = Buffer.alloc(4);
            x.writeUInt32BE((base + k) >>> 0);
            addUni(map, start + k, Buffer.concat([prefix, x.subarray(4 - v.length)]));
          }
        }
      }
    } else if (tok.v === 'endcidchar' || tok.v === 'endcidrange') {
      throw new Error('PDF: cidchar/cidrange in ToUnicode is not supported');
    }
    if (tok.v.startsWith('begin') || tok.v.startsWith('end') || tok.v === 'def') {
      stack = [];
    }
  }
  return map;
}

function nameOf(v) {
  return v && v.name !== undefined ? v.name : v instanceof Buffer ? v.toString('latin1') : v;
}

/** Build a pdfminer-equivalent font from a font dictionary. */
function makeFont(doc, spec) {
  const R = doc.resolve;
  const subtype = R(spec.get('Subtype'))?.name;
  if (subtype === 'Type0') {
    const enc = R(spec.get('Encoding'))?.name;
    if (enc !== 'Identity-H') {
      throw new Error(`PDF: Type0 font encoding ${enc} is not supported`);
    }
    const desc = R(R(spec.get('DescendantFonts'))[0]);
    const fd = R(desc.get('FontDescriptor')) ?? new Map();
    const widths = new Map();
    const W = R(desc.get('W')) ?? [];
    let r = [];
    for (let v of W) {
      v = R(v);
      if (Array.isArray(v)) {
        if (r.length) {
          const c1 = r[r.length - 1];
          v.forEach((w, i) => widths.set(c1 + i, R(w)));
          r = [];
        }
      } else if (typeof v === 'number') {
        r.push(v);
        if (r.length === 3) {
          for (let c = r[0]; c <= r[1]; c++) {
            widths.set(c, r[2]);
          }
          r = [];
        }
      }
    }
    const tu = spec.get('ToUnicode');
    const uni = tu !== undefined && R(tu) instanceof PdfStream ? parseToUnicode(doc.streamData(tu)) : null;
    let descent = Number(R(fd.get('Descent')) ?? 0);
    descent = descent > 0 ? -descent : descent;
    return {
      fontname: nameOf(R(fd.get('FontName'))) ?? 'unknown',
      multibyte: true,
      descent: descent * 0.001,
      decode: (b) => {
        const out = [];
        for (let i = 0; i + 1 < b.length; i += 2) {
          out.push((b[i] << 8) | b[i + 1]);
        }
        return out;
      },
      toUni: (cid) => (uni ? uni.get(cid) : undefined),
      width: (cid) => (widths.has(cid) ? widths.get(cid) : Number(R(desc.get('DW')) ?? 1000)) * 0.001,
    };
  }
  if (subtype !== 'TrueType' && subtype !== 'Type1') {
    throw new Error(`PDF: font subtype ${subtype} is not supported`);
  }
  const base = nameOf(R(spec.get('BaseFont')));
  const encName = R(spec.get('Encoding'));
  if (encName !== undefined && !isName(encName, 'WinAnsiEncoding')) {
    throw new Error(`PDF: simple font encoding ${nameOf(encName)} is not supported`);
  }
  if (subtype === 'Type1' && encName === undefined) {
    throw new Error('PDF: Type1 fonts with built-in encodings are not supported');
  }
  const tu = spec.get('ToUnicode');
  const uni = tu !== undefined ? parseToUnicode(doc.streamData(tu)) : null;
  const toUni = (cid) => (uni && uni.has(cid) ? uni.get(cid) : WIN_ANSI.get(cid));
  const afm = AFM[base];
  if (afm) {
    // pdfminer substitutes the built-in AFM metrics, keyed by unicode character.
    return {
      fontname: afm.fontName,
      multibyte: false,
      descent: afm.descent * 0.001,
      decode: (b) => [...b],
      toUni,
      width: (cid) => {
        const u = toUni(cid);
        return (u !== undefined && afm.widths.has(u) ? afm.widths.get(u) : 0) * 0.001;
      },
    };
  }
  const fd = R(spec.get('FontDescriptor')) ?? new Map();
  const first = Number(R(spec.get('FirstChar')) ?? 0);
  const wl = R(spec.get('Widths')) ?? new Array(256).fill(0);
  const missing = Number(R(fd.get('MissingWidth')) ?? 0);
  let descent = Number(R(fd.get('Descent')) ?? 0);
  descent = descent > 0 ? -descent : descent;
  return {
    fontname: nameOf(R(fd.get('FontName'))) ?? 'unknown',
    multibyte: false,
    descent: descent * 0.001,
    decode: (b) => [...b],
    toUni,
    width: (cid) => {
      const i = cid - first;
      const w = i >= 0 && i < wl.length ? R(wl[i]) : undefined;
      return (typeof w === 'number' ? w : missing) * 0.001;
    },
  };
}

// ---------- interpreter ----------

function freshText() {
  return { font: null, fontsize: 0, charspace: 0, wordspace: 0, scaling: 100, leading: 0, rise: 0, matrix: IDENTITY, line: [0, 0] };
}

/**
 * Interpret one page. Returns { width, height, chars, rects, curves } with pdfplumber's attribute
 * names and values (top-left origin).
 * @param {import('./_pdf.mjs').PdfDocument} doc
 * @param {number} pno 1-based page number
 * @see ../docs/flows/pdf-read.md
 */
export function pageObjects(doc, pno) {
  if (!Number.isInteger(pno) || pno < 1 || pno > doc.pages.length) {
    throw new Error(`pageObjects: page ${pno} is out of range 1..${doc.pages.length}`);
  }
  const R = doc.resolve;
  doc.fontCache = doc.fontCache ?? new Map();
  const page = doc.pages[pno - 1];
  const rotate = R(page.get('Rotate')) ?? 0;
  if (rotate % 360 !== 0) {
    throw new Error(`PDF: rotated pages are not supported (page ${pno})`);
  }
  const mb = R(page.get('MediaBox')).map((v) => R(v));
  const [mx0, my0, mx1, my1] = [Math.min(mb[0], mb[2]), Math.min(mb[1], mb[3]), Math.max(mb[0], mb[2]), Math.max(mb[1], mb[3])];
  const H = my1 - my0;
  const mbTop = H - my1;
  const out = { width: mx1 - mx0, height: H, chars: [], rects: [], curves: [] };
  const dev = { ctm: null };

  const toTop = (y0, y1, x0, x1) => {
    const o = { x0, x1, top: H - y1 + mbTop, bottom: H - y0 + mbTop, height: y1 - y0, width: x1 - x0 };
    if (mx0 !== 0) {
      o.x0 += mx0;
      o.x1 += mx0;
    }
    return o;
  };

  const fontFor = (resources, name) => {
    const fonts = R(resources?.get('Font'));
    const ref = fonts?.get(name);
    if (ref === undefined) {
      throw new Error(`PDF: undefined font /${name} on page ${pno}`);
    }
    const key = ref instanceof PdfRef ? ref.num : null;
    if (key !== null && doc.fontCache.has(key)) {
      return doc.fontCache.get(key);
    }
    const f = makeFont(doc, R(ref));
    if (key !== null) {
      doc.fontCache.set(key, f);
    }
    return f;
  };

  const paintPath = (path) => {
    let shape = path.map((s) => s[0]).join('');
    if (shape[0] !== 'm') {
      return;
    }
    if ((shape.match(/m/g) || []).length > 1) {
      for (const m of shape.matchAll(/m[^m]+/g)) {
        paintPath(path.slice(m.index, m.index + m[0].length));
      }
      return;
    }
    const pts = path.map((s) => {
      const src = s[0] === 'h' ? path[0] : s;
      return applyPt(dev.ctm, src[src.length - 2], src[src.length - 1]);
    });
    if (shape.length > 3 && shape.endsWith('lh') && pts[pts.length - 2][0] === pts[0][0] && pts[pts.length - 2][1] === pts[0][1]) {
      shape = shape.slice(0, -2) + 'h';
      pts.pop();
    }
    if (shape === 'mlh' || shape === 'ml') {
      return; // LTLine: pdfplumber "lines", not used by the kit.
    }
    const bound = () => {
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      return toTop(Math.min(...ys), Math.max(...ys), Math.min(...xs), Math.max(...xs));
    };
    if (shape === 'mlllh' || shape === 'mllll') {
      const [[x0, y0], [x1, y1], [x2, y2], [x3, y3], p4] = pts;
      const closed = pts[0][0] === p4[0] && pts[0][1] === p4[1];
      const square = (x0 === x1 && y1 === y2 && x2 === x3 && y3 === y0) || (y0 === y1 && x1 === x2 && y2 === y3 && x3 === x0);
      if (closed && square) {
        // LTRect(bbox=(*pts[0], *pts[2])) normalizes through get_bound of its 4 corners.
        const xa = Math.min(x0, x2);
        const xb = Math.max(x0, x2);
        const ya = Math.min(y0, y2);
        const yb = Math.max(y0, y2);
        out.rects.push(toTop(ya, yb, xa, xb));
        return;
      }
    }
    out.curves.push(bound());
  };

  const renderString = (ts, seq) => {
    const matrix = mult(ts.matrix, dev.ctm);
    const font = ts.font;
    const fontsize = ts.fontsize;
    const scaling = ts.scaling * 0.01;
    const charspace = ts.charspace * scaling;
    const wordspace = font.multibyte ? 0 : ts.wordspace * scaling;
    const rise = ts.rise;
    const dxscale = 0.001 * fontsize * scaling;
    let [x, y] = ts.line;
    let needcharspace = false;
    for (const obj of seq) {
      if (typeof obj === 'number') {
        x -= obj * dxscale;
        needcharspace = true;
      } else if (Buffer.isBuffer(obj)) {
        for (const cid of font.decode(obj)) {
          if (needcharspace) {
            x += charspace;
          }
          const m = translate(matrix, x, y);
          const uni = font.toUni(cid);
          const text = uni === undefined ? `(cid:${cid})` : uni;
          const adv = font.width(cid) * fontsize * scaling;
          const descent = font.descent * fontsize;
          let [x0, y0, x1, y1] = applyRect(m, 0, descent + rise, adv, descent + rise + fontsize);
          if (x1 < x0) {
            [x0, x1] = [x1, x0];
          }
          if (y1 < y0) {
            [y0, y1] = [y1, y0];
          }
          const upright = m[0] * m[3] * scaling > 0 && m[1] * m[2] <= 0;
          const c = toTop(y0, y1, x0, x1);
          c.text = text;
          c.fontname = font.fontname;
          c.size = y1 - y0;
          c.upright = upright;
          out.chars.push(c);
          x += adv;
          if (cid === 32 && wordspace) {
            x += wordspace;
          }
          needcharspace = true;
        }
      }
    }
    ts.line = [x, y];
  };

  const run = (resources, data, ctm0, depth) => {
    if (depth > 8) {
      throw new Error('PDF: Form XObjects nested too deep');
    }
    let ctm = ctm0;
    dev.ctm = ctm;
    let ts = freshText();
    let gstack = [];
    let curpath = [];
    const args = [];
    const p = new Parser(data);
    const num = (i) => args[args.length - i];
    for (;;) {
      const tok = p.token();
      if (tok === null) {
        break;
      }
      const v = p.parseObject(tok, true);
      if (!(v instanceof PdfOp)) {
        args.push(v);
        continue;
      }
      const op = v.op;
      switch (op) {
        case 'q':
          gstack.push([ctm, { ...ts }]);
          break;
        case 'Q':
          if (gstack.length) {
            [ctm, ts] = gstack.pop();
            dev.ctm = ctm;
          }
          break;
        case 'cm':
          ctm = mult(args.slice(-6), ctm);
          dev.ctm = ctm;
          break;
        case 'm':
        case 'l':
          curpath.push([op, num(2), num(1)]);
          break;
        case 'c':
          curpath.push(['c', ...args.slice(-6)]);
          break;
        case 'v':
        case 'y':
          curpath.push([op, ...args.slice(-4)]);
          break;
        case 'h':
          curpath.push(['h']);
          break;
        case 're': {
          const [x, y, w, h] = args.slice(-4);
          curpath.push(['m', x, y], ['l', x + w, y], ['l', x + w, y + h], ['l', x, y + h], ['h']);
          break;
        }
        case 's':
        case 'b':
        case 'b*':
          curpath.push(['h']);
          paintPath(curpath);
          curpath = [];
          break;
        case 'S':
        case 'f':
        case 'F':
        case 'f*':
        case 'B':
        case 'B*':
          paintPath(curpath);
          curpath = [];
          break;
        case 'n':
          curpath = [];
          break;
        case 'BT':
          ts.matrix = IDENTITY;
          ts.line = [0, 0];
          break;
        case 'Tc':
          ts.charspace = num(1);
          break;
        case 'Tw':
          ts.wordspace = num(1);
          break;
        case 'Tz':
          ts.scaling = num(1);
          break;
        case 'TL':
          ts.leading = -num(1);
          break;
        case 'Ts':
          ts.rise = num(1);
          break;
        case 'Tf':
          ts.font = fontFor(resources, num(2).name);
          ts.fontsize = num(1);
          break;
        case 'Td':
        case 'TD': {
          const [tx, ty] = args.slice(-2);
          const [a, b, c, d, e, f] = ts.matrix;
          ts.matrix = [a, b, c, d, tx * a + ty * c + e, tx * b + ty * d + f];
          if (op === 'TD') {
            ts.leading = ty;
          }
          ts.line = [0, 0];
          break;
        }
        case 'Tm':
          ts.matrix = args.slice(-6);
          ts.line = [0, 0];
          break;
        case 'T*': {
          const [a, b, c, d, e, f] = ts.matrix;
          ts.matrix = [a, b, c, d, ts.leading * c + e, ts.leading * d + f];
          ts.line = [0, 0];
          break;
        }
        case 'TJ':
          if (ts.font) {
            renderString(ts, num(1));
          }
          break;
        case 'Tj':
          if (ts.font) {
            renderString(ts, [num(1)]);
          }
          break;
        case "'": {
          const [a, b, c, d, e, f] = ts.matrix;
          ts.matrix = [a, b, c, d, ts.leading * c + e, ts.leading * d + f];
          ts.line = [0, 0];
          if (ts.font) {
            renderString(ts, [num(1)]);
          }
          break;
        }
        case '"':
          // pdfminer sets Tw and Tc but does not move to the next line.
          ts.wordspace = num(3);
          ts.charspace = num(2);
          if (ts.font) {
            renderString(ts, [num(1)]);
          }
          break;
        case 'BI':
          throw new Error(`PDF: inline images are not supported (page ${pno})`);
        case 'Do': {
          const xobj = R(R(resources?.get('XObject'))?.get(num(1).name));
          if (xobj instanceof PdfStream && isName(R(xobj.dict.get('Subtype')), 'Form') && xobj.dict.has('BBox')) {
            const fm = R(xobj.dict.get('Matrix')) ?? IDENTITY;
            const xres = R(xobj.dict.get('Resources'));
            run(xres ? xres : resources, doc.streamData(xobj), mult(fm.map((x) => R(x)), ctm), depth + 1);
          }
          break;
        }
        default:
          break;
      }
      args.length = 0;
    }
  };

  const contents = R(page.get('Contents'));
  const streams = Array.isArray(contents) ? contents : contents ? [page.get('Contents')] : [];
  const data = Buffer.concat(streams.flatMap((s) => [doc.streamData(s), Buffer.from('\n')]));
  run(R(page.get('Resources')), data, [1, 0, 0, 1, -mx0, -my0], 0);
  return out;
}
