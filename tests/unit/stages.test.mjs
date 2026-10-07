// The five stages end to end on an invented two-page "dictionary" and three-page "rulebook" laid out
// like Issue 9 (no ASD content). Includes .5 ties where Python round() and Math.round() disagree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PdfDocument } from '../../extract/_pdf.mjs';
import { parseDict, groupLines } from '../../extract/parse_dict.mjs';
import { structureDict, parseCol1 } from '../../extract/structure_dict.mjs';
import { parseRules } from '../../extract/parse_rules.mjs';
import { structureRules, toBlocks } from '../../extract/structure_rules.mjs';
import { generate, mdBlocks } from '../../extract/generate.mjs';
import { buildDoc } from '../helpers/mkpdf.mjs';
import { DICT_PAGES, RULE_PAGES } from '../helpers/fixture_pages.mjs';

const doc = new PdfDocument(buildDoc([...DICT_PAGES, ...RULE_PAGES]));
const dict = parseDict(doc, { first: 1, last: 2 });
const entries = structureDict(dict.merged);
const rules = parseRules(doc, { first: 3, last: 5 });
const structured = structureRules(rules.data);

test('parse_dict: regions, continuation merge, and counts', () => {
  assert.deepEqual(dict.log, ['regions 5 entries after merge 4', 'approved (uppercase headword): 2  unapproved: 2']);
  assert.deepEqual(dict.merged[2].pages, [1, 2]);
  assert.equal(dict.merged[2].col2[1].top, 95 + 10000, 'continuation blocks shift by 10000 per page');
});

test('structure_dict: headwords, forms, meanings, help, examples, alternatives', () => {
  assert.deepEqual(entries.log, ['4 entries; 2 approved']);
  assert.deepEqual(entries.entries, [
    {
      word: 'TEST',
      pos: 'v',
      approved: true,
      page: '2-1-T0',
      forms: ['TESTS', 'TESTED'],
      meanings: [
        { meaning: 'To try something', help: ['Use it gently'], ste_examples: ['Test the unit.'] },
        { meaning: 'To check', ste_examples: ['Test the valve.'], non_ste_examples: ['Examine the valve.'] },
      ],
    },
    {
      word: 'attempt',
      pos: 'v',
      approved: false,
      page: '2-1-T0',
      alternatives: [{ alternative: 'TRY (v)', help: ['Use TRY.'], ste_examples: ['Try again.'], non_ste_examples: ['Attempt again. A1 B2'] }],
    },
    { word: 'examine', pos: 'v', approved: false, page: '2-1-T0', alternatives: [{ alternative: 'TEST (v)', help: ['Continued help.'] }] },
    { word: 'ZERO', pos: 'n', approved: true, page: '2-1-T1', meanings: [{ meaning: 'Nothing.' }] },
  ]);
});

test('structure_dict: approval follows Python isupper(), so a headword without letters is not approved', () => {
  const raw = (head) => ({ label: 'x', col1: [head], col2: [{ top: 1, last_top: 1, x0: 160, help: false, text: 'ALT (n)' }], col3: [], col4: [] });
  const { entries: es } = structureDict([raw('2024 (n)'), raw('A4 (n)'), raw('a... (n)')]);
  assert.deepEqual(
    es.map((e) => [e.word, e.approved]),
    [
      ['2024', false],
      ['A4', true],
      ['a...', false],
    ],
  );
});

