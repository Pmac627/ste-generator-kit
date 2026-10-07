# Parity: Node port vs the Python kit

The Python kit (commit `c26cb4a`, pdfplumber 0.11.10 on pdfminer.six 20260107, Python 3.12) was replaced by the Node.js port in this folder. This file records how equivalence was proven, how to repeat the proof, and every intended difference. Any difference not listed here is a bug.

Nothing in this repository is derived from the specification. The real-data comparisons below run only on a machine that holds the licensed PDF, and their outputs stay outside the repository.

## Results (2026-10-07, Node 24.21, Windows 11)

These results prove the straight port, before the one deliberate fix (intended difference 9). With that fix applied, exactly 6 of 2,194 dictionary entries differ from the Python kit, and every other row below still holds. The fix changes `dict_raw.json`, `dict_entries.json`, `dictionary/ste-dictionary.json`, `dictionary/approved-words.json`, and `dictionary/approved-words.tsv`; the counts do not change.

| Check | Data | Result |
|---|---|---|
| Two Python runs | Issue 9 PDF | identical (only the absolute work path in the file listing differs) |
| Two Node runs | Issue 9 PDF | identical |
| PDF primitives: every word (text, box, fontname, size), rect, curve, and page text | Issue 9, all 370 pages the kit reads | 0 differences against pdfplumber (3 decimal places) |
| `dict_raw.json`, `dict_entries.json`, `rules_raw.json`, `rules_structured.json` | Issue 9 | deep-equal; `dict_entries.json` and `rules_structured.json` byte-identical |
| Every generated pack file (`rules/*`, `dictionary/*`) | Issue 9 | byte-identical (after CRLF normalization, see below) |
| Count lines | Issue 9 | identical to the `INSTRUCTIONS.md` table |
| Full pipeline, intermediates, pack, and `parse_*` stdout | synthetic 434-page PDF (`tools/synthetic_issue.mjs`) | identical to the Python kit |
| Synthetic PDF, word, and Python-helper cases (`tools/crosscheck_synthetic.*`) | 26 invented cases | identical to pdfplumber and CPython |
| `lint()` findings, `ste_lint.mjs` vs `ste_lint.py`, both modes (`tools/crosscheck_lint.mjs`) | 842 local Markdown files, against the Issue 9 pack (564,332 findings) and the synthetic pack (553,788 findings) | 0 differences |
| CLI text output, `--json`, `--allow`, `--mode`, exit codes | 23 files x 5 option sets | identical, except a missing file (intended difference 8) |
| Documented bash steps, Node 22.23.3 (official tarball), no Python on PATH | WSL Ubuntu, Issue 9 PDF | 37 of 37 tests pass; pack byte-identical to the Windows run (fix included) |
| Pipeline and tests on Node 22.0.0 | Windows, Issue 9 PDF | output identical to Node 24 |

Runtime on Issue 9: Python 39 s, Node 3.6 s. The first linter comparison found one bug in the port (a UTF-8 byte order mark was stripped; Python keeps it as a character), fixed before the results above.

## Mutation check

Each mutation below was applied to a copy of the port to confirm that some test fails.

- Killed by the real-data comparison: ignoring the font descent, ignoring `Q`, JS `\s` and `trim()` instead of Python whitespace, dropping the example-notes merge, a fixed continuation-page offset.
- Equivalent on Issue 9, so killed by unit tests instead: `Math.round` for `round()` (separator key, indent, font size), a return to the `round(top)` line sort, a naive `isupper`, UTF-16 sort order, `None` rendered as `null`, word tolerance 2.9, `Tw` ignored or applied to multibyte fonts, the Form XObject CTM quirk, ligature expansion, the AFM metric substitution, `ensure_ascii` not escaping DEL, `round(-0.5)` giving `-0`, the empty-text-char rule, and the redundant closing `l` rule.
- Equivalent on every input the pipeline can produce: Python's `$` matching before a trailing newline in `structure_dict` (block text never contains a newline).

## Intended differences

