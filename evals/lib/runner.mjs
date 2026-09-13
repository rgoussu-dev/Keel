/**
 * Campaign orchestration — pure of process/agent concerns: the
 * driver, the workspace builder, the clock and the log all arrive as
 * ports, so the verify suites run whole campaigns through the fake
 * driver with in-process fixtures and no live agent anywhere near
 * (`verify` must never make an agent call; live runs sit behind
 * `KEEL_RUN_EVALS=1` in `run.mjs`).
 */

import { judge } from './oracle.mjs';
import { aggregateCase } from './metrics.mjs';
import { emptyMetrics } from '../drivers/driver.mjs';
import { auditContext } from './context-audit.mjs';

/** The benchmark file's self-describing schema tag. */
export const BENCHMARK_SCHEMA = 'keel-evals/benchmark@1';

/** The summary block over a set of case entries. */
function summarize(cases) {
  const rated = cases.filter((c) => c.aggregate.successRate !== null);
  return {
    cases: cases.length,
    successRate:
      rated.length === 0
        ? null
        : Math.round(
            (rated.reduce((a, c) => a + c.aggregate.successRate, 0) / rated.length) * 1000,
          ) / 1000,
    // A benchmark written before the count existed carries none;
    // that is zero unprepared runs, not NaN in the merged summary.
    unprepared: cases.reduce((a, c) => a + (c.aggregate.unprepared ?? 0), 0),
  };
}

/**
 * The part of a benchmark's identity a re-run has to share with it
 * before it may fold in: the campaign, and the driver down to its
 * version and model. An agent upgraded between sittings, or a model
 * changed, is a different measurement, not a re-run — so this is
 * checked twice, by {@link mergeBenchmark} on every write and by the
 * runner before the first paid session, so a mismatch costs nothing.
 */
export function assertMergeable(previous, identity) {
  if (previous.campaign !== identity.campaign) {
    throw new Error(`cannot merge campaign '${identity.campaign}' into '${previous.campaign}'`);
  }
  for (const key of ['id', 'version', 'mode', 'model']) {
    if (previous.driver[key] !== identity.driver[key]) {
      throw new Error(
        `cannot merge: driver ${key} '${identity.driver[key]}' differs from '${previous.driver[key]}'`,
      );
    }
  }
}

/**
 * What the benchmark records under `driver`, and what `--only` has to
 * match. The model is the one the driver was asked to run — the
 * flag, else the driver's default — but only where the driver's
 * manifest for that mode says it can pin one (`model: true`; a
 * manifest that says nothing has not claimed it either). An attended
 * session is opened by the operator with whatever model the CLI last
 * had, so the benchmark records `null` rather than a request nothing
 * verified.
 */
export function driverIdentity(driver, mode, model, version) {
  const capabilities = driver.capabilities(mode);
  const pinned = capabilities.model === true;
  return {
    id: driver.id,
    version,
    mode,
    model: pinned ? (model ?? driver.defaultModel ?? null) : null,
    capabilities,
  };
}

/**
 * Folds a benchmark over a subset of cases (`--only`) into an earlier
 * benchmark of the same campaign, driver and model: the re-run cases
 * replace their earlier entries, every other case is kept, and the
 * result is ordered as the campaign lists them. The file records
 * that it is a merge — which cases, at which keel commit — so a
 * baseline finished in two sittings says so rather than passing for
 * one. Refuses to fold across campaigns or drivers (see
 * {@link assertMergeable}).
 *
 * Called on every checkpoint, not only at the end, so a fresh
 * benchmark that is not yet complete carries a case still in
 * progress, marked `complete: false` on the entry itself (an entry
 * without the flag predates it and is settled). That case does not
 * replace its earlier entry: the last complete measurement stays in
 * the file until the re-run has finished, so a kill mid-case loses
 * the partial re-run, never the measurement it was replacing; a case
 * new to the file lands as it is, flag and all, so the next merge
 * still knows it. The merge is complete only when the fresh part is
 * and every case the campaign lists has a settled entry from one
 * sitting or the other — a one-case `--only` over an interrupted
 * campaign does not turn it into a finished one.
 *
 * The `merged` record names the sitting's settled cases and is one
 * entry per sitting, not per checkpoint: `run.mjs` merges every
 * write from the benchmark as it was loaded at start, so each
 * checkpoint replaces the record the previous one wrote rather than
 * adding to it, and the final write leaves the finished one.
 */
export function mergeBenchmark(previous, fresh, order) {
  assertMergeable(previous, fresh);
  const isSettled = (c) => c.complete !== false;
  const byId = new Map(previous.cases.map((c) => [c.id, c]));
  for (const c of fresh.cases) {
    if (isSettled(c) || !byId.has(c.id)) byId.set(c.id, c);
  }
  const settledIds = new Set(
    [...previous.cases, ...fresh.cases].filter(isSettled).map((c) => c.id),
  );
  const cases = [
    ...order.filter((id) => byId.has(id)).map((id) => byId.get(id)),
    ...[...byId.keys()].filter((id) => !order.includes(id)).map((id) => byId.get(id)),
  ];
  return {
    ...previous,
    complete: fresh.complete && order.every((id) => settledIds.has(id)),
    finishedAt: fresh.finishedAt,
    cases,
    summary: summarize(cases),
    merged: [
      ...(previous.merged ?? []),
      {
        cases: fresh.cases.filter(isSettled).map((c) => c.id),
        commit: fresh.keel.commit,
        finishedAt: fresh.finishedAt,
      },
    ],
  };
}

