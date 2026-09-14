# ASD-STE100 Issue 9: agent pack

Machine-readable derivation of **ASD-STE100 Simplified Technical English, Issue 9 (January 2025)** for use by AI agents that write or review technical documentation. Built from the official PDF (434 pages) by coordinate-based extraction of the writing rules (Part 1) and the four-column dictionary (Part 2).

## License posture

ASD-STE100 is copyright ASD and is distributed under specific usage rights (see the spec's copyright page). These files are a **derived internal reference** for tooling that consumes the spec. Keep them inside the environment that holds the licensed PDF. Do not publish, redistribute, or commit them to a public repository. Every generated Markdown file carries a provenance comment at the top.

## What is here

```
rules/
  ste-rules-summary.md        53 rule statements, grouped by section and topic         ~1.7K tokens
  enforcement-checklist.md    hard (mechanical) vs judgment checks, with limits table  ~1.2K tokens
  index.md                    section -> file -> rule map
  section-1-words.md ...      full text per section: statement, explanation, help,     2K-9K tokens each
  section-9-writing-practices.md   Not-STE / STE example pairs
  technical-categories.md     22 technical-noun and 4 technical-verb categories (1.5, 1.12)
  technical-categories.json   same, structured
  ste-rules.json              every rule as typed blocks (para/heading/help/examples/list)
dictionary/
  dictionary-conventions.md   how to interpret entries, forms, help, alternatives      ~1K tokens
  approved-wordlist.md        876 approved words with part of speech, by letter        ~3K tokens
  approved-wordforms.txt      lowercase membership list (headwords + listed forms)
  approved-words.json         approved entries without examples
  unapproved-words.json       unapproved entries: alternatives + help, no examples
  approved-words.tsv          grep-friendly
  unapproved-lookup.tsv       grep-friendly: word -> alternatives -> help
  ste-dictionary.json         full fidelity (all examples); ~200K tokens, query it, never load it whole
tools/
  ste_lint.py                 reference implementation of the mechanical checks
```

## Loading strategy for agents

| Task | Load |
|---|---|
| Always-on awareness in a system prompt | `rules/ste-rules-summary.md` + `rules/enforcement-checklist.md` (~3K tokens) |
| Writing a procedure or description | add the relevant `rules/section-N-*.md` (Sections 3, 4, 5 or 6, 8) |
| Checking a specific word | look it up in `unapproved-lookup.tsv` / `approved-words.tsv`, or query `ste-dictionary.json` by `word` + `pos` |
| Deciding whether an unknown word is allowed | `rules/technical-categories.md` |
| Automated gate in CI or a skill | `python tools/ste_lint.py FILE --mode procedural|descriptive [--allow glossary.txt]` |

`ste_lint.py` exits 1 on any hard-rule error. Unknown words (not approved, not listed as unapproved) are warnings, because they may be technical nouns/verbs; feed a project glossary with `--allow` to silence known terms (Rule 1.8).

## Data model (JSON)

Dictionary entry (both entries are invented to show the shape of the data; they are not in the dictionary):
```json
{"word": "frobnicate", "pos": "v", "approved": false, "page": "2-1-Z9",
 "alternatives": [{"alternative": "TWEAK (v)", "ste_examples": ["TWEAK THE WIDGET."],
                   "non_ste_examples": ["Frobnicate the widget."]}]}
{"word": "WIDGET", "pos": "n", "approved": true, "forms": ["WIDGETS"],
 "meanings": [{"meaning": "An invented part for this example ...", "ste_examples": ["..."], "help": ["An invented help note."]}]}
```
Rule (`ste-rules.json`): `{id, section, section_title, topic, statement, blocks[]}` where each block is `{kind: para|heading|label|topic|help|list|examples, text, pairs?}` and `pairs` is `[{non_ste?, ste[], notes?}]`.

## Known extraction limits

- Entry counts: spec states 875 approved / 1274 unapproved; extraction yields 876 / 1318. No duplicates or empty entries were found; the difference is most likely the spec counting a headword once across several parts of speech. Treat the extracted set as complete.
- About 60 dictionary examples end without terminal punctuation (many legitimately end in a colon); a few are wrapped fragments.
- In Rules 1.3 (PDF p.48) and 9.1 (PDF p.116) the source puts explanatory prose between a Non-STE example and its STE rewrite, so those render as a Non-STE-only row followed by the paragraph and then the STE row. No data is missing.
- Tables inside rules (1.4 verb/adjective form tables, 3.2 tense table, 1.5/1.12 category word lists) are preserved as indented `list` lines, not as parsed tables.
- The General Introduction, Highlights (change log), and the change form are not included; nothing in them governs writing.

## Regenerating

The extraction scripts are in `tools/extract/` (run in order: parse_dict, structure_dict, parse_rules, structure_rules, generate; paths are hardcoded to /home/claude/ste and /mnt/user-data/uploads). Re-extraction needs `pdfplumber` and the Issue 9 PDF; the approach is column geometry from the header row on each dictionary page, full-width rules as entry separators, help detected by the lightbulb icon curves, and font size/weight to separate rule statements from body text.
