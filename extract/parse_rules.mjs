// Stage 3: writing-rules (Part 1) pages -> classified lines per rule (rules_raw.json).
// Port of parse_rules.py.

import { join } from 'node:path';
import { pageObjects } from './_layout.mjs';
import { extractWords, extractText } from './_words.mjs';
import { S, pyRound, strip, dumpFile } from './_py.mjs';

export const FIRST = 45;
export const LAST = 128;
const RULE_RE = /^Rule (\p{Nd})\.(\p{Nd}{1,2})(?![\p{L}\p{N}_])/u;
const SECTION_RE = new RegExp(`^Section (\\p{Nd}) [–-] ([^\\n]+)(?=\\n?$)`, 'u');

function pageLines(pg, pno) {
  let words = extractWords(pg.chars, ['fontname', 'size']).filter((w) => w.top > 60 && w.top < 715); // drop header/footer
  words = [...words].sort((a, b) => pyRound(a.top) - pyRound(b.top) || a.x0 - b.x0);
  const lines = [];
  let cur = null;
  for (const w of words) {
    if (cur && Math.abs(w.top - cur.top) <= 2.5 && w.x0 - cur.x1 < 60) {
      cur.text += ' ' + w.text;
      cur.x1 = w.x1;
      cur.bold = cur.bold && w.fontname.includes('Bold');
      cur.italic = cur.italic && w.fontname.includes('Italic');
    } else {
      cur = { top: w.top, x0: w.x0, x1: w.x1, text: w.text, bold: w.fontname.includes('Bold'), italic: w.fontname.includes('Italic'), size: w.size };
      lines.push(cur);
    }
  }
  // left margin = the footer's left edge
  if (!lines.length) {
    return [];
  }
  const foot = extractWords(pg.chars)
    .filter((w) => w.top > 718)
    .map((w) => w.x0);
  const margin = foot.length ? pyRound(Math.min(...foot)) : pyRound(Math.min(...lines.map((l) => l.x0)));
  const icons = pg.curves.filter((c) => c.x1 - c.x0 > 15).map((c) => [c.top, c.x0]);
  for (const l of lines) {
    l.indent = pyRound(l.x0 - margin);
    l.icon = icons.some(([it, ix]) => Math.abs(l.top - it) < 14 && l.x0 > ix);
    l.page = pno;
  }
  return lines;
}

function slim(x) {
  const d = { text: x.text, indent: x.indent, bold: x.bold, italic: x.italic, icon: x.icon, page: x.page, top: pyRound(x.top, 1), size: pyRound(x.size) };
  if (x.kind) {
    d.kind = x.kind;
  }
  return d;
}

/**
 * Parse the rules pages.
 * @param {import('./_pdf.mjs').PdfDocument} doc
 * @param {{ first?: number, last?: number }} [range] 1-based PDF pages; defaults to Issue 9's Part 1
 * @see ../docs/flows/rules-extraction.md
 */
export function parseRules(doc, { first = FIRST, last = LAST } = {}) {
  if (!doc) {
    throw new TypeError('parseRules: doc is required');
  }
  const statements = {};
  const subtitles = {};
  const sectionTitles = new Map();
  const sectionIntro = new Map();
  const rules = {};
  const order = [];
  let cur = null; // current rule
  let curSection = null;
  let inSummary = false;
  let sumSub = null;
  let lastStmt;
  let ruleIndent;
  for (let pno = first; pno <= last; pno++) {
    const pg = pageObjects(doc, pno);
    if (extractText(pg.chars).includes('Blank Page')) {
      continue;
    }
    for (const l of pageLines(pg, pno)) {
      const t = l.text;
      const sz = pyRound(l.size);
      let m = SECTION_RE.exec(t);
      if (m && l.bold && sz >= 16) {
        curSection = m[1];
        sectionTitles.set(curSection, strip(m[2]));
        inSummary = true;
        sumSub = null;
        cur = null;
        continue;
      }
      if (inSummary) {
        if (t.startsWith('Summary of the rules')) {
          continue;
        }
        m = RULE_RE.exec(t);
        if (l.bold && sz >= 12) {
          inSummary = false; // body starts (falls through to body handling)
        } else if (m) {
          const rid = `${m[1]}.${m[2]}`;
          statements[rid] = strip(t.slice(m[0].length));
          subtitles[rid] = sumSub;
          lastStmt = rid;
          ruleIndent = l.indent;
          continue;
        } else if (l.bold) {
          sumSub = t;
          lastStmt = null;
          continue;
        } else if (lastStmt && (t.startsWith('-') || l.indent > ruleIndent + 10)) {
          statements[lastStmt] += ' ' + t;
          continue;
        } else {
          inSummary = false; // plain body/intro text after the summary
        }
      }
      // body
      m = RULE_RE.exec(t);
      if (m && l.bold && sz >= 12) {
        const rid = `${m[1]}.${m[2]}`;
        if (!(rid in rules)) {
          rules[rid] = { id: rid, section: curSection, lines: [] };
          order.push(rid);
        }
        cur = rules[rid];
        continue;
      }
      if (l.bold && sz >= 13) {
        l.kind = 'topic';
      }
      if (cur === null) {
        if (!sectionIntro.has(curSection)) {
          sectionIntro.set(curSection, []);
        }
        sectionIntro.get(curSection).push(l);
        continue;
      }
      if (l.bold && sz >= 12 && l.indent > 40) {
        continue; // bold continuation of the rule statement (already in summary)
      }
      cur.lines.push(l);
    }
  }

  const data = {
    statements,
    subtitles,
    section_titles: sectionTitles,
    section_intro: new Map([...sectionIntro].map(([k, v]) => [k, v.map(slim)])),
    rules: Object.fromEntries(Object.entries(rules).map(([k, v]) => [k, { id: v.id, section: v.section, lines: v.lines.map(slim) }])),
    order,
  };
  const stmtIds = Object.keys(statements);
  const log = [
    `statements ${stmtIds.length} rules with bodies ${Object.keys(rules).length} order ok: ${order.length === stmtIds.length && order.every((r, i) => r === stmtIds[i]) ? 'True' : 'False'}`,
    `missing bodies [${stmtIds
      .filter((r) => !(r in rules))
      .map((r) => `'${r}'`)
      .join(', ')}]`,
    `{${[...sectionIntro].map(([k, v]) => `${k === null ? 'None' : `'${k}'`}: ${v.length}`).join(', ')}}`,
  ];
  return { data, log };
}

/** Run the stage: write rules_raw.json to the work directory. */
export function run(doc, work) {
  const { data, log } = parseRules(doc);
  dumpFile(join(work, 'rules_raw.json'), data, { indent: 0 });
  return { data, log };
}
