import os
import json, re
d = json.load(open(os.path.join(os.environ.get('STE_WORK', '.'), 'rules_raw.json')))
EX_RE = re.compile(r'^(Non-STE|STE):\s*(.*)$')

def to_blocks(lines):
    blocks = []
    i = 0
    def push(kind, text, **kw):
        blocks.append(dict(kind=kind, text=text, **kw))
    while i < len(lines):
        l = lines[i]; t = l['text']
        if l.get('kind') == 'topic':
            push('topic', t); i += 1; continue
        m = EX_RE.match(t)
        if m:
            # collect an example group: consecutive example lines + continuations
            group = []
            cur = None
            while i < len(lines):
                l2 = lines[i]; t2 = l2['text']; m2 = EX_RE.match(t2)
                if m2:
                    cur = dict(label=m2.group(1), text=m2.group(2), note=[]); group.append(cur); i += 1
                elif cur and l2['indent'] >= 30 and not l2['bold'] and not l2['icon']:
                    if t2.strip().lower() == 'or':
                        cur = None; i += 1; continue  # next STE alternative follows
                    if t2.startswith('(') and l2['indent'] >= 60:
                        cur['note'].append(t2)
                    else:
                        cur['text'] += ' ' + t2
                    i += 1
                else:
                    break
            # fold into pairs: each Non-STE followed by its STE alternatives; leading STE-only ok
            pairs = []
            for g in group:
                if g['label'] == 'Non-STE' or not pairs or pairs[-1].get('non_ste') is None and g['label'] == 'Non-STE':
                    pairs.append(dict(non_ste=g['text'] if g['label'] == 'Non-STE' else None, ste=[], notes=g['note']))
                    if g['label'] == 'STE':
                        pairs[-1]['ste'].append(g['text'])
                else:
                    if pairs[-1]['non_ste'] is None and pairs[-1]['ste'] and g['label'] == 'STE':
                        pairs.append(dict(non_ste=None, ste=[g['text']], notes=g['note']))
                    else:
                        pairs[-1]['ste'].append(g['text']); pairs[-1]['notes'] += g['note']
            for p in pairs:
                if p['non_ste'] is None: p.pop('non_ste')
                if not p['notes']: p.pop('notes')
            push('examples', '', pairs=pairs)
            continue
        if l['icon']:
            txt = t; i += 1
            while i < len(lines) and not lines[i]['icon'] and 20 <= lines[i]['indent'] < 80 \
                    and not EX_RE.match(lines[i]['text']) and not lines[i]['bold']:
                nxt = lines[i]['text']
                txt += ('\n' if nxt.lstrip().startswith(('-', '•')) or lines[i]['indent'] > 45 else ' ') + nxt.strip()
                i += 1
            push('help', txt); continue
        if l['bold'] and l['indent'] <= 5 and len(t) < 60 and t.endswith(':'):
            push('label', t); i += 1; continue
        if l['indent'] <= 5 and l['bold']:
            push('heading', t); i += 1; continue
        if l['indent'] <= 5:
            # paragraph: merge following indent-0 non-bold lines
            txt = t; i += 1
            while i < len(lines) and lines[i]['indent'] <= 5 and not lines[i]['bold'] and not lines[i]['icon'] \
                    and not EX_RE.match(lines[i]['text']) and not lines[i].get('kind'):
                txt += ' ' + lines[i]['text']; i += 1
            push('para' if not l['bold'] else 'heading', txt); continue
        # indented, non-example, non-help: list/table lines
        txt = t; i += 1
        rows = [t]
        while i < len(lines) and lines[i]['indent'] > 5 and not lines[i]['icon'] and not EX_RE.match(lines[i]['text']) \
                and not lines[i].get('kind'):
            rows.append(lines[i]['text']); i += 1
        push('list', '\n'.join(rows))
    return blocks

out = dict(section_titles=d['section_titles'], rules=[])
for rid in d['order']:
    r = d['rules'][rid]
    out['rules'].append(dict(id=rid, section=r['section'], section_title=d['section_titles'][r['section']],
                             topic=d['subtitles'].get(rid), statement=d['statements'][rid],
                             blocks=to_blocks(r['lines'])))
out['section_intro'] = {k: to_blocks(v) for k, v in d['section_intro'].items()}
json.dump(out, open(os.path.join(os.environ.get('STE_WORK', '.'), 'rules_structured.json'), 'w'), indent=1, ensure_ascii=False)
import collections
kinds = collections.Counter(b['kind'] for r in out['rules'] for b in r['blocks'])
print(kinds)
print('total chars:', sum(len(b['text']) + sum(len(p.get('non_ste', '')) + sum(map(len, p['ste'])) for p in b.get('pairs', [])) for r in out['rules'] for b in r['blocks']))
r = [x for x in out['rules'] if x['id'] == '1.2'][0]
for b in r['blocks'][:9]:
    print(b['kind'], '|', (b['text'][:100] if b['text'] else b.get('pairs')))
