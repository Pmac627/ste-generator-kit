---
type: Reference
title: Configuration
description: The two environment values that the kit reads, where it reads them, and their defaults.
diataxis: reference
status: stable
sources:
  - id: entry
    resource: run_all.mjs
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-07T16:00:00Z }
verified:
  - { by: claude-code/claude-opus-5-5, at: 2026-10-07T16:00:00Z }
  - { by: human:Pmac627, at: 2026-10-07T22:30:00Z }
---

# Configuration

The kit has no configuration file. It reads 2 environment values from `process.env` in the command-line code at the end of `run_all.mjs`, and only there. The linter `ste_lint.mjs` reads no environment value.

## Environment

### `STE_PDF`
- **Provider:** process environment
- **Type:** path
<!-- ste-ok: 1.1 field label from the configuration template of Anchored Docs -->
- **Required:** no
- **Default:** `ASD-STE100_ISSUE9.pdf` in the kit folder `KIT` of `run_all.mjs`
- **Access**
  - Raw: the command-line code at the end of `run_all.mjs`, which gives the path to `runAll`
- The path of the Issue 9 PDF. `run_all.mjs` finds a relative path from the kit folder `KIT`, not from the current folder.

### `STE_WORK`
- **Provider:** process environment
- **Type:** path
<!-- ste-ok: 1.1 field label from the configuration template of Anchored Docs -->
- **Required:** no
- **Default:** `work` in the current folder
- **Access**
  - Raw: the command-line code at the end of `run_all.mjs`, which gives the path to `runAll`
- The folder for the intermediate files and for `pack/`. `run_all.mjs` finds a relative path from the kit folder `KIT`. `runAll` makes the folder when the folder is not there.

The `.gitignore` file of the kit tells Git to ignore each PDF, each `work/` and `pack/` folder, and the 4 intermediate files. These patterns apply in all folders of the kit. Thus a relative `STE_WORK` cannot put pack content into a commit. ASD has the copyright of the content in the PDF and in the pack.
