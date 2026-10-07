// Minimal PDF reader: objects, xref streams, object streams, Standard security handler (AES-128, R4),
// FlateDecode with PNG predictors, and the page tree. Built-ins only.
//
// Scope: the features the ASD-STE100 Issue 9 PDF uses. Anything else fails fast with a clear error,
// so a different PDF never produces silently wrong output.

import { readFileSync } from 'node:fs';
import { createDecipheriv, createHash } from 'node:crypto';
import { inflateSync, constants as zc } from 'node:zlib';

// ---------- object model ----------

/** A PDF name, kept distinct from strings. */
export class PdfName {
  constructor(name) {
    this.name = name;
  }
}

/** An indirect reference "num gen R". */
export class PdfRef {
  constructor(num, gen) {
    this.num = num;
    this.gen = gen;
  }
}

/** A stream: its dictionary plus the raw (still encoded, still encrypted) bytes. */
export class PdfStream {
  constructor(dict, raw, num, gen) {
    this.dict = dict;
    this.raw = raw;
    this.num = num;
    this.gen = gen;
  }
}

/** An operator keyword inside a content stream. */
export class PdfOp {
  constructor(op) {
    this.op = op;
  }
}

const NAME_CACHE = new Map();

/** Interned PdfName, so names compare by identity. */
export function N(name) {
  let n = NAME_CACHE.get(name);
  if (n === undefined) {
    n = new PdfName(name);
    NAME_CACHE.set(name, n);
  }
  return n;
}

export function isName(v, name) {
  return v instanceof PdfName && (name === undefined || v.name === name);
}

// ---------- lexer / parser ----------

const WS = new Uint8Array(256);
for (const c of [0, 9, 10, 12, 13, 32]) {
  WS[c] = 1;
}
const DELIM = new Uint8Array(256);
for (const c of '()<>[]{}/%') {
  DELIM[c.charCodeAt(0)] = 1;
}

/**
 * Tokenizing parser over a byte buffer. Used for file objects and content streams.
 * Strings are returned as Buffer, names as PdfName, keywords as PdfOp.
 */
export class Parser {
  constructor(buf, pos = 0) {
    this.buf = buf;
    this.pos = pos;
  }

  skipWs() {
    const b = this.buf;
    for (;;) {
      while (this.pos < b.length && WS[b[this.pos]]) {
        this.pos++;
      }
      if (this.pos < b.length && b[this.pos] === 0x25) {
        while (this.pos < b.length && b[this.pos] !== 10 && b[this.pos] !== 13) {
          this.pos++;
        }
        continue;
      }
      return;
    }
  }

