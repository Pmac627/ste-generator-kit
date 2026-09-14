# Generating the ASD-STE100 agent pack

This kit turns the official **ASD-STE100 Simplified Technical English, Issue 9** PDF into a set of files that AI agents can load and query: rule summaries, per-section rule files with examples, a structured dictionary (JSON/TSV), technical-noun/verb categories, an enforcement checklist, and a reference linter.

The kit contains **no content from the specification**. You must obtain the PDF yourself. The generated pack is derived from a copyrighted document and is for use inside your own environment only; do not publish or redistribute it.

## 1. Get the specification

1. Go to https://www.asd-ste100.org and request the specification through the site's official form (it is free of charge, but you must register and accept ASD's usage conditions).
2. ASD emails a link to the PDF. Save it as `ASD-STE100_ISSUE9.pdf`.
3. Confirm it is Issue 9 (January 2025), 434 pages. The parser is calibrated to this issue's layout; a different issue will need script adjustments (see section 6).

## 2. Set up the environment

Linux or macOS with Python 3.10+.

```bash
pip install pdfplumber            # coordinate-based PDF extraction
# poppler-utils is optional but useful for inspection (pdfinfo, pdftotext)
```

Unzip the kit anywhere. Layout:

```
ste-generator-kit/
  run_all.sh              runs the pipeline end to end
  extract/                five extraction scripts, run in order
  handwritten/            README, checklist, dictionary conventions, ste_lint.py (copied into the pack)
  INSTRUCTIONS.md         this file
```

## 3. Run

```bash
cd ste-generator-kit
STE_PDF=/path/to/ASD-STE100_ISSUE9.pdf STE_WORK=/path/to/workdir ./run_all.sh
```

Runtime is about one minute. Intermediate JSON files land in `$STE_WORK`; the deliverable is `$STE_WORK/pack/`.

## 4. Verify

The scripts print counts. Compare them with these expected values:

| Stage | Expected output |
|---|---|
| `parse_dict.py` | `regions 2249 entries after merge 2194`, `approved 877 unapproved 1317` |
| `structure_dict.py` | `2194 entries; 876 approved` |
| `parse_rules.py` | `statements 53 rules with bodies 53 order ok: True`, `missing bodies []` |
| `generate.py` | `TN cats 22 TV cats 4`, `approved 876 unapproved 1318 forms 1291` |

The spec itself states 875 approved and 1274 unapproved words. The extracted set is slightly larger; it has no duplicates or empty entries, and the difference is most likely a counting convention (one headword with several parts of speech). If your numbers differ materially from the table, the PDF is a different issue or revision.

Smoke-test the linter:

```bash
printf 'Prior to starting, the cache should be warmed up.\n' > /tmp/t.md
python3 "$STE_WORK/pack/tools/ste_lint.py" /tmp/t.md --mode procedural
```
Expected: errors for "prior to", "should", "warmed" (unapproved words with alternatives) and warnings for passive voice and the "-ing" form.

## 5. What the pack contains

```
pack/
  README.md                       file map, loading strategy per task, data model, known limits
  rules/
    ste-rules-summary.md          53 rule statements, ~1.7K tokens: put this in a system prompt
    enforcement-checklist.md      hard (mechanical) vs judgment checks, sentence limits by text type
    section-1-words.md ... section-9-writing-practices.md
                                  full rule text, help notes, Not-STE / STE example pairs
    technical-categories.md/.json 22 technical-noun and 4 technical-verb categories
    ste-rules.json                every rule as typed blocks
    index.md
  dictionary/
    dictionary-conventions.md     how to read entries, forms, help, alternatives
    approved-wordlist.md          all approved words with part of speech, ~3K tokens
    approved-wordforms.txt        lowercase membership list
    approved-words.json/.tsv      approved entries without examples
    unapproved-words.json / unapproved-lookup.tsv
                                  unapproved word -> approved alternatives -> help
    ste-dictionary.json           full fidelity with all examples (~200K tokens; query, never load whole)
  tools/
    ste_lint.py                   mechanical checks; exit 1 on errors; --allow for a project glossary
    extract/                      the scripts that built the pack
```

Read `README.md` in the pack for which files to load for which task.

## 6. How the extraction works (for troubleshooting or a future issue)

- **Dictionary (Part 2, PDF pages 149 to 434).** Each page is a four-column table. Column x-ranges are read from the header row ("Word", "Approved", "STE", "Non-STE") on every page because odd and even pages have mirrored margins. Full-width horizontal rules separate entries; partial rules separate sub-rows. The lightbulb "help" icon is drawn as vector curves, and its small rectangles must be ignored when detecting rules. Help text is identified by its indent (28pt past the column start); numbered-meaning hanging indents are narrower. An entry that continues onto the next page is recognized because its first region has no part-of-speech tag in column 1.
- **Rules (Part 1, PDF pages 45 to 128).** Each section opens with a "Summary of the rules" page in 11pt; body rule headings are bold 12pt and topic headings bold 14pt, which is how the two are separated. Line roles come from indent relative to the footer's left edge: body text at 0, help text at 20 to 80 (with an icon), examples labeled `Non-STE:` / `STE:`. Example continuation lines and "or" alternatives are folded into pairs.
- Constants live at the top of `parse_dict.py` (page range, help indent, body top/bottom) and `parse_rules.py` (page range, size thresholds). For a new issue, adjust the page ranges first, then check the counts in section 4.

## 7. License reminder

Every generated Markdown file starts with a provenance comment naming ASD as the copyright holder. Keep the pack alongside your licensed copy of the PDF, out of public repositories, and do not share it with anyone who has not registered for the specification themselves.
