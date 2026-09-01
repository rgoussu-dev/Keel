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
import { auditContext } from './context-audit.mjs';

/** The benchmark file's self-describing schema tag. */
export const BENCHMARK_SCHEMA = 'keel-evals/benchmark@1';

/**
 * Runs a loaded campaign and returns the benchmark object.
 *
 * @param deps.campaign  from `loadCampaign` (with `resolved` cases).
 * @param deps.driver  an AgentDriver.
 * @param deps.mode  'scripted' | 'attended'.
 * @param deps.prepareWorkspace  async (caseSpec) → workspace path,
 *   scaffolded per the case with the git baseline pinned.
 * @param deps.diffStats  (workspace) → { filesChanged, … }.
 * @param deps.keel  { version, commit } recorded in the benchmark.
 * @param deps.now  () → epoch ms (injectable clock).
 * @param deps.log  (line) → void progress narration.
 * @param deps.io  passed through to attended drivers.
 */
export async function runCampaign(deps) {
  const { campaign, driver, mode, prepareWorkspace, diffStats, keel, now, log, io } = deps;
  if (!driver.modes.includes(mode)) {
    throw new Error(`driver '${driver.id}' does not support ${mode} mode`);
  }
  const probe = await driver.probe();
  if (!probe.available) {
    throw new Error(`driver '${driver.id}' unavailable: ${probe.detail ?? 'probe failed'}`);
  }
  log(`driver ${driver.id} (${probe.version}), mode ${mode}`);

  const startedAt = now();
  const cases = [];
  for (const caseSpec of campaign.resolved) {
    const runs = campaign.runs ?? caseSpec.runs;
    const results = [];
    let contextAudit = null;
    for (let i = 1; i <= runs; i += 1) {
      log(`${caseSpec.id}: run ${i}/${runs}`);
      const workspace = await prepareWorkspace(caseSpec);
      if (contextAudit === null) contextAudit = auditContext(workspace);
      const t0 = now();
      const outcome = await driver.run({ caseSpec, workspace, mode, io });
      const wallMs = now() - t0;
      const diff = diffStats(workspace);
      const oracle = judge(workspace, caseSpec);
      const metrics = driver.harvest(outcome);
      results.push({
        run: i,
        workspace,
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
    }
    cases.push({
      id: caseSpec.id,
      tags: caseSpec.tags,
      contextAudit,
      runs: results,
      aggregate: aggregateCase(results),
    });
  }

  return {
    schema: BENCHMARK_SCHEMA,
    campaign: campaign.name,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date(now()).toISOString(),
    keel,
    driver: {
      id: driver.id,
      version: probe.version,
      mode,
      capabilities: driver.capabilities(mode),
    },
    cases,
    summary: {
      cases: cases.length,
      successRate:
        cases.length === 0
          ? null
          : Math.round(
              (cases.reduce((a, c) => a + c.aggregate.successRate, 0) / cases.length) * 1000,
            ) / 1000,
    },
  };
}
