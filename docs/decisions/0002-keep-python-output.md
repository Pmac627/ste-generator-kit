---
type: Decision
date: 2026-10-06
title: "0002: Keep the output of the Python kit"
description: The Node.js stages give the same pack as the Python kit, and the repository records each intended difference.
diataxis: explanation
status: stable
sources:
  - id: py
    resource: extract/_py.mjs
  - id: parity
    resource: tests/PARITY.md
  - id: tools
    resource: tests/tools/**
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-07T16:00:00Z }
verified:
  - { by: claude-code/claude-opus-5-5, at: 2026-10-07T16:00:00Z }
---

# 0002: Keep the output of the Python kit

- Decision status: accepted
- Date: 2026-10-06

## Context

Anchored Docs and its users had packs from the Python kit. A pack with different data can change the results of their checks. Some Python behavior is different in JavaScript. Examples are `round` on a half value, `str.isupper`, the whitespace for `strip`, the sort order of strings, and `json.dump`.

## Decision

We write the kit again in Node.js, 1 stage at a time. We compare each stage with the Python output on the licensed PDF. `extract/_py.mjs` holds the Python behavior that the output uses: `pyRound`, `isUpper`, `strip`, `cmpCodePoint`, and `dumps`. `tests/PARITY.md` lists each intended difference. All other differences are bugs.

## Consequences

- All pack files from the first Node.js version were byte-identical to the Python pack, after the change from CRLF to LF.
- Some code keeps pdfminer.six behavior that looks incorrect, for example the text matrix that `Q` gives back. `tests/PARITY.md` lists each example that `pageObjects` in `extract/_layout.mjs` keeps.
- A change to the output must have a new entry in `tests/PARITY.md`. [0003](0003-dictionary-line-order.md) is the first such change.

## Notes

After acceptance, do not change this record. If the decision changes, add a new ADR and set this one to "superseded by NNNN".
