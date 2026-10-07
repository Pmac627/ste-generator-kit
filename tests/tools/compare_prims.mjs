// Compare Node primitives with the pdfplumber reference dump (values rounded to 3 dp there).
// Usage: python -I tests/tools/dump_prims.py <pdf> <prims.json>, then node tests/tools/compare_prims.mjs <pdf> <prims.json>
import { readFileSync } from 'node:fs';
import { PdfDocument } from '../../extract/_pdf.mjs';
import { pageObjects } from '../../extract/_layout.mjs';
import { extractWords, extractText } from '../../extract/_words.mjs';
const ref = JSON.parse(readFileSync(process.argv[3], 'utf8'));
const doc = new PdfDocument(process.argv[2]);
const close = (a, b) => Math.abs(a - b) <= 0.0006;
let bad = 0; const report = (p, what, a, b) => { if (bad++ < 25) console.log(`p${p} ${what}\n  node: ${JSON.stringify(a)}\n  ref:  ${JSON.stringify(b)}`); };
const t0 = Date.now();
for (const [p, r] of Object.entries(ref)) {
  const o = pageObjects(doc, Number(p));
  const w = extractWords(o.chars, ['fontname', 'size']).map(x => [x.text, x.x0, x.x1, x.top, x.bottom, x.fontname, x.size]);
  if (w.length !== r.words.length) report(p, `word count ${w.length} vs ${r.words.length}`, w.slice(0,3), r.words.slice(0,3));
  for (let i = 0; i < Math.min(w.length, r.words.length); i++) {
    const a = w[i], b = r.words[i];
    if (a[0] !== b[0] || a[5] !== b[5] || ![1,2,3,4,6].every(k => close(a[k], b[k]))) { report(p, `word ${i}`, a, b); break; }
  }
  const rc = o.rects.map(x => [x.x0, x.x1, x.top, x.height]);
  if (rc.length !== r.rects.length || rc.some((a, i) => !a.every((v, k) => close(v, r.rects[i][k])))) report(p, `rects ${rc.length} vs ${r.rects.length}`, rc.slice(0, 4), r.rects.slice(0, 4));
  const cv = o.curves.map(x => [x.x0, x.x1, x.top]);
  if (cv.length !== r.curves.length || cv.some((a, i) => !a.every((v, k) => close(v, r.curves[i][k])))) report(p, `curves ${cv.length} vs ${r.curves.length}`, cv.slice(0, 4), r.curves.slice(0, 4));
  const tx = extractText(o.chars);
  if (tx !== r.text) { const i = [...tx].findIndex((c, k) => c !== r.text[k]); report(p, `text differs at ${i}`, tx.slice(Math.max(0,i-40), i+40), r.text.slice(Math.max(0,i-40), i+40)); }
}
console.log('pages', Object.keys(ref).length, 'mismatches', bad, 'ms', Date.now() - t0);
