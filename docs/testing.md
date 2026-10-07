---
type: Runbook
title: Testing
description: How to run the unit tests, how the tests make invented PDFs, and how to compare the kit with the Python kit again.
diataxis: how-to
status: stable
sources:
  - id: unit
    resource: tests/unit/**
  - id: helpers
    resource: tests/helpers/**
  - id: tools
    resource: tests/tools/**
  - id: parity
    resource: tests/PARITY.md
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-07T22:00:00Z }
verified:
  - { by: claude-code/claude-opus-5-5, at: 2026-10-07T22:00:00Z }
  - { by: human:Pmac627, at: 2026-10-07T22:30:00Z }
---

# Testing

## Run the unit tests

1. Go to the kit folder.
2. Run `node --test "tests/unit/*.test.mjs"`.
3. Make sure that the last lines show `fail 0`.

The unit tests do not use the licensed PDF, Python, or the network. They use only invented pages.

## How the tests make a PDF

- Use `buildPdf` in `tests/helpers/mkpdf.mjs` to write a PDF with an xref stream and Flate compression, as Issue 9 has.
- Use `onePage` in `tests/helpers/mkpdf.mjs` to make 1 page with 3 test fonts. Put the content of each test page in `PDF_CASES` in `tests/helpers/cases.mjs`.
- Use `buildDoc` in `tests/helpers/mkpdf.mjs` to make a document with many pages. Use `txt`, `rect`, and `icon` in `mkpdf.mjs` to write text, rectangles, and icon curves.
- Find the invented dictionary pages and rule pages in `DICT_PAGES` and `RULE_PAGES` in `tests/helpers/fixture_pages.mjs`. `tests/unit/stages.test.mjs` sends them through the 5 stages.
- Find the cases for `_words.mjs` and `_py.mjs` in `WORD_CASES` and `PY_CASES` in `tests/helpers/cases.mjs`.

Add a new case to `cases.mjs` or `fixture_pages.mjs`. Do not put text from the specification into a test.

## Compare the expected values with pdfplumber and Python

Do this procedure after you add or change a case. It uses Python 3.12 and pdfplumber 0.11, only on your computer.

1. Run `node tests/tools/crosscheck_synthetic.mjs <folder>`.
2. Run `python -I tests/tools/crosscheck_synthetic.py <folder>`.
3. Make sure that the last line shows `diffs 0`.

## Compare the kit with the Python kit

Do this procedure when a change can change the pack. It uses the licensed PDF. Keep all output out of the repository.

1. Make the Python output from commit `c26cb4a`. `tests/PARITY.md` gives the steps.
2. Make the Node.js output with `node run_all.mjs` into a different folder.
3. Run `node tests/tools/compare_work.mjs <python folder> <node folder>`.
4. Make sure that each difference is in the list of intended differences in `tests/PARITY.md`.

To compare the linter, use `tests/tools/crosscheck_lint.mjs` with `tests/tools/lint_ref.py`. To compare the page data, use `tests/tools/dump_prims.py` with `tests/tools/compare_prims.mjs`.

## Decisions

- [0002: Keep the output of the Python kit](decisions/0002-keep-python-output.md)
