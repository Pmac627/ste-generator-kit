// Compare a Node work dir with the Python baseline: intermediates by deep equality, pack files by bytes (CRLF normalized).
// Usage: node tests/tools/compare_work.mjs <python_work_dir> <node_work_dir>
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
const [base, mine] = process.argv.slice(2);
const walk = (d) => readdirSync(d).flatMap((n) => statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]);
let bad = 0;
const firstDiff = (a, b, path = '$') => {
  if (isDeepStrictEqual(a, b)) return null;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) return `${path}: ${JSON.stringify(a)?.slice(0, 200)} vs ${JSON.stringify(b)?.slice(0, 200)}`;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) { const d = firstDiff(a[k], b[k], `${path}.${k}`); if (d) return d; }
  return `${path}: differs`;
};
for (const f of ['dict_raw.json', 'dict_entries.json', 'rules_raw.json', 'rules_structured.json']) {
  const d = firstDiff(JSON.parse(readFileSync(join(mine, f), 'utf8')), JSON.parse(readFileSync(join(base, f), 'utf8')));
  console.log(d ? `DIFF ${f} ${d}` : `same ${f}`); if (d) bad++;
}
for (const p of walk(join(base, 'pack'))) {
  const rel = relative(join(base, 'pack'), p).split(sep).join('/');
  const q = join(mine, 'pack', rel);
  if (!existsSync(q)) { console.log(`MISSING ${rel}`); bad++; continue; }
  const a = readFileSync(p, 'latin1').replaceAll('\r\n', '\n');
  const b = readFileSync(q, 'latin1');
  if (a !== b) { const i = [...a].findIndex((c, k) => c !== b[k]); console.log(`DIFF pack/${rel} at ${i}: ${JSON.stringify(a.slice(Math.max(0, i - 60), i + 60))}\n   vs ${JSON.stringify(b.slice(Math.max(0, i - 60), i + 60))}`); bad++; }
}
for (const p of walk(join(mine, 'pack'))) { const rel = relative(join(mine, 'pack'), p); if (!existsSync(join(base, 'pack', rel))) console.log(`EXTRA ${rel.split(sep).join('/')}`); }
console.log('differences', bad);
