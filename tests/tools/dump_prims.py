# Dump pdfplumber primitives the kit uses, for every page in the kit's ranges (developer tool, never shipped).
# Usage: python -I tests/tools/dump_prims.py <pdf> <prims.json>   (needs pdfplumber 0.11.x; output stays outside the repo)
import sys, json, pdfplumber
pdf = pdfplumber.open(sys.argv[1]); out = {}
pages = list(range(45, 129)) + list(range(149, 435))
for p in pages:
    pg = pdf.pages[p-1]
    w = pg.extract_words(extra_attrs=['fontname', 'size'])
    out[p] = dict(words=[[x['text'], round(x['x0'],3), round(x['x1'],3), round(x['top'],3), round(x['bottom'],3), x['fontname'], round(x['size'],3)] for x in w],
                  rects=[[round(r['x0'],3), round(r['x1'],3), round(r['top'],3), round(r['height'],3)] for r in pg.rects],
                  curves=[[round(c['x0'],3), round(c['x1'],3), round(c['top'],3)] for c in pg.curves],
                  text=pg.extract_text() or '')
json.dump(out, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False)
