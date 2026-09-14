#!/usr/bin/env node
/**
 * Harness evals runner — the composition root wiring real drivers,
 * live workspaces and the terminal to the campaign orchestrator.
 *
 *   node evals/run.mjs --list
 *   node evals/run.mjs --check [--driver codex]
 *   node evals/run.mjs --solvable --campaign tasks
 *   KEEL_RUN_EVALS=1 node evals/run.mjs --campaign baseline
 *   KEEL_RUN_EVALS=1 node evals/run.mjs --campaign baseline --driver claude-code --mode attended
 *   KEEL_RUN_EVALS=1 node evals/run.mjs --campaign baseline --model opus
 *   KEEL_RUN_EVALS=1 node evals/run.mjs --campaign baseline --only navigation/ts-http
 *   KEEL_RUN_EVALS=1 node evals/run.mjs --campaign tasks --variant terse --overlay evals/overlays/terse
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
import { assertMergeable, driverIdentity, mergeBenchmark, runCampaign } from './lib/runner.mjs';
import { proveSolvable } from './lib/solvable.mjs';
import { prepareWorkspace, diffStats } from './lib/workspace.mjs';
import { DRIVERS } from './drivers/index.mjs';

const EVALS_ROOT = path.dirname(fileURLToPath(import.meta.url));
const KEEL_ROOT = path.dirname(EVALS_ROOT);

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
    solvable: { type: 'boolean', default: false },
    variant: { type: 'string' },
    overlay: { type: 'string' },
  },
});

/** The harness variant a run is taken under; `baseline` when none is named. */
const variant = {
  id: values.variant ?? 'baseline',
  ...(values.overlay === undefined ? {} : { overlay: values.overlay }),
};
const overlay = values.overlay === undefined ? null : path.resolve(KEEL_ROOT, values.overlay);

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
    'usage: node evals/run.mjs --campaign <name> [--driver claude-code|codex] [--mode scripted|attended]\n' +
      '         [--model id] [--only case-id]... [--variant id --overlay dir] [--out file]\n' +
      '       node evals/run.mjs --solvable --campaign <name> [--only case-id]...\n' +
      '       node evals/run.mjs --list | --check',
  );
  process.exit(2);
}

// `--solvable` proves every reference solution against a freshly
// prepared workspace. No agent runs, so it is neither billed nor
// gated — but the oracle is the project's own build, so the family's
// toolchain has to be there.
if (values.solvable) {
  const { loadCampaign: load } = await import('./lib/case-schema.mjs');
  const suite = load(
    path.join(EVALS_ROOT, 'campaigns', `${values.campaign}.yaml`),
    path.join(EVALS_ROOT, 'cases'),
  );
  const selected =
    values.only.length === 0
      ? suite.resolved
      : suite.resolved.filter((c) => values.only.includes(c.id));
  let failed = 0;
  for (const caseSpec of selected) {
    console.log(`${caseSpec.id}: preparing…`);
    let workspace = null;
    try {
      workspace = prepareWorkspace(caseSpec, KEEL_ROOT, overlay);
      const result = proveSolvable(caseSpec, workspace);
      console.log(`${caseSpec.id}: ${result.ok ? 'SOLVABLE' : 'NOT SOLVABLE'}`);
      for (const failure of result.failures) console.log(`  - ${failure}`);
      if (!result.ok) failed += 1;
    } catch (err) {
      console.log(`${caseSpec.id}: NOT SOLVABLE`);
      console.log(`  - ${err instanceof Error ? err.message : String(err)}`);
      failed += 1;
    } finally {
      if (workspace !== null) fs.rmSync(workspace, { recursive: true, force: true });
    }
  }
  console.log(`\n${String(selected.length - failed)}/${String(selected.length)} solvable`);
  process.exit(failed === 0 ? 0 : 1);
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

// The model is part of a benchmark's identity, so an explicit
// `--model` gets its own file rather than overwriting the driver
// default's; the default keeps the plain name the docs give.
const modelSuffix =
  values.model === undefined ? '' : `-${values.model.replace(/[^a-z0-9.]+/gi, '_')}`;
// The variant is part of a benchmark's identity too, and for the
// same reason as the model: two variants overwriting one file is an
// A/B with nothing to compare.
const variantSuffix =
  variant.id === 'baseline' ? '' : `-${variant.id.replace(/[^a-z0-9.]+/gi, '_')}`;
const out =
  values.out ??
  path.join(
    EVALS_ROOT,
    'results',
    `${campaign.name}-${driver.id}-${values.mode}${modelSuffix}${variantSuffix}.json`,
  );
fs.mkdirSync(path.dirname(out), { recursive: true });
const previous =
  values.only.length > 0 && fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
if (values.only.length > 0 && previous === null) {
  console.error(`--only needs an existing benchmark to fold into; none at ${out}`);
  process.exit(2);
}
// Refused here, before a workspace is built or a session is spent —
// the same check every checkpoint repeats, but a mismatch found on
// the first write has already paid for one agent run.
if (previous !== null) {
  const probe = await driver.probe();
  if (!probe.available) {
    console.error(`${driver.id}: NOT available — ${probe.detail}`);
    process.exit(1);
  }
  try {
    assertMergeable(previous, {
      campaign: whole.name,
      driver: driverIdentity(driver, values.mode, values.model, probe.version),
    });
  } catch (err) {
    console.error(`${err instanceof Error ? err.message : String(err)} (${out})`);
    process.exit(2);
  }
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
    prepareWorkspace: (caseSpec) => Promise.resolve(prepareWorkspace(caseSpec, KEEL_ROOT, overlay)),
    diffStats,
    keel: { version, commit, dirty },
    variant,
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
