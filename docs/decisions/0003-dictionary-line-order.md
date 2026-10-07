---
type: Decision
date: 2026-10-07
title: "0003: Sort dictionary words by line, not by rounded top"
description: groupLines sorts the words of a dictionary column by line cluster, which corrects 6 entries and is the first intended change to the Python output.
diataxis: explanation
status: stable
sources:
  - id: code
    resource: extract/parse_dict.mjs
  - id: parity
    resource: tests/PARITY.md
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-07T16:00:00Z }
verified:
  - { by: claude-code/claude-opus-5-5, at: 2026-10-07T16:00:00Z }
---

# 0003: Sort dictionary words by line, not by rounded top

- Decision status: accepted
- Date: 2026-10-07

## Context

The Python kit sorted the words of a dictionary column by the rounded top, then by x position. Some glyphs are a fraction of a point lower or higher than their line, for example a high meaning number `2.` or a degree sign. When the 2 tops rounded to different integers, the glyph went to the end of its line. In Issue 9 this put `2.` in the meaning text of 2 entries and moved text in 4 other entries.

## Decision

`groupLines` in `extract/parse_dict.mjs` makes line clusters from tops that are not more than `LINE_TOLERANCE` = 2.0 points apart. It sorts by cluster, then by x position. `groupLines` used the same tolerance before to connect words.

## Consequences

- 6 of 2194 entries are correct after the change. The counts do not change.
- The pack is no longer byte-identical to the Python pack in `ste-dictionary.json`, `approved-words.json`, and `approved-words.tsv`. `tests/PARITY.md` records this as intended difference 9.
- A unit test in `tests/unit/stages.test.mjs` shows a failure if the sort goes back to the rounded top.

## Notes

After acceptance, do not change this record. If the decision changes, add a new ADR and set this one to "superseded by NNNN".
