/**
 * The A/B protocol as a computation: what the report pairs, what it
 * refuses to pair, and what the analyst pass flags before a reader
 * over-reads a row.
 *
 * No benchmark on disk and no agent anywhere — the inputs are two
 * hand-built benchmark objects, which is the only way to state
 * "a delta inside the pooled spread is noise" as a test rather than
 * as a paragraph.
 */

import { describe, expect, it } from 'vitest';
import { compare, flagsFor, renderReport, variantOf } from '../../evals/lib/ab.mjs';

interface Aggregate {
  readonly unprepared?: number;
  readonly successRate?: number | null;
  readonly completedRate?: number | null;
  readonly wallMs?: { n: number; mean: number; stddev: number } | null;
  readonly bashSearches?: { n: number; mean: number; stddev: number } | null;
}

const benchmark = (variant: string, cases: { id: string; aggregate: Aggregate }[]): unknown => ({
  campaign: 'tasks',
  keel: { commit: 'a'.repeat(40) },
  variant: { id: variant },
  finishedAt: '2026-09-14T00:00:00.000Z',
  driver: { id: 'claude-code', version: '1.0.0', mode: 'scripted', model: 'sonnet' },
  cases: cases.map((c) => ({ ...c, tags: ['task'] })),
});

/** A case with three runs, a success rate and a wall-clock series. */
const entry = (
  id: string,
  successRate: number,
  wall: [number, number],
  searches?: [number, number],
): { id: string; aggregate: Aggregate } => ({
  id,
  aggregate: {
    unprepared: 0,
    successRate,
    completedRate: 1,
    wallMs: { n: 3, mean: wall[0], stddev: wall[1] },
    ...(searches === undefined
      ? {}
      : { bashSearches: { n: 3, mean: searches[0], stddev: searches[1] } }),
  },
});

describe('assertComparable, through compare', () => {
  it('refuses two benchmarks of different campaigns', () => {
    const other = { ...(benchmark('a', []) as { campaign: string }), campaign: 'baseline' };
    expect(() => compare(benchmark('a', []), other)).toThrow(/cannot compare campaign/);
  });

  it('refuses a comparison that varied the agent instead of the harness', () => {
    const after = benchmark('b', []) as { driver: { model: string } };
    after.driver = { ...after.driver, model: 'opus' };
    expect(() => compare(benchmark('a', []), after)).toThrow(/varies the harness, never the agent/);
  });

  it('refuses two benchmarks of the same variant', () => {
    expect(() => compare(benchmark('a', []), benchmark('a', []))).toThrow(/both benchmarks are/);
  });

  it('reads a benchmark with no variant as the baseline', () => {
    const legacy = benchmark('x', []) as { variant?: unknown };
    delete legacy.variant;
    expect(variantOf(legacy)).toBe('baseline');
  });
});

