// _pdf.mjs and _layout.mjs on synthetic PDFs. Expected values follow pdfminer.six 20260107 arithmetic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PdfDocument } from '../../extract/_pdf.mjs';
import { pageObjects } from '../../extract/_layout.mjs';
import { onePage } from '../helpers/mkpdf.mjs';
import { PDF_CASES } from '../helpers/cases.mjs';

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ''} ${a} != ${b}`);
const page = (content, opts) => pageObjects(new PdfDocument(onePage(content, opts)), 1);
const kase = (name) => page(...PDF_CASES[name]);

test('simple font: char boxes use Widths and FontDescriptor Descent', () => {
  const { chars } = kase('simple');
  assert.deepEqual(
    chars.map((c) => [c.text, c.x0, c.x1, c.top, c.bottom, c.fontname, c.size, c.upright]),
    [
      ['A', 100, 105, 92, 102, 'TestSans-Bold', 10, true],
      ['B', 105, 110, 92, 102, 'TestSans-Bold', 10, true],
    ],
  );
});

test('object streams resolve the same as top-level objects', () => {
  const { chars } = kase('objstm');
  assert.equal(chars[0].fontname, 'TestSans-Bold');
  assert.equal(chars[0].x1, 105);
});

test('Type0 Identity-H font: 2-byte codes, W widths, ToUnicode bfrange and bfchar, positive Descent forced negative', () => {
  const { chars } = kase('type0');
  assert.deepEqual(
    chars.map((c) => c.text),
    ['a', ' ', 'b'],
  );
  near(chars[0].x1 - chars[0].x0, 7.2, 'width');
  near(chars[0].bottom, 800 - (700 - 3.6), 'bottom');
  assert.equal(chars[0].fontname, 'TestCid');
});

test('Type0 font ignores Tw (multibyte), simple font applies Tw after a space', () => {
  const simple = kase('tw').chars;
  assert.equal(simple[2].x0, 115);
  const cid = kase('twcid').chars;
  assert.equal(cid[1].text, '(cid:32)', 'no ToUnicode entry');
  near(cid[2].x0, 116);
});

test('BaseFont Helvetica uses the built-in AFM metrics, not the PDF Widths or descriptor', () => {
  const [a] = kase('afm').chars;
  assert.equal(a.fontname, 'Helvetica');
  near(a.x1 - a.x0, 6.67, 'AFM width of A is 667');
  near(a.bottom, 800 - (700 - 2.07), 'AFM descent -207');
});

test('TJ kerning, Tc, Tz, and Ts', () => {
  const [a, b] = kase('tj').chars;
  near(a.x1 - a.x0, 10, 'Tz doubles the advance');
  near(b.x0, 100 + 10 + 2 + 4, 'advance + kerning (100 * 0.001 * 10 * 2) + Tc * scaling');
  near(a.bottom, 800 - (700 + 3 - 2), 'rise lifts the box');
});

test('Q restores the whole text state, including the text matrix (pdfminer behavior)', () => {
  const { chars } = kase('q');
  assert.equal(chars[0].x0, 150);
  assert.equal(chars[1].x0, 100);
});

test('cm, TD sets leading, T* and the quote operator move down', () => {
  const { chars } = kase('td');
  assert.deepEqual(
    chars.map((c) => [c.text, c.x0, c.top]),
    [
      ['A', 110, 92],
      ['B', 110, 112],
      ['C', 110, 132],
      ['D', 110, 152],
    ],
  );
});

test('a Form XObject leaves the device CTM as the form set it (pdfminer behavior)', () => {
  const { chars } = kase('form');
  assert.deepEqual(
    chars.map((c) => [c.text, c.top]),
    [
      ['Z', 792 + 100],
      ['A', 192],
    ],
  );
});

test('paths: rects, curves, ignored lines, multi-subpath split, redundant closing l', () => {
  const { rects, curves } = kase('paths');
  assert.deepEqual(
    rects.map((r) => [r.x0, r.x1, r.top, r.height]),
    [
      [10, 110, 789, 1],
      [10, 50, 770, 10],
      [10, 20, 690, 10],
      [30, 40, 690, 10],
      [60, 70, 780, 10],
    ],
  );
  assert.deepEqual(
    curves.map((c) => [c.x0, c.x1, c.top]),
    [
      [10, 50, 750],
      [80, 80, 780], // curve bounds use segment end points only, not control points
    ],
  );
});

test('fails fast on input it does not support', () => {
  assert.throws(() => new PdfDocument(Buffer.from('not a pdf')), /does not start with %PDF-/);
  assert.throws(() => new PdfDocument(Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\nxref\n0 1\n0000000000 65535 f \ntrailer<<>>\nstartxref\n27\n%%EOF\n')), /classic xref tables are not supported/);
  assert.throws(() => page('BI /W 1 /H 1 ID x EI'), /inline images are not supported/);
  assert.throws(() => page('BT /F9 10 Tf (A) Tj ET'), /undefined font/);
  assert.throws(() => pageObjects(new PdfDocument(onePage('')), 2), /out of range/);
});
