#!/usr/bin/env node
/**
 * Harness evals runner — the composition root wiring real drivers,
 * live workspaces and the terminal to the campaign orchestrator.
 *
 *   node evals/run.mjs --list
 *   node evals/run.mjs --check [--driver codex]
 *   KEEL_RUN_EVALS=1 node evals/run.mjs --campaign baseline
 *   KEEL_RUN_EVALS=1 node evals/run.mjs --campaign baseline --driver claude-code --mode attended
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
import { runCampaign } from './lib/runner.mjs';
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
    'usage: node evals/run.mjs --campaign <name> [--driver claude-code|codex] [--mode scripted|attended] [--out file] | --list | --check',
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

const campaign = loadCampaign(
  path.join(EVALS_ROOT, 'campaigns', `${values.campaign}.yaml`),
  path.join(EVALS_ROOT, 'cases'),
);

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
const version = JSON.parse(fs.readFileSync(path.join(KEEL_ROOT, 'package.json'), 'utf8')).version;

try {
  const benchmark = await runCampaign({
    campaign,
    driver,
    mode: values.mode,
    prepareWorkspace: (caseSpec) => Promise.resolve(prepareWorkspace(caseSpec, KEEL_ROOT)),
    diffStats,
    keel: { version, commit },
    now: () => Date.now(),
    log: (line) => console.log(line),
    io,
  });
  const out =
    values.out ??
    path.join(EVALS_ROOT, 'results', `${campaign.name}-${driver.id}-${values.mode}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(benchmark, null, 2)}\n`);
  console.log(`\nbenchmark written to ${out}`);
  console.log(`overall success rate: ${benchmark.summary.successRate}`);
} finally {
  rl.close();
}