  /** Next raw token, or null at end. Composite objects are built by parseObject. */
  token() {
    this.skipWs();
    const b = this.buf;
    if (this.pos >= b.length) {
      return null;
    }
    const c = b[this.pos];
    if (c === 0x28) {
      return { t: 'str', v: this.literalString() };
    }
    if (c === 0x3c) {
      if (b[this.pos + 1] === 0x3c) {
        this.pos += 2;
        return { t: '<<' };
      }
      return { t: 'str', v: this.hexString() };
    }
    if (c === 0x3e && b[this.pos + 1] === 0x3e) {
      this.pos += 2;
      return { t: '>>' };
    }
    if (c === 0x5b || c === 0x5d || c === 0x7b || c === 0x7d) {
      this.pos++;
      return { t: String.fromCharCode(c) };
    }
    if (c === 0x2f) {
      this.pos++;
      const start = this.pos;
      while (this.pos < b.length && !WS[b[this.pos]] && !DELIM[b[this.pos]]) {
        this.pos++;
      }
      const raw = b.toString('latin1', start, this.pos);
      const name = raw.includes('#') ? raw.replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))) : raw;
      return { t: 'name', v: N(name) };
    }
    const start = this.pos;
    while (this.pos < b.length && !WS[b[this.pos]] && !DELIM[b[this.pos]]) {
      this.pos++;
    }
    if (this.pos === start) {
      // A stray delimiter such as ')' or '>': consume it so parsing always advances.
      this.pos++;
      return { t: 'kw', v: String.fromCharCode(c) };
    }
    const s = b.toString('latin1', start, this.pos);
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) {
      return { t: 'num', v: parseFloat(s), int: !s.includes('.') };
    }
    return { t: 'kw', v: s };
  }

  literalString() {
    const b = this.buf;
    const out = [];
    let depth = 0;
    this.pos++;
    while (this.pos < b.length) {
      const c = b[this.pos++];
      if (c === 0x5c) {
        const e = b[this.pos++];
        const map = { 0x6e: 10, 0x72: 13, 0x74: 9, 0x62: 8, 0x66: 12, 0x28: 0x28, 0x29: 0x29, 0x5c: 0x5c };
        if (map[e] !== undefined) {
          out.push(map[e]);
        } else if (e >= 0x30 && e <= 0x37) {
          let v = e - 0x30;
          for (let k = 0; k < 2 && b[this.pos] >= 0x30 && b[this.pos] <= 0x37; k++) {
            v = v * 8 + (b[this.pos++] - 0x30);
          }
          out.push(v & 0xff);
        } else if (e === 13) {
          if (b[this.pos] === 10) {
            this.pos++;
          }
        } else if (e !== 10) {
          out.push(e);
        }
        continue;
      }
      if (c === 0x28) {
        depth++;
      } else if (c === 0x29) {
        if (depth === 0) {
          break;
        }
        depth--;
      }
      out.push(c);
    }
    return Buffer.from(out);
  }

  hexString() {
    const b = this.buf;
    this.pos++;
    let hex = '';
    while (this.pos < b.length && b[this.pos] !== 0x3e) {
      const c = b[this.pos++];
      if (!WS[c]) {
        hex += String.fromCharCode(c);
      }
    }
    this.pos++;
    if (hex.length % 2) {
      hex += '0';
    }
    return Buffer.from(hex, 'hex');
  }

  /**
   * Parse one object. In file mode, "n g R" becomes a PdfRef. In content mode, keywords other than
   * true/false/null become PdfOp so the interpreter can dispatch on them.
   */
  parseObject(tok = this.token(), contentMode = false) {
    if (tok === null) {
      return undefined;
    }
    switch (tok.t) {
      case 'str':
      case 'name':
        return tok.v;
      case 'num': {
        if (!contentMode && tok.int) {
          const save = this.pos;
          const t2 = this.token();
          if (t2 && t2.t === 'num' && t2.int) {
            const t3 = this.token();
            if (t3 && t3.t === 'kw' && t3.v === 'R') {
              return new PdfRef(tok.v, t2.v);
            }
          }
          this.pos = save;
        }
        return tok.v;
      }
      case '[': {
        const arr = [];
        for (;;) {
          const t = this.token();
          if (t === null || t.t === ']') {
            return arr;
          }
          arr.push(this.parseObject(t, contentMode));
        }
      }
      case '<<': {
        const dict = new Map();
        for (;;) {
          const t = this.token();
          if (t === null || t.t === '>>') {
            return dict;
          }
          if (t.t !== 'name') {
            continue;
          }
          dict.set(t.v.name, this.parseObject(this.token(), contentMode));
        }
      }
      case 'kw':
        if (tok.v === 'true') {
          return true;
        }
        if (tok.v === 'false') {
          return false;
        }
        if (tok.v === 'null') {
          return null;
        }
        return contentMode ? new PdfOp(tok.v) : { kw: tok.v };
      default:
        return contentMode ? new PdfOp(tok.t) : { kw: tok.t };
    }
  }
}

// ---------- filters ----------

function pngUnpredict(data, columns, colors = 1, bpc = 8) {
  const bpp = Math.max(1, Math.ceil((colors * bpc) / 8));
  const rowLen = Math.ceil((columns * colors * bpc) / 8);
  const rows = Math.floor(data.length / (rowLen + 1));
  const out = Buffer.alloc(rows * rowLen);
  let prev = Buffer.alloc(rowLen);
  for (let r = 0; r < rows; r++) {
    const ft = data[r * (rowLen + 1)];
    const row = Buffer.from(data.subarray(r * (rowLen + 1) + 1, (r + 1) * (rowLen + 1)));
    for (let i = 0; i < rowLen; i++) {
      const a = i >= bpp ? row[i - bpp] : 0;
      const up = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      if (ft === 1) {
        row[i] = (row[i] + a) & 0xff;
      } else if (ft === 2) {
        row[i] = (row[i] + up) & 0xff;
      } else if (ft === 3) {
        row[i] = (row[i] + ((a + up) >> 1)) & 0xff;
      } else if (ft === 4) {
        const p = a + up - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - c);
        row[i] = (row[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? up : c)) & 0xff;
      } else if (ft !== 0) {
        throw new Error(`PDF: unsupported PNG predictor filter type ${ft}`);
      }
    }
    row.copy(out, r * rowLen);
    prev = row;
  }
  return out;
}

