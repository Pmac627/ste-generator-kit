// Stage 2: raw dictionary regions -> structured entries (dict_entries.json).
// Port of structure_dict.py.

import { join } from 'node:path';
import { S, strip, stripChars, isUpper, dumpFile } from './_py.mjs';

const POS_RE = /\((n|v|adj|adv|pron|art|prep|conj)\)/;
const WS_RUN = new RegExp(`${S}+`, 'gu');
const SPLIT_RE = new RegExp(`[,${S.slice(1, -1)}]+`, 'u');
const MEANING_NUM_RE = new RegExp(`^\\p{Nd}+\\.${S}*`, 'u');
// Python's $ also matches before a final newline.
const FRAG_END_RE = new RegExp(`[.!?:”"\\)]${S}*(?=\\n?$)`, 'u');

function clean(t) {
  return strip(t.replace(WS_RUN, ' '));
}

/** Split column 1 into headword, part of speech, listed forms, and trailing notes. */
export function parseCol1(lines) {
  if (!Array.isArray(lines)) {
    throw new TypeError('parseCol1: lines must be an array');
  }
  const txt = strip(lines.join(' ').replace(WS_RUN, ' '));
  const m = POS_RE.exec(txt);
  if (!m) {
    throw new Error(`structure_dict: no part of speech in column 1: ${JSON.stringify(txt)}`);
  }
  const pos = m[1];
  const head = strip(stripChars(strip(txt.slice(0, m.index)), ',', 'right'));
  const rest = strip(stripChars(strip(txt.slice(m.index + m[0].length)), ',', 'left'));
  const forms = [];
  const notes = [];
  for (const pm of rest.matchAll(/\(([^)]*)\)/g)) {
    const par = pm[1];
    const body = par.toLowerCase().startsWith('also') ? [...par].slice(4).join('') : par;
    forms.push(...body.split(',').map(strip).filter((f) => f));
  }
  const restNp = rest.replace(/\([^)]*\)/g, '');
  const toks = restNp.split(SPLIT_RE).filter((x) => x);
  let i = 0;
  while (i < toks.length && isUpper(toks[i])) {
    forms.push(toks[i]);
    i++;
  }
  const tail = stripChars(strip(toks.slice(i).join(' ')), '.', 'right');
  if (tail) {
    notes.push(tail);
  }
  return { head, pos, forms, notes };
}

/**
 * Structure the raw regions.
 * @param {object[]} raw output of parse_dict
 * @returns {{ entries: object[], log: string[] }}
 * @see ../docs/flows/dictionary-extraction.md
 */
export function structureDict(raw) {
  if (!Array.isArray(raw)) {
    throw new TypeError('structureDict: raw must be an array');
  }
  const entries = [];
  for (const r of raw) {
    const { head, pos, forms, notes } = parseCol1(r.col1);
    const approved = isUpper(head.replaceAll('...', '').replaceAll(' ', ''));
    const byTop = (a, b) => a.top - b.top;
    const c2 = [...r.col2].sort(byTop);
    let c3 = [...r.col3].sort(byTop);
    let c4 = [...r.col4].sort(byTop);
    const senses = [];
    const entryHelp = [];
    for (const b of c2) {
      if (b.help) {
        (senses.length ? senses[senses.length - 1].help : entryHelp).push(clean(b.text));
      } else {
        senses.push({ text: clean(b.text), top: b.top, help: [], ste: [], non_ste: [] });
      }
    }

    // attach examples to senses by vertical position
    const attach = (blocks, key) => {
      for (const b of blocks) {
        let target = null;
        for (const s of senses) {
          if (s.top - 4 <= b.top) {
            target = s;
          }
        }
        if (target === null) {
          if (senses.length) {
            target = senses[0];
          } else {
            senses.push({ text: '', top: b.top, help: [], ste: [], non_ste: [] });
            target = senses[0];
          }
        }
        target[key].push(clean(b.text));
      }
    };
    const mergeFrags = (blocks) => {
      const out = [];
      for (const b of [...blocks].sort(byTop)) {
        const last = out[out.length - 1];
        if (last && !FRAG_END_RE.test(last.text) && b.top - last.last_top < 40) {
          last.text += ' ' + b.text;
          last.last_top = b.last_top;
        } else {
          out.push({ ...b });
        }
      }
      return out;
    };
    c3 = mergeFrags(c3);
    c4 = mergeFrags(c4);
    attach(c3, 'ste');
    attach(c4, 'non_ste');

    const out = { word: head, pos, approved, page: r.label };
    if (forms.length) {
      out.forms = forms;
    }
    if (notes.length) {
      out.notes = notes;
    }
    if (entryHelp.length) {
      out.help = entryHelp;
    }
    if (approved) {
      out.meanings = senses.map((s) => {
        const m = { meaning: s.text.replace(MEANING_NUM_RE, '') };
        if (s.help.length) {
          m.help = s.help;
        }
        if (s.ste.length) {
          m.ste_examples = s.ste;
        }
        if (s.non_ste.length) {
          m.non_ste_examples = s.non_ste;
        }
        return m;
      });
    } else {
      out.alternatives = senses.map((s) => {
        const a = s.text ? { alternative: s.text } : {};
        if (s.help.length) {
          a.help = s.help;
        }
        if (s.ste.length) {
          a.ste_examples = s.ste;
        }
        if (s.non_ste.length) {
          a.non_ste_examples = s.non_ste;
        }
        return a;
      });
    }
    entries.push(out);
  }

  for (const e of entries) {
    if (e.word.startsWith('precautionary')) {
      e.word = 'precautionary';
      delete e.help;
      e.alternatives[0].alternative = 'PRECAUTION (n)';
    }
  }
  const log = [`${entries.length} entries; ${entries.filter((e) => e.approved).length} approved`];
  return { entries, log };
}

/** Run the stage: write dict_entries.json to the work directory. */
export function run(raw, work) {
  const { entries, log } = structureDict(raw);
  dumpFile(join(work, 'dict_entries.json'), entries, { indent: 1, ensureAscii: false });
  return { data: entries, log };
}
