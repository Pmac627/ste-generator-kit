// Stage 4: classified rule lines -> typed blocks per rule (rules_structured.json).
// Port of structure_rules.py.

import { join } from 'node:path';
import { S, strip, lstrip, dumpFile } from './_py.mjs';

const EX_RE = new RegExp(`^(Non-STE|STE):${S}*([^\\n]*)(?=\\n?$)`, 'u');

/** Turn a rule's lines into blocks: topic, heading, label, para, help, list, examples. */
export function toBlocks(lines) {
  if (!Array.isArray(lines)) {
    throw new TypeError('toBlocks: lines must be an array');
  }
  const blocks = [];
  let i = 0;
  const push = (kind, text, extra = {}) => blocks.push({ kind, text, ...extra });
  while (i < lines.length) {
    const l = lines[i];
    const t = l.text;
    if (l.kind === 'topic') {
      push('topic', t);
      i++;
      continue;
    }
    if (EX_RE.test(t)) {
      // collect an example group: consecutive example lines + continuations
      const group = [];
      let cur = null;
      while (i < lines.length) {
        const l2 = lines[i];
        const t2 = l2.text;
        const m2 = EX_RE.exec(t2);
        if (m2) {
          cur = { label: m2[1], text: m2[2], note: [] };
          group.push(cur);
          i++;
        } else if (cur && l2.indent >= 30 && !l2.bold && !l2.icon) {
          if (strip(t2).toLowerCase() === 'or') {
            cur = null;
            i++;
            continue; // next STE alternative follows
          }
          if (t2.startsWith('(') && l2.indent >= 60) {
            cur.note.push(t2);
          } else {
            cur.text += ' ' + t2;
          }
          i++;
        } else {
          break;
        }
      }
      // fold into pairs: each Non-STE followed by its STE alternatives; leading STE-only ok
      const pairs = [];
      for (const g of group) {
        const last = pairs[pairs.length - 1];
        if (g.label === 'Non-STE' || !pairs.length || ((last.non_ste ?? null) === null && g.label === 'Non-STE')) {
          pairs.push({ non_ste: g.label === 'Non-STE' ? g.text : null, ste: [], notes: g.note });
          if (g.label === 'STE') {
            pairs[pairs.length - 1].ste.push(g.text);
          }
        } else if (last.non_ste === null && last.ste.length && g.label === 'STE') {
          pairs.push({ non_ste: null, ste: [g.text], notes: g.note });
        } else {
          last.ste.push(g.text);
          last.notes = last.notes.concat(g.note);
        }
      }
      for (const p of pairs) {
        if (p.non_ste === null) {
          delete p.non_ste;
        }
        if (!p.notes.length) {
          delete p.notes;
        }
      }
      push('examples', '', { pairs });
      continue;
    }
    if (l.icon) {
      let txt = t;
      i++;
      while (i < lines.length && !lines[i].icon && lines[i].indent >= 20 && lines[i].indent < 80 && !EX_RE.test(lines[i].text) && !lines[i].bold) {
        const nxt = lines[i].text;
        const ln = lstrip(nxt);
        txt += (ln.startsWith('-') || ln.startsWith('•') || lines[i].indent > 45 ? '\n' : ' ') + strip(nxt);
        i++;
      }
      push('help', txt);
      continue;
    }
    if (l.bold && l.indent <= 5 && [...t].length < 60 && t.endsWith(':')) {
      push('label', t);
      i++;
      continue;
    }
    if (l.indent <= 5 && l.bold) {
      push('heading', t);
      i++;
      continue;
    }
    if (l.indent <= 5) {
      // paragraph: merge following indent-0 non-bold lines
      let txt = t;
      i++;
      while (i < lines.length && lines[i].indent <= 5 && !lines[i].bold && !lines[i].icon && !EX_RE.test(lines[i].text) && !lines[i].kind) {
        txt += ' ' + lines[i].text;
        i++;
      }
      push(!l.bold ? 'para' : 'heading', txt);
      continue;
    }
    // indented, non-example, non-help: list/table lines
    const rows = [t];
    i++;
    while (i < lines.length && lines[i].indent > 5 && !lines[i].icon && !EX_RE.test(lines[i].text) && !lines[i].kind) {
      rows.push(lines[i].text);
      i++;
    }
    push('list', rows.join('\n'));
  }
  return blocks;
}

/**
 * Structure the parsed rules.
 * @param {object} d output of parse_rules (section_titles and section_intro are Maps)
 * @see ../docs/flows/rules-extraction.md
 */
export function structureRules(d) {
  if (!d || !Array.isArray(d.order)) {
    throw new TypeError('structureRules: parse_rules output is required');
  }
  const out = { section_titles: d.section_titles, rules: [] };
  for (const rid of d.order) {
    const r = d.rules[rid];
    out.rules.push({
      id: rid,
      section: r.section,
      section_title: d.section_titles.get(r.section),
      topic: d.subtitles[rid] ?? null,
      statement: d.statements[rid],
      blocks: toBlocks(r.lines),
    });
  }
  out.section_intro = new Map([...d.section_intro].map(([k, v]) => [k, toBlocks(v)]));
  const kinds = new Map();
  for (const r of out.rules) {
    for (const b of r.blocks) {
      kinds.set(b.kind, (kinds.get(b.kind) ?? 0) + 1);
    }
  }
  const log = [`block kinds ${JSON.stringify(Object.fromEntries(kinds))}`];
  return { data: out, log };
}

/** Run the stage: write rules_structured.json to the work directory. */
export function run(d, work) {
  const { data, log } = structureRules(d);
  dumpFile(join(work, 'rules_structured.json'), data, { indent: 1, ensureAscii: false });
  return { data, log };
}