function applyFilters(data, dict, resolve) {
  let filters = resolve(dict.get('Filter'));
  let parms = resolve(dict.get('DecodeParms'));
  if (filters === undefined || filters === null) {
    return data;
  }
  if (!Array.isArray(filters)) {
    filters = [filters];
    parms = [parms];
  }
  for (let i = 0; i < filters.length; i++) {
    const f = resolve(filters[i]).name;
    const p = parms ? resolve(parms[i]) : null;
    if (f === 'FlateDecode' || f === 'Fl') {
      data = inflateSync(data, { finishFlush: zc.Z_SYNC_FLUSH });
      const pred = p ? resolve(p.get('Predictor')) : undefined;
      if (pred !== undefined && pred >= 10) {
        data = pngUnpredict(data, resolve(p.get('Columns')) ?? 1, resolve(p.get('Colors')) ?? 1, resolve(p.get('BitsPerComponent')) ?? 8);
      } else if (pred !== undefined && pred !== 1) {
        throw new Error(`PDF: unsupported predictor ${pred}`);
      }
    } else {
      throw new Error(`PDF: unsupported stream filter ${f}`);
    }
  }
  return data;
}

// ---------- encryption (Standard handler, V4/R4 AESV2, empty user password) ----------

const PAD = Buffer.from('28bf4e5e4e758a4164004e56fffa01082e2e00b6d0683e802f0ca9fe6453697a', 'hex');

function md5(...parts) {
  const h = createHash('md5');
  for (const p of parts) {
    h.update(p);
  }
  return h.digest();
}

function rc4(key, data) {
  const s = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    s[i] = i;
  }
  for (let i = 0, j = 0; i < 256; i++) {
    j = (j + s[i] + key[i % key.length]) & 0xff;
    [s[i], s[j]] = [s[j], s[i]];
  }
  const out = Buffer.alloc(data.length);
  for (let k = 0, i = 0, j = 0; k < data.length; k++) {
    i = (i + 1) & 0xff;
    j = (j + s[i]) & 0xff;
    [s[i], s[j]] = [s[j], s[i]];
    out[k] = data[k] ^ s[(s[i] + s[j]) & 0xff];
  }
  return out;
}

function makeDecryptor(enc, id0, resolve) {
  const filter = resolve(enc.get('Filter'));
  const v = resolve(enc.get('V'));
  const r = resolve(enc.get('R'));
  if (!isName(filter, 'Standard') || v !== 4 || r !== 4) {
    throw new Error(`PDF: unsupported encryption (Filter ${filter?.name}, V ${v}, R ${r}); only Standard V4/R4 is supported`);
  }
  const cf = resolve(enc.get('CF'));
  const stmF = resolve(enc.get('StmF'))?.name;
  const strF = resolve(enc.get('StrF'))?.name;
  const cfm = resolve(resolve(cf?.get(stmF))?.get('CFM'))?.name;
  if (cfm !== 'AESV2' || strF !== stmF) {
    throw new Error(`PDF: unsupported crypt filter ${cfm}; only AESV2 is supported`);
  }
  const n = (resolve(enc.get('Length')) ?? 128) / 8;
  const O = resolve(enc.get('O'));
  const U = resolve(enc.get('U'));
  const P = resolve(enc.get('P'));
  const pBuf = Buffer.alloc(4);
  pBuf.writeInt32LE(P);
  const encMeta = resolve(enc.get('EncryptMetadata'));
  const parts = [PAD, O.subarray(0, 32), pBuf, id0];
  if (encMeta === false) {
    parts.push(Buffer.from([0xff, 0xff, 0xff, 0xff]));
  }
  let key = md5(...parts);
  for (let i = 0; i < 50; i++) {
    key = md5(key.subarray(0, n));
  }
  key = key.subarray(0, n);

  // Algorithm 5: check the empty user password, so a protected PDF fails fast.
  let u = rc4(key, md5(PAD, id0));
  for (let i = 1; i <= 19; i++) {
    u = rc4(key.map((b) => b ^ i), u);
  }
  if (!u.equals(U.subarray(0, 16))) {
    throw new Error('PDF: the document needs a user password; open it without one first');
  }

  return (data, num, gen) => {
    const ob = Buffer.from([num & 0xff, (num >> 8) & 0xff, (num >> 16) & 0xff, gen & 0xff, (gen >> 8) & 0xff]);
    const k = md5(key, ob, Buffer.from('sAlT', 'latin1')).subarray(0, Math.min(n + 5, 16));
    if (data.length < 16) {
      return Buffer.alloc(0);
    }
    const d = createDecipheriv('aes-128-cbc', k, data.subarray(0, 16));
    d.setAutoPadding(false);
    const out = Buffer.concat([d.update(data.subarray(16)), d.final()]);
    const pad = out.length ? out[out.length - 1] : 0;
    return pad >= 1 && pad <= 16 ? out.subarray(0, out.length - pad) : out;
  };
}

