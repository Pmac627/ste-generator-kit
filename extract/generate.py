import os
import json, re, os, collections
OUT = os.path.join(os.environ.get('STE_WORK', '.'), 'pack')
for sub in ('rules', 'dictionary', 'tools'):
    os.makedirs(f'{OUT}/{sub}', exist_ok=True)
R = json.load(open(os.path.join(os.environ.get('STE_WORK', '.'), 'rules_structured.json')))
D = json.load(open(os.path.join(os.environ.get('STE_WORK', '.'), 'dict_entries.json')))
HDR = "<!-- Derived from ASD-STE100 Issue 9 (January 2025), (c) ASD. Internal reference for AI agents; do not redistribute. -->\n\n"

# ---------- helpers ----------
def slug(t): return re.sub(r'[^a-z0-9]+', '-', t.lower()).strip('-')
def md_blocks(blocks, level=4):
    out = []
    for b in blocks:
        k = b['kind']
        if k == 'topic':
            out.append(f"\n{'#'*(level-1)} {b['text']}\n")
        elif k == 'heading':
            out.append(f"\n**{b['text']}**\n")
        elif k == 'label':
            out.append(f"\n*{b['text']}*\n")
        elif k == 'para':
            out.append(b['text'] + '\n')
        elif k == 'help':
            out.append('> **Help:** ' + b['text'].replace('\n', '\n> ') + '\n')
        elif k == 'list':
            out.append('\n'.join('    ' + ln for ln in b['text'].split('\n')) + '\n')
        elif k == 'examples':
            rows = []
            for p in b['pairs']:
                ste = ' **or** '.join(p['ste'])
                note = (' ' + ' '.join(p['notes'])) if p.get('notes') else ''
                if 'non_ste' in p and not p['ste']:
                    rows.append(f"| Non-STE: {p['non_ste']}{note} | (STE rewrite follows the explanation below) |")
                elif 'non_ste' in p:
                    rows.append(f"| Non-STE: {p['non_ste']} | STE: {ste}{note} |")
                else:
                    rows.append(f"| | STE: {ste}{note} |")
            out.append('\n| Not STE | STE |\n|---|---|\n' + '\n'.join(rows) + '\n')
    return '\n'.join(out)

# ---------- rules: json ----------
json.dump(R, open(f'{OUT}/rules/ste-rules.json', 'w'), indent=1, ensure_ascii=False)

# ---------- rules: summary ----------
lines = [HDR + "# ASD-STE100 Issue 9: the 53 writing rules (summary)\n",
         "Rule statements only, grouped by section and topic. Load this file for cheap, whole-standard awareness; load `section-N-*.md` for the explanation and examples behind a rule.\n"]
cur_sec = cur_topic = None
for r in R['rules']:
    if r['section'] != cur_sec:
        cur_sec = r['section']; cur_topic = None
        lines.append(f"\n## Section {cur_sec}: {r['section_title']}\n")
    if r['topic'] != cur_topic:
        cur_topic = r['topic']; lines.append(f"\n**{cur_topic}**\n")
    st = r['statement'].replace(' - ', '\n  - ') if ' - ' in r['statement'] else r['statement']
    lines.append(f"- **Rule {r['id']}**: {st}")
open(f'{OUT}/rules/ste-rules-summary.md', 'w').write('\n'.join(lines) + '\n')

# ---------- rules: per-section markdown ----------
by_sec = collections.OrderedDict()
for r in R['rules']:
    by_sec.setdefault(r['section'], []).append(r)
index = [HDR + "# ASD-STE100 Issue 9: Part 1, Writing rules\n", "One file per section. Each rule has: the rule statement (verbatim), the spec's explanation, help notes, and Not-STE / STE example pairs.\n",
         "| Section | File | Rules |", "|---|---|---|"]
for sec, rs in by_sec.items():
    title = rs[0]['section_title']
    fname = f"section-{sec}-{slug(title)}.md"
    index.append(f"| {sec} {title} | `{fname}` | {', '.join(r['id'] for r in rs)} |")
    md = [HDR + f"# Section {sec}: {title}\n"]
    if R['section_intro'].get(sec):
        md.append("## Introduction\n" + md_blocks(R['section_intro'][sec]))
    for r in rs:
        md.append(f"\n## Rule {r['id']}: {r['topic']}\n\n**RULE {r['id']}: {r['statement']}**\n")
        md.append(md_blocks(r['blocks']))
    open(f'{OUT}/rules/{fname}', 'w').write('\n'.join(md))
open(f'{OUT}/rules/index.md', 'w').write('\n'.join(index) + '\n')

# ---------- technical categories (rules 1.5 and 1.12) ----------
def categories(rule_id):
    r = next(x for x in R['rules'] if x['id'] == rule_id)
    cats = []; cur = None
    for b in r['blocks']:
        m = re.match(r'^(\d+)\.\s+(.+)$', b['text']) if b['kind'] == 'heading' else None
        if m:
            cur = dict(number=int(m.group(1)), title=m.group(2).strip(), description='', examples=[], help=[]); cats.append(cur); continue
        if cur is None: continue
        if b['kind'] == 'para' and not cur['description']: cur['description'] = b['text']
        elif b['kind'] == 'para': cur['description'] += ' ' + b['text']
        elif b['kind'] == 'list':
            for ln in b['text'].split('\n'):
                cur['examples'] += [w.strip() for w in ln.split(',') if w.strip()]
        elif b['kind'] == 'help': cur['help'].append(b['text'])
    return cats
