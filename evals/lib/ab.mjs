/**
 * The A/B protocol: two benchmarks of the same campaign under the
 * same driver, one per **harness variant**, folded into a paired
 * per-case delta report.
 *
 * Three rules the shape encodes, all of them about not over-reading a
 * small sample:
 *
 *   - **Paired per scenario.** A case is compared with itself, never
 *     with the campaign average. Cases differ from one another far
 *     more than harnesses differ from one another, so an unpaired
 *     comparison measures the case mix.
 *   - **One stddev is the tripwire, not a p-value.** N=3 is a
 *     regression detector, not statistics. A delta inside the pooled
 *     spread of the two samples is noise until a bigger campaign says
 *     otherwise, and the report says which is which rather than
 *     leaving the reader to eyeball it.
 *   - **The analyst pass runs before the reader does.** A case both
 *     variants pass every time discriminates nothing; one that passes
 *     sometimes under one variant is flaky, and its own variance can
 *     swamp whatever the harness did. Both are flagged on the case,
 *     because the fix is to the case.
 *
 * Never across drivers, models or campaigns: a harness delta measured
 * against a different agent is a different measurement wearing this
 * one's name. {@link assertComparable} refuses it.
 */

/** The report file's self-describing schema tag. */
export const AB_SCHEMA = 'keel-evals/ab@1';

/**
 * The aggregate fields compared as `{mean, stddev}` series — the
 * #130 metric set, minus the two rates, which are compared from
 * their own shape below. A field neither variant could measure is
 * dropped from the report rather than reported as a zero delta.
 */
export const SERIES_METRICS = Object.freeze([
  'wallMs',
  'filesChanged',
  'insertions',
  'deletions',
  'tokensIn',
  'tokensOut',
  'cacheRead',
  'costUsd',
  'turns',
  'toolCallsTotal',
  'bashSearches',
]);

/** The aggregate fields that are a rate over the case's runs. */
export const RATE_METRICS = Object.freeze(['successRate', 'completedRate']);

/**
 * Holds two benchmarks to the one thing an A/B may vary. Everything
 * that decides what a number means — the campaign, the agent, its
 * version, the drive mode, the model — has to match, and the variant
 * has to differ, or the report would name a comparison nobody made.
 */
export function assertComparable(before, after) {
  if (before.campaign !== after.campaign) {
    throw new Error(`cannot compare campaign '${after.campaign}' against '${before.campaign}'`);
  }
  for (const key of ['id', 'version', 'mode', 'model']) {
    if (before.driver?.[key] !== after.driver?.[key]) {
      throw new Error(
        `cannot compare: driver ${key} '${after.driver?.[key]}' differs from '${before.driver?.[key]}' — an A/B varies the harness, never the agent`,
      );
    }
  }
  if (variantOf(before) === variantOf(after)) {
    throw new Error(
      `both benchmarks are variant '${variantOf(before)}' — an A/B needs two, and the runner records the one it ran under`,
    );
  }
}

/** The harness variant a benchmark was taken under; `baseline` when it records none. */
export function variantOf(benchmark) {
  return benchmark.variant?.id ?? 'baseline';
}

function round(n) {
  return Math.round(n * 1000) / 1000;
}

/**
 * One metric's delta. `stddev` is the pooled spread of the two
 * samples — `sqrt((sa² + sb²) / 2)` — and `significant` is the
 * tripwire: a delta wider than that spread is worth a look, and one
 * inside it is this campaign's noise.
 */
function delta(beforeMean, afterMean, beforeSd, afterSd) {
  if (beforeMean === null || afterMean === null) return null;
  const pooled = Math.sqrt(((beforeSd ?? 0) ** 2 + (afterSd ?? 0) ** 2) / 2);
  const diff = afterMean - beforeMean;
  return {
    before: round(beforeMean),
    after: round(afterMean),
    delta: round(diff),
    stddev: round(pooled),
    // A change with no spread at all on either side is real by
    // construction — every run agreed — so it is not held to a
    // threshold of zero it could never clear.
    significant: pooled === 0 ? diff !== 0 : Math.abs(diff) > pooled,
  };
}

/**
 * The spread of a rate over `n` runs. A success rate is the mean of a
 * 0/1 series, so its population standard deviation is `sqrt(p(1-p))`
 * exactly — no extra data needed, and honestly wide at N=3, which is
 * the point.
 */
function rateStddev(rate) {
  return rate === null ? null : Math.sqrt(rate * (1 - rate));
}

/**
 * How many runs a case's aggregate is actually over. `wallMs` is the
 * runner's own measurement rather than a driver's, so it is present
 * for every prepared run and absent for every unprepared one — which
 * makes its `n` the honest sample size, not the number attempted.
 */
function runsOf(entry) {
  return entry?.aggregate?.wallMs?.n ?? 0;
}

