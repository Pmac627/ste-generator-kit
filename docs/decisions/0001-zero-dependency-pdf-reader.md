---
type: Decision
date: 2026-10-06
title: "0001: Read the PDF with a small reader that uses only Node.js"
description: The kit reads the PDF with its own reader, which uses only Node.js built-in modules, instead of pdfjs-dist or poppler.
diataxis: explanation
status: stable
sources:
  - id: reader
    resource: extract/_pdf.mjs
  - id: layout
    resource: extract/_layout.mjs
  - id: parity
    resource: tests/PARITY.md
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-07T16:00:00Z }
verified:
  - { by: claude-code/claude-opus-5-5, at: 2026-10-07T16:00:00Z }
  - { by: human:Pmac627, at: 2026-10-07T22:30:00Z }
---

# 0001: Read the PDF with a small reader that uses only Node.js

- Decision status: accepted
- Date: 2026-10-06

## Context

The Python kit used pdfplumber. The stages use more than plain text. They use the box, the font name, and the font size of each word. They also use the thin rectangles and the curves of the help icons. Node.js has no built-in PDF reader. The Issue 9 PDF uses xref streams, object streams, Flate compression, and AES-128 encryption.

We compared 3 alternatives. The `pdftotext` tool gives word boxes, but no fonts, rectangles, or curves. The pdfjs-dist package is 35 MB and gives groups of text, not character boxes. Its font descent also comes from a different source than in pdfminer.six. Thus each alternative had to have new code for the character boxes, the word groups, and the path types.

## Decision

We write a small reader in `extract/_pdf.mjs`, `extract/_layout.mjs`, and `extract/_words.mjs` that uses only `node:zlib` and `node:crypto`. The reader can read only the parts of the PDF format that Issue 9 uses. It stops with a clear message on all other parts.

## Consequences

- The kit has no packages to install. It operates on Windows, macOS, and Linux with Node.js 22 or a higher version.
- `pageObjects` in `extract/_layout.mjs` gives the same characters, rectangles, and curves as pdfplumber on all 370 pages that the stages read. `tests/PARITY.md` has the results.
- A PDF from a different source, or a subsequent issue, can use parts of the PDF format that the reader cannot read. The reader then stops with a message that names the part. A person must then add that part to the reader.

## Notes

After acceptance, do not change this record. If the decision changes, add a new ADR and set this one to "superseded by NNNN".
