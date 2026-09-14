# ASD-STE100 Generator Kit

Generate a private, agent-ready reference pack from your licensed copy of ASD-STE100 Simplified Technical English, Issue 9.

The kit extracts the writing rules and dictionary from the official PDF. It then produces structured rule files, word lists, JSON and TSV dictionaries, an enforcement checklist, and a reference linter. It is designed for [Anchored Docs](https://github.com/Pmac627/anchored-docs), but the generated pack can support any local documentation workflow or coding agent.

## Important legal boundary

This repository contains extraction code and handwritten guidance. It does not contain the ASD-STE100 specification or generated pack.

Get the official PDF from [ASD Simplified Technical English Maintenance Group](https://www.asd-ste100.org/). Keep the PDF and the generated pack in the environment that holds your authorized copy. Do not commit, publish, or redistribute either one.

The default `work/` directory is ignored for this reason.

## Requirements

- Python 3.10 or later.
- Bash on Linux, macOS, or WSL.
- `pdfplumber`.
- ASD-STE100 Simplified Technical English, Issue 9, January 2025.

On Windows, use WSL and Linux paths such as `/mnt/d/projects/...`. Do not run `run_all.sh` directly in PowerShell.

## Generate a pack

1. Clone this repository and change to its directory.
2. Create an isolated Python environment, if you use one, and install the dependency.

   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   python3 -m pip install pdfplumber
   ```

3. Set the PDF and working-directory paths. Keep both outside a public repository, or use the ignored default `work/` directory.

   ```bash
   export STE_PDF=/secure/path/ASD-STE100_ISSUE9.pdf
   export STE_WORK=/secure/path/ste-work
   ./run_all.sh
   ```

The command writes the deliverable to `$STE_WORK/pack/`. Intermediate extraction files are also written below `$STE_WORK/`.

## Verify the result

Compare the command output with these expected values:

| Stage | Expected result |
| --- | --- |
| `parse_dict.py` | `regions 2249 entries after merge 2194`, then `approved 877 unapproved 1317` |
| `structure_dict.py` | `2194 entries; 876 approved` |
| `parse_rules.py` | `statements 53 rules with bodies 53 order ok: True`, then `missing bodies []` |
| `generate.py` | `TN cats 22 TV cats 4`, then `approved 876 unapproved 1318 forms 1291` |

Materially different counts usually mean that the PDF is not Issue 9 or that its layout changed. See [INSTRUCTIONS.md](INSTRUCTIONS.md) for troubleshooting details and the reference-linter smoke test.

## Use the pack with Anchored Docs

Install [Anchored Docs](https://github.com/Pmac627/anchored-docs) first. Then either copy the generated files into the installed skill or point the skill to them with `STE_AGENT_PACK`.

```bash
export ANCHORED_DOCS=/path/to/anchored-docs
cp -R "$STE_WORK/pack/." "$ANCHORED_DOCS/references/asd-ste100-agent-pack/"
python3 "$ANCHORED_DOCS/scripts/ste_check.py" --status
```

For a shared, private pack location, set `STE_AGENT_PACK` instead:

```bash
export STE_AGENT_PACK="$STE_WORK/pack"
python3 "$ANCHORED_DOCS/scripts/ste_check.py" --status
```

The checker reports `STE word source: pack` when it finds a valid pack. It then uses the official word data for word checks and alternatives.

## Repository layout

```text
extract/       PDF extraction and pack-generation scripts.
handwritten/   Original files copied into each generated pack.
run_all.sh     End-to-end pipeline entry point.
INSTRUCTIONS.md Detailed extraction, validation, and troubleshooting reference.
```

Run `run_all.sh` again when you modify an extraction script or when you intentionally regenerate a pack from the same authorized PDF. Do not add generated files to this repository.
