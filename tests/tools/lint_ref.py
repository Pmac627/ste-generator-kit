"""Run the original Python ste_lint.py over many files and print the findings as JSON (developer tool, never shipped).

Usage:
    python -I tests/tools/lint_ref.py <ste_lint.py> <pack_dir> <file_list.txt>
<ste_lint.py> is the last Python version: git show c26cb4a:handwritten/ste_lint.py > ste_lint.py
<file_list.txt> holds one path per line. Output: {path: {"descriptive": [...], "procedural": [...]}} or {"error": msg}.
"""
import json
import os
import runpy
import sys


def main(ref, pack, listfile):
    g = runpy.run_path(ref, run_name='ste_lint_ref')
    # run_path returns a copy of the module globals; patch the dict the functions actually use.
    g['load'].__globals__['DICT'] = os.path.join(pack, 'dictionary')
    out = {}
    for path in open(listfile, encoding='utf-8').read().split('\n'):
        if not path:
            continue
        try:
            text = open(path, encoding='utf-8').read()
        except (UnicodeDecodeError, OSError) as e:
            out[path] = {'error': type(e).__name__}
            continue
        out[path] = {m: g['lint'](text, m, []) for m in ('descriptive', 'procedural')}
    sys.stdout.reconfigure(encoding='utf-8')
    print(json.dumps(out, ensure_ascii=False))


if __name__ == '__main__':
    main(*sys.argv[1:4])