function decryptStrings(v, dec, num, gen) {
  if (Buffer.isBuffer(v)) {
    return dec(v, num, gen);
  }
  if (Array.isArray(v)) {
    return v.map((x) => decryptStrings(x, dec, num, gen));
  }
  if (v instanceof Map) {
    const m = new Map();
    for (const [k, x] of v) {
      m.set(k, decryptStrings(x, dec, num, gen));
    }
    return m;
  }
  return v;
}

// ---------- document ----------

/**
 * A parsed PDF document. Objects are loaded lazily and cached.
 * @see ../docs/flows/pdf-read.md
 */
export class PdfDocument {
  /** @param {string|Buffer} src a file path or the file bytes. */
  constructor(src) {
    if (src === undefined || src === null) {
      throw new Error('PdfDocument: a file path or Buffer is required');
    }
    this.buf = Buffer.isBuffer(src) ? src : readFileSync(src);
    if (this.buf.toString('latin1', 0, 5) !== '%PDF-') {
      throw new Error('PDF: the file does not start with %PDF-');
    }
    this.xref = new Map();
    this.cache = new Map();
    this.objStmCache = new Map();
    this.decrypt = null;
    this.trailer = this.readXref();
    this.resolve = this.resolve.bind(this);
    const enc = this.trailer.get('Encrypt');
    if (enc !== undefined) {
      this.encryptNum = enc instanceof PdfRef ? enc.num : -1;
      const id0 = this.resolve(this.trailer.get('ID'))[0];
      this.decrypt = makeDecryptor(this.resolve(enc), id0, this.resolve);
    }
    this.pages = [];
    this.collectPages(this.resolve(this.resolve(this.trailer.get('Root')).get('Pages')), new Map());
  }

  readXref() {
    const tail = this.buf.toString('latin1', Math.max(0, this.buf.length - 1024));
    const m = tail.match(/startxref\s+(\d+)\s+%%EOF\s*$/);
    if (!m) {
      throw new Error('PDF: startxref not found');
    }
    let offset = Number(m[1]);
    let trailer = null;
    const seen = new Set();
    while (offset !== undefined && !seen.has(offset)) {
      seen.add(offset);
      const p = new Parser(this.buf, offset);
      const t = p.token();
      if (t && t.t === 'kw' && t.v === 'xref') {
        throw new Error('PDF: classic xref tables are not supported; this reader handles xref streams only');
      }
      p.pos = offset;
      const obj = this.parseIndirectAt(offset, false);
      if (!(obj instanceof PdfStream) || !isName(obj.dict.get('Type'), 'XRef')) {
        throw new Error(`PDF: no xref stream at offset ${offset}`);
      }
      const d = obj.dict;
      const data = applyFilters(obj.raw, d, (x) => x);
      const W = d.get('W');
      const index = d.get('Index') ?? [0, d.get('Size')];
      const rowLen = W[0] + W[1] + W[2];
      let pos = 0;
      for (let s = 0; s < index.length; s += 2) {
        for (let k = 0; k < index[s + 1]; k++) {
          const num = index[s] + k;
          const f = [];
          for (const w of W) {
            let v = 0;
            for (let i = 0; i < w; i++) {
              v = v * 256 + data[pos++];
            }
            f.push(v);
          }
          const type = W[0] === 0 ? 1 : f[0];
          if (!this.xref.has(num)) {
            if (type === 1) {
              this.xref.set(num, { type, offset: f[1], gen: f[2] });
            } else if (type === 2) {
              this.xref.set(num, { type, stm: f[1], idx: f[2] });
            } else {
              this.xref.set(num, { type: 0 });
            }
          }
        }
      }
      if (pos > data.length || rowLen === 0) {
        throw new Error('PDF: malformed xref stream');
      }
      trailer = trailer ?? d;
      offset = d.get('Prev');
    }
    return trailer;
  }

