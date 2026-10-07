# Docs update log

## 2026-10-07
* **Update**: human:Pmac627 reviewed all pages. The status of each page changed from `draft` to `stable`.
* **Creation**: [Testing](testing.md) tells how to run the unit tests, how the tests make invented PDFs, and how to compare the kit with the Python kit again.
* **Update**: [PDF read](flows/pdf-read.md) tells how the reader gets the text of each character from the ToUnicode table and the WinAnsi table.
* **Update**: `_glossary.json` no longer has the shared words that moved to the organization glossary.
* **Update**: [Configuration](configuration.md) tells which files the `.gitignore` file keeps out of commits, after the patterns started to match in all folders of the kit.
* **Initialization**: Created the docs bundle from the code of the Node.js port, in commit `0e0a2ce` (merged into `main` in `9e09c29`). Flows: [Pack build](flows/pack-build.md), [PDF read](flows/pdf-read.md), [Dictionary extraction](flows/dictionary-extraction.md), [Rules extraction](flows/rules-extraction.md), [Pack generation](flows/pack-generation.md), [Pack linter](flows/lint.md). Decisions 0001 to 0003.
