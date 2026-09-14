#!/usr/bin/env python3
"""ste_lint.py: mechanical ASD-STE100 (Issue 9) checks against the extracted dictionary.

Hard (error) checks are the ones the standard makes mechanical. Heuristic checks are warnings.
Usage:
    python ste_lint.py FILE.md [--mode procedural|descriptive] [--json] [--allow FILE]
    --mode       sets the sentence limit: procedural = 20 words (Rule 5.1), descriptive = 25 (Rule 6.3). Default: descriptive.
    --allow      newline-separated technical nouns/verbs approved for your project (Rule 1.8). Case-insensitive.
    --json       machine-readable output.
Exit code 1 if any error, else 0.
"""
import argparse, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DICT = os.path.join(HERE, '..', 'dictionary')

def load():
    approved = json.load(open(os.path.join(DICT, 'approved-words.json'), encoding='utf-8'))
    unapproved = json.load(open(os.path.join(DICT, 'unapproved-words.json'), encoding='utf-8'))
    forms = set()
    for e in approved:
        forms.add(e['word'].lower())
        for f in e.get('forms', []):
            forms.add(f.lower())
        if e['pos'] == 'n':
            forms.add(e['word'].lower() + 's'); forms.add(e['word'].lower() + 'es')  # plurals permitted unless help says otherwise
    un, phrases = {}, {}
    for e in unapproved:
        w = e['word'].lower()
        (phrases if ' ' in w else un).setdefault(w, []).append(e)
    return forms, un, phrases

def stems(lt):
    out = [lt]
    for suf, rep in (('ies', 'y'), ('es', ''), ('s', ''), ('ed', ''), ('ed', 'e'), ('ing', ''), ('ing', 'e'), ('ly', ''), ('er', ''), ('est', '')):
        if lt.endswith(suf) and len(lt) - len(suf) >= 3:
            out.append(lt[:-len(suf)] + rep)
    return out

# Rule 8.6: these count as one word and are not dictionary lookups
SKIP_TOKEN = re.compile(r'^(\d[\d.,:/-]*[a-zA-Z%°]*|[A-Z]{2,}[A-Z0-9-]*|[A-Za-z]+\d[\w-]*|\w+\.\w+)$')
STOP_PUNCT = re.compile(r'[.!?:]$')

def sentences(text):
    """Very light sentence splitter that respects Rule 8.4 (colon ends a sentence in a list)."""
    text = re.sub(r'`[^`]*`', ' CODE ', text)          # inline code counts as one token
    text = re.sub(r'\[([^\]]*)\]\([^)]*\)', r'\1', text)  # markdown links -> text
    for para in re.split(r'\n\s*\n', text):
        para = re.sub(r'^\s*(#+|[-*]|\d+\.)\s*', '', para, flags=re.M)
        for s in re.split(r'(?<=[.!?:])\s+(?=[A-Z(“"])', para.replace('\n', ' ')):
            s = s.strip()
            if s:
                yield s

def word_count(s):
    """Rule 8.5/8.6/8.7: parenthetical text = 1 word, hyphenated = 1 word, numbers/units/ids = 1 word."""
    s = re.sub(r'\([^)]*\)', ' PAREN ', s)
    s = re.sub(r'\d+\s*(mm|cm|m|in|inches|kg|g|lb|psi|kPa|°[CF]|%|V|A|Hz|s|ms)\b', 'UNIT', s)
    toks = [t for t in re.split(r'\s+', s) if re.search(r'\w', t)]
    return len(toks)

def tokens(s):
    s = re.sub(r'\([^)]*\)', ' ', s)
    return re.findall(r"[A-Za-z][A-Za-z'\-]*", s)

PASSIVE = re.compile(r'\b(is|are|was|were|be|been|being)\s+(\w+ed|\w+en|built|done|made|put|set|shown|found|given|held|kept|left|sent|told)\b', re.I)
CONTRACTION = re.compile(r"\b\w+'(t|re|ve|ll|d|s|m)\b", re.I)
ING = re.compile(r'\b\w{3,}ing\b')
COMPLEX_AUX = re.compile(r'\b(has|have|had|is|are|was|were|will be|would|should|could|may|might|must)\s+(been\s+)?\w+(ed|ing)\b', re.I)