test('generate: approved-wordforms.txt sorts by code point, not UTF-16 unit', () => {
  const work = mkdtempSync(join(tmpdir(), 'ste-gen-'));
  try {
    const D = [{ word: 'A', pos: 'n', approved: true, page: 'x', forms: ['￿', '😀', 'b'], meanings: [] }];
    generate(structured.data, D, work);
    assert.equal(readFileSync(join(work, 'pack', 'dictionary', 'approved-wordforms.txt'), 'utf8'), 'a\nb\n￿\n😀\n');
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test('parse_dict groupLines: a label slightly off its line stays at the start of the line', () => {
  const cols = [
    [42, 157],
    [157, 287],
  ];
  const w = (text, x0, top) => ({ text, x0, x1: x0 + 10, top, bottom: top + 10, fontname: 'TestSans' });
  // Tops 168.98 and 168.25 round to different integers; the Python kit wrote "To move 2. on".
  const lines = groupLines([w('To', 178, 168.25), w('move', 193.9, 168.25), w('2.', 158.4, 168.98), w('on', 178, 180.25)], cols);
  assert.deepEqual(
    lines.map((l) => [l.text, l.top]),
    [
      ['2. To move', 168.98],
      ['on', 180.25],
    ],
  );
});

test('structure_dict: column 1 parsing', () => {
  assert.deepEqual(parseCol1(['BE (v)', '(also ARE, WERE) IS, WAS only']), { head: 'BE', pos: 'v', forms: ['ARE', 'WERE', 'IS', 'WAS'], notes: ['only'] });
  assert.deepEqual(parseCol1(['little (a little),', '(adj)']), { head: 'little (a little)', pos: 'adj', forms: [], notes: [] });
  assert.throws(() => parseCol1(['no tag']), /no part of speech/);
});

test('parse_rules: summary statements, subtitles, section intro, blank pages', () => {
  assert.deepEqual(rules.log, ['statements 3 rules with bodies 3 order ok: True', 'missing bodies []', "{'1': 1}"]);
  assert.deepEqual(rules.data.statements, { 1.2: 'Use approved words', 1.5: 'Name tools with technical nouns - as given in the list', '1.12': 'Name actions with technical verbs' });
  assert.deepEqual(rules.data.subtitles, { 1.2: 'Basics', 1.5: 'Tools', '1.12': 'Actions' });
  assert.deepEqual([...rules.data.section_titles], [['1', 'Words']]);
  assert.equal(rules.data.section_intro.get('1')[0].text, 'Intro text for the section.');
});

test('structure_rules: block kinds, help join, example pairs with alternatives and notes', () => {
  const [r12, r15, r112] = structured.data.rules;
  assert.deepEqual(r12.blocks, [{ kind: 'para', text: 'Write simple words.' }]);
  assert.deepEqual(r15.blocks, [
    { kind: 'heading', text: '1. Tools' },
    { kind: 'para', text: 'Things that you hold.' },
    { kind: 'list', text: 'hammer, saw,\ndrill' },
    { kind: 'help', text: 'Use the tool name. Not a brand.' },
    { kind: 'examples', text: '', pairs: [{ non_ste: 'Apply the hammer.', ste: ['Hit it with the hammer.', 'Use the hammer.'], notes: ['(simple)'] }] },
  ]);
  assert.deepEqual(
    r112.blocks.map((b) => [b.kind, b.text]),
    [
      ['topic', 'Verb topic'],
      ['heading', '1. Movement'],
      ['para', 'Verbs for motion.'],
      ['list', 'shift, slide'],
      ['para', 'End of list.'],
      ['list', 'Bold aside\nBold continuation'],
    ],
  );
  assert.equal(r15.topic, 'Tools');
  assert.equal(r15.section_title, 'Words');
});

test('structure_rules: example folding edge cases', () => {
  const L = (text, indent = 0) => ({ text, indent, bold: false, icon: false });
  assert.deepEqual(toBlocks([L('STE: one.'), L('STE: two.'), L('Non-STE: bad.'), L('STE: good.')])[0].pairs, [{ ste: ['one.'] }, { ste: ['two.'] }, { non_ste: 'bad.', ste: ['good.'] }]);
  assert.deepEqual(toBlocks([L('Non-STE: only.')])[0].pairs, [{ non_ste: 'only.', ste: [] }]);
});

test('generate: pack files, categories, None topics, and code-point sort', () => {
  const work = mkdtempSync(join(tmpdir(), 'ste-gen-'));
  try {
    const { log } = generate(structured.data, entries.entries, work);
    assert.deepEqual(log.slice(0, 2), ['TN cats 1 TV cats 1', 'approved 2 unapproved 2 forms 4']);
    const read = (rel) => readFileSync(join(work, 'pack', rel), 'utf8');
    assert.deepEqual(JSON.parse(read('rules/technical-categories.json')), {
      technical_noun_categories: [{ number: 1, title: 'Tools', description: 'Things that you hold.', examples: ['hammer', 'saw', 'drill'], help: ['Use the tool name. Not a brand.'] }],
      technical_verb_categories: [{ number: 1, title: 'Movement', description: 'Verbs for motion. End of list.', examples: ['shift', 'slide', 'Bold aside', 'Bold continuation'], help: [] }],
    });
    assert.equal(read('dictionary/approved-words.json'), '[\n{\n"word": "TEST",\n"pos": "v",\n"forms": [\n"TESTS",\n"TESTED"\n],\n"meanings": [\n"To try something",\n"To check"\n],\n"help": [\n"Use it gently"\n]\n},\n{\n"word": "ZERO",\n"pos": "n",\n"meanings": [\n"Nothing."\n]\n}\n]');
    assert.deepEqual(JSON.parse(read('dictionary/unapproved-words.json')), [
      { word: 'attempt', pos: 'v', alternatives: ['TRY (v)'], help: ['Use TRY.'] },
      { word: 'examine', pos: 'v', alternatives: ['TEST (v)'], help: ['Continued help.'] },
    ]);
    assert.equal(read('dictionary/approved-wordforms.txt'), 'test\ntested\ntests\nzero\n');
    assert.match(read('rules/ste-rules-summary.md'), /\n## Section 1: Words\n\n\n\*\*Basics\*\*\n\n- \*\*Rule 1\.2\*\*: Use approved words\n\n\*\*Tools\*\*\n\n- \*\*Rule 1\.5\*\*: Name tools with technical nouns\n {2}- as given in the list\n/);
    assert.match(read('rules/index.md'), /\| 1 Words \| `section-1-words\.md` \| 1\.2, 1\.5, 1\.12 \|/);
    assert.match(read('rules/section-1-words.md'), /^<!-- Derived from ASD-STE100/);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test('generate: a rule without a topic renders as None, like a Python f-string', () => {
  const work = mkdtempSync(join(tmpdir(), 'ste-gen-'));
  try {
    const R = structuredClone(structured.data);
    R.rules[2].topic = null;
    generate(R, entries.entries, work);
    const sec = readFileSync(join(work, 'pack', 'rules', 'section-1-words.md'), 'utf8');
    assert.match(sec, /## Rule 1\.12: None\n/);
    assert.match(readFileSync(join(work, 'pack', 'rules', 'ste-rules-summary.md'), 'utf8'), /\*\*None\*\*/);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test('mdBlocks renders every block kind', () => {
  const md = mdBlocks([
    { kind: 'topic', text: 'T' },
    { kind: 'label', text: 'L:' },
    { kind: 'help', text: 'a\nb' },
    { kind: 'list', text: 'x\ny' },
    { kind: 'examples', text: '', pairs: [{ non_ste: 'n', ste: [] }, { ste: ['s'], notes: ['(z)'] }] },
  ]);
  assert.equal(md, '\n### T\n\n\n*L:*\n\n> **Help:** a\n> b\n\n    x\n    y\n\n\n| Not STE | STE |\n|---|---|\n| Non-STE: n | (STE rewrite follows the explanation below) |\n| | STE: s (z) |\n');
});
