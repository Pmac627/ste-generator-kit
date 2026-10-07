# Decisions

* [0001: Read the PDF with a small reader that uses only Node.js](0001-zero-dependency-pdf-reader.md) - the kit reads the PDF with its own reader, which uses only Node.js built-in modules.
* [0002: Keep the output of the Python kit](0002-keep-python-output.md) - the Node.js stages give the same pack as the Python kit, and the repository records each intended difference.
* [0003: Sort dictionary words by line, not by rounded top](0003-dictionary-line-order.md) - `groupLines` sorts by line cluster, which corrects 6 entries.