describe('compare', () => {
  const before = benchmark('baseline', [entry('task/go-http', 1, [100, 10], [6, 1])]);

  it('pairs each case with itself and reports the delta and the pooled spread', () => {
    const after = benchmark('terse', [entry('task/go-http', 1, [130, 10], [2, 1])]);
    const report = compare(before, after) as unknown as {
      cases: { id: string; metrics: Record<string, { delta: number; significant: boolean }> }[];
    };
    expect(report.cases).toHaveLength(1);
    const metrics = report.cases[0]!.metrics;
    expect(metrics['wallMs']).toMatchObject({ before: 100, after: 130, delta: 30, stddev: 10 });
    expect(metrics['wallMs']!.significant, '30ms over a 10ms spread').toBe(true);
    expect(metrics['bashSearches']!.delta).toBe(-4);
  });

  it('calls a delta inside the pooled spread this campaign’s noise', () => {
    const after = benchmark('terse', [entry('task/go-http', 1, [105, 20], [6, 1])]);
    const report = compare(before, after) as unknown as {
      cases: { metrics: Record<string, { significant: boolean }> }[];
    };
    expect(report.cases[0]!.metrics['wallMs']!.significant).toBe(false);
  });

  it('treats a change with no spread at all as real', () => {
    const stable = benchmark('baseline', [entry('task/go-http', 1, [100, 0])]);
    const after = benchmark('terse', [entry('task/go-http', 1, [101, 0])]);
    const report = compare(stable, after) as unknown as {
      cases: { metrics: Record<string, { significant: boolean }> }[];
    };
    expect(report.cases[0]!.metrics['wallMs']!.significant).toBe(true);
  });

  it('derives a success rate’s spread from the rate itself', () => {
    const after = benchmark('terse', [entry('task/go-http', 0, [100, 10])]);
    const report = compare(before, after) as unknown as {
      cases: { metrics: Record<string, { delta: number; stddev: number }> }[];
    };
    // Both variants agreed with themselves every run: p(1-p) is zero
    // on each side, so a full swing is as significant as it looks.
    expect(report.cases[0]!.metrics['successRate']).toMatchObject({ delta: -1, stddev: 0 });
  });

  it('compares a case only one side ran nowhere, and says so', () => {
    const after = benchmark('terse', [
      entry('task/go-http', 1, [100, 10]),
      entry('task/ts-http', 1, [50, 5]),
    ]);
    const report = compare(before, after) as unknown as { cases: unknown[]; unpaired: string[] };
    expect(report.cases).toHaveLength(1);
    expect(report.unpaired).toEqual(['task/ts-http']);
  });

  it('drops a metric neither variant could measure', () => {
    const after = benchmark('terse', [entry('task/go-http', 1, [130, 10])]);
    const report = compare(before, after) as unknown as {
      cases: { metrics: Record<string, unknown> }[];
    };
    expect(Object.keys(report.cases[0]!.metrics)).not.toContain('tokensIn');
  });

  it('summarises without inventing a campaign-wide significance', () => {
    const after = benchmark('terse', [entry('task/go-http', 1, [130, 10], [2, 1])]);
    const report = compare(before, after) as unknown as {
      summary: { cases: number; metrics: Record<string, { significantCases: number }> };
    };
    expect(report.summary.cases).toBe(1);
    expect(report.summary.metrics['wallMs']!.significantCases).toBe(1);
    expect(report.summary.metrics['wallMs']).not.toHaveProperty('significant');
  });
});

describe('the analyst pass', () => {
  const three = (rate: number, unprepared = 0) => ({
    aggregate: { successRate: rate, unprepared, wallMs: { n: 3 - unprepared, mean: 1, stddev: 0 } },
  });

  it('flags a case both variants pass every run as discriminating nothing', () => {
    expect(flagsFor(three(1), three(1)).join(' ')).toContain('non-discriminating');
    expect(flagsFor(three(0), three(0)).join(' ')).toContain('non-discriminating');
  });

  it('flags a case that neither passed nor failed consistently as flaky', () => {
    expect(flagsFor(three(1), three(0.667)).join(' ')).toContain('flaky');
  });

  it('flags runs that never got a workspace, and a thin sample', () => {
    const flags = flagsFor(three(1), three(1, 1)).join(' ');
    expect(flags).toContain('1 run(s) never got a workspace');
    expect(flags).toContain('underpowered: 2 run(s)');
  });

  it('says nothing about a case that discriminated cleanly', () => {
    expect(flagsFor(three(1), three(0))).toEqual([]);
  });
});

describe('renderReport', () => {
  it('marks the significant rows and explains the mark once', () => {
    const report = compare(
      benchmark('baseline', [entry('task/go-http', 1, [100, 1])]),
      benchmark('terse', [entry('task/go-http', 1, [200, 1])]),
    );
    const text = renderReport(report);
    expect(text).toContain('task/go-http');
    expect(text).toMatch(/wallMs .*Δ .*100.*\*/);
    expect(text).toContain('wider than the pooled spread');
  });
});
