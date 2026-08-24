/**
 * Codex CLI driver — the second driver that makes the port real
 * (walking-skeleton rule: one driver = the seam is fiction), scripted
 * mode only. Picked over Gemini/opencode per the verified capability
 * matrix on #130: full JSONL event stream with per-item tool
 * visibility and token usage, strong config isolation, OS-level
 * sandbox — and Codex is the AGENTS.md originator, strategically the
 * most important non-Claude consumer of the emitted harness.
 *
 * Concept mapping: `codex exec --json` is headless with structured
 * JSONL on stdout; autonomy/containment is `--sandbox
 * workspace-write` (writes stay in the workspace — which also pins
 * probe answers inside it); config isolation is
 * `--ignore-user-config`, or a private `CODEX_HOME` when the operator
 * exports `KEEL_EVALS_CODEX_HOME` (note the project-layer
 * `.codex/config.toml` still loads either way — that layer is part of
 * what an emitted harness may legitimately carry). Codex enforces no
 * turn budget of its own; the rig's wall-clock kill is the cap, and
 * `max_turns` goes unmapped — declared in the manifest, not silently.
 */

import { agentEnv } from '../lib/env.mjs';
import { emptyMetrics, isSearchCommand, probeBinary, spawnScripted } from './driver.mjs';

/** Flags for one scripted invocation; exported for the verify suite. */
export function scriptedArgs(caseSpec) {
  return [
    'exec',
    '--json',
    '--sandbox',
    'workspace-write',
    '--skip-git-repo-check',
    '--ignore-user-config',
    caseSpec.prompt,
  ];
}

/** Parses `codex exec --json` JSONL stdout into metrics. */
export function harvestExecJson(stdout) {
  const metrics = emptyMetrics();
  const toolCalls = {};
  let bashSearches = 0;
  let turns = 0;
  let tokensIn = 0;
  let tokensOut = 0;
  let cacheRead = 0;
  let sawUsage = false;
  for (const line of stdout.split('\n')) {
    if (!line.trim().startsWith('{')) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type === 'item.completed' && event.item) {
      const kind = typeof event.item.type === 'string' ? event.item.type : 'unknown';
      if (kind === 'agent_message' || kind === 'reasoning') continue;
      toolCalls[kind] = (toolCalls[kind] ?? 0) + 1;
      if (kind === 'command_execution' && isSearchCommand(event.item.command)) bashSearches += 1;
    }
    if (event.type === 'turn.completed') {
      turns += 1;
      const usage = event.usage ?? {};
      sawUsage = true;
      tokensIn += usage.input_tokens ?? 0;
      tokensOut += usage.output_tokens ?? 0;
      cacheRead += usage.cached_input_tokens ?? 0;
    }
  }
  if (turns > 0) metrics.turns = turns;
  if (sawUsage) {
    metrics.tokensIn = tokensIn;
    metrics.tokensOut = tokensOut;
    metrics.cacheRead = cacheRead;
  }
  metrics.toolCalls = toolCalls;
  metrics.bashSearches = bashSearches;
  return metrics;
}

export const codexDriver = {
  id: 'codex',
  modes: ['scripted'],

  capabilities(mode) {
    if (mode !== 'scripted') throw new Error('codex driver: scripted mode only');
    return {
      structuredOutput: true,
      tokens: true,
      cost: false,
      turns: true,
      toolCalls: true,
      transcript: false,
    };
  },

  probe() {
    return probeBinary('codex');
  },

  async run({ caseSpec, workspace, mode }) {
    if (mode !== 'scripted') throw new Error('codex driver: scripted mode only');
    const overrides =
      process.env['KEEL_EVALS_CODEX_HOME'] !== undefined
        ? { CODEX_HOME: process.env['KEEL_EVALS_CODEX_HOME'] }
        : {};
    const r = await spawnScripted({
      command: 'codex',
      args: scriptedArgs(caseSpec),
      cwd: workspace,
      env: agentEnv(process.env, overrides),
      timeoutMs: caseSpec.budgets.timeout_seconds * 1000,
    });
    return { mode, exitCode: r.exitCode, timedOut: r.timedOut, stdout: r.stdout, stderr: r.stderr };
  },

  harvest(outcome) {
    return harvestExecJson(outcome.stdout);
  },
};
