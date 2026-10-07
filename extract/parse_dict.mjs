// Stage 1: dictionary (Part 2) pages -> raw entry regions (dict_raw.json).
// Port of parse_dict.py. Each page is a four-column table; full-width rules separate entries.

import { join } from 'node:path';
import { pageObjects } from './_layout.mjs';
import { extractWords, extractText } from './_words.mjs';
import { S, pyRound, isUpper, strip, dumpFile } from './_py.mjs';

const POS_RE = /\((n|v|adj|adv|pron|art|prep|conj)\)/;
const LABEL_RE = new RegExp(`Page${S}+(2-1-[A-Z]\\p{Nd}+)`, 'u');
export const FIRST = 149;
export const LAST = 434; // PDF pages (1-based) of the word list
const BODY_TOP = 89;
const BODY_BOTTOM = 715;
const LINE_GAP_NEW_BLOCK = 15.5; // vertical gap (pt) that starts a new block
const LINE_TOLERANCE = 2.0; // words whose tops differ by at most this much (pt) are on one line

function colOf(cols, x) {
  for (let i = 0; i < cols.length; i++) {
    if (cols[i][0] <= x && x < cols[i][1]) {
      return i;
    }
  }
  return null;
}

/**
 * Group words into lines by top (tolerance 2pt) within one column.
 * Words are ordered by line cluster, then x0. The Python kit sorted by round(top), which put a glyph
 * that sits a fraction of a point off its line (a raised "2." label, a degree sign) at the end of the
 * line when the two tops rounded to different integers. See tests/PARITY.md, intended difference 9.
 */
export function groupLines(words, cols) {
  const lines = [];
  const byTop = [...words].sort((a, b) => a.top - b.top);
  const lineOf = new Map();
  let line = 0;
  byTop.forEach((w, i) => {
    if (i > 0 && w.top - byTop[i - 1].top > LINE_TOLERANCE) {
      line++;
    }
    lineOf.set(w, line);
  });
  const sorted = [...words].sort((a, b) => lineOf.get(a) - lineOf.get(b) || a.x0 - b.x0);
  let cur = null;
  for (const w of sorted) {
    const c = colOf(cols, w.x0);
    if (c === null) {
      continue;
    }
    if (cur && Math.abs(w.top - cur.top) <= LINE_TOLERANCE && cur.col === c) {
      cur.text += ' ' + w.text;
      cur.x1 = w.x1;
    } else {
      cur = { top: w.top, bottom: w.bottom, col: c, x0: w.x0, x1: w.x1, text: w.text, bold: w.fontname.includes('Bold') };
      lines.push(cur);
    }
  }
  return lines;
}

/** Split a column's lines into blocks by vertical gap, a crossing separator rule, or a help-indent change. */
function blocksFromLines(lines, seps, helpIndentX) {
  const blocks = [];
  let cur = null;
  for (const ln of [...lines].sort((a, b) => a.top - b.top)) {
    let isNew = cur === null;
    if (cur !== null) {
      const gap = ln.top - cur.last_top;
      const crossed = seps.some((s) => cur.last_top < s && s < ln.top);
      const indentChange = ln.x0 >= helpIndentX !== cur.help;
      if (gap > LINE_GAP_NEW_BLOCK || crossed || indentChange) {
        isNew = true;
      }
    }
    if (isNew) {
      cur = { top: ln.top, last_top: ln.top, x0: ln.x0, help: ln.x0 >= helpIndentX, text: ln.text };
      blocks.push(cur);
    } else {
      cur.text += ' ' + ln.text;
      cur.last_top = ln.top;
    }
  }
  return blocks;
}

/**
 * Parse the dictionary pages.
 * @param {import('./_pdf.mjs').PdfDocument} doc
 * @param {{ first?: number, last?: number }} [range] 1-based PDF pages; defaults to Issue 9's word list
 * @returns {{ merged: object[], log: string[] }}
 * @see ../docs/flows/dictionary-extraction.md
 */
