#!/usr/bin/env bash
# Usage: STE_PDF=/path/to/ASD-STE100_ISSUE9.pdf STE_WORK=/path/to/workdir ./run_all.sh
set -euo pipefail
export STE_PDF="${STE_PDF:-ASD-STE100_ISSUE9.pdf}"
export STE_WORK="${STE_WORK:-$(pwd)/work}"
mkdir -p "$STE_WORK"
cd "$(dirname "$0")"
python3 extract/parse_dict.py
python3 extract/structure_dict.py > /dev/null
python3 extract/parse_rules.py
python3 extract/structure_rules.py > /dev/null
python3 extract/generate.py
cp handwritten/README.md "$STE_WORK/pack/README.md"
cp handwritten/enforcement-checklist.md "$STE_WORK/pack/rules/"
cp handwritten/dictionary-conventions.md "$STE_WORK/pack/dictionary/"
cp handwritten/ste_lint.py "$STE_WORK/pack/tools/"
mkdir -p "$STE_WORK/pack/tools/extract" && cp extract/*.py "$STE_WORK/pack/tools/extract/"
echo "Pack written to $STE_WORK/pack"
