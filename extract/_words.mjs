// pdfplumber 0.11 extract_words / extract_text (non-layout) over chars from _layout.mjs.
// Defaults only: x_tolerance 3, y_tolerance 3, keep_blank_chars False, use_text_flow False,
// split_at_punctuation False, expand_ligatures True, horizontal left-to-right text.

import { LIGATURES } from './_pdf_tables.mjs';

const TOL = 3;

// Python str.isspace(): differs from JS \s (adds 0x1c-0x1f and 0x85, drops U+FEFF).
const PY_SPACE = new RegExp('^[' + String.fromCodePoint(9, 10, 11, 12, 13, 0x1c, 0x1d, 0x1e, 0x1f, 0x20, 0x85, 0xa0, 0x1680, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000) + '\u2000-\u200a]+$', 'u');

function pyIsSpace(s) {
  return PY_SPACE.test(s);
}

/** pdfplumber cluster_objects(xs, key, tolerance), preserve_order False. */
function clusterObjects(xs, key, tolerance) {
  const values = [...new Set(xs.map(key))].sort((a, b) => a - b);
  const idx = new Map();
  let group = 0;
  let last = values[0];
  for (const v of values) {
    if (v > last + tolerance) {
      group++;
    }
    idx.set(v, group);
    last = v;
  }
  const tagged = xs.map((x) => [x, idx.get(key(x))]);
  tagged.sort((a, b) => a[1] - b[1]);
  const out = [];
  let prev = null;
  for (const [x, g] of tagged) {
    if (g !== prev) {
      out.push([]);
      prev = g;
    }
    out[out.length - 1].push(x);
  }
  return out;
}

function beginsNewWord(prev, cur) {
  return cur.x0 < prev.x0 || cur.x0 > prev.x1 + TOL || Math.abs(cur.top - prev.top) > TOL;
}

function mergeChars(chars, extraAttrs) {
  let x0 = Infinity;
  let top = Infinity;
  let x1 = -Infinity;
  let bottom = -Infinity;
  for (const c of chars) {
    x0 = Math.min(x0, c.x0);
    top = Math.min(top, c.top);
    x1 = Math.max(x1, c.x1);
    bottom = Math.max(bottom, c.bottom);
  }
  const w = {
    text: chars.map((c) => LIGATURES.get(c.text) ?? (c.text || '')).join(''),
    x0,
    x1,
    top,
    bottom,
    upright: chars[0].upright,
  };
  for (const k of extraAttrs) {
    w[k] = chars[0][k];
  }
  return w;
}

function* lineChars(chars) {
  for (const line of clusterObjects(chars, (c) => c.top, TOL)) {
    yield [...line].sort((a, b) => a.x0 - b.x0);
  }
}

function* charsToWords(line) {
  let cur = [];
  for (const c of line) {
    if (pyIsSpace(c.text)) {
      if (cur.length) {
        yield cur;
      }
      cur = [];
    } else if (c.text === '') {
      // Python: '' in '' is True, so an empty char is "punctuation" and becomes its own word.
      if (cur.length) {
        yield cur;
      }
      yield [c];
      cur = [];
    } else if (cur.length && beginsNewWord(cur[cur.length - 1], c)) {
      yield cur;
      cur = [c];
    } else {
      cur.push(c);
    }
  }
  if (cur.length) {
    yield cur;
  }
}

/**
 * pdfplumber Page.extract_words(extra_attrs=...).
 * @param {object[]} chars page chars in content order
 * @param {string[]} extraAttrs e.g. ['fontname'] or ['fontname', 'size']
 * @see ../docs/flows/pdf-read.md
 */
export function extractWords(chars, extraAttrs = []) {
  if (!Array.isArray(chars)) {
    throw new TypeError('extractWords: chars must be an array');
  }
  const keyOf = (c) => [c.upright, ...extraAttrs.map((k) => c[k])];
  const words = [];
  let i = 0;
  while (i < chars.length) {
    const k = keyOf(chars[i]);
    let j = i + 1;
    while (j < chars.length && keyOf(chars[j]).every((v, n) => v === k[n])) {
      j++;
    }
    if (!chars[i].upright) {
      throw new Error('extractWords: non-upright text is not supported');
    }
    for (const line of lineChars(chars.slice(i, j))) {
      for (const wc of charsToWords(line)) {
        words.push(mergeChars(wc, extraAttrs));
      }
    }
    i = j;
  }
  return words;
}

/** pdfplumber Page.extract_text() with layout=False: lines by top cluster, words joined by one space. */
export function extractText(chars) {
  const words = extractWords(chars);
  if (!words.length) {
    return '';
  }
  const sorted = [...words].sort((a, b) => a.top - b.top);
  return clusterObjects(sorted, (w) => w.top, TOL)
    .map((line) => [...line].sort((a, b) => a.x0 - b.x0).map((w) => w.text).join(' '))
    .join('\n');
}
