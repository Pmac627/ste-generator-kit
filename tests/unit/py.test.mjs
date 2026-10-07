// _py.mjs: Python 3 behaviors. Expected values were produced by CPython 3.12
// (tests/tools/crosscheck_synthetic.py re-checks them against a live interpreter).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pyRound, isUpper, strip, lstrip, stripChars, cmpCodePoint, dumps } from '../../extract/_py.mjs';
import { PY_CASES, BOM } from '../helpers/cases.mjs';

test('round(x): half to even, and Math.round would differ', () => {
  assert.deepEqual(
    PY_CASES.round0.map((x) => pyRound(x)),
    [0, 2, 2, 0, -2, 2, 30, 32, 12, 12, 1000000000000000],
  );
});

test('round(x, n): exact binary value, ties to even', () => {
  assert.deepEqual(
    PY_CASES.round1.map(([x, n]) => pyRound(x, n)),
    [87.2, 87.3, 0.1, 0.2, -0.2, 136, 2.67],
  );
  assert.throws(() => pyRound(NaN), TypeError);
});

test('str.isupper()', () => {
  assert.deepEqual(PY_CASES.isupper.map(isUpper), [true, true, true, false, false, false, false, true, true, true, false, true]);
});

test('str.strip() uses Python whitespace, not JS whitespace', () => {
  assert.deepEqual(PY_CASES.strip.map(strip), ['a b', 'a', 'a', `${BOM}a${BOM}`, 'a', 'a']);
  assert.equal(lstrip('  a  '), 'a  ');
  assert.equal(stripChars(',,a,b,,', ',', 'right'), ',,a,b');
  assert.equal(stripChars('..a..', '.', 'left'), 'a..');
  assert.equal(stripChars('-a-', '-'), 'a');
});

test('sorted() order is by code point', () => {
  assert.deepEqual([...PY_CASES.sort].sort(cmpCodePoint), ['', 'B', 'a', 'aa', 'b', '\uffff', '\ud83d\ude00']);
});

test('json.dumps formatting: indent, ensure_ascii, floats, empty containers, Map order', () => {
  const [obj, arr] = PY_CASES.json;
  assert.equal(
    dumps(obj, { indent: 1, ensureAscii: false }),
    '{\n "a": [\n  1,\n  2.5,\n  [],\n  {}\n ],\n "b": "é\x7f\\u001f\\"\\\\",\n "c": null,\n "d": true,\n "e": 1e-07,\n "f": 15000000000000000,\n "g": 0.0001\n}',
  );
  assert.equal(dumps(arr, { indent: 0 }), '[\n"\\u2028",\n"\\ud83d\\ude00",\n"x"\n]');
  assert.equal(dumps({ a: 'é\x7f' }), '{"a": "\\u00e9\\u007f"}');
  assert.equal(
    dumps(
      new Map([
        ['2', 1],
        ['1', 2],
        [null, 3],
      ]),
    ),
    '{"2": 1, "1": 2, "null": 3}',
  );
  assert.equal(dumps([1.5e-5, 1e16 + 2, 0.1]), '[1.5e-05, 10000000000000002, 0.1]');
});