def lint(text, mode='descriptive', allow=()):
    forms, un, phrases = load()
    allow = {a.lower() for a in allow}
    limit = 20 if mode == 'procedural' else 25
    findings = []
    seen_unknown = set()
    for n, s in enumerate(sentences(text), 1):
        wc = word_count(s)
        if wc > limit:
            findings.append(dict(level='error', rule='5.1' if mode == 'procedural' else '6.3',
                                 msg=f'{wc} words (max {limit})', sentence=s))
        if ';' in s:
            findings.append(dict(level='error', rule='8.1', msg='semicolon is not permitted', sentence=s))
        if CONTRACTION.search(s):
            findings.append(dict(level='error', rule='4.2', msg='contraction', sentence=s))
        for t in tokens(s):
            lt = t.lower().strip("'-")
            if not lt or SKIP_TOKEN.match(t) or lt in allow or lt in forms:
                continue
            hit = next((c for c in stems(lt) if c in un), None)
            if hit:
                alts = sorted({a for e in un[hit] for a in e['alternatives']})
                poses = {e['pos'] for e in un[hit]}
                tn_ok = any('[TN]' in a or '(TN)' in a for a in alts) or (poses == {'v'} and hit + ' [tn]' in ' '.join(alts).lower())
                if tn_ok:
                    findings.append(dict(level='warn', rule='1.7', msg=f'"{t}" is not approved as {"/".join(sorted(poses))}; permitted only as a technical noun', sentence=s))
                else:
                    findings.append(dict(level='error', rule='1.1', msg=f'"{t}" is not approved ({hit}, {"/".join(sorted(poses))}); alternatives: {", ".join(alts) or "see help"}', sentence=s))
            elif lt not in seen_unknown:
                seen_unknown.add(lt)
                findings.append(dict(level='warn', rule='1.5/1.12', msg=f'"{t}" is not in the dictionary: allowed only as a technical noun/verb', sentence=s))
        low = ' ' + s.lower() + ' '
        for ph, es in phrases.items():
            if ' ' + ph + ' ' in low:
                alts = sorted({a for e in es for a in e['alternatives']})
                findings.append(dict(level='error', rule='1.1', msg=f'"{ph}" is not approved; alternatives: {", ".join(alts) or "see help"}', sentence=s))
        if PASSIVE.search(s):
            findings.append(dict(level='warn', rule='3.6', msg='possible passive voice', sentence=s))
        if COMPLEX_AUX.search(s):
            findings.append(dict(level='warn', rule='3.4', msg='possible complex verb construction (auxiliary + participle)', sentence=s))
        if ING.search(s):
            findings.append(dict(level='warn', rule='3.5', msg='"-ing" form: permitted only inside a technical noun', sentence=s))
    # paragraph length (Rule 6.6)
    for para in re.split(r'\n\s*\n', text):
        if para.strip().startswith(('#', '|', '```')):
            continue
        n = len(list(sentences(para)))
        if n > 6:
            findings.append(dict(level='error', rule='6.6', msg=f'paragraph has {n} sentences (max 6)', sentence=para[:80] + '...'))
    return findings

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('file'); ap.add_argument('--mode', default='descriptive', choices=['procedural', 'descriptive'])
    ap.add_argument('--json', action='store_true'); ap.add_argument('--allow')
    a = ap.parse_args()
    allow = [l.strip() for l in open(a.allow, encoding='utf-8')] if a.allow else []
    f = lint(open(a.file, encoding='utf-8').read(), a.mode, allow)
    if a.json:
        print(json.dumps(f, indent=1))
    else:
        for x in f:
            print(f"[{x['level'].upper()} rule {x['rule']}] {x['msg']}\n    {x['sentence'][:120]}")
        print(f"{sum(x['level']=='error' for x in f)} errors, {sum(x['level']=='warn' for x in f)} warnings")
    sys.exit(1 if any(x['level'] == 'error' for x in f) else 0)

if __name__ == '__main__':
    main()
