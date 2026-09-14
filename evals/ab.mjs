#!/usr/bin/env node
/**
 * The A/B reporter: folds two benchmarks of one campaign — one per
 * harness variant — into a paired per-case delta report.
 *
 *   node evals/ab.mjs --before evals/results/tasks-claude-code-scripted.json \
 *                     --after  evals/results/tasks-claude-code-scripted-no_nested_docs.json
 *
 * Reads two files, writes one, and never touches an agent: the
 * measurement already happened. Exits non-zero only when the two
 * benchmarks cannot honestly be compared — a delta, however large, is
 * a finding rather than a failure, which is what "report-only" means
 * for this lane.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { compare, renderReport } from './lib/ab.mjs';

const EVALS_ROOT = path.dirname(fileURLToPath(import.meta.url));

const { values } = parseArgs({
  options: {
    before: { type: 'string' },
    after: { type: 'string' },
    out: { type: 'string' },
  },
});

if (values.before === undefined || values.after === undefined) {
  console.error(
    'usage: node evals/ab.mjs --before <benchmark.json> --after <benchmark.json> [--out report.json]',
  );
  process.exit(2);
}

const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

let report;
try {
  report = compare(read(values.before), read(values.after));
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(2);
}

const out =
  values.out ??
  path.join(EVALS_ROOT, 'results', `ab-${report.campaign}-${report.after.variant}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(renderReport(report));
console.log(`\nreport written to ${out}`);
