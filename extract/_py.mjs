// Python 3 behaviors the extraction relies on that differ in JavaScript: round(), str.isupper(),
// str.strip() and re's Unicode \s, code-point string sorting, and json.dump formatting.

import { writeFileSync } from 'node:fs';

// Characters for which Python str.isspace() is true; also what re's \s matches in str patterns.
const WS_CHARS = String.fromCodePoint(9, 10, 11, 12, 13, 0x1c, 0x1d, 0x1e, 0x1f, 0x20, 0x85, 0xa0, 0x1680, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000);

/** Regex source for one Python whitespace character (use with the 'u' flag). */
export const S = `[${WS_CHARS}\\u2000-\\u200a]`;

const LEAD_WS = new RegExp(`^${S}+`, 'u');
const TRAIL_WS = new RegExp(`${S}+$`, 'u');

/** str.strip() with no argument. */
export function strip(s) {
  return s.replace(LEAD_WS, '').replace(TRAIL_WS, '');
}

/** str.lstrip() with no argument. */
export function lstrip(s) {
  return s.replace(LEAD_WS, '');
}

/** str.strip(chars) / lstrip / rstrip with an explicit character set. */
export function stripChars(s, chars, side = 'both') {
  const set = new Set([...chars]);
  const cps = [...s];
  let i = 0;
  let j = cps.length;
  if (side !== 'right') {
    while (i < j && set.has(cps[i])) {
      i++;
    }
  }
  if (side !== 'left') {
    while (j > i && set.has(cps[j - 1])) {
      j--;
    }
  }
  return cps.slice(i, j).join('');
}

const LOWER_OR_TITLE = /[\p{Lowercase}\p{Lt}]/u;
const UPPER = /\p{Uppercase}/u;

/** str.isupper(): at least one cased character and no lowercase or titlecase character. */
export function isUpper(s) {
  return !LOWER_OR_TITLE.test(s) && UPPER.test(s);
}

/**
 * round(x) and round(x, n) for floats: round half to even on the exact binary value.
 * With n omitted the result is an integer, as in Python.
 */
export function pyRound(x, n = 0) {
  if (typeof x !== 'number' || !Number.isFinite(x)) {
    throw new TypeError(`pyRound: expected a finite number, got ${x}`);
  }
  const neg = x < 0;
  const exact = Math.abs(x).toFixed(100);
  const [ip, fp] = exact.split('.');
  const keep = ip + fp.slice(0, n);
  const rest = fp.slice(n);
  let digits = BigInt(keep);
  const first = rest.charCodeAt(0) - 48;
  const tail = /[1-9]/.test(rest.slice(1));
  if (first > 5 || (first === 5 && (tail || digits % 2n === 1n))) {
    digits += 1n;
  }
  let str = digits.toString().padStart(n + 1, '0');
  if (n > 0) {
    str = `${str.slice(0, -n)}.${str.slice(-n)}`;
  }
  const v = Number(str);
  // round(x) returns an int, which has no negative zero; round(x, n) returns a float, which does.
  return neg && (v !== 0 || n > 0) ? -v : v;
}

/** sorted() order for strings: by code point, not UTF-16 unit. */
export function cmpCodePoint(a, b) {
  const A = [...a];
  const B = [...b];
  for (let i = 0; i < Math.min(A.length, B.length); i++) {
    const d = A[i].codePointAt(0) - B[i].codePointAt(0);
    if (d !== 0) {
      return d;
    }
  }
  return A.length - B.length;
}

// ---------- json.dump ----------

function floatRepr(n) {
  if (Number.isInteger(n)) {
    // Python prints an int here when the value was an int; integral floats are a known difference (see tests/PARITY.md).
    return String(n);
  }
  const [mant, expStr] = n.toExponential().split('e');
  const exp = Number(expStr);
  if (exp >= -4 && exp < 16) {
    return String(n);
  }
  return `${mant}e${exp < 0 ? '-' : '+'}${String(Math.abs(exp)).padStart(2, '0')}`;
}

function strRepr(s, ensureAscii) {
  const j = JSON.stringify(s);
  if (!ensureAscii) {
    return j;
  }
  let out = '';
  for (let i = 0; i < j.length; i++) {
    const c = j.charCodeAt(i);
    // Python escapes everything outside printable ASCII 0x20-0x7e (JSON.stringify already escaped < 0x20).
    out += c > 0x7e ? `\\u${c.toString(16).padStart(4, '0')}` : j[i];
  }
  return out;
}

/**
 * json.dumps(value, indent=indent, ensure_ascii=ensureAscii). Objects and Maps keep insertion order;
 * use a Map where keys look like integers, because plain objects reorder those.
 */
export function dumps(value, { indent = null, ensureAscii = true } = {}) {
  const nl = indent === null ? '' : '\n';
  const itemSep = indent === null ? ', ' : ',';
  const pad = (lvl) => (indent === null ? '' : ' '.repeat(indent * lvl));
  const enc = (v, lvl) => {
    if (v === null || v === undefined) {
      return 'null';
    }
    if (v === true) {
      return 'true';
    }
    if (v === false) {
      return 'false';
    }
    if (typeof v === 'number') {
      return floatRepr(v);
    }
    if (typeof v === 'string') {
      return strRepr(v, ensureAscii);
    }
    if (Array.isArray(v)) {
      if (!v.length) {
        return '[]';
      }
      return `[${nl}${v.map((x) => pad(lvl + 1) + enc(x, lvl + 1)).join(itemSep + nl)}${nl}${pad(lvl)}]`;
    }
    const entries = v instanceof Map ? [...v.entries()] : Object.entries(v);
    if (!entries.length) {
      return '{}';
    }
    const items = entries.map(([k, x]) => `${pad(lvl + 1)}${strRepr(k === null ? 'null' : String(k), ensureAscii)}: ${enc(x, lvl + 1)}`);
    return `{${nl}${items.join(itemSep + nl)}${nl}${pad(lvl)}}`;
  };
  return enc(value, 0);
}

/** json.dump to a UTF-8 file (no trailing newline, as Python writes it). */
export function dumpFile(path, value, opts) {
  writeFileSync(path, dumps(value, opts), 'utf8');
}