export function parseDict(doc, { first = FIRST, last = LAST } = {}) {
  if (!doc) {
    throw new TypeError('parseDict: doc is required');
  }
  const log = [];
  const entries = [];
  for (let pno = first; pno <= last; pno++) {
    const pg = pageObjects(doc, pno);
    const words = extractWords(pg.chars, ['fontname']);
    const hdr = new Map();
    for (const w of words) {
      if (w.top > 60 && w.top < 85 && ['Word', 'Approved', 'STE', 'Non-STE'].includes(w.text)) {
        hdr.delete(w.text);
        hdr.set(w.text, w.x0);
      }
    }
    if (hdr.size < 4) {
      log.push(`no header on page ${pno} ${JSON.stringify(Object.fromEntries(hdr))}`);
      continue;
    }
    const [xw, xa, xs, xn] = ['Word', 'Approved', 'STE', 'Non-STE'].map((k) => hdr.get(k));
    const cols = [
      [xw - 8, xa - 3],
      [xa - 3, xs - 3],
      [xs - 3, xn - 3],
      [xn - 3, xn + 150],
    ];
    const helpIndentX = xa + 28;
    const body = words.filter((w) => BODY_TOP < w.top && w.top < BODY_BOTTOM);

    // separators
    const byTop = new Map();
    for (const r of pg.rects) {
      if (BODY_TOP < r.top && r.top < BODY_BOTTOM && r.height < 3) {
        const k = pyRound(r.top, 0);
        if (!byTop.has(k)) {
          byTop.set(k, []);
        }
        byTop.get(k).push(r);
      }
    }
    const fullSeps = [];
    const partSeps = [];
    for (const [t, rs] of byTop) {
      const x0 = Math.min(...rs.map((r) => r.x0));
      const x1 = Math.max(...rs.map((r) => r.x1));
      if (x1 - x0 < 60) {
        continue; // icon fragments, not rules
      }
      (x0 < xw + 15 && x1 > xn + 50 ? fullSeps : partSeps).push(t);
    }
    fullSeps.sort((a, b) => a - b);
    partSeps.sort((a, b) => a - b);
    const lines = groupLines(body, cols);

    const lab = extractText(pg.chars).match(LABEL_RE);
    const label = lab ? lab[1] : String(pno);

    // split lines into entry regions by full separators; a region is [prev_sep, sep)
    const bounds = [BODY_TOP, ...fullSeps, BODY_BOTTOM];
    for (let i = 0; i < bounds.length - 1; i++) {
      const lo = bounds[i];
      const hi = bounds[i + 1];
      const region = lines.filter((l) => lo <= l.top && l.top < hi);
      if (!region.length) {
        continue;
      }
      const col1 = region.filter((l) => l.col === 0);
      const headLines = col1.filter((l) => l.bold);
      const sepsHere = partSeps.filter((s) => lo < s && s < hi);
      const cols3 = [1, 2, 3].map((c) =>
        blocksFromLines(
          region.filter((l) => l.col === c),
          sepsHere,
          helpIndentX,
        ),
      );
      entries.push({
        page: pno,
        label,
        top: lo,
        col1: col1.map((l) => l.text),
        col1_bold: headLines.map((l) => l.text),
        col2: cols3[0],
        col3: cols3[1],
        col4: cols3[2],
        continuation: !POS_RE.test(col1.map((l) => l.text).join(' ')),
      });
    }
  }

  // merge continuations into previous entry
  const merged = [];
  for (const e of entries) {
    if (e.continuation && merged.length) {
      const prev = merged[merged.length - 1];
      prev.col1 = prev.col1.concat(e.col1);
      // shift tops so later blocks sort after earlier ones
      const off = 10000 * ((prev.pages ?? []).length + 1);
      for (const c of ['col2', 'col3', 'col4']) {
        for (const b of e[c]) {
          b.top += off;
          b.last_top += off;
        }
        prev[c] = prev[c].concat(e[c]);
      }
      if (!prev.pages) {
        prev.pages = [prev.page];
      }
      prev.pages.push(e.page);
    } else {
      merged.push(e);
    }
  }

  log.push(`regions ${entries.length} entries after merge ${merged.length}`);
  const up = merged.filter((e) => e.col1_bold.length && isUpper(strip(e.col1_bold[0].split('(')[0]))).length;
  log.push(`approved (uppercase headword): ${up}  unapproved: ${merged.length - up}`);
  return { merged, log };
}

/** Run the stage: read the PDF document, write dict_raw.json to the work directory. */
export function run(doc, work) {
  const { merged, log } = parseDict(doc);
  dumpFile(join(work, 'dict_raw.json'), merged, { indent: 0 });
  return { data: merged, log };
}
