// Differential test: ste_lint.mjs against the original ste_lint.py on many files (developer tool).
// Usage: node tests/tools/crosscheck_lint.mjs <python> <ste_lint.py> <pack_dir> <file_or_dir>...
// Directories are searched for *.md (node_modules and .git skipped). Prints the first differences.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { lint, load, readText } from '../../handwritten/ste_lint.mjs';

const [py, ref, pack, ...roots] = process.argv.slice(2);
if (!roots.length) {
  console.error('usage: node tests/tools/crosscheck_lint.mjs <python> <ste_lint.py> <pack_dir> <file_or_dir>...');
  process.exit(2);
}
const files = [];
const walk = (p) => {
  if (statSync(p).isDirectory()) {
    for (const n of readdirSync(p)) {
      if (n !== 'node_modules' && n !== '.git') {
        walk(join(p, n));
      }
    }
  } else if (p.endsWith('.md') || roots.includes(p)) {
    files.push(p);
  }
};
roots.forEach(walk);

const tmp = mkdtempSync(join(tmpdir(), 'ste-lint-x-'));
try {
  const list = join(tmp, 'files.txt');
  writeFileSync(list, files.join('\n'), 'utf8');
  const pyOut = JSON.parse(execFileSync(py, ['-I', join(import.meta.dirname, 'lint_ref.py'), ref, pack, list], { encoding: 'utf8', maxBuffer: 1 << 30, env: { ...process.env, PYTHONUTF8: '1' } }));
  const dict = load(join(pack, 'dictionary'));
  let diffs = 0;
  let findings = 0;
  for (const f of files) {
    let mine;
    try {
      const text = readText(f);
      mine = { descriptive: lint(text, 'descriptive', [], dict), procedural: lint(text, 'procedural', [], dict) };
      findings += mine.descriptive.length + mine.procedural.length;
    } catch {
      mine = { error: 'decode' };
    }
    const theirs = pyOut[f];
    const same = theirs.error ? mine.error !== undefined : isDeepStrictEqual(mine, theirs);
    if (!same) {
      diffs++;
      if (diffs <= 5) {
        for (const m of ['descriptive', 'procedural']) {
          const a = mine[m] ?? [];
          const b = theirs[m] ?? [];
          const i = a.findIndex((x, k) => !isDeepStrictEqual(x, b[k]));
          console.log(`DIFF ${f} [${m}] at ${i} (node ${a.length}, python ${b.length})\n  node:   ${JSON.stringify(a[i])}\n  python: ${JSON.stringify(b[i])}`);
        }
      }
    }
  }
  console.log(`files ${files.length} findings ${findings} files-with-differences ${diffs}`);
  process.exitCode = diffs ? 1 : 0;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
