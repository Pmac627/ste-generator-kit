// Write a 434-page synthetic PDF with the invented fixture pages at Issue 9's page positions
// (rules from page 45, dictionary from page 149, every other page blank). Both the Python kit and
// the Node port can run on it, so their full outputs can be diffed without the licensed PDF.
// Usage: node tests/tools/synthetic_issue.mjs <out.pdf>
import { writeFileSync } from 'node:fs';
import { buildDoc } from '../helpers/mkpdf.mjs';
import { DICT_PAGES, RULE_PAGES } from '../helpers/fixture_pages.mjs';

const out = process.argv[2];
if (!out) {
  console.error('usage: node tests/tools/synthetic_issue.mjs <out.pdf>');
  process.exit(2);
}
const pages = new Array(434).fill('');
RULE_PAGES.forEach((c, i) => {
  pages[44 + i] = c;
});
DICT_PAGES.forEach((c, i) => {
  pages[148 + i] = c;
});
writeFileSync(out, buildDoc(pages));
console.log(`wrote ${out}`);