1. **Line endings.** Python on Windows writes CRLF in text mode; the Node port always writes LF, which is what Python writes on Linux and macOS. The comparison normalizes CRLF.
2. **Integral floats in two intermediates.** `dict_raw.json` and `rules_raw.json` carry coordinates. Python writes an integral float as `136.0`; JavaScript has one number type and writes `136`. The values are equal, and no pack file contains floats.
3. **Console output.** Each count line is prefixed with its stage name, and all five stages print their counts (`run_all.sh` hid the output of the two `structure_*` stages). The Python debug dumps of sample entries and blocks are not ported; `structure_rules` prints one block-kind count line instead. The `generate` file list uses pack-relative paths with forward slashes.
4. **`pack/tools/`.** `ste_lint.mjs` replaces `ste_lint.py`, and `tools/extract/` holds the `.mjs` stages instead of the `.py` scripts. The handwritten `README.md` and `enforcement-checklist.md` name the new linter, so those two copied files differ from the Python-era pack.
5. **Fail fast.** The reader stops with an error on PDF features Issue 9 does not use (classic xref tables, other encryption, inline images, rotated or vertical text, other font encodings), and `run_all.mjs` stops if the PDF has fewer than 434 pages. The Python kit would continue on a best-effort basis or crash with a traceback.
6. **Diagnostics for a page without a table header.** Python printed a dict repr (`{'Word': 50.4}`); Node prints JSON (`{"Word":50.4}`). Issue 9 has no such page.
7. **`structure_rules.py` crashed without a rule 1.2** (its debug print indexed it). The Node stage has no such requirement.
8. **`ste_lint.mjs` errors.** Invalid UTF-8 or a missing file gives a one-line message and exit 1, where Python printed a traceback (also exit 1). Option parsing follows argparse's messages and exit code 2, but does not accept abbreviated option names such as `--mo`.
9. **Dictionary line order (a bug fix).** `parse_dict` groups a column's words into lines. The Python kit ordered the words by `(round(top), x0)`, so a glyph that sits a fraction of a point off its line went to the end of the line when the two tops rounded to different integers. The Node stage orders by line cluster (tops within 2pt, the tolerance the grouping already used), then `x0`. On Issue 9 this corrects 6 entries: a raised meaning number ("2.") that ended up inside the meaning text of PUSH and SOAK, a degree sign that moved to the start of an example in two entries, a colon in a help note, and a separated letter in one example. The counts do not change. On the synthetic issue, one invented example changes from "B2 A1" to "A1 B2".

## pdfminer behaviors kept on purpose

These look like bugs but the port keeps them, because the baseline depends on them:

- `Q` restores the whole text state, including the text matrix.
- After a Form XObject, the device CTM stays as the form left it until the next `cm` or `Q`.
- The `"` operator sets word and character spacing but does not move to the next line.
- A simple font whose BaseFont is a standard-14 name (only `Helvetica` occurs in Issue 9) uses the built-in AFM metrics, not the PDF's `/Widths`.
- Curve bounds use segment end points only, not Bezier control points.

## Repeating the proof

Developer tools in `tests/tools/` may use Python and pdfplumber; nothing that ships does. You need the licensed PDF and a Python 3.12 environment with `pdfplumber==0.11.10`.

1. Baseline: `git worktree add ../kit-python c26cb4a`, then run its `run_all.sh` (or the five scripts in order) with `PYTHONUTF8=1`, `STE_PDF`, and `STE_WORK` set to a folder outside the repository.
2. Port: `STE_PDF=... STE_WORK=<another folder> node run_all.mjs`.
3. Compare the two work folders: `node tests/tools/compare_work.mjs <python_work> <node_work>` (deep-equal intermediates, byte-equal pack files after normalizing CRLF; the `tools/` entries and the two edited handwritten files are intended differences).
4. PDF primitives: `python -I tests/tools/dump_prims.py <pdf> prims.json`, then `node tests/tools/compare_prims.mjs <pdf> prims.json`.
5. Synthetic issue, no licensed data needed: `node tests/tools/synthetic_issue.mjs synthetic.pdf`, then run both kits on `synthetic.pdf` and compare the same way.
6. Synthetic cases: `node tests/tools/crosscheck_synthetic.mjs <dir>` then `python -I tests/tools/crosscheck_synthetic.py <dir>`.
7. Linter: `git show c26cb4a:handwritten/ste_lint.py > ste_lint.py`, then `node tests/tools/crosscheck_lint.mjs <python> ste_lint.py <pack_dir> <folders with .md files>`.