  parseIndirectAt(offset, decrypt = true) {
    const p = new Parser(this.buf, offset);
    const num = p.token().v;
    const gen = p.token().v;
    const kw = p.token();
    if (!kw || kw.v !== 'obj') {
      throw new Error(`PDF: expected "obj" at offset ${offset}`);
    }
    const value = p.parseObject();
    p.skipWs();
    const isStream = value instanceof Map && this.buf.toString('latin1', p.pos, p.pos + 6) === 'stream';
    const dec = decrypt && this.decrypt && num !== this.encryptNum ? this.decrypt : null;
    if (!isStream) {
      return dec ? decryptStrings(value, dec, num, gen) : value;
    }
    let start = p.pos + 6;
    if (this.buf[start] === 13) {
      start++;
    }
    if (this.buf[start] === 10) {
      start++;
    }
    let len = value.get('Length');
    if (len instanceof PdfRef) {
      len = this.resolve(len);
    }
    let end = start + len;
    if (typeof len !== 'number' || this.buf.toString('latin1', end, end + 20).search(/^\s*endstream/) !== 0) {
      end = this.buf.indexOf('endstream', start, 'latin1');
      if (end < 0) {
        throw new Error(`PDF: object ${num} has no endstream`);
      }
    }
    const dict = dec ? decryptStrings(value, dec, num, gen) : value;
    const raw = this.buf.subarray(start, end);
    return new PdfStream(dict, dec ? dec(raw, num, gen) : raw, num, gen);
  }

  getObject(num) {
    if (this.cache.has(num)) {
      return this.cache.get(num);
    }
    const e = this.xref.get(num);
    let v = null;
    if (e && e.type === 1) {
      v = this.parseIndirectAt(e.offset);
    } else if (e && e.type === 2) {
      v = this.objFromStream(e.stm, e.idx);
    }
    this.cache.set(num, v);
    return v;
  }

  objFromStream(stmNum, idx) {
    let entry = this.objStmCache.get(stmNum);
    if (!entry) {
      const stm = this.getObject(stmNum);
      const data = this.streamData(stm);
      const n = stm.dict.get('N');
      const first = stm.dict.get('First');
      const p = new Parser(data, 0);
      const offsets = [];
      for (let i = 0; i < n; i++) {
        p.token();
        offsets.push(p.token().v);
      }
      entry = { data, first, offsets };
      this.objStmCache.set(stmNum, entry);
    }
    const p = new Parser(entry.data, entry.first + entry.offsets[idx]);
    return p.parseObject();
  }

  /** Follow references until a direct value. */
  resolve(v) {
    let guard = 0;
    while (v instanceof PdfRef) {
      if (++guard > 32) {
        throw new Error('PDF: reference chain too deep');
      }
      v = this.getObject(v.num);
    }
    return v;
  }

  /** Decoded stream bytes. Unsupported filters throw. */
  streamData(stm) {
    stm = this.resolve(stm);
    if (!(stm instanceof PdfStream)) {
      throw new Error('PDF: expected a stream');
    }
    if (stm.decoded === undefined) {
      stm.decoded = applyFilters(stm.raw, stm.dict, this.resolve);
    }
    return stm.decoded;
  }

  collectPages(node, inherited) {
    const kids = this.resolve(node.get('Kids'));
    const inh = new Map(inherited);
    for (const k of ['Resources', 'MediaBox', 'CropBox', 'Rotate']) {
      if (node.has(k)) {
        inh.set(k, node.get(k));
      }
    }
    if (isName(this.resolve(node.get('Type')), 'Pages') || kids) {
      for (const kid of kids ?? []) {
        this.collectPages(this.resolve(kid), inh);
      }
      return;
    }
    const attrs = new Map(inh);
    for (const [k, v] of node) {
      attrs.set(k, v);
    }
    this.pages.push(attrs);
  }
}
