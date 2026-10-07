# Generating the ASD-STE100 agent pack

This kit turns the official **ASD-STE100 Simplified Technical English, Issue 9** PDF into a set of files that AI agents can load and query: rule summaries, per-section rule files with examples, a structured dictionary (JSON/TSV), technical-noun/verb categories, an enforcement checklist, and a reference linter.

The kit contains **no content from the specification**. You must obtain the PDF yourself. The generated pack is derived from a copyrighted document and is for use inside your own environment only; do not publish or redistribute it.

## 1. Get the specification

1. Go to https://www.asd-ste100.org and request the specification through the site's official form (it is free of charge, but you must register and accept ASD's usage conditions).
2. ASD emails a link to the PDF. Save it as `ASD-STE100_ISSUE9.pdf`.
3. Confirm it is Issue 9 (January 2025), 434 pages. The parser is calibrated to this issue's layout; a different issue will need script adjustments (see section 6).

## 2. Set up the environment

Node.js 22 or later on Windows, macOS, Linux, or WSL. There is nothing to install: the kit uses only Node.js built-in modules, including its own PDF reader. Python is not needed.

```
node --version     # v22.0.0 or later
```

Unzip or clone the kit anywhere. Layout:

```
ste-generator-kit/
  run_all.mjs             runs the pipeline end to end
  extract/                PDF reader and the five extraction stages
  handwritten/            README, checklist, dictionary conventions, ste_lint.mjs (copied into the pack)
  tests/                  unit tests (synthetic data only) and developer parity tools
  INSTRUCTIONS.md         this file
```

## 3. Run

PowerShell (Windows):

```powershell
cd ste-generator-kit
$env:STE_PDF  = 'C:\secure\ASD-STE100_ISSUE9.pdf'
$env:STE_WORK = 'C:\secure\ste-work'
node run_all.mjs
```

Command Prompt (Windows):

```bat
cd ste-generator-kit
set STE_PDF=C:\secure\ASD-STE100_ISSUE9.pdf
set STE_WORK=C:\secure\ste-work
node run_all.mjs
```

bash or zsh (Linux, macOS, WSL):

```bash
cd ste-generator-kit
STE_PDF=/secure/ASD-STE100_ISSUE9.pdf STE_WORK=/secure/ste-work node run_all.mjs
```

If `STE_PDF` is not set, the kit reads `ASD-STE100_ISSUE9.pdf` from the kit folder. If `STE_WORK` is not set, it writes to `work/` in the current directory. A relative `STE_PDF` or `STE_WORK` is resolved against the kit folder. Both default locations are in `.gitignore`.

Runtime is a few seconds. Intermediate JSON files (`dict_raw.json`, `dict_entries.json`, `rules_raw.json`, `rules_structured.json`) land in `$STE_WORK`; the deliverable is `$STE_WORK/pack/`. The command exits with code 1 and a one-line message if the PDF is missing, has fewer than 434 pages, or uses a PDF feature the reader does not support.

## 4. Verify

Each stage prints its counts, prefixed with the stage name. Compare them with these expected values:

| Stage | Expected output |
|---|---|
| `parse_dict` | `regions 2249 entries after merge 2194`, `approved (uppercase headword): 877  unapproved: 1317` |
| `structure_dict` | `2194 entries; 876 approved` |
| `parse_rules` | `statements 53 rules with bodies 53 order ok: True`, `missing bodies []` |
| `generate` | `TN cats 22 TV cats 4`, `approved 876 unapproved 1318 forms 1291` |

`generate` then lists each pack file with its size. `parse_rules` and `structure_rules` also print a per-section and per-kind breakdown, which is for troubleshooting only.

The spec itself states 875 approved and 1274 unapproved words. The extracted set is slightly larger; it has no duplicates or empty entries, and the difference is most likely a counting convention (one headword with several parts of speech). The `parse_dict` count of 877 uppercase headwords includes one entry that `structure_dict` classifies as unapproved, so the later stages report 876. If your numbers differ materially from the table, the PDF is a different issue or revision.

Smoke-test the linter (PowerShell; in bash use `printf ... > /tmp/t.md`). Save test files as UTF-8 without a byte order mark: the linter, like the Python original, treats a BOM as part of the first word.

```powershell
Set-Content t.md 'Prior to starting, the cache should be warmed up.' -Encoding ascii
node "$env:STE_WORK\pack\tools\ste_lint.mjs" t.md --mode procedural
```

Expected: errors for "prior to", "should", "warmed" (unapproved words with alternatives) and warnings for passive voice and the "-ing" form. The exit code is 1 because there are errors.

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
    ste_lint.mjs                  mechanical checks; exit 1 on errors; --allow for a project glossary
    extract/                      the scripts that built the pack
```

Read `README.md` in the pack for which files to load for which task. To use the pack with Anchored Docs 2.x, set `STE_AGENT_PACK` to the `pack` folder (or copy the pack into the skill's `references/asd-ste100-agent-pack/`) and run `node <skill>/scripts/ste_check.mjs --status`; it reports `STE word source: pack`.

## 6. How the extraction works (for troubleshooting or a future issue)

- **PDF reading.** `extract/_pdf.mjs` reads the file (xref streams, object streams, FlateDecode, and the Standard security handler with AES-128 and an empty user password, which is what the Issue 9 PDF uses). `extract/_layout.mjs` interprets each page's content stream and returns characters, rectangles, and curves with top-left coordinates; `extract/_words.mjs` groups characters into words and lines. These three files reproduce the exact geometry that pdfplumber 0.11 (on pdfminer.six) gives, which the original Python kit used. A PDF that needs an unsupported feature (another encryption method, classic xref tables, inline images, vertical or rotated text, other font encodings) stops with an error that names the feature.
- **Dictionary (Part 2, PDF pages 149 to 434).** Each page is a four-column table. Column x-ranges are read from the header row ("Word", "Approved", "STE", "Non-STE") on every page because odd and even pages have mirrored margins. Full-width horizontal rules separate entries; partial rules separate sub-rows. The lightbulb "help" icon is drawn as vector curves, and its small rectangles must be ignored when detecting rules. Help text is identified by its indent (28pt past the column start); numbered-meaning hanging indents are narrower. An entry that continues onto the next page is recognized because its first region has no part-of-speech tag in column 1.
- **Rules (Part 1, PDF pages 45 to 128).** Each section opens with a "Summary of the rules" page in 11pt; body rule headings are bold 12pt and topic headings bold 14pt, which is how the two are separated. Line roles come from indent relative to the footer's left edge: body text at 0, help text at 20 to 80 (with an icon), examples labeled `Non-STE:` / `STE:`. Example continuation lines and "or" alternatives are folded into pairs.
- Constants live at the top of `extract/parse_dict.mjs` (page range, help indent, body top/bottom) and `extract/parse_rules.mjs` (page range, size thresholds). For a new issue, adjust the page ranges first, then check the counts in section 4.
- `extract/_py.mjs` holds the Python behaviors the extraction depends on (`round()` half-to-even, `str.isupper()`, Python whitespace, code-point sorting, `json.dump` formatting). Keep using it when you change a stage, or the output will drift from earlier packs.
- Tests: `node --test "tests/unit/*.test.mjs"` runs the unit tests, which use invented content only. `tests/PARITY.md` describes how the Node port was proven equivalent to the Python kit and lists every intended difference.

## 7. License reminder

Every generated Markdown file starts with a provenance comment naming ASD as the copyright holder. Keep the pack alongside your licensed copy of the PDF, out of public repositories, and do not share it with anyone who has not registered for the specification themselves.
