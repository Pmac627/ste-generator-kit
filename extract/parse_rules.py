import os
import pdfplumber, json, re
from collections import Counter

PDF = os.environ.get('STE_PDF', 'ASD-STE100_ISSUE9.pdf')
pdf = pdfplumber.open(PDF)
RULE_RE = re.compile(r'^Rule (\d)\.(\d{1,2})\b')

def page_lines(pno):
    pg = pdf.pages[pno - 1]
    words = pg.extract_words(extra_attrs=['fontname', 'size'])
    words = [w for w in words if 60 < w['top'] < 715]  # drop header/footer
    words.sort(key=lambda w: (round(w['top']), w['x0']))
    lines = []
    cur = None
    for w in words:
        if cur and abs(w['top'] - cur['top']) <= 2.5 and w['x0'] - cur['x1'] < 60:
            cur['text'] += ' ' + w['text']; cur['x1'] = w['x1']
            cur['bold'] = cur['bold'] and 'Bold' in w['fontname']
            cur['italic'] = cur['italic'] and 'Italic' in w['fontname']
        else:
            cur = dict(top=w['top'], x0=w['x0'], x1=w['x1'], text=w['text'],
                       bold='Bold' in w['fontname'], italic='Italic' in w['fontname'], size=w['size'])
            lines.append(cur)
    # left margin = most common x0
    if not lines:
        return []
    foot = [w['x0'] for w in pg.extract_words() if w['top'] > 718]
    margin = round(min(foot)) if foot else round(min(l['x0'] for l in lines))
    icons = [(c['top'], c['x0']) for c in pg.curves if c['x1'] - c['x0'] > 15]
    for l in lines:
        l['indent'] = round(l['x0'] - margin)
        l['icon'] = any(abs(l['top'] - it) < 14 and l['x0'] > ix for it, ix in icons)
        l['page'] = pno
    return lines

# ---- unified pass over all Part 1 pages ----
statements, subtitles, section_titles, section_intro = {}, {}, {}, {}
rules, order = {}, []
cur = None            # current rule dict
cur_section = None
in_summary = False
sum_sub = None
for pno in range(45, 129):
    txt = pdf.pages[pno - 1].extract_text() or ''
    if 'Blank Page' in txt:
        continue
    for l in page_lines(pno):
        t = l['text']; sz = round(l['size'])
        m = re.match(r'^Section (\d) [–-] (.+)$', t)
        if m and l['bold'] and sz >= 16:
            cur_section = m.group(1); section_titles[cur_section] = m.group(2).strip()
            in_summary = True; sum_sub = None; cur = None; continue
        if in_summary:
            if t.startswith('Summary of the rules'):
                continue
            m = RULE_RE.match(t)
            if l['bold'] and sz >= 12:
                in_summary = False   # body starts (falls through to body handling)
            elif m:
                rid = f"{m.group(1)}.{m.group(2)}"
                statements[rid] = t[m.end():].strip(); subtitles[rid] = sum_sub; last_stmt = rid
                rule_indent = l['indent']; continue
            elif l['bold']:
                sum_sub = t; last_stmt = None; continue
            elif last_stmt and (t.startswith('-') or l['indent'] > rule_indent + 10):
                statements[last_stmt] += ' ' + t; continue
            else:
                in_summary = False   # plain body/intro text after the summary
        # body
        m = RULE_RE.match(t)
        if m and l['bold'] and sz >= 12:
            rid = f"{m.group(1)}.{m.group(2)}"
            if rid not in rules:
                rules[rid] = dict(id=rid, section=cur_section, lines=[]); order.append(rid)
            cur = rules[rid]; continue
        if l['bold'] and sz >= 13:
            l['kind'] = 'topic'
        if cur is None:
            section_intro.setdefault(cur_section, []).append(l); continue
        if l['bold'] and sz >= 12 and l['indent'] > 40:
            continue  # bold continuation of the rule statement (already in summary)
        cur['lines'].append(l)

def slim(x):
    d = dict(text=x['text'], indent=x['indent'], bold=x['bold'], italic=x['italic'],
             icon=x['icon'], page=x['page'], top=round(x['top'], 1), size=round(x['size']))
    if x.get('kind'): d['kind'] = x['kind']
    return d
json.dump(dict(statements=statements, subtitles=subtitles, section_titles=section_titles,
               section_intro={k: [slim(x) for x in v] for k, v in section_intro.items()},
               rules={k: dict(id=v['id'], section=v['section'], lines=[slim(x) for x in v['lines']]) for k, v in rules.items()},
               order=order),
          open(os.path.join(os.environ.get('STE_WORK', '.'), 'rules_raw.json'), 'w'), indent=0)
print('statements', len(statements), 'rules with bodies', len(rules), 'order ok:', order == list(statements))
print('missing bodies', [r for r in statements if r not in rules])
print({k: len(v) for k, v in section_intro.items()})
