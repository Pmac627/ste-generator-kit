// Synthetic cases shared by the unit tests and tests/tools/crosscheck_synthetic.* (which runs the
// same cases through pdfplumber to confirm the expected values). Invented content only.

const LIG_FI = String.fromCodePoint(0xfb01);
export const BOM = String.fromCodePoint(0xfeff);

/** A char at x0 with width w on a line at top, in font f. */
const ch = (text, x0, top = 100, w = 5, f = 'Sans') => ({ text, x0, x1: x0 + w, top, bottom: top + 10, upright: true, fontname: f, size: 10 });

/** Char lists for extract_words / extract_text. */
export const WORD_CASES = {
  // gap of exactly 3 joins, a gap above 3 splits (x_tolerance 3)
  tolerance: [ch('a', 0), ch('b', 8), ch('c', 16.0001)],
  // a font change splits a word only when fontname is an extra attribute
  fonts: [ch('a', 0), ch('b', 5, 100, 5, 'Sans-Bold'), ch('c', 10)],
  // lines cluster by top with tolerance 3; within a line chars sort by x0
  lines: [ch('b', 5, 102.5), ch('a', 0, 100), ch('c', 0, 106)],
  // chars are sorted by x0 within a line, so overlapping or out-of-order chars still join
  overlap: [ch('a', 10), ch('b', 4.9, 100.5)],
  // ligatures expand; Python isspace() includes \x1c and \x85 but not U+FEFF
  unicode: [ch(LIG_FI, 0), ch('x', 5), ch('\x1c', 10), ch('y', 15), ch(BOM, 20), ch('z', 25), ch('\x85', 30), ch('w', 35)],
  // an empty-text char is its own word ('' in '' is True in Python)
  empty: [ch('a', 0), ch('', 5), ch('b', 10)],
  // extract_text: one line per top cluster
  text: [ch('b', 30, 120), ch('a', 0, 100), ch('c', 0, 120), ch('d', 50, 101)],
};

/** [content stream, onePage options] for the interpreter. */
export const PDF_CASES = {
  simple: ['BT /F1 10 Tf 100 700 Td (AB) Tj ET'],
  objstm: ['BT /F1 10 Tf 100 700 Td (A) Tj ET', { objStm: true }],
  type0: ['BT /F2 12 Tf 100 700 Td <0001001B0002> Tj ET'],
  tw: ['BT /F1 10 Tf 5 Tw 100 700 Td (A B) Tj ET'],
  twcid: ['BT /F2 10 Tf 5 Tw 100 700 Td <000100200002> Tj ET'],
  afm: ['BT /F3 10 Tf 100 700 Td (A) Tj ET'],
  tj: ['BT /F1 10 Tf 2 Tc 200 Tz 3 Ts 100 700 Td [(A) -100 (B)] TJ ET'],
  q: ['BT /F1 10 Tf 100 700 Td q 50 0 Td (A) Tj Q (B) Tj ET'],
  td: ["q 1 0 0 1 10 0 cm BT /F1 10 Tf 100 700 TD (A) Tj 0 -20 TD (B) Tj T* (C) Tj (D) ' ET Q"],
  form: ['/X1 Do BT /F1 10 Tf 100 700 Td (A) Tj ET', { form: { matrix: [1, 0, 0, 1, 0, -100], content: 'BT /F1 10 Tf 0 0 Td (Z) Tj ET' } }],
  paths: [
    [
      '10 10 100 1 re f', // rect
      '10 20 m 50 20 l 50 30 l 10 30 l h f', // mlllh rect
      '10 40 m 50 40 l 50 50 l 10 45 l h f', // not square: curve
      '10 60 m 20 70 l S', // line: neither
      '10 100 m 20 100 l 20 110 l 10 110 l h 30 100 m 40 100 l 40 110 l 30 110 l h f', // two rects
      '60 10 m 70 10 l 70 20 l 60 20 l 60 10 l h S', // mllllh -> mlllh rect
      '80 10 m 90 10 90 20 80 20 c f', // curve
      '0 0 600 800 re W n', // clip only: not painted
    ].join('\n'),
  ],
};

/** Inputs for the Python-behavior helpers in _py.mjs; expected values come from CPython (crosscheck_synthetic.py). */
export const PY_CASES = {
  round0: [0.5, 1.5, 2.5, -0.5, -2.5, 2.4999999999999996, 30.5, 31.5, 12.04, 11.5, 1e15 + 0.5],
  round1: [
    [87.25, 1],
    [87.35, 1],
    [0.15, 1],
    [0.25, 1],
    [-0.25, 1],
    [136.04999999999998, 1],
    [2.675, 2],
  ],
  isupper: ['ABC', 'AB-C', 'A1', '123', '', 'Abc', 'ǅ', 'ÀÉ', 'ΣΑ', 'ABC...', 'ﬁ', 'ⅫA'],
  strip: ['  a b  ', '\x1ca\x1f', '\x85a\x85', `${BOM}a${BOM}`, '\u3000a\u2028', '\ta\n'],
  json: [
    { a: [1, 2.5, [], {}], b: 'é\x7f\x1f"\\', c: null, d: true, e: 1e-7, f: 1.5e16, g: 0.0001 },
    ['\u2028', '\ud83d\ude00', 'x'],
  ],
  sort: ['b', 'a', 'B', '\ud83d\ude00', '\uffff', 'aa', ''],
};