tn, tv = categories('1.5'), categories('1.12')
json.dump(dict(technical_noun_categories=tn, technical_verb_categories=tv),
          open(f'{OUT}/rules/technical-categories.json', 'w'), indent=1, ensure_ascii=False)
md = [HDR + "# Technical noun and technical verb categories\n",
      "Words outside the dictionary are permitted only when they fit one of these categories (Rules 1.5, 1.6, 1.12). Use this to decide whether an unknown word is a legitimate technical noun/verb or an error.\n",
      "## Technical noun categories (Rule 1.5)\n"]
for c in tn:
    md.append(f"**{c['number']}. {c['title']}**  \n{c['description']}  \nExamples: {', '.join(c['examples'])}\n")
    for h in c['help']: md.append(f"> Help: {h}\n")
md.append("\n## Technical verb categories (Rule 1.12)\n")
for c in tv:
    md.append(f"**{c['number']}. {c['title']}**  \n{c['description']}  \nExamples: {', '.join(c['examples'])}\n")
    for h in c['help']: md.append(f"> Help: {h}\n")
open(f'{OUT}/rules/technical-categories.md', 'w').write('\n'.join(md))
print('TN cats', len(tn), 'TV cats', len(tv))

# ---------- dictionary ----------
json.dump(D, open(f'{OUT}/dictionary/ste-dictionary.json', 'w'), indent=1, ensure_ascii=False)
approved = [e for e in D if e['approved']]
unapproved = [e for e in D if not e['approved']]
ALT_RE = re.compile(r'^([A-Z][A-Z\-\' .]*?)(?:\s*\((n|v|adj|adv|pron|art|prep|conj|TN|TV)\))?$')

def alt_words(e):
    ws = []
    for a in e.get('alternatives', []):
        t = a.get('alternative', '')
        if t: ws.append(t)
    return ws

compact_ap = []
for e in approved:
    c = dict(word=e['word'], pos=e['pos'])
    if e.get('forms'): c['forms'] = e['forms']
    if e.get('notes'): c['notes'] = e['notes']
    c['meanings'] = [m['meaning'] for m in e.get('meanings', []) if m.get('meaning')]
    helps = (e.get('help') or []) + [h for m in e.get('meanings', []) for h in m.get('help', [])]
    if helps: c['help'] = helps
    compact_ap.append(c)
json.dump(compact_ap, open(f'{OUT}/dictionary/approved-words.json', 'w'), indent=0, ensure_ascii=False)

compact_un = []
for e in unapproved:
    c = dict(word=e['word'], pos=e['pos'], alternatives=alt_words(e))
    helps = (e.get('help') or []) + [h for a in e.get('alternatives', []) for h in a.get('help', [])]
    if helps: c['help'] = helps
    compact_un.append(c)
json.dump(compact_un, open(f'{OUT}/dictionary/unapproved-words.json', 'w'), indent=0, ensure_ascii=False)

# word-form list for membership tests: headword + listed forms, lowercase
forms = set()
for e in approved:
    forms.add(e['word'].lower())
    for f in e.get('forms', []): forms.add(f.lower())
open(f'{OUT}/dictionary/approved-wordforms.txt', 'w').write('\n'.join(sorted(forms)) + '\n')
with open(f'{OUT}/dictionary/approved-words.tsv', 'w') as f:
    f.write('word\tpos\tforms\tmeaning\n')
    for c in compact_ap:
        f.write(f"{c['word']}\t{c['pos']}\t{','.join(c.get('forms', []))}\t{' | '.join(c['meanings'])}\n")
with open(f'{OUT}/dictionary/unapproved-lookup.tsv', 'w') as f:
    f.write('word\tpos\talternatives\thelp\n')
    for c in compact_un:
        f.write(f"{c['word']}\t{c['pos']}\t{' | '.join(c['alternatives'])}\t{' '.join(c.get('help', []))}\n")
# compact markdown word list (approved) for prompt injection
by_letter = collections.OrderedDict()
for c in compact_ap:
    by_letter.setdefault(c['word'][0].upper(), []).append(f"{c['word']} ({c['pos']})")
md = [HDR + "# STE approved words (Issue 9)\n", f"{len(compact_ap)} approved dictionary entries as word (part of speech). Approved only as the listed part of speech and only with the approved meaning (Rules 1.2, 1.3). Verb forms and adjective comparatives are in `approved-words.json`.\n"]
for L, ws in by_letter.items():
    md.append(f"**{L}**: " + ', '.join(ws) + '\n')
open(f'{OUT}/dictionary/approved-wordlist.md', 'w').write('\n'.join(md))
print('approved', len(approved), 'unapproved', len(unapproved), 'forms', len(forms))
for root, _, files in os.walk(OUT):
    for fn in sorted(files):
        p = os.path.join(root, fn); print(f"{os.path.getsize(p)/1024:8.1f} KB  {p.replace(OUT+'/', '')}")
