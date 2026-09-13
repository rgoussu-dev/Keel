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
 * Folds a benchmark over a subset of cases (`--only`) into an earlier
 * benchmark of the same campaign, driver and model: the re-run cases
 * replace their earlier entries, every other case is kept, and the
 * result is ordered as the campaign lists them. The file records
 * that it is a merge — which cases, at which keel commit — so a
 * baseline finished in two sittings says so rather than passing for
 * one. Refuses to fold across campaigns or drivers — the driver's
 * id, version, mode and model all have to agree, an agent upgraded
 * between sittings included: those are different measurements, not
 * a re-run.
 */
export function mergeBenchmark(previous, fresh, order) {
  if (previous.campaign !== fresh.campaign) {
    throw new Error(`cannot merge campaign '${fresh.campaign}' into '${previous.campaign}'`);
  }
  for (const key of ['id', 'version', 'mode', 'model']) {
    if (previous.driver[key] !== fresh.driver[key]) {
      throw new Error(
        `cannot merge: driver ${key} '${fresh.driver[key]}' differs from '${previous.driver[key]}'`,
      );
    }
  }
  const byId = new Map(previous.cases.map((c) => [c.id, c]));
  for (const c of fresh.cases) byId.set(c.id, c);
  const cases = [
    ...order.filter((id) => byId.has(id)).map((id) => byId.get(id)),
    ...[...byId.keys()].filter((id) => !order.includes(id)).map((id) => byId.get(id)),
  ];
  return {
    ...previous,
    complete: fresh.complete,
    finishedAt: fresh.finishedAt,
    cases,
    summary: summarize(cases),
    merged: [
      ...(previous.merged ?? []),
      {
        cases: fresh.cases.map((c) => c.id),
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
  const effectiveModel = model ?? driver.defaultModel ?? null;
  log(
    `driver ${driver.id} (${probe.version}), mode ${mode}, model ${effectiveModel ?? 'agent default'}`,
  );

  const startedAt = now();
  const cases = [];
  const caseEntry = (caseSpec, results, contextAudit) => ({
    id: caseSpec.id,
    tags: caseSpec.tags,
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
      driver: {
        id: driver.id,
        version: probe.version,
        mode,
        model: effectiveModel,
        capabilities: driver.capabilities(mode),
      },
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
        checkpoint?.(benchmark(false, caseEntry(caseSpec, results, contextAudit)));
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
      checkpoint?.(benchmark(false, caseEntry(caseSpec, results, contextAudit)));
    }
    cases.push(caseEntry(caseSpec, results, contextAudit));
  }

  return benchmark(true, null);
}
