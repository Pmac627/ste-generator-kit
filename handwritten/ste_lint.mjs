#!/usr/bin/env node
// ste_lint.mjs: mechanical ASD-STE100 (Issue 9) checks against the extracted dictionary.
// Node port of ste_lint.py with the same findings and output. No dependencies.
//
// Hard (error) checks are the ones the standard makes mechanical. Heuristic checks are warnings.
// Usage:
//     node ste_lint.mjs FILE.md [--mode procedural|descriptive] [--json] [--allow FILE]
//     --mode       sets the sentence limit: procedural = 20 words (Rule 5.1), descriptive = 25 (Rule 6.3). Default: descriptive.
//     --allow      newline-separated technical nouns/verbs approved for your project (Rule 1.8). Case-insensitive.
//     --json       machine-readable output.
// Exit code 1 if any error, else 0. Exit code 2 on a usage error.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DICT = join(HERE, '..', 'dictionary');

// ---------- Python re / str semantics ----------

// Python str.isspace() and re's \s in str patterns.
const S = `[${String.fromCodePoint(9, 10, 11, 12, 13, 0x1c, 0x1d, 0x1e, 0x1f, 0x20, 0x85, 0xa0, 0x1680, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000)}\\u2000-\\u200a]`;
// Python's \w (str.isalnum() or "_") and \d (decimal digits).
const W = '[\\p{L}\\p{Nd}\\p{Nl}\\p{No}_]';
const D = '\\p{Nd}';
// Python's \b: JS \b is ASCII-only even with the u flag.
const B = `(?:(?<=${W})(?!${W})|(?<!${W})(?=${W}))`;
// Python's ^ under re.M matches only after "\n"; JS m-flag ^ also matches after \r, U+2028, U+2029.
const BOL = '(?:^|(?<=\\n))';

const re = (src, flags = '') => new RegExp(src, `u${flags}`);

function strip(s) {
  return s.replace(re(`^${S}+`), '').replace(re(`${S}+$`), '');
}

function stripChars(s, chars) {
  const cps = [...s];
  let i = 0;
  let j = cps.length;
  while (i < j && chars.includes(cps[i])) {
    i++;
  }
  while (j > i && chars.includes(cps[j - 1])) {
    j--;
  }
  return cps.slice(i, j).join('');
}

function cmpCodePoint(a, b) {
  const A = [...a];
  const Bs = [...b];
  for (let i = 0; i < Math.min(A.length, Bs.length); i++) {
    const d = A[i].codePointAt(0) - Bs[i].codePointAt(0);
    if (d !== 0) {
      return d;
    }
  }
  return A.length - Bs.length;
}

const sortedSet = (items) => [...new Set(items)].sort(cmpCodePoint);

/** json.dumps(findings, indent=1) with ensure_ascii=True. Values are strings only. */
function dumpFindings(findings) {
  const str = (s) => {
    // Escape every UTF-16 unit outside printable ASCII, as ensure_ascii does (JSON.stringify handled < 0x20).
    const j = JSON.stringify(s);
    let out = '';
    for (let i = 0; i < j.length; i++) {
      const c = j.charCodeAt(i);
      out += c > 0x7e ? `\\u${c.toString(16).padStart(4, '0')}` : j[i];
    }
    return out;
  };
  if (!findings.length) {
    return '[]';
  }
  const items = findings.map((f) => ` {\n${Object.entries(f).map(([k, v]) => `  ${str(k)}: ${str(v)}`).join(',\n')}\n }`);
  return `[\n${items.join(',\n')}\n]`;
}

// ---------- dictionary ----------

/** Load approved word forms, unapproved words, and unapproved multi-word phrases from the pack. */
export function load(dictDir = DICT) {
  const approved = JSON.parse(readFileSync(join(dictDir, 'approved-words.json'), 'utf8'));
  const unapproved = JSON.parse(readFileSync(join(dictDir, 'unapproved-words.json'), 'utf8'));
  const forms = new Set();
  for (const e of approved) {
    forms.add(e.word.toLowerCase());
    for (const f of e.forms ?? []) {
      forms.add(f.toLowerCase());
    }
    if (e.pos === 'n') {
      forms.add(e.word.toLowerCase() + 's'); // plurals permitted unless help says otherwise
      forms.add(e.word.toLowerCase() + 'es');
    }
  }
  const un = new Map();
  const phrases = new Map();
  for (const e of unapproved) {
    const w = e.word.toLowerCase();
    const target = w.includes(' ') ? phrases : un;
    if (!target.has(w)) {
      target.set(w, []);
    }
    target.get(w).push(e);
  }
  return { forms, un, phrases };
}

