#!/usr/bin/env node
// Build the ASD-STE100 agent pack from your licensed Issue 9 PDF. Node 22+, no dependencies.
//
// Usage (any OS):
//   STE_PDF=/path/to/ASD-STE100_ISSUE9.pdf STE_WORK=/path/to/workdir node run_all.mjs
// PowerShell:
//   $env:STE_PDF='C:\path\ASD-STE100_ISSUE9.pdf'; $env:STE_WORK='C:\path\work'; node run_all.mjs
//
// STE_PDF defaults to ASD-STE100_ISSUE9.pdf in the kit folder. STE_WORK defaults to ./work under the
// current directory. Intermediate JSON lands in STE_WORK; the pack is STE_WORK/pack.

import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PdfDocument } from './extract/_pdf.mjs';
import * as parseDict from './extract/parse_dict.mjs';
import * as structureDict from './extract/structure_dict.mjs';
import * as parseRules from './extract/parse_rules.mjs';
import * as structureRules from './extract/structure_rules.mjs';
import { generate } from './extract/generate.mjs';

const KIT = dirname(fileURLToPath(import.meta.url));

/**
 * Run the whole pipeline. Returns the pack directory.
 * @see docs/flows/pack-build.md
 */
export function runAll({ pdf, work, print = console.log }) {
  if (!pdf || !work) {
    throw new TypeError('runAll: pdf and work paths are required');
  }
  if (!existsSync(pdf)) {
    throw new Error(`PDF not found: ${pdf}`);
  }
  mkdirSync(work, { recursive: true });
  const doc = new PdfDocument(pdf);
  if (doc.pages.length < parseDict.LAST) {
    throw new Error(`The PDF has ${doc.pages.length} pages; Issue 9 has 434. See INSTRUCTIONS.md section 6.`);
  }
  const show = (stage, log) => log.forEach((l) => print(`${stage}: ${l}`));

  const raw = parseDict.run(doc, work);
  show('parse_dict', raw.log);
  const entries = structureDict.run(raw.data, work);
  show('structure_dict', entries.log);
  const rules = parseRules.run(doc, work);
  show('parse_rules', rules.log);
  const structured = structureRules.run(rules.data, work);
  show('structure_rules', structured.log);
  show('generate', generate(structured.data, entries.data, work).log);

  const pack = join(work, 'pack');
  copyFileSync(join(KIT, 'handwritten', 'README.md'), join(pack, 'README.md'));
  copyFileSync(join(KIT, 'handwritten', 'enforcement-checklist.md'), join(pack, 'rules', 'enforcement-checklist.md'));
  copyFileSync(join(KIT, 'handwritten', 'dictionary-conventions.md'), join(pack, 'dictionary', 'dictionary-conventions.md'));
  copyFileSync(join(KIT, 'handwritten', 'ste_lint.mjs'), join(pack, 'tools', 'ste_lint.mjs'));
  mkdirSync(join(pack, 'tools', 'extract'), { recursive: true });
  for (const f of readdirSync(join(KIT, 'extract')).filter((n) => n.endsWith('.mjs'))) {
    copyFileSync(join(KIT, 'extract', f), join(pack, 'tools', 'extract', f));
  }
  print(`Pack written to ${pack}`);
  return pack;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const envPdf = process.env.STE_PDF || 'ASD-STE100_ISSUE9.pdf';
  const pdf = isAbsolute(envPdf) ? envPdf : join(KIT, envPdf);
  const envWork = process.env.STE_WORK;
  const work = envWork ? (isAbsolute(envWork) ? envWork : join(KIT, envWork)) : resolve('work');
  try {
    runAll({ pdf, work });
  } catch (err) {
    console.error(`run_all: ${err.message}`);
    process.exit(1);
  }
}
