import os
import json, re
raw = json.load(open(os.path.join(os.environ.get('STE_WORK', '.'), 'dict_raw.json')))
POS_RE = re.compile(r'\((n|v|adj|adv|pron|art|prep|conj)\)')

def parse_col1(lines):
    txt = ' '.join(lines)
    txt = re.sub(r'\s+', ' ', txt).strip()
    m = POS_RE.search(txt)
    pos = m.group(1)
    head = txt[:m.start()].strip().rstrip(',').strip()
    rest = txt[m.end():].strip().lstrip(',').strip()
    # headword may carry a parenthetical variant e.g. "little (a little)"
    forms, notes = [], []
    # comparative/superlative "(SLOWER, SLOWEST)"; "(also ARE, WERE)"
    for par in re.findall(r'\(([^)]*)\)', rest):
        if par.lower().startswith('also'):
            forms += [f.strip() for f in par[4:].split(',') if f.strip()]
        else:
            forms += [f.strip() for f in par.split(',') if f.strip()]
    rest_np = re.sub(r'\([^)]*\)', '', rest)
    toks = [x for x in re.split(r'[,\s]+', rest_np) if x]
    i = 0
    while i < len(toks) and toks[i].isupper():
        forms.append(toks[i]); i += 1
    tail = ' '.join(toks[i:]).strip().rstrip('.')
    if tail:
        notes.append(tail)
    return head, pos, forms, notes

def clean(t):
    return re.sub(r'\s+', ' ', t).strip()

entries = []
for r in raw:
    head, pos, forms, notes = parse_col1(r['col1'])
    approved = head.replace('...', '').replace(' ', '').isupper()
    c2 = sorted(r['col2'], key=lambda b: b['top'])
    c3 = sorted(r['col3'], key=lambda b: b['top'])
    c4 = sorted(r['col4'], key=lambda b: b['top'])
    senses = []
    entry_help = []
    for b in c2:
        if b['help']:
            (senses[-1]['help'] if senses else entry_help).append(clean(b['text']))
        else:
            senses.append(dict(text=clean(b['text']), top=b['top'], help=[], ste=[], non_ste=[]))
    # attach examples to senses by vertical position
    def attach(blocks, key):
        for b in blocks:
            target = None
            for s in senses:
                if s['top'] - 4 <= b['top']:
                    target = s
            if target is None:
                if senses:
                    target = senses[0]
                else:
                    senses.append(dict(text='', top=b['top'], help=[], ste=[], non_ste=[]))
                    target = senses[0]
            target[key].append(clean(b['text']))
    def merge_frags(blocks):
        out = []
        for b in sorted(blocks, key=lambda b: b['top']):
            if out and not re.search(r'[.!?:”"\)]\s*$', out[-1]['text']) and b['top'] - out[-1]['last_top'] < 40:
                out[-1]['text'] += ' ' + b['text']; out[-1]['last_top'] = b['last_top']
            else:
                out.append(dict(b))
        return out
    c3 = merge_frags(c3); c4 = merge_frags(c4)
    attach(c3, 'ste'); attach(c4, 'non_ste')
    out = dict(word=head, pos=pos, approved=approved, page=r['label'])
    if forms: out['forms'] = forms
    if notes: out['notes'] = notes
    if entry_help: out['help'] = entry_help
    if approved:
        out['meanings'] = []
        for s in senses:
            m = dict(meaning=re.sub(r'^\d+\.\s*', '', s['text']))
            if s['help']: m['help'] = s['help']
            if s['ste']: m['ste_examples'] = s['ste']
            if s['non_ste']: m['non_ste_examples'] = s['non_ste']
            out['meanings'].append(m)
    else:
        out['alternatives'] = []
        for s in senses:
            a = dict(alternative=s['text']) if s['text'] else {}
            if s['help']: a['help'] = s['help']
            if s['ste']: a['ste_examples'] = s['ste']
            if s['non_ste']: a['non_ste_examples'] = s['non_ste']
            out['alternatives'].append(a)
    entries.append(out)

for e in entries:
    if e['word'].startswith('precautionary'):
        e['word'] = 'precautionary'; e.pop('help', None); e['alternatives'][0]['alternative'] = 'PRECAUTION (n)'
json.dump(entries, open(os.path.join(os.environ.get('STE_WORK', '.'), 'dict_entries.json'), 'w'), indent=1, ensure_ascii=False)
print(len(entries), 'entries;', sum(e['approved'] for e in entries), 'approved')
for w in ('ABOUT', 'abrupt', 'CAN', 'PUSH', 'maintain', 'BE', 'precautionary'):
    for e in entries:
        if e['word'] == w:
            print(json.dumps(e, ensure_ascii=False)[:900]); print()
