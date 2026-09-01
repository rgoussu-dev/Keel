/**
 * The canonical fake AgentDriver — the port's test double, side by
 * side with the real adapters per the repo convention. The verify
 * suites drive the whole runner through it: no agent binary, no
 * network, no billing.
 *
 * Behavior is injected per instance: `solve` is called with the
 * workspace and case before the outcome is returned, so a test can
 * make the fake "act" (write the answers file, touch a tracked file)
 * and watch the oracle judge the result — the same seam a real agent
 * occupies.
 */

import { emptyMetrics } from './driver.mjs';

/**
 * Builds a fake driver.
 *
 * @param options.solve  async (workspace, caseSpec, mode) — the
 *   fake's "agent work" on the workspace; defaults to doing nothing.
 * @param options.metrics  what `harvest` reports; merged over the
 *   all-null shape.
 * @param options.exitCode  scripted exit code (default 0; an explicit
 *   null models a signal-killed agent, as Node reports it).
 * @param options.timedOut  report the run as killed at the budget.
 * @param options.spawnError  report the agent as failed to spawn
 *   (forces `exitCode: null`, matching `spawnScripted`'s shape).
 * @param options.available  what `probe` reports (default true).
 */
export function fakeDriver(options = {}) {
  const calls = { probe: 0, runs: [] };
  return {
    id: options.id ?? 'fake',
    modes: ['scripted', 'attended'],
    calls,

    capabilities() {
      return {
        structuredOutput: false,
        tokens: options.metrics?.tokensIn !== undefined,
        cost: options.metrics?.costUsd !== undefined,
        turns: options.metrics?.turns !== undefined,
        toolCalls: options.metrics?.toolCalls !== undefined,
        transcript: false,
      };
    },

    async probe() {
      calls.probe += 1;
      return options.available === false
        ? { available: false, version: null, detail: 'fake agent not installed' }
        : { available: true, version: 'fake 1.0.0' };
    },

    async run({ caseSpec, workspace, mode }) {
      calls.runs.push({ id: caseSpec.id, workspace, mode });
      if (options.solve) await options.solve(workspace, caseSpec, mode);
      return {
        mode,
        exitCode:
          options.spawnError === true
            ? null
            : options.exitCode !== undefined
              ? options.exitCode
              : 0,
        spawnError: options.spawnError ?? false,
        timedOut: options.timedOut ?? false,
        stdout: '',
        stderr: '',
      };
    },

    harvest() {
      return { ...emptyMetrics(), ...options.metrics };
    },
  };
}
