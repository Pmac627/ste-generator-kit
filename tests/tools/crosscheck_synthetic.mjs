// Write the synthetic test cases and the Node results to a directory, for crosscheck_synthetic.py.
// Usage: node tests/tools/crosscheck_synthetic.mjs <out_dir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PdfDocument } from '../../extract/_pdf.mjs';
import { pageObjects } from '../../extract/_layout.mjs';
import { extractWords, extractText } from '../../extract/_words.mjs';
import { onePage } from '../helpers/mkpdf.mjs';
import { PDF_CASES, WORD_CASES, PY_CASES } from '../helpers/cases.mjs';
import { pyRound, isUpper, strip, dumps, cmpCodePoint } from '../../extract/_py.mjs';

const out = process.argv[2];
if (!out) {
  console.error('usage: node tests/tools/crosscheck_synthetic.mjs <out_dir>');
  process.exit(2);
}
mkdirSync(out, { recursive: true });

const pdfs = {};
for (const [name, [content, opts]] of Object.entries(PDF_CASES)) {
  const buf = onePage(content, opts);
  writeFileSync(join(out, `${name}.pdf`), buf);
  const p = pageObjects(new PdfDocument(buf), 1);
  pdfs[name] = {
    chars: p.chars.map((c) => [c.text, c.x0, c.x1, c.top, c.bottom, c.fontname, c.size]),
    rects: p.rects.map((r) => [r.x0, r.x1, r.top, r.height]),
    curves: p.curves.map((r) => [r.x0, r.x1, r.top]),
  };
}

const words = {};
for (const [name, chars] of Object.entries(WORD_CASES)) {
  words[name] = {
    chars,
    plain: extractWords(chars).map((w) => [w.text, w.x0, w.x1, w.top, w.bottom]),
    fontname: extractWords(chars, ['fontname']).map((w) => [w.text, w.fontname]),
    text: extractText(chars),
  };
}
const py = {
  cases: PY_CASES,
  round0: PY_CASES.round0.map((x) => pyRound(x)),
  round1: PY_CASES.round1.map(([x, n]) => pyRound(x, n)),
  isupper: PY_CASES.isupper.map(isUpper),
  strip: PY_CASES.strip.map(strip),
  json_indent1: PY_CASES.json.map((v) => dumps(v, { indent: 1, ensureAscii: false })),
  json_indent0_ascii: PY_CASES.json.map((v) => dumps(v, { indent: 0 })),
  json_compact: PY_CASES.json.map((v) => dumps(v, { ensureAscii: false })),
  sort: [...PY_CASES.sort].sort(cmpCodePoint),
};
writeFileSync(join(out, 'node.json'), JSON.stringify({ pdfs, words, py }));
console.log(`wrote ${Object.keys(pdfs).length} PDFs and ${Object.keys(words).length} word cases to ${out}`);