/** Compares one case across the two variants, metric by metric. */
function compareCase(before, after) {
  const metrics = {};
  for (const key of RATE_METRICS) {
    const b = before.aggregate?.[key] ?? null;
    const a = after.aggregate?.[key] ?? null;
    const d = delta(b, a, rateStddev(b), rateStddev(a));
    if (d !== null) metrics[key] = d;
  }
  for (const key of SERIES_METRICS) {
    const b = before.aggregate?.[key] ?? null;
    const a = after.aggregate?.[key] ?? null;
    const d = delta(b?.mean ?? null, a?.mean ?? null, b?.stddev ?? null, a?.stddev ?? null);
    if (d !== null) metrics[key] = d;
  }
  return { id: before.id, tags: before.tags ?? [], metrics, flags: flagsFor(before, after) };
}

/**
 * The analyst pass, per case: what would make a reader over-read this
 * row. Every flag is about the *case*, because that is what the fix
 * changes — a case nobody can fail teaches nothing, and a case that
 * fails at random teaches less.
 */
export function flagsFor(before, after) {
  const flags = [];
  const rates = [before.aggregate?.successRate ?? null, after.aggregate?.successRate ?? null];
  if (rates.every((r) => r === 1)) flags.push('non-discriminating: both variants passed every run');
  if (rates.every((r) => r === 0)) flags.push('non-discriminating: both variants failed every run');
  if (rates.some((r) => r !== null && r > 0 && r < 1)) {
    flags.push('flaky: a variant neither passed nor failed consistently');
  }
  const unprepared = (before.aggregate?.unprepared ?? 0) + (after.aggregate?.unprepared ?? 0);
  if (unprepared > 0) flags.push(`${String(unprepared)} run(s) never got a workspace`);
  const runs = Math.min(runsOf(before), runsOf(after));
  if (runs < 3) flags.push(`underpowered: ${String(runs)} run(s) on the thinner side`);
  return flags;
}

/**
 * The A/B report over two benchmarks of one campaign. Cases only one
 * side ran are listed under `unpaired` and compared nowhere: an
 * unpaired case in a paired report is the one way this shape could
 * lie.
 */
export function compare(before, after) {
  assertComparable(before, after);
  const byId = new Map(after.cases.map((c) => [c.id, c]));
  const paired = [];
  const unpaired = [];
  for (const b of before.cases) {
    const a = byId.get(b.id);
    if (a === undefined) unpaired.push(b.id);
    else paired.push(compareCase(b, a));
  }
  for (const a of after.cases) {
    if (!before.cases.some((b) => b.id === a.id)) unpaired.push(a.id);
  }
  return {
    schema: AB_SCHEMA,
    campaign: before.campaign,
    driver: before.driver,
    before: { variant: variantOf(before), keel: before.keel, finishedAt: before.finishedAt },
    after: { variant: variantOf(after), keel: after.keel, finishedAt: after.finishedAt },
    cases: paired,
    unpaired: [...new Set(unpaired)].sort(),
    summary: summarize(paired),
  };
}

/**
 * The overall line: the mean delta of each metric across the paired
 * cases, and how many of them cleared their own tripwire. Deliberately
 * *not* a pooled significance claim over the campaign — the cases are
 * different tasks, and averaging their spreads would invent a
 * precision the sample does not have.
 */
function summarize(cases) {
  const metrics = {};
  for (const key of [...RATE_METRICS, ...SERIES_METRICS]) {
    const rows = cases.map((c) => c.metrics[key]).filter((m) => m !== undefined);
    if (rows.length === 0) continue;
    metrics[key] = {
      cases: rows.length,
      meanDelta: round(rows.reduce((a, m) => a + m.delta, 0) / rows.length),
      significantCases: rows.filter((m) => m.significant).length,
    };
  }
  return {
    cases: cases.length,
    flagged: cases.filter((c) => c.flags.length > 0).length,
    metrics,
  };
}

/** Renders the report as the fixed-width table the workflow logs. */
export function renderReport(report) {
  const lines = [
    `A/B — campaign '${report.campaign}', driver ${report.driver?.id ?? 'unknown'} ${report.driver?.version ?? ''} (${report.driver?.mode ?? '?'}, model ${report.driver?.model ?? 'not pinned'})`,
    `  before: ${report.before.variant} @ ${report.before.keel?.commit?.slice(0, 8) ?? 'unknown'}`,
    `  after:  ${report.after.variant} @ ${report.after.keel?.commit?.slice(0, 8) ?? 'unknown'}`,
    '',
  ];
  for (const c of report.cases) {
    lines.push(c.id);
    for (const [key, m] of Object.entries(c.metrics)) {
      lines.push(
        `  ${key.padEnd(16)} ${String(m.before).padStart(10)} → ${String(m.after).padStart(10)}  ` +
          `Δ ${String(m.delta).padStart(10)} ±${String(m.stddev).padStart(8)}` +
          `${m.significant ? '  *' : ''}`,
      );
    }
    for (const flag of c.flags) lines.push(`  ! ${flag}`);
    lines.push('');
  }
  if (report.unpaired.length > 0) {
    lines.push(`unpaired (compared nowhere): ${report.unpaired.join(', ')}`, '');
  }
  lines.push(
    `${String(report.summary.cases)} paired case(s), ${String(report.summary.flagged)} flagged`,
    '* the delta is wider than the pooled spread of the two samples — everything else is this campaign’s noise',
  );
  return lines.join('\n');
}