function stems(lt) {
  const out = [lt];
  const n = [...lt].length;
  for (const [suf, rep] of [
    ['ies', 'y'],
    ['es', ''],
    ['s', ''],
    ['ed', ''],
    ['ed', 'e'],
    ['ing', ''],
    ['ing', 'e'],
    ['ly', ''],
    ['er', ''],
    ['est', ''],
  ]) {
    if (lt.endsWith(suf) && n - suf.length >= 3) {
      out.push(lt.slice(0, lt.length - suf.length) + rep);
    }
  }
  return out;
}

// Rule 8.6: these count as one word and are not dictionary lookups
const SKIP_TOKEN = re(`^(?:${D}[${D.slice(0)}.,:/-]*[a-zA-Z%°]*|[A-Z]{2,}[A-Z0-9-]*|[A-Za-z]+${D}[${W.slice(1, -1)}-]*|${W}+\\.${W}+)(?=\\n?$)`);
const PARA_SPLIT = re(`\\n${S}*\\n`);

/** Very light sentence splitter that respects Rule 8.4 (colon ends a sentence in a list). */
export function* sentences(text) {
  text = text.replace(/`[^`]*`/g, ' CODE '); // inline code counts as one token
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'); // markdown links -> text
  for (let para of text.split(PARA_SPLIT)) {
    para = para.replace(re(`${BOL}${S}*(?:#+|[-*]|${D}+\\.)${S}*`, 'g'), '');
    for (let s of para.replaceAll('\n', ' ').split(re(`(?<=[.!?:])${S}+(?=[A-Z(“"])`))) {
      s = strip(s);
      if (s) {
        yield s;
      }
    }
  }
}

const UNIT_RE = re(`${D}+${S}*(?:mm|cm|m|in|inches|kg|g|lb|psi|kPa|°[CF]|%|V|A|Hz|s|ms)${B}`, 'g');
const HAS_W = re(W);

/** Rule 8.5/8.6/8.7: parenthetical text = 1 word, hyphenated = 1 word, numbers/units/ids = 1 word. */
export function wordCount(s) {
  s = s.replace(/\([^)]*\)/g, ' PAREN ');
  s = s.replace(UNIT_RE, 'UNIT');
  return s.split(re(`${S}+`)).filter((t) => HAS_W.test(t)).length;
}

