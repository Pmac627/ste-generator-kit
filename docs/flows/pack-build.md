---
type: Flow
title: Pack build
description: How one command turns the Issue 9 PDF into a complete agent pack in the work folder.
diataxis: explanation
status: stable
sources:
  - id: entry
    resource: run_all.mjs
  - id: stages
    resource: extract/*.mjs
  - id: handwritten
    resource: handwritten/**
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-07T16:00:00Z }
verified:
  - { by: claude-code/claude-opus-5-5, at: 2026-10-07T16:00:00Z }
  - { by: human:Pmac627, at: 2026-10-07T22:30:00Z }
tags: [pipeline, entry-point]
---

# Pack build

## Purpose

The pack build is the only flow that a person starts. It reads the PDF one time, sends the data through 5 stages, and writes the agent pack. Each stage also writes its intermediate file, so a person can find the stage that causes an incorrect result.

## Entry points

- `node run_all.mjs` starts the command-line code at the end of `run_all.mjs`. That code reads `STE_PDF` and `STE_WORK` and starts `runAll` in `run_all.mjs`.
- Tests and tools can start `runAll` in `run_all.mjs` directly with `pdf` and `work` paths.

## Sequence

```mermaid
sequenceDiagram
    actor User
    participant Run as run_all.mjs runAll
    participant Pdf as _pdf.mjs PdfDocument
    participant PD as parse_dict.mjs
    participant SD as structure_dict.mjs
    participant PR as parse_rules.mjs
    participant SR as structure_rules.mjs
    participant Gen as generate.mjs generate
    User->>Run: STE_PDF, STE_WORK
    Run->>Pdf: new PdfDocument(pdf)
    Run->>PD: run(doc, work)
    PD-->>Run: entry regions, dict_raw.json
    Run->>SD: run(regions, work)
    SD-->>Run: entries, dict_entries.json
    Run->>PR: run(doc, work)
    PR-->>Run: rule lines, rules_raw.json
    Run->>SR: run(lines, work)
    SR-->>Run: rule blocks, rules_structured.json
    Run->>Gen: generate(rules, entries, work)
    Gen-->>Run: pack/rules, pack/dictionary
    Run->>Run: copy handwritten files and extract/*.mjs into pack
```

## Key behavior

- `runAll` in `run_all.mjs` opens the PDF one time with `PdfDocument` and gives the same document to `parseDict` and `parseRules`.
- The stage order is always the same: `parseDict`, `structureDict`, `parseRules`, `structureRules`, then `generate`. Each stage module also has a `run` function that writes the intermediate file of the stage.
- `runAll` prints each line of the stage log with the stage name in front of it. The count lines are the values in the table of `INSTRUCTIONS.md`, section 4.
- After `generate`, `runAll` copies `README.md`, `enforcement-checklist.md`, `dictionary-conventions.md`, and `ste_lint.mjs` from `handwritten/` into the pack. It also copies each `.mjs` file of `extract/` into `pack/tools/extract/`.
- The command-line code of `run_all.mjs` finds a relative `STE_PDF` or `STE_WORK` from the kit folder `KIT`. Without `STE_WORK`, it uses `work` in the current folder. [Configuration](../configuration.md) gives the full rules.

## Failure modes

- No PDF at the path: `runAll` stops with `PDF not found`.
- Less pages than `LAST` in `parse_dict.mjs`: `runAll` stops before a stage starts, because Issue 9 has 434 pages.
- A part of the PDF format that `PdfDocument` or `pageObjects` cannot read: the reader stops with a message that names that part. See [PDF read](pdf-read.md).
- The command-line code of `run_all.mjs` catches each error, prints one line with `run_all:` in front, and sets exit code 1.

## Decisions

- [0001: Read the PDF with a small reader that uses only Node.js](../decisions/0001-zero-dependency-pdf-reader.md)
- [0002: Keep the output of the Python kit](../decisions/0002-keep-python-output.md)

## Source references

`run_all.mjs` (`runAll`, `KIT`), `extract/parse_dict.mjs`, `extract/structure_dict.mjs`, `extract/parse_rules.mjs`, `extract/structure_rules.mjs`, `extract/generate.mjs`, `handwritten/`.
