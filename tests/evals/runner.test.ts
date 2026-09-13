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
import {
  BENCHMARK_SCHEMA,
  driverIdentity,
  mergeBenchmark,
  runCampaign,
} from '../../evals/lib/runner.mjs';

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
    expect(benchmark.summary).toEqual({ cases: 1, successRate: 1, unprepared: 0 });
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

  it('a scripted agent killed by a signal (null exit) is not completed', async () => {
    const benchmark = await runCampaign(baseDeps(fakeDriver({ solve, exitCode: null })));
    expect(benchmark.cases[0]!.runs[0]!.completed).toBe(false);
  });

  it('an attended run has no exit code, and its null exit stays completed', async () => {
    const deps = { ...baseDeps(fakeDriver({ solve, exitCode: null })), mode: 'attended' };
    const benchmark = await runCampaign(deps);
    expect(benchmark.cases[0]!.runs[0]!.completed).toBe(true);
  });

  it('the campaign runs count overrides the case default', async () => {
    const driver = fakeDriver({ solve });
    const deps = { ...baseDeps(driver), campaign: campaignOf({ runs: 1 }) };
    await runCampaign(deps);
    expect(driver.calls.runs).toHaveLength(1);
  });

  it('hands the requested model to the driver and records it in the benchmark', async () => {
    const driver = fakeDriver({ solve });
    const benchmark = await runCampaign({ ...baseDeps(driver), model: 'opus' });
    expect(driver.calls.runs[0]!.model).toBe('opus');
    expect(benchmark.driver.model).toBe('opus');
  });

  it('records no model where the driver cannot pin one in that mode', async () => {
    const unpinned = fakeDriver({ solve, defaultModel: 'sonnet', pinsModel: false });
    const benchmark = await runCampaign({ ...baseDeps(unpinned), model: 'opus' });
    expect(benchmark.driver.model).toBeNull();
    expect(benchmark.driver.capabilities.model).toBe(false);
    // The request still reaches the driver — it is what the operator is told to pick.
    expect(unpinned.calls.runs[0]!.model).toBe('opus');
    expect(driverIdentity(unpinned, 'scripted', 'opus', 'v').model).toBeNull();
    expect(driverIdentity(fakeDriver({ solve }), 'scripted', 'opus', 'v').model).toBe('opus');
  });

  it('falls back to the driver default model, and to null when it has none', async () => {
    const withDefault = fakeDriver({ solve, defaultModel: 'sonnet' });
    expect((await runCampaign(baseDeps(withDefault))).driver.model).toBe('sonnet');
    expect(withDefault.calls.runs[0]!.model).toBeUndefined();
    const without = fakeDriver({ solve });
    expect((await runCampaign(baseDeps(without))).driver.model).toBeNull();
  });

  it('retries a workspace that fails to prepare once, and the run then counts', async () => {
    const driver = fakeDriver({ solve });
    let attempts = 0;
    const flaky = async (): Promise<string> => {
      attempts += 1;
      if (attempts === 1) throw new Error('npm install: transient');
      return prepareWorkspace();
    };
    const benchmark = await runCampaign({ ...baseDeps(driver), prepareWorkspace: flaky });
    expect(attempts).toBe(3);
    expect(driver.calls.runs).toHaveLength(2);
    expect(benchmark.cases[0]!.aggregate.successRate).toBe(1);
    expect(benchmark.cases[0]!.aggregate.unprepared).toBe(0);
  });

  it('records a workspace that cannot be prepared, keeps it out of the rates, and goes on', async () => {
    const driver = fakeDriver({ solve });
    let attempts = 0;
    const broken = async (): Promise<string> => {
      attempts += 1;
      if (attempts <= 2) throw new Error('npm install: edgesOut of null');
      return prepareWorkspace();
    };
    const benchmark = await runCampaign({ ...baseDeps(driver), prepareWorkspace: broken });
    const c = benchmark.cases[0]!;
    expect(driver.calls.runs).toHaveLength(1);
    expect(c.runs[0]).toMatchObject({
      run: 1,
      prepared: false,
      completed: false,
      workspace: null,
      oracle: null,
    });
    expect(c.runs[0]!.error).toMatch(/edgesOut/);
    expect(c.runs[1]).toMatchObject({ run: 2, prepared: true, completed: true });
    expect(c.aggregate.successRate).toBe(1);
    expect(c.aggregate.unprepared).toBe(1);
    expect(benchmark.summary).toEqual({ cases: 1, successRate: 1, unprepared: 1 });
  });

  it('a case with no prepared run has null rates rather than zero', async () => {
    const driver = fakeDriver({ solve });
    const never = async (): Promise<string> => {
      throw new Error('no scaffold');
    };
    const benchmark = await runCampaign({ ...baseDeps(driver), prepareWorkspace: never });
    expect(driver.calls.runs).toHaveLength(0);
    expect(benchmark.cases[0]!.aggregate.successRate).toBeNull();
    expect(benchmark.cases[0]!.contextAudit).toBeNull();
    expect(benchmark.summary).toEqual({ cases: 1, successRate: null, unprepared: 2 });
  });

  it('checkpoints the benchmark so far after every run', async () => {
    const seen: { complete: boolean; runs: number }[] = [];
    const checkpoint = (b: { complete: boolean; cases: { runs: unknown[] }[] }): void => {
      seen.push({ complete: b.complete, runs: b.cases.reduce((n, c) => n + c.runs.length, 0) });
    };
    const benchmark = await runCampaign({ ...baseDeps(fakeDriver({ solve })), checkpoint });
    expect(seen).toEqual([
      { complete: false, runs: 1 },
      { complete: false, runs: 2 },
    ]);
    expect(benchmark.complete).toBe(true);
    expect(benchmark.summary.successRate).toBe(1);
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

describe('mergeBenchmark — re-running a subset of cases into an existing benchmark', () => {
  const caseResult = (id: string, successRate: number | null, unprepared = 0) => ({
    id,
    tags: ['navigation'],
    contextAudit: null,
    runs: [],
    aggregate: { successRate, unprepared },
  });
  const previous = {
    schema: BENCHMARK_SCHEMA,
    complete: true,
    campaign: 'baseline',
    startedAt: '2026-09-13T00:00:00.000Z',
    finishedAt: '2026-09-13T00:30:00.000Z',
    keel: { version: '0.5.0-alpha', commit: 'aaaa' },
    driver: { id: 'claude-code', version: '2.1.270', mode: 'scripted', model: 'sonnet' },
    cases: [caseResult('a', 1), caseResult('b', 0.5), caseResult('c', null, 2)],
    summary: { cases: 3, successRate: 0.75, unprepared: 2 },
  };
  const fresh = {
    ...previous,
    complete: true,
    startedAt: '2026-09-13T01:00:00.000Z',
    finishedAt: '2026-09-13T01:05:00.000Z',
    keel: { version: '0.5.0-alpha', commit: 'bbbb' },
    cases: [caseResult('c', 1)],
    summary: { cases: 1, successRate: 1, unprepared: 0 },
  };
  const order = ['a', 'b', 'c'];

  it('replaces the re-run cases, keeps the rest, in campaign order, and re-summarizes', () => {
    const merged = mergeBenchmark(previous, fresh, order);
    expect(merged.cases.map((c: { id: string }) => c.id)).toEqual(['a', 'b', 'c']);
    expect(merged.cases[2]!.aggregate).toEqual({ successRate: 1, unprepared: 0 });
    expect(merged.summary).toEqual({ cases: 3, successRate: 0.833, unprepared: 0 });
    expect(merged.startedAt).toBe(previous.startedAt);
    expect(merged.finishedAt).toBe(fresh.finishedAt);
    expect(merged.complete).toBe(true);
  });

  it('keeps the last complete measurement of a case while its re-run is still in progress', () => {
    const partial = { ...fresh, complete: false, finishedAt: null };
    const merged = mergeBenchmark(previous, partial, order);
    expect(merged.complete).toBe(false);
    expect(merged.cases.map((c: { id: string }) => c.id)).toEqual(['a', 'b', 'c']);
    expect(merged.cases[2]!.aggregate).toEqual({ successRate: null, unprepared: 2 });

    // Settled cases of an incomplete re-run do replace theirs; only the
    // last, still running, waits — and a case new to the file lands at once.
    const twoCases = {
      ...partial,
      cases: [caseResult('c', 1), caseResult('d', 0.5)],
    };
    const settled = mergeBenchmark(previous, twoCases, [...order, 'd']);
    expect(
      settled.cases.map((c: { id: string; aggregate: { successRate: number | null } }) => [
        c.id,
        c.aggregate.successRate,
      ]),
    ).toEqual([
      ['a', 1],
      ['b', 0.5],
      ['c', 1],
      ['d', 0.5],
    ]);
  });

  it('records that the benchmark is a merge, naming the re-run cases and both commits', () => {
    const merged = mergeBenchmark(previous, fresh, order);
    expect(merged.merged).toEqual([{ cases: ['c'], commit: 'bbbb', finishedAt: fresh.finishedAt }]);
    expect(merged.keel).toEqual(previous.keel);
  });

  it('is incomplete while the fresh part is, and refuses a different campaign or driver', () => {
    expect(mergeBenchmark(previous, { ...fresh, complete: false }, order).complete).toBe(false);
    expect(() => mergeBenchmark(previous, { ...fresh, campaign: 'other' }, order)).toThrow(
      /campaign/,
    );
    expect(() =>
      mergeBenchmark(previous, { ...fresh, driver: { ...fresh.driver, model: 'opus' } }, order),
    ).toThrow(/driver model/);
  });

  it('refuses an agent upgraded between sittings — a version is part of the driver identity', () => {
    expect(() =>
      mergeBenchmark(
        previous,
        { ...fresh, driver: { ...fresh.driver, version: '2.1.271' } },
        order,
      ),
    ).toThrow(/driver version '2.1.271' differs from '2.1.270'/);
  });

  it('reads a benchmark written before unprepared runs were counted as having none', () => {
    const legacy = {
      ...previous,
      cases: previous.cases.map(({ aggregate, ...c }) => ({
        ...c,
        aggregate: { successRate: aggregate.successRate },
      })),
      summary: { cases: 3, successRate: 0.75 },
    };
    const merged = mergeBenchmark(legacy, fresh, order);
    expect(merged.summary).toEqual({ cases: 3, successRate: 0.833, unprepared: 0 });
  });
});
