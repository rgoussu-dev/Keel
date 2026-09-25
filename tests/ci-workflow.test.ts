/**
 * The consumer for the CI e2e matrix.
 *
 * `.github/workflows/ci.yml` shards the end-to-end suite by toolchain,
 * and each shard names its files explicitly — a matrix cannot glob a
 * directory, and grouping by toolchain is a judgement no glob encodes
 * anyway. The hazard that creates is silent: add `tests/e2e/foo.test.ts`,
 * forget the matrix, and the suite simply never runs. Nothing goes red.
 * CI reports the same green it reported before, over strictly less
 * coverage — the identical failure mode the shards' toolchain-probe step
 * exists to prevent, one level up.
 *
 * So the matrix gets a test. This is the thing that fails when the wall
 * is absent, and it runs in `verify` — the fast gate — so the answer
 * arrives in a minute rather than after a JVM build.
 *
 * The weekly composition sweep has the same hazard the other way round:
 * its suites under `tests/sweep/` self-skip unless `KEEL_RUN_SWEEP=1`,
 * so a workflow that stopped opting in, ran one file of the directory,
 * pinned the presets it sweeps, skipped its step on the schedule (an
 * `if:`) or let a red run pass (`continue-on-error`) would report green
 * over little or nothing. And it is report-only by design — most of an
 * hour long, and red whenever it finds something to plan — so a trigger
 * that put it on a push or a pull request would make it a gate nobody
 * chose.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowPath = path.join(repoRoot, '.github', 'workflows', 'ci.yml');
const sweepPath = path.join(repoRoot, '.github', 'workflows', 'composition-sweep.yml');
const e2eDir = path.join(repoRoot, 'tests', 'e2e');

interface Shard {
  id: string;
  tools: string;
  files: string;
}

/**
 * The shard list as CI will actually expand it — parsed, not
 * regex-matched, so a change to the workflow's shape surfaces here as a
 * failure rather than as a quietly empty result.
 */
const shards = (): Shard[] => {
  const workflow = parse(fs.readFileSync(workflowPath, 'utf8')) as {
    jobs: { e2e: { strategy: { matrix: { shard: Shard[] } } } };
  };
  return workflow.jobs.e2e.strategy.matrix.shard;
};

const claimedFiles = (shard: Shard): string[] => shard.files.trim().split(/\s+/);

describe('the CI e2e matrix', () => {
  it('claims every suite in tests/e2e/', () => {
    const onDisk = fs
      .readdirSync(e2eDir)
      .filter((entry) => entry.endsWith('.test.ts'))
      .map((entry) => `tests/e2e/${entry}`)
      .sort();
    const claimed = shards().flatMap(claimedFiles).sort();

    expect(claimed).toEqual(onDisk);
  });

  it('claims each suite exactly once', () => {
    const claimed = shards().flatMap(claimedFiles);
    const duplicated = claimed.filter((file, index) => claimed.indexOf(file) !== index);

    expect(duplicated).toEqual([]);
  });

  it('names a toolchain to probe for in every shard', () => {
    // The probe step is what turns an under-provisioned runner into a
    // red build; a shard with nothing to probe has opted out of it.
    for (const shard of shards()) {
      expect(shard.tools.trim(), `shard ${shard.id}`).not.toBe('');
    }
  });
});

/** What a job or a step may carry that decides whether it runs, and whether it can fail. */
interface Gated {
  if?: unknown;
  'continue-on-error'?: unknown;
  env?: Record<string, string>;
}

interface SweepWorkflow {
  on: Record<string, unknown>;
  env?: Record<string, string>;
  jobs: Record<string, Gated & { steps: (Gated & { run?: string })[] }>;
}

describe('the composition sweep workflow', () => {
  const sweep = (): SweepWorkflow => parse(fs.readFileSync(sweepPath, 'utf8')) as SweepWorkflow;

  it('runs on a schedule and on dispatch, never on a push or a pull request', () => {
    expect(Object.keys(sweep().on).sort()).toEqual(['schedule', 'workflow_dispatch']);
  });

  it('runs every suite under tests/sweep/, opted in, on the presets the dispatch names', () => {
    const workflow = sweep();
    // A step sees the workflow's env, then its job's, then its own.
    const running = Object.values(workflow.jobs).flatMap((job) =>
      job.steps
        .filter((step) => /\bvitest run\b/.test(step.run ?? ''))
        .map((step) => ({
          run: step.run,
          env: { ...workflow.env, ...job.env, ...step.env },
          gates: [job, step],
        })),
    );
    expect(running).toHaveLength(1);
    // Runs on every event, and fails when it finds something: an `if:`
    // could skip the schedule, and `continue-on-error` would turn every
    // red run green.
    for (const gate of running[0]?.gates ?? []) {
      expect(gate.if).toBeUndefined();
      expect(gate['continue-on-error']).toBeUndefined();
    }
    // The directory, whole: a file of it would sweep one suite.
    expect(running[0]?.run).toMatch(/\bvitest run tests\/sweep\/?$/);
    expect(running[0]?.env['KEEL_RUN_SWEEP']).toBe('1');
    // Blank on the schedule, so every preset is swept; never a list.
    expect(running[0]?.env['KEEL_SWEEP_STACKS'] ?? '${{ inputs.stacks }}').toBe(
      '${{ inputs.stacks }}',
    );
  });
});
