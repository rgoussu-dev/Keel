/**
 * Aggregation over a case's N runs: mean/stddev/min/max per numeric
 * series, nulls dropped first — a driver that cannot measure a field
 * yields null there, and a null must never drag a mean toward zero.
 */

/** Aggregates one numeric series; `null` when nothing was measured. */
export function aggregate(values) {
  const nums = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (nums.length === 0) return null;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length;
  return {
    n: nums.length,
    mean: round(mean),
    stddev: round(Math.sqrt(variance)),
    min: Math.min(...nums),
    max: Math.max(...nums),
  };
}

function round(n) {
  return Math.round(n * 1000) / 1000;
}

/** The per-case aggregate block of a benchmark. */
export function aggregateCase(runs) {
  return {
    successRate: round(runs.filter((r) => r.oracle.pass).length / runs.length),
    completedRate: round(runs.filter((r) => r.completed).length / runs.length),
    wallMs: aggregate(runs.map((r) => r.wallMs)),
    filesChanged: aggregate(runs.map((r) => r.diff.filesChanged)),
    insertions: aggregate(runs.map((r) => r.diff.insertions)),
    deletions: aggregate(runs.map((r) => r.diff.deletions)),
    tokensIn: aggregate(runs.map((r) => r.metrics.tokensIn)),
    tokensOut: aggregate(runs.map((r) => r.metrics.tokensOut)),
    cacheRead: aggregate(runs.map((r) => r.metrics.cacheRead)),
    costUsd: aggregate(runs.map((r) => r.metrics.costUsd)),
    turns: aggregate(runs.map((r) => r.metrics.turns)),
    toolCallsTotal: aggregate(
      runs.map((r) =>
        r.metrics.toolCalls === null
          ? null
          : Object.values(r.metrics.toolCalls).reduce((a, b) => a + b, 0),
      ),
    ),
    bashSearches: aggregate(runs.map((r) => r.metrics.bashSearches)),
  };
}
