// _words.mjs: pdfplumber 0.11 extract_words / extract_text semantics on hand-made chars.
// tests/tools/crosscheck_synthetic.py confirms these expectations against pdfplumber itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractWords, extractText } from '../../extract/_words.mjs';
import { WORD_CASES, BOM } from '../helpers/cases.mjs';

const texts = (chars, extra) => extractWords(chars, extra).map((w) => w.text);

test('x_tolerance: a gap of exactly 3 joins, above 3 splits', () => {
  assert.deepEqual(texts(WORD_CASES.tolerance), ['ab', 'c']);
});

test('extra attrs: a font change splits a word only when fontname is requested', () => {
  assert.deepEqual(texts(WORD_CASES.fonts), ['abc']);
  assert.deepEqual(
    extractWords(WORD_CASES.fonts, ['fontname']).map((w) => [w.text, w.fontname]),
    [
      ['a', 'Sans'],
      ['b', 'Sans-Bold'],
      ['c', 'Sans'],
    ],
  );
});

test('lines cluster by top, chars sort by x0, word box is the union', () => {
  assert.deepEqual(
    extractWords(WORD_CASES.lines).map((x) => [x.text, x.x0, x.x1, x.top, x.bottom]),
    [
      ['ab', 0, 10, 100, 112.5],
      ['c', 0, 5, 106, 116],
    ],
  );
});

test('chars sort by x0 within a line before word breaks are decided', () => {
  assert.deepEqual(texts(WORD_CASES.overlap), ['ba']);
});

test('ligatures expand and Python isspace() decides word breaks', () => {
  assert.deepEqual(texts(WORD_CASES.unicode), ['fix', `y${BOM}z`, 'w']);
});

test('an empty-text char becomes its own word', () => {
  assert.deepEqual(texts(WORD_CASES.empty), ['a', '', 'b']);
});

test('extractText: one line per top cluster, words joined by one space', () => {
  assert.equal(extractText(WORD_CASES.text), 'a d\nc b');
  assert.equal(extractText([]), '');
});

test('rejects bad input', () => {
  assert.throws(() => extractWords(null), TypeError);
  assert.throws(() => extractWords([{ ...WORD_CASES.empty[0], upright: false }]), /non-upright/);
});
