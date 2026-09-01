/**
 * The whole runner, end to end, against the canonical fake driver —
 * no agent binary, no network, no billing. The fake occupies exactly
 * the seam a real agent does: it acts on the workspace, and the
 * oracle judges what it left there.
 */

import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeDriver } from '../../evals/drivers/fake-driver.mjs';
import { BENCHMARK_SCHEMA, runCampaign } from '../../evals/lib/runner.mjs';

let workspaces: string[];

beforeEach(() => {
  workspaces = [];
});

afterEach(async () => {
  for (const w of workspaces) await fs.remove(w);
});

const CASE = {
  id: 'navigation/sample',
  tags: ['navigation'],
  dir: '/nowhere',
  scaffold: { stack: 'ts-http' },
  prompt: 'which file?',
  oracle: {
    answers_file: '.keel-eval/answers.txt',
    answers: { wiring: 'application/rest/src/shipping.ts' },
  },
  budgets: { timeout_seconds: 60 },
  runs: 2,
};

const campaignOf = (overrides: Record<string, unknown> = {}) => ({
  name: 'test',
  description: 'test campaign',
  cases: ['navigation/sample'],
  resolved: [CASE],
  ...overrides,
});

/** A workspace with just enough tree for the context audit. */
const prepareWorkspace = async (): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-eval-runner-'));
  workspaces.push(dir);
  await fs.writeFile(path.join(dir, 'AGENTS.md'), '# conventions\n'.repeat(10));
  await fs.writeFile(path.join(dir, 'CLAUDE.md'), '@AGENTS.md\n');
  return dir;
};

const solve = async (workspace: string): Promise<void> => {
  await fs.mkdirp(path.join(workspace, '.keel-eval'));
  await fs.writeFile(
    path.join(workspace, '.keel-eval', 'answers.txt'),
    'wiring=application/rest/src/shipping.ts\n',
  );
};

const baseDeps = (driver: ReturnType<typeof fakeDriver>) => {
  let tick = 0;
  return {
    campaign: campaignOf(),
    driver,
    mode: 'scripted',
    prepareWorkspace,
    diffStats: () => ({ filesChanged: 0, insertions: 0, deletions: 0 }),
    keel: { version: '0.0.0-test', commit: null },
    now: () => {
      tick += 1000;
      return tick;
    },
    log: () => {},
    io: undefined,
  };
};

describe('runCampaign against the fake driver', () => {
  it('a solving agent passes every run and the benchmark says so', async () => {
    const driver = fakeDriver({ solve, metrics: { turns: 4, tokensIn: 100, tokensOut: 50 } });
    const benchmark = await runCampaign(baseDeps(driver));

    expect(benchmark.schema).toBe(BENCHMARK_SCHEMA);
    expect(benchmark.campaign).toBe('test');
    expect(benchmark.driver.id).toBe('fake');
    expect(benchmark.driver.version).toBe('fake 1.0.0');
    expect(driver.calls.runs).toHaveLength(2);
    const c = benchmark.cases[0]!;
    expect(c.aggregate.successRate).toBe(1);
    expect(c.aggregate.turns).toMatchObject({ n: 2, mean: 4, min: 4, max: 4 });
    expect(c.runs.every((r: { completed: boolean }) => r.completed)).toBe(true);
    expect(benchmark.summary).toEqual({ cases: 1, successRate: 1 });
  });

  it('wall time is measured by the runner, not reported by the driver', async () => {
    const benchmark = await runCampaign(baseDeps(fakeDriver({ solve })));
    for (const r of benchmark.cases[0]!.runs) expect(r.wallMs).toBe(1000);
  });

  it('an agent that does nothing fails the oracle with the reason listed', async () => {
    const benchmark = await runCampaign(baseDeps(fakeDriver({})));
    const c = benchmark.cases[0]!;
    expect(c.aggregate.successRate).toBe(0);
    expect(c.runs[0]!.oracle.failures[0]).toMatch(/was not written/);
  });

  it('unmeasured metrics aggregate to null, never to zero', async () => {
    const benchmark = await runCampaign(baseDeps(fakeDriver({ solve })));
    const agg = benchmark.cases[0]!.aggregate;
    expect(agg.tokensIn).toBeNull();
    expect(agg.costUsd).toBeNull();
    expect(agg.turns).toBeNull();
  });

  it('a timed-out run is not completed even with a zero exit', async () => {
    const benchmark = await runCampaign(
      baseDeps(fakeDriver({ solve, timedOut: true, exitCode: 0 })),
    );
    expect(benchmark.cases[0]!.runs[0]!.completed).toBe(false);
  });

  it('an agent that failed to spawn is not completed despite its null exit', async () => {
    const benchmark = await runCampaign(baseDeps(fakeDriver({ solve, spawnError: true })));
    const run = benchmark.cases[0]!.runs[0]!;
    expect(run.exitCode).toBeNull();
    expect(run.completed).toBe(false);
  });

  it('the campaign runs count overrides the case default', async () => {
    const driver = fakeDriver({ solve });
    const deps = { ...baseDeps(driver), campaign: campaignOf({ runs: 1 }) };
    await runCampaign(deps);
    expect(driver.calls.runs).toHaveLength(1);
  });

  it('audits the workspace context once per case', async () => {
    const benchmark = await runCampaign(baseDeps(fakeDriver({ solve })));
    const audit = benchmark.cases[0]!.contextAudit!;
    expect(audit.files.map((f: { path: string }) => f.path)).toEqual(['AGENTS.md', 'CLAUDE.md']);
    expect(audit.totalBytes).toBeGreaterThan(0);
    expect(audit.approxTokens).toBeGreaterThan(0);
  });

  it('refuses an unavailable driver, naming the probe detail', async () => {
    await expect(runCampaign(baseDeps(fakeDriver({ available: false })))).rejects.toThrow(
      /unavailable: fake agent not installed/,
    );
  });

  it('refuses a mode the driver does not declare', async () => {
    const deps = { ...baseDeps(fakeDriver({})), mode: 'psychic' };
    await expect(runCampaign(deps)).rejects.toThrow(/does not support psychic mode/);
  });
});
