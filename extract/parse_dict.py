import os
import pdfplumber, json, re, sys
from collections import defaultdict

POS_RE = re.compile(r'\((n|v|adj|adv|pron|art|prep|conj)\)')
PDF = os.environ.get('STE_PDF', 'ASD-STE100_ISSUE9.pdf')
FIRST, LAST = 149, 434  # PDF pages (1-based) of the word list
COLS = [(46, 155), (155, 284.5), (284.5, 414.3), (414.3, 545)]
HELP_INDENT_X = 175.0  # col2 text starting right of this is help text
BODY_TOP, BODY_BOTTOM = 89, 715
LINE_GAP_NEW_BLOCK = 15.5  # vertical gap (pt) that starts a new block

def col_of(x):
    for i, (a, b) in enumerate(COLS):
        if a <= x < b:
            return i
    return None

def group_lines(words):
    """group words into lines by 'top' (tolerance 2pt), return list of dict(top, col, x0, text, bold)"""
    lines = []
    words = sorted(words, key=lambda w: (round(w['top']), w['x0']))
    cur = None
    for w in words:
        c = col_of(w['x0'])
        if c is None:
            continue
        if cur and abs(w['top'] - cur['top']) <= 2.0 and cur['col'] == c:
            cur['text'] += ' ' + w['text']
            cur['x1'] = w['x1']
        else:
            cur = dict(top=w['top'], bottom=w['bottom'], col=c, x0=w['x0'], x1=w['x1'],
                       text=w['text'], bold='Bold' in w['fontname'])
            lines.append(cur)
    return lines

def blocks_from_lines(lines, seps):
    global HELP_INDENT_X
    """split a column's lines into blocks by vertical gap or crossing separator rule"""
    blocks = []
    cur = None
    for ln in sorted(lines, key=lambda l: l['top']):
        new = cur is None
        if cur is not None:
            gap = ln['top'] - cur['last_top']
            crossed = any(cur['last_top'] < s < ln['top'] for s in seps)
            indent_change = (ln['x0'] >= HELP_INDENT_X) != cur['help']
            if gap > LINE_GAP_NEW_BLOCK or crossed or indent_change:
                new = True
        if new:
            cur = dict(top=ln['top'], last_top=ln['top'], x0=ln['x0'], help=ln['x0'] >= HELP_INDENT_X,
                       text=ln['text'])
            blocks.append(cur)
        else:
            cur['text'] += ' ' + ln['text']
            cur['last_top'] = ln['top']
    return blocks

entries = []
pdf = pdfplumber.open(PDF)
for pno in range(FIRST, LAST + 1):
    pg = pdf.pages[pno - 1]
    words = pg.extract_words(extra_attrs=['fontname'])
    hdr = {w['text']: w['x0'] for w in words if 60 < w['top'] < 85 and w['text'] in ('Word','Approved','STE','Non-STE')}
    if len(hdr) < 4:
        print('no header on page', pno, hdr); continue
    xw, xa, xs, xn = hdr['Word'], hdr['Approved'], hdr['STE'], hdr['Non-STE']
    COLS[:] = [(xw-8, xa-3), (xa-3, xs-3), (xs-3, xn-3), (xn-3, xn+150)]
    globals()['HELP_INDENT_X'] = xa + 28
    body = [w for w in words if BODY_TOP < w['top'] < BODY_BOTTOM]
    # separators
    by_top = defaultdict(list)
    for r in pg.rects:
        if BODY_TOP < r['top'] < BODY_BOTTOM and r['height'] < 3:
            by_top[round(r['top'], 0)].append(r)
    full_seps, part_seps = [], []
    for t, rs in by_top.items():
        x0 = min(r['x0'] for r in rs); x1 = max(r['x1'] for r in rs)
        if x1 - x0 < 60:
            continue  # icon fragments, not rules
        (full_seps if (x0 < xw + 15 and x1 > xn + 50) else part_seps).append(t)
    full_seps.sort(); part_seps.sort()
    lines = group_lines(body)
    # page label
    lab = re.search(r'Page\s+(2-1-[A-Z]\d+)', pg.extract_text() or '')
    label = lab.group(1) if lab else str(pno)
    # split lines into entry regions by full separators; a region is [prev_sep, sep)
    bounds = [BODY_TOP] + full_seps + [BODY_BOTTOM]
    for i in range(len(bounds) - 1):
        lo, hi = bounds[i], bounds[i + 1]
        region = [l for l in lines if lo <= l['top'] < hi]
        if not region:
            continue
        col1 = [l for l in region if l['col'] == 0]
        # continuation from previous page: region without a bold col1 headword
        head_lines = [l for l in col1 if l['bold']]
        seps_here = [s for s in part_seps if lo < s < hi]
        cols = {c: blocks_from_lines([l for l in region if l['col'] == c], seps_here) for c in range(1, 4)}
        rec = dict(page=pno, label=label, top=lo,
                   col1=[l['text'] for l in col1], col1_bold=[l['text'] for l in head_lines],
                   col2=cols[1], col3=cols[2], col4=cols[3],
                   continuation=not POS_RE.search(' '.join(l['text'] for l in col1)))
        entries.append(rec)

# merge continuations into previous entry
merged = []
for e in entries:
    if e['continuation'] and merged:
        prev = merged[-1]
        prev['col1'] += e['col1']
        # shift tops so later blocks sort after earlier ones
        off = 10000 * (len(prev.get('pages', [])) + 1)
        for c in ('col2', 'col3', 'col4'):
            for b in e[c]:
                b['top'] += off; b['last_top'] += off
            prev[c] += e[c]
        prev.setdefault('pages', [prev['page']]).append(e['page'])
    else:
        merged.append(e)

json.dump(merged, open(os.path.join(os.environ.get('STE_WORK', '.'), 'dict_raw.json'), 'w'), indent=0)
print('regions', len(entries), 'entries after merge', len(merged))
up = sum(1 for e in merged if e['col1_bold'] and e['col1_bold'][0].split('(')[0].strip().isupper())
print('approved (uppercase headword):', up, ' unapproved:', len(merged) - up)