/**
 * Runs a loaded campaign and returns the benchmark object.
 *
 * @param deps.campaign  from `loadCampaign` (with `resolved` cases).
 * @param deps.driver  an AgentDriver.
 * @param deps.mode  'scripted' | 'attended'.
 * @param deps.model  optional model the driver should pin; when
 *   absent the driver's own `defaultModel` (if it declares one) is
 *   what ran, and that is what the benchmark records — `null` when
 *   neither names one, never a guess.
 * @param deps.prepareWorkspace  async (caseSpec) → workspace path,
 *   scaffolded per the case with the git baseline pinned.
 * @param deps.diffStats  (workspace) → { filesChanged, … }.
 * @param deps.keel  { version, commit } recorded in the benchmark.
 * @param deps.now  () → epoch ms (injectable clock).
 * @param deps.log  (line) → void progress narration.
 * @param deps.io  passed through to attended drivers.
 * @param deps.checkpoint  optional (benchmark) → void, called with the
 *   benchmark so far after every run (`complete: false`), so a crash
 *   or a kill part-way loses one run and not the campaign — every
 *   run is a paid agent session.
 */
export async function runCampaign(deps) {
  const {
    campaign,
    driver,
    mode,
    model,
    prepareWorkspace,
    diffStats,
    keel,
    now,
    log,
    io,
    checkpoint,
  } = deps;
  if (!driver.modes.includes(mode)) {
    throw new Error(`driver '${driver.id}' does not support ${mode} mode`);
  }
  const probe = await driver.probe();
  if (!probe.available) {
    throw new Error(`driver '${driver.id}' unavailable: ${probe.detail ?? 'probe failed'}`);
  }
  const identity = driverIdentity(driver, mode, model, probe.version);
  log(
    `driver ${driver.id} (${probe.version}), mode ${mode}, model ${identity.model ?? (identity.capabilities.model === true ? 'agent default' : 'not pinned in this mode')}`,
  );

  const startedAt = now();
  const cases = [];
  // `complete` is the case's own: false on the entry a checkpoint
  // carries while its runs are still going, true from the last run's
  // checkpoint on, so a merge can tell a settled measurement from a
  // partial one wherever it sits — and a kill between that last
  // checkpoint and the campaign's next step loses nothing.
  const caseEntry = (caseSpec, results, contextAudit, complete) => ({
    id: caseSpec.id,
    tags: caseSpec.tags,
    complete,
    contextAudit,
    runs: results,
    aggregate: aggregateCase(results),
  });
  const benchmark = (done, inProgress) => {
    const all = inProgress ? [...cases, inProgress] : cases;
    return {
      schema: BENCHMARK_SCHEMA,
      complete: done,
      campaign: campaign.name,
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: done ? new Date(now()).toISOString() : null,
      keel,
      driver: identity,
      cases: all,
      summary: summarize(all),
    };
  };

  for (const caseSpec of campaign.resolved) {
    const runs = campaign.runs ?? caseSpec.runs;
    const results = [];
    let contextAudit = null;
    for (let i = 1; i <= runs; i += 1) {
      log(`${caseSpec.id}: run ${i}/${runs}`);
      // One retry: the scaffold runs real package managers and real
      // wrappers, and a transient failure there (a flaky registry
      // fetch, an npm internal error that does not recur) must not
      // cost a paid agent session, let alone the campaign. A second
      // failure is recorded and the campaign moves on — no agent ran,
      // so nothing was measured, and the aggregate says so.
      let workspace = null;
      let error = null;
      for (let attempt = 1; attempt <= 2 && workspace === null; attempt += 1) {
        try {
          workspace = await prepareWorkspace(caseSpec);
        } catch (err) {
          error = err instanceof Error ? err.message : String(err);
          log(
            `${caseSpec.id}: run ${i} workspace failed to prepare (attempt ${attempt}): ${error}`,
          );
        }
      }
      if (workspace === null) {
        results.push({
          run: i,
          workspace: null,
          prepared: false,
          error,
          completed: false,
          exitCode: null,
          timedOut: false,
          wallMs: null,
          diff: null,
          oracle: null,
          metrics: emptyMetrics(),
        });
        log(`${caseSpec.id}: run ${i} UNPREPARED — no agent ran`);
        checkpoint?.(benchmark(false, caseEntry(caseSpec, results, contextAudit, i === runs)));
        continue;
      }
      if (contextAudit === null) contextAudit = auditContext(workspace);
      const t0 = now();
      const outcome = await driver.run({ caseSpec, workspace, mode, io, model });
      const wallMs = now() - t0;
      const diff = diffStats(workspace);
      const oracle = judge(workspace, caseSpec);
      const metrics = driver.harvest(outcome);
      results.push({
        run: i,
        workspace,
        prepared: true,
        completed:
          outcome.timedOut !== true &&
          outcome.spawnError !== true &&
          (outcome.exitCode === 0 || (mode === 'attended' && outcome.exitCode === null)),
        exitCode: outcome.exitCode,
        timedOut: outcome.timedOut === true,
        wallMs,
        diff,
        oracle,
        metrics,
      });
      log(
        `${caseSpec.id}: run ${i} ${oracle.pass ? 'PASS' : `FAIL (${oracle.failures.join('; ')})`}`,
      );
      checkpoint?.(benchmark(false, caseEntry(caseSpec, results, contextAudit, i === runs)));
    }
    cases.push(caseEntry(caseSpec, results, contextAudit, true));
  }

  return benchmark(true, null);
}
