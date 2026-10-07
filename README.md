# ASD-STE100 Generator Kit

Generate a private, agent-ready reference pack from your licensed copy of ASD-STE100 Simplified Technical English, Issue 9.

The kit extracts the writing rules and dictionary from the official PDF. It then produces structured rule files, word lists, JSON and TSV dictionaries, an enforcement checklist, and a reference linter. It is designed for [Anchored Docs](https://github.com/Pmac627/anchored-docs), but the generated pack can support any local documentation workflow or coding agent.

## Important legal boundary

This repository contains extraction code and handwritten guidance. It does not contain the ASD-STE100 specification or generated pack. The unit tests use invented content only.

Get the official PDF from [ASD Simplified Technical English Maintenance Group](https://www.asd-ste100.org/). Keep the PDF and the generated pack in the environment that holds your authorized copy. Do not commit, publish, or redistribute either one.

The default `work/` directory is ignored for this reason.

## Requirements

- Node.js 22 or later. No packages to install; the kit uses only Node.js built-in modules.
- ASD-STE100 Simplified Technical English, Issue 9, January 2025.

It runs natively on Windows (PowerShell or Command Prompt), macOS, Linux, and WSL. Python is not needed.

## Generate a pack

1. Clone this repository and change to its directory.
2. Set the PDF and working-directory paths. Keep both outside a public repository, or use the ignored default `work/` directory.

   PowerShell:

   ```powershell
   $env:STE_PDF  = 'C:\secure\ASD-STE100_ISSUE9.pdf'
   $env:STE_WORK = 'C:\secure\ste-work'
   node run_all.mjs
   ```

   bash or zsh:

   ```bash
   export STE_PDF=/secure/path/ASD-STE100_ISSUE9.pdf
   export STE_WORK=/secure/path/ste-work
   node run_all.mjs
   ```

The command writes the deliverable to `$STE_WORK/pack/`. Intermediate extraction files are also written below `$STE_WORK/`.

## Verify the result

Compare the command output with these expected values:

| Stage | Expected result |
| --- | --- |
| `parse_dict` | `regions 2249 entries after merge 2194`, then `approved (uppercase headword): 877  unapproved: 1317` |
| `structure_dict` | `2194 entries; 876 approved` |
| `parse_rules` | `statements 53 rules with bodies 53 order ok: True`, then `missing bodies []` |
| `generate` | `TN cats 22 TV cats 4`, then `approved 876 unapproved 1318 forms 1291` |

Materially different counts usually mean that the PDF is not Issue 9 or that its layout changed. See [INSTRUCTIONS.md](INSTRUCTIONS.md) for troubleshooting details and the reference-linter smoke test.

## Use the pack with Anchored Docs

Install [Anchored Docs](https://github.com/Pmac627/anchored-docs) 2.0 or later first. Then either point the skill to the pack with `STE_AGENT_PACK`, or copy the generated files into the installed skill.

PowerShell:

```powershell
$env:STE_AGENT_PACK = "$env:STE_WORK\pack"
node "$env:ANCHORED_DOCS\scripts\ste_check.mjs" --status
node "$env:ANCHORED_DOCS\scripts\ste_check.mjs" --lookup maintain
```

bash or zsh:

```bash
export ANCHORED_DOCS=/path/to/anchored-docs
export STE_AGENT_PACK="$STE_WORK/pack"
node "$ANCHORED_DOCS/scripts/ste_check.mjs" --status
```

To install the pack inside the skill instead, copy the contents of `$STE_WORK/pack/` into `$ANCHORED_DOCS/references/asd-ste100-agent-pack/`.

The checker reports `STE word source: pack` when it finds a valid pack. It then uses the official word data for word checks and alternatives.

## Repository layout

```text
extract/        PDF reader and the five extraction stages (Node.js, no dependencies).
handwritten/    Original files copied into each generated pack, including ste_lint.mjs.
tests/          Unit tests on invented data, and the parity tools used to prove the Node port.
run_all.mjs     End-to-end pipeline entry point.
INSTRUCTIONS.md Detailed extraction, validation, and troubleshooting reference.
```

Run `node --test "tests/unit/*.test.mjs"` to run the unit tests. Run `node run_all.mjs` again when you modify an extraction script or when you intentionally regenerate a pack from the same authorized PDF. Do not add generated files to this repository.
