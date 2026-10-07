"""Confirm the synthetic test expectations against pdfplumber itself (developer tool, never shipped).

Usage:
    node tests/tools/crosscheck_synthetic.mjs <dir>
    python tests/tools/crosscheck_synthetic.py <dir>      # needs pdfplumber 0.11.x
Exit 1 if pdfplumber disagrees with the Node port on any case.
"""
import json
import os
import sys

import pdfplumber
from pdfplumber.utils import extract_text, extract_words


def main(d):
    node = json.load(open(os.path.join(d, 'node.json'), encoding='utf-8'))
    bad = 0
    for name, n in node['pdfs'].items():
        with pdfplumber.open(os.path.join(d, name + '.pdf')) as pdf:
            pg = pdf.pages[0]
            p = dict(chars=[[c['text'], c['x0'], c['x1'], c['top'], c['bottom'], c['fontname'], c['size']] for c in pg.chars],
                     rects=[[r['x0'], r['x1'], r['top'], r['height']] for r in pg.rects],
                     curves=[[r['x0'], r['x1'], r['top']] for r in pg.curves])
        if p != n:
            bad += 1
            print('DIFF pdf', name, '\n  pdfplumber', p, '\n  node      ', n)
    for name, n in node['words'].items():
        chars = [dict(c, doctop=c['top']) for c in n['chars']]
        p = dict(plain=[[w['text'], w['x0'], w['x1'], w['top'], w['bottom']] for w in extract_words(chars)],
                 fontname=[[w['text'], w['fontname']] for w in extract_words(chars, extra_attrs=['fontname'])],
                 text=extract_text(chars))
        n = {k: n[k] for k in ('plain', 'fontname', 'text')}
        if p != n:
            bad += 1
            print('DIFF words', name, '\n  pdfplumber', p, '\n  node      ', n)
    py, c = node['py'], node['py']['cases']
    expect = dict(round0=[round(x) for x in c['round0']],
                  round1=[round(x, n) for x, n in c['round1']],
                  isupper=[s.isupper() for s in c['isupper']],
                  strip=[s.strip() for s in c['strip']],
                  json_indent1=[json.dumps(v, indent=1, ensure_ascii=False) for v in c['json']],
                  json_indent0_ascii=[json.dumps(v, indent=0) for v in c['json']],
                  json_compact=[json.dumps(v, ensure_ascii=False) for v in c['json']],
                  sort=sorted(c['sort']))
    for k, v in expect.items():
        if v != py[k]:
            bad += 1
            print('DIFF py', k, '\n  python', v, '\n  node  ', py[k])
    print('pdfplumber', pdfplumber.__version__, 'cases', len(node['pdfs']) + len(node['words']) + len(expect), 'diffs', bad)
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1]))
