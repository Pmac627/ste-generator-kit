// Stage 5: structured rules and dictionary -> the agent pack ($STE_WORK/pack).
// Port of generate.py.

import { mkdirSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { S, strip, pyRound, cmpCodePoint, dumps } from './_py.mjs';

const HDR = '<!-- Derived from ASD-STE100 Issue 9 (January 2025), (c) ASD. Internal reference for AI agents; do not redistribute. -->\n\n';
const CATEGORY_RE = new RegExp(`^(\\p{Nd}+)\\.${S}+([^\\n]+)(?=\\n?$)`, 'u');

/** Python f-string rendering of a value (None prints as "None"). */
function py(v) {
  return v === null || v === undefined ? 'None' : String(v);
}

function slug(t) {
  return t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Render rule blocks as Markdown. */
export function mdBlocks(blocks, level = 4) {
  const out = [];
  for (const b of blocks) {
    const k = b.kind;
    if (k === 'topic') {
      out.push(`\n${'#'.repeat(level - 1)} ${b.text}\n`);
    } else if (k === 'heading') {
      out.push(`\n**${b.text}**\n`);
    } else if (k === 'label') {
      out.push(`\n*${b.text}*\n`);
    } else if (k === 'para') {
      out.push(b.text + '\n');
    } else if (k === 'help') {
      out.push('> **Help:** ' + b.text.replaceAll('\n', '\n> ') + '\n');
    } else if (k === 'list') {
      out.push(
        b.text
          .split('\n')
          .map((ln) => '    ' + ln)
          .join('\n') + '\n',
      );
    } else if (k === 'examples') {
      const rows = [];
      for (const p of b.pairs) {
        const ste = p.ste.join(' **or** ');
        const note = p.notes && p.notes.length ? ' ' + p.notes.join(' ') : '';
        if ('non_ste' in p && !p.ste.length) {
          rows.push(`| Non-STE: ${p.non_ste}${note} | (STE rewrite follows the explanation below) |`);
        } else if ('non_ste' in p) {
          rows.push(`| Non-STE: ${p.non_ste} | STE: ${ste}${note} |`);
        } else {
          rows.push(`| | STE: ${ste}${note} |`);
        }
      }
      out.push('\n| Not STE | STE |\n|---|---|\n' + rows.join('\n') + '\n');
    }
  }
  return out.join('\n');
}

/** Technical noun (1.5) or verb (1.12) categories from a rule's blocks. */
export function categories(R, ruleId) {
  const r = R.rules.find((x) => x.id === ruleId);
  if (!r) {
    throw new Error(`generate: rule ${ruleId} not found`);
  }
  const cats = [];
  let cur = null;
  for (const b of r.blocks) {
    const m = b.kind === 'heading' ? CATEGORY_RE.exec(b.text) : null;
    if (m) {
      cur = { number: Number(m[1]), title: strip(m[2]), description: '', examples: [], help: [] };
      cats.push(cur);
      continue;
    }
    if (cur === null) {
      continue;
    }
    if (b.kind === 'para' && !cur.description) {
      cur.description = b.text;
    } else if (b.kind === 'para') {
      cur.description += ' ' + b.text;
    } else if (b.kind === 'list') {
      for (const ln of b.text.split('\n')) {
        cur.examples.push(...ln.split(',').map(strip).filter((w) => w));
      }
    } else if (b.kind === 'help') {
      cur.help.push(b.text);
    }
  }
  return cats;
}

function listFiles(dir, rel = '') {
  const out = [];
  const ents = readdirSync(join(dir, rel), { withFileTypes: true });
  const files = ents.filter((e) => e.isFile()).map((e) => e.name);
  const dirs = ents.filter((e) => e.isDirectory()).map((e) => e.name);
  for (const f of files.sort(cmpCodePoint)) {
    out.push(rel ? `${rel}/${f}` : f);
  }
  for (const d of dirs.sort(cmpCodePoint)) {
    out.push(...listFiles(dir, rel ? `${rel}/${d}` : d));
  }
  return out;
}

/**
 * Write the pack.
 * @param {object} R structured rules (section_titles and section_intro are Maps)
 * @param {object[]} D structured dictionary entries
 * @param {string} work the work directory; the pack goes to work/pack
 * @see ../docs/flows/pack-generation.md
 */
export function generate(R, D, work) {
  if (!R || !Array.isArray(R.rules) || !Array.isArray(D) || !work) {
    throw new TypeError('generate: structured rules, dictionary entries, and a work directory are required');
  }
  const OUT = join(work, 'pack');
  for (const sub of ['rules', 'dictionary', 'tools']) {
    mkdirSync(join(OUT, sub), { recursive: true });
  }
  const write = (rel, text) => writeFileSync(join(OUT, rel), text, 'utf8');
  const log = [];

  // ---------- rules: json ----------
  write('rules/ste-rules.json', dumps(R, { indent: 1, ensureAscii: false }));

  // ---------- rules: summary ----------
  const lines = [
    HDR + '# ASD-STE100 Issue 9: the 53 writing rules (summary)\n',
    'Rule statements only, grouped by section and topic. Load this file for cheap, whole-standard awareness; load `section-N-*.md` for the explanation and examples behind a rule.\n',
  ];
  let curSec = null;
  let curTopic = null;
  for (const r of R.rules) {
    if (r.section !== curSec) {
      curSec = r.section;
      curTopic = null;
      lines.push(`\n## Section ${py(curSec)}: ${py(r.section_title)}\n`);
    }
    if (r.topic !== curTopic) {
      curTopic = r.topic;
      lines.push(`\n**${py(curTopic)}**\n`);
    }
    const st = r.statement.includes(' - ') ? r.statement.replaceAll(' - ', '\n  - ') : r.statement;
    lines.push(`- **Rule ${r.id}**: ${st}`);
  }
  write('rules/ste-rules-summary.md', lines.join('\n') + '\n');

  // ---------- rules: per-section markdown ----------
  const bySec = new Map();
  for (const r of R.rules) {
    if (!bySec.has(r.section)) {
      bySec.set(r.section, []);
    }
    bySec.get(r.section).push(r);
  }
  const index = [
    HDR + '# ASD-STE100 Issue 9: Part 1, Writing rules\n',
    'One file per section. Each rule has: the rule statement (verbatim), the spec\'s explanation, help notes, and Not-STE / STE example pairs.\n',
    '| Section | File | Rules |',
    '|---|---|---|',
  ];
  for (const [sec, rs] of bySec) {
    const title = rs[0].section_title;
    const fname = `section-${py(sec)}-${slug(title)}.md`;
    index.push(`| ${py(sec)} ${title} | \`${fname}\` | ${rs.map((r) => r.id).join(', ')} |`);
    const md = [HDR + `# Section ${py(sec)}: ${title}\n`];
    const intro = R.section_intro.get(sec);
    if (intro && intro.length) {
      md.push('## Introduction\n' + mdBlocks(intro));
    }
    for (const r of rs) {
      md.push(`\n## Rule ${r.id}: ${py(r.topic)}\n\n**RULE ${r.id}: ${r.statement}**\n`);
      md.push(mdBlocks(r.blocks));
    }
    write(`rules/${fname}`, md.join('\n'));
  }
  write('rules/index.md', index.join('\n') + '\n');

  // ---------- technical categories (rules 1.5 and 1.12) ----------
  const tn = categories(R, '1.5');
  const tv = categories(R, '1.12');
  write('rules/technical-categories.json', dumps({ technical_noun_categories: tn, technical_verb_categories: tv }, { indent: 1, ensureAscii: false }));
  const cmd = [
    HDR + '# Technical noun and technical verb categories\n',
    'Words outside the dictionary are permitted only when they fit one of these categories (Rules 1.5, 1.6, 1.12). Use this to decide whether an unknown word is a legitimate technical noun/verb or an error.\n',
    '## Technical noun categories (Rule 1.5)\n',
  ];
  const catMd = (c) => {
    cmd.push(`**${c.number}. ${c.title}**  \n${c.description}  \nExamples: ${c.examples.join(', ')}\n`);
    for (const h of c.help) {
      cmd.push(`> Help: ${h}\n`);
    }
  };
  tn.forEach(catMd);
  cmd.push('\n## Technical verb categories (Rule 1.12)\n');
  tv.forEach(catMd);
  write('rules/technical-categories.md', cmd.join('\n'));
  log.push(`TN cats ${tn.length} TV cats ${tv.length}`);

  // ---------- dictionary ----------
  write('dictionary/ste-dictionary.json', dumps(D, { indent: 1, ensureAscii: false }));
  const approved = D.filter((e) => e.approved);
  const unapproved = D.filter((e) => !e.approved);

  const compactAp = approved.map((e) => {
    const c = { word: e.word, pos: e.pos };
    if (e.forms && e.forms.length) {
      c.forms = e.forms;
    }
    if (e.notes && e.notes.length) {
      c.notes = e.notes;
    }
    const meanings = e.meanings ?? [];
    c.meanings = meanings.filter((m) => m.meaning).map((m) => m.meaning);
    const helps = [...(e.help ?? []), ...meanings.flatMap((m) => m.help ?? [])];
    if (helps.length) {
      c.help = helps;
    }
    return c;
  });
  write('dictionary/approved-words.json', dumps(compactAp, { indent: 0, ensureAscii: false }));

  const compactUn = unapproved.map((e) => {
    const alts = e.alternatives ?? [];
    const c = { word: e.word, pos: e.pos, alternatives: alts.map((a) => a.alternative ?? '').filter((t) => t) };
    const helps = [...(e.help ?? []), ...alts.flatMap((a) => a.help ?? [])];
    if (helps.length) {
      c.help = helps;
    }
    return c;
  });
  write('dictionary/unapproved-words.json', dumps(compactUn, { indent: 0, ensureAscii: false }));

  // word-form list for membership tests: headword + listed forms, lowercase
  const forms = new Set();
  for (const e of approved) {
    forms.add(e.word.toLowerCase());
    for (const f of e.forms ?? []) {
      forms.add(f.toLowerCase());
    }
  }
  write('dictionary/approved-wordforms.txt', [...forms].sort(cmpCodePoint).join('\n') + '\n');
  write('dictionary/approved-words.tsv', 'word\tpos\tforms\tmeaning\n' + compactAp.map((c) => `${c.word}\t${c.pos}\t${(c.forms ?? []).join(',')}\t${c.meanings.join(' | ')}\n`).join(''));
  write('dictionary/unapproved-lookup.tsv', 'word\tpos\talternatives\thelp\n' + compactUn.map((c) => `${c.word}\t${c.pos}\t${c.alternatives.join(' | ')}\t${(c.help ?? []).join(' ')}\n`).join(''));

  // compact markdown word list (approved) for prompt injection
  const byLetter = new Map();
  for (const c of compactAp) {
    const L = [...c.word][0].toUpperCase();
    if (!byLetter.has(L)) {
      byLetter.set(L, []);
    }
    byLetter.get(L).push(`${c.word} (${c.pos})`);
  }
  const wl = [
    HDR + '# STE approved words (Issue 9)\n',
    `${compactAp.length} approved dictionary entries as word (part of speech). Approved only as the listed part of speech and only with the approved meaning (Rules 1.2, 1.3). Verb forms and adjective comparatives are in \`approved-words.json\`.\n`,
  ];
  for (const [L, ws] of byLetter) {
    wl.push(`**${L}**: ` + ws.join(', ') + '\n');
  }
  write('dictionary/approved-wordlist.md', wl.join('\n'));
  log.push(`approved ${approved.length} unapproved ${unapproved.length} forms ${forms.size}`);
  for (const rel of listFiles(OUT)) {
    const kb = pyRound(statSync(join(OUT, rel)).size / 1024, 1).toFixed(1);
    log.push(`${kb.padStart(8)} KB  ${rel}`);
  }
  return { log };
}