function tokens(s) {
  s = s.replace(/\([^)]*\)/g, ' ');
  return s.match(/[A-Za-z][A-Za-z'-]*/g) ?? [];
}

const PASSIVE = re(`${B}(?:is|are|was|were|be|been|being)${S}+(?:${W}+ed|${W}+en|built|done|made|put|set|shown|found|given|held|kept|left|sent|told)${B}`, 'i');
const CONTRACTION = re(`${B}${W}+'(?:t|re|ve|ll|d|s|m)${B}`, 'i');
const ING = re(`${B}${W}{3,}ing${B}`);
const COMPLEX_AUX = re(`${B}(?:has|have|had|is|are|was|were|will be|would|should|could|may|might|must)${S}+(?:been${S}+)?${W}+(?:ed|ing)${B}`, 'i');

/**
 * Lint Markdown text.
 * @param {string} text file contents (newlines already normalized to \n)
 * @param {'procedural'|'descriptive'} mode
 * @param {Iterable<string>} allow project glossary terms
 * @param {{ forms: Set<string>, un: Map, phrases: Map }} [dict] from load()
 * @see ../docs/flows/lint.md
 */
export function lint(text, mode = 'descriptive', allow = [], dict = load()) {
  if (typeof text !== 'string') {
    throw new TypeError('lint: text must be a string');
  }
  if (mode !== 'procedural' && mode !== 'descriptive') {
    throw new RangeError(`lint: mode must be procedural or descriptive, got ${mode}`);
  }
  const { forms, un, phrases } = dict;
  const allowSet = new Set([...allow].map((a) => a.toLowerCase()));
  const limit = mode === 'procedural' ? 20 : 25;
  const findings = [];
  const seenUnknown = new Set();
  const add = (level, rule, msg, sentence) => findings.push({ level, rule, msg, sentence });
  for (const s of sentences(text)) {
    const wc = wordCount(s);
    if (wc > limit) {
      add('error', mode === 'procedural' ? '5.1' : '6.3', `${wc} words (max ${limit})`, s);
    }
    if (s.includes(';')) {
      add('error', '8.1', 'semicolon is not permitted', s);
    }
    if (CONTRACTION.test(s)) {
      add('error', '4.2', 'contraction', s);
    }
    for (const t of tokens(s)) {
      const lt = stripChars(t.toLowerCase(), "'-");
      if (!lt || SKIP_TOKEN.test(t) || allowSet.has(lt) || forms.has(lt)) {
        continue;
      }
      const hit = stems(lt).find((c) => un.has(c));
      if (hit !== undefined) {
        const es = un.get(hit);
        const alts = sortedSet(es.flatMap((e) => e.alternatives));
        const poses = sortedSet(es.map((e) => e.pos));
        const tnOk = alts.some((a) => a.includes('[TN]') || a.includes('(TN)')) || (poses.length === 1 && poses[0] === 'v' && alts.join(' ').toLowerCase().includes(hit + ' [tn]'));
        if (tnOk) {
          add('warn', '1.7', `"${t}" is not approved as ${poses.join('/')}; permitted only as a technical noun`, s);
        } else {
          add('error', '1.1', `"${t}" is not approved (${hit}, ${poses.join('/')}); alternatives: ${alts.join(', ') || 'see help'}`, s);
        }
      } else if (!seenUnknown.has(lt)) {
        seenUnknown.add(lt);
        add('warn', '1.5/1.12', `"${t}" is not in the dictionary: allowed only as a technical noun/verb`, s);
      }
    }
    const low = ' ' + s.toLowerCase() + ' ';
    for (const [ph, es] of phrases) {
      if (low.includes(' ' + ph + ' ')) {
        const alts = sortedSet(es.flatMap((e) => e.alternatives));
        add('error', '1.1', `"${ph}" is not approved; alternatives: ${alts.join(', ') || 'see help'}`, s);
      }
    }
    if (PASSIVE.test(s)) {
      add('warn', '3.6', 'possible passive voice', s);
    }
    if (COMPLEX_AUX.test(s)) {
      add('warn', '3.4', 'possible complex verb construction (auxiliary + participle)', s);
    }
    if (ING.test(s)) {
      add('warn', '3.5', '"-ing" form: permitted only inside a technical noun', s);
    }
  }
  // paragraph length (Rule 6.6)
  for (const para of text.split(PARA_SPLIT)) {
    const p = strip(para);
    if (p.startsWith('#') || p.startsWith('|') || p.startsWith('```')) {
      continue;
    }
    const n = [...sentences(para)].length;
    if (n > 6) {
      add('error', '6.6', `paragraph has ${n} sentences (max 6)`, [...para].slice(0, 80).join('') + '...');
    }
  }
  return findings;
}

/** Read a text file the way Python's open(..., encoding='utf-8') does: strict UTF-8, BOM kept as a character, universal newlines. */
export function readText(path) {
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(readFileSync(path)).replace(/\r\n?/g, '\n');
}

const USAGE = 'usage: ste_lint.mjs [-h] [--mode {procedural,descriptive}] [--json] [--allow ALLOW] file';

function parseArgs(argv) {
  const a = { file: null, mode: 'descriptive', json: false, allow: null };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '-h' || x === '--help') {
      return { help: true };
    }
    if (x === '--json') {
      a.json = true;
    } else if (x === '--mode' || x.startsWith('--mode=')) {
      a.mode = x.includes('=') ? x.slice(7) : argv[++i];
      if (a.mode !== 'procedural' && a.mode !== 'descriptive') {
        throw new Error(`argument --mode: invalid choice: '${a.mode}' (choose from 'procedural', 'descriptive')`);
      }
    } else if (x === '--allow' || x.startsWith('--allow=')) {
      a.allow = x.includes('=') ? x.slice(8) : argv[++i];
      if (a.allow === undefined) {
        throw new Error('argument --allow: expected one argument');
      }
    } else if (x.startsWith('-') && x !== '-') {
      throw new Error(`unrecognized arguments: ${x}`);
    } else if (a.file === null) {
      a.file = x;
    } else {
      throw new Error(`unrecognized arguments: ${x}`);
    }
  }
  if (a.file === null) {
    throw new Error('the following arguments are required: file');
  }
  return a;
}

function main(argv) {
  let a;
  try {
    a = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`${USAGE}\nste_lint.mjs: error: ${err.message}\n`);
    return 2;
  }
  if (a.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  try {
    const allow = a.allow ? readText(a.allow).split('\n').map(strip) : [];
    // Python iterates lines of the file; a trailing newline does not add an extra empty line.
    if (a.allow && allow.length && allow[allow.length - 1] === '' && readText(a.allow).endsWith('\n')) {
      allow.pop();
    }
    const f = lint(readText(a.file), a.mode, allow);
    const out = [];
    if (a.json) {
      out.push(dumpFindings(f));
    } else {
      for (const x of f) {
        out.push(`[${x.level.toUpperCase()} rule ${x.rule}] ${x.msg}\n    ${[...x.sentence].slice(0, 120).join('')}`);
      }
      out.push(`${f.filter((x) => x.level === 'error').length} errors, ${f.filter((x) => x.level === 'warn').length} warnings`);
    }
    process.stdout.write(out.join('\n') + '\n');
    return f.some((x) => x.level === 'error') ? 1 : 0;
  } catch (err) {
    process.stderr.write(`ste_lint.mjs: ${err.message}\n`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
