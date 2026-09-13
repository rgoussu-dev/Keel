#!/usr/bin/env node
/**
 * Harness evals runner — the composition root wiring real drivers,
 * live workspaces and the terminal to the campaign orchestrator.
 *
 *   node evals/run.mjs --list
 *   node evals/run.mjs --check [--driver codex]
 *   KEEL_RUN_EVALS=1 node evals/run.mjs --campaign baseline
 *   KEEL_RUN_EVALS=1 node evals/run.mjs --campaign baseline --driver claude-code --mode attended
 *   KEEL_RUN_EVALS=1 node evals/run.mjs --campaign baseline --model opus
 *   KEEL_RUN_EVALS=1 node evals/run.mjs --campaign baseline --only navigation/ts-http
 *
 * Live runs are gated on `KEEL_RUN_EVALS=1` and are never a PR gate:
 * they spawn a real agent on the operator's own auth (see
 * docs/development.md → Harness evals for the billing posture).
 * `--list` and `--check` never touch an agent beyond `--version`.
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import { loadCampaign } from './lib/case-schema.mjs';
import { mergeBenchmark, runCampaign } from './lib/runner.mjs';
import { prepareWorkspace, diffStats } from './lib/workspace.mjs';
import { claudeCodeDriver } from './drivers/claude-code.mjs';
import { codexDriver } from './drivers/codex.mjs';

const EVALS_ROOT = path.dirname(fileURLToPath(import.meta.url));
const KEEL_ROOT = path.dirname(EVALS_ROOT);
const DRIVERS = { 'claude-code': claudeCodeDriver, codex: codexDriver };

const { values } = parseArgs({
  options: {
    campaign: { type: 'string' },
    driver: { type: 'string', default: 'claude-code' },
    mode: { type: 'string', default: 'scripted' },
    model: { type: 'string' },
    only: { type: 'string', multiple: true, default: [] },
    out: { type: 'string' },
    list: { type: 'boolean', default: false },
    check: { type: 'boolean', default: false },
  },
});

const driver = DRIVERS[values.driver];
if (driver === undefined) {
  console.error(
    `unknown driver '${values.driver}' — available: ${Object.keys(DRIVERS).join(', ')}`,
  );
  process.exit(2);
}

if (values.list) {
  for (const file of fs.readdirSync(path.join(EVALS_ROOT, 'campaigns')).sort()) {
    const campaign = loadCampaign(
      path.join(EVALS_ROOT, 'campaigns', file),
      path.join(EVALS_ROOT, 'cases'),
    );
    console.log(`${campaign.name} — ${campaign.description}`);
    for (const c of campaign.resolved) console.log(`  ${c.id} (runs: ${campaign.runs ?? c.runs})`);
  }
  process.exit(0);
}

if (values.check) {
  const probe = await driver.probe();
  console.log(
    probe.available
      ? `${driver.id}: available (${probe.version})`
      : `${driver.id}: NOT available — ${probe.detail}`,
  );
  process.exit(probe.available ? 0 : 1);
}

if (values.campaign === undefined) {
  console.error(
    'usage: node evals/run.mjs --campaign <name> [--driver claude-code|codex] [--mode scripted|attended] [--model id] [--only case-id]... [--out file] | --list | --check',
  );
  process.exit(2);
}

if (process.env.KEEL_RUN_EVALS !== '1') {
  console.error(
    'Live evals spawn a real agent on your own auth and are opt-in:\n' +
      '  KEEL_RUN_EVALS=1 node evals/run.mjs --campaign ' +
      values.campaign +
      '\nSee docs/development.md → Harness evals (drive modes, billing posture).',
  );
  process.exit(2);
}

const whole = loadCampaign(
  path.join(EVALS_ROOT, 'campaigns', `${values.campaign}.yaml`),
  path.join(EVALS_ROOT, 'cases'),
);
// `--only` re-runs a subset — the cases a first sitting left
// unprepared, say — and folds the result into the existing benchmark
// rather than replacing it (see `mergeBenchmark`).
const unknown = values.only.filter((id) => !whole.resolved.some((c) => c.id === id));
if (unknown.length > 0) {
  console.error(`--only names no case of '${whole.name}': ${unknown.join(', ')}`);
  process.exit(2);
}
const campaign =
  values.only.length === 0
    ? whole
    : { ...whole, resolved: whole.resolved.filter((c) => values.only.includes(c.id)) };

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const io = {
  print: (line) => console.log(line),
  waitForOperator: (prompt) => new Promise((resolve) => rl.question(prompt, resolve)),
};

const commit = (() => {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: KEEL_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
})();
// A benchmark taken on uncommitted changes says so: `commit` alone
// would name a tree the run did not actually measure.
const dirty = (() => {
  try {
    return (
      execFileSync('git', ['status', '--porcelain', '--', ':!evals/results'], {
        cwd: KEEL_ROOT,
        encoding: 'utf8',
      }).trim() !== ''
    );
  } catch {
    return null;
  }
})();
const version = JSON.parse(fs.readFileSync(path.join(KEEL_ROOT, 'package.json'), 'utf8')).version;

const out =
  values.out ??
  path.join(EVALS_ROOT, 'results', `${campaign.name}-${driver.id}-${values.mode}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
const previous =
  values.only.length > 0 && fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
if (values.only.length > 0 && previous === null) {
  console.error(`--only needs an existing benchmark to fold into; none at ${out}`);
  process.exit(2);
}
// Written after every run, not once at the end: each run is a paid
// agent session, and a crash in the ninth must not discard the eight.
// Written atomically, too — a sibling temp file renamed over the
// benchmark — because the file being replaced is the very checkpoint
// this exists to keep: a kill between truncating it and finishing
// the new JSON would lose every run so far, or leave a half-written
// artifact. `rename` replaces in place on POSIX and on Windows alike.
// Returns what was written, merged where `--only` folds into an
// earlier benchmark, so the summary printed is the summary on disk.
const order = whole.resolved.map((c) => c.id);
const write = (benchmark) => {
  const written = previous === null ? benchmark : mergeBenchmark(previous, benchmark, order);
  const tmp = `${out}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(written, null, 2)}\n`);
  fs.renameSync(tmp, out);
  return written;
};

try {
  const benchmark = await runCampaign({
    campaign,
    driver,
    mode: values.mode,
    model: values.model,
    prepareWorkspace: (caseSpec) => Promise.resolve(prepareWorkspace(caseSpec, KEEL_ROOT)),
    diffStats,
    keel: { version, commit, dirty },
    now: () => Date.now(),
    log: (line) => console.log(line),
    io,
    checkpoint: write,
  });
  const written = write(benchmark);
  console.log(`\nbenchmark written to ${out}`);
  console.log(`overall success rate: ${written.summary.successRate}`);
  if (written.summary.unprepared > 0) {
    console.log(`WARNING ${written.summary.unprepared} run(s) had no workspace and no agent ran`);
  }
} finally {
  rl.close();
}
