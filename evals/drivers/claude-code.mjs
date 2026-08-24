/**
 * Claude Code driver — the reference AgentDriver, both drive modes.
 *
 * Scripted: `claude -p --output-format stream-json` headlessly.
 * Config isolation is `--setting-sources project` — the operator's
 * home-dir settings, skills and MCP servers stay out of the run;
 * `--bare` is never passed (it would also drop the project layer the
 * harness under measurement lives in). Autonomy is
 * `--permission-mode bypassPermissions`; budgets map to `--max-turns`
 * plus the rig's own wall-clock kill.
 *
 * Attended: the rig prepares the workspace and prints the prompt for
 * the operator to paste into a normal interactive session (their
 * subscription, their login); on the operator's keypress the runner
 * judges the workspace, and `harvest` reads the session transcript
 * Claude Code leaves at `~/.claude/projects/<cwd-slug>/<session>.jsonl`.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { agentEnv } from '../lib/env.mjs';
import { emptyMetrics, isSearchCommand, probeBinary, spawnScripted } from './driver.mjs';

/** Flags for one scripted invocation; exported for the verify suite. */
export function scriptedArgs(caseSpec) {
  return [
    '-p',
    caseSpec.prompt,
    '--output-format',
    'stream-json',
    '--verbose',
    '--setting-sources',
    'project',
    '--permission-mode',
    'bypassPermissions',
    ...(caseSpec.budgets.max_turns !== undefined
      ? ['--max-turns', String(caseSpec.budgets.max_turns)]
      : []),
  ];
}

/** How Claude Code slugs a cwd into its per-project transcript dir. */
export function projectSlug(workspace) {
  return workspace.replace(/[^a-zA-Z0-9]/g, '-');
}

/**
 * The session transcript for an attended run: the most recently
 * modified `*.jsonl` under the workspace's project dir whose mtime
 * falls inside the run window.
 */
export function findSessionTranscript(
  workspace,
  startedAtMs,
  claudeHome = path.join(os.homedir(), '.claude'),
) {
  const dir = path.join(claudeHome, 'projects', projectSlug(workspace));
  if (!fs.existsSync(dir)) return null;
  const candidates = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => ({ file: path.join(dir, f), mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .filter((c) => c.mtime >= startedAtMs)
    .sort((a, b) => b.mtime - a.mtime);
  return candidates[0]?.file ?? null;
}

/** Shared over both modes: census one message's tool_use blocks. */
function censusContent(content, tally) {
  if (!Array.isArray(content)) return;
  for (const block of content) {
    if (block?.type !== 'tool_use') continue;
    const name = typeof block.name === 'string' ? block.name : 'unknown';
    tally.toolCalls[name] = (tally.toolCalls[name] ?? 0) + 1;
    if (name === 'Bash' && isSearchCommand(block.input?.command)) tally.bashSearches += 1;
  }
}

/** Parses `--output-format stream-json` stdout into metrics. */
export function harvestStreamJson(stdout) {
  const metrics = emptyMetrics();
  const tally = { toolCalls: {}, bashSearches: 0 };
  for (const line of stdout.split('\n')) {
    if (!line.trim().startsWith('{')) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type === 'assistant') censusContent(event.message?.content, tally);
    if (event.type === 'result') {
      metrics.turns = event.num_turns ?? null;
      metrics.costUsd = event.total_cost_usd ?? null;
      const usage = event.usage ?? {};
      metrics.tokensIn = usage.input_tokens ?? null;
      metrics.tokensOut = usage.output_tokens ?? null;
      metrics.cacheRead = usage.cache_read_input_tokens ?? null;
      metrics.cacheWrite = usage.cache_creation_input_tokens ?? null;
    }
  }
  metrics.toolCalls = tally.toolCalls;
  metrics.bashSearches = tally.bashSearches;
  return metrics;
}

/**
 * Parses a session transcript (attended mode). Turns are the count of
 * assistant entries — an approximation, declared as such; cost stays
 * null: the client-side estimate is notional on subscription auth and
 * the transcript does not carry a trustworthy figure.
 */
export function harvestSessionTranscript(jsonl) {
  const metrics = emptyMetrics();
  const tally = { toolCalls: {}, bashSearches: 0 };
  let turns = 0;
  let tokensIn = 0;
  let tokensOut = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  let sawUsage = false;
  for (const line of jsonl.split('\n')) {
    if (!line.trim().startsWith('{')) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.type !== 'assistant') continue;
    turns += 1;
    censusContent(entry.message?.content, tally);
    const usage = entry.message?.usage;
    if (usage) {
      sawUsage = true;
      tokensIn += usage.input_tokens ?? 0;
      tokensOut += usage.output_tokens ?? 0;
      cacheRead += usage.cache_read_input_tokens ?? 0;
      cacheWrite += usage.cache_creation_input_tokens ?? 0;
    }
  }
  metrics.turns = turns;
  if (sawUsage) {
    metrics.tokensIn = tokensIn;
    metrics.tokensOut = tokensOut;
    metrics.cacheRead = cacheRead;
    metrics.cacheWrite = cacheWrite;
  }
  metrics.toolCalls = tally.toolCalls;
  metrics.bashSearches = tally.bashSearches;
  return metrics;
}

export const claudeCodeDriver = {
  id: 'claude-code',
  modes: ['scripted', 'attended'],

  capabilities(mode) {
    return mode === 'scripted'
      ? {
          structuredOutput: true,
          tokens: true,
          cost: true,
          turns: true,
          toolCalls: true,
          transcript: true,
        }
      : {
          structuredOutput: false,
          tokens: true,
          cost: false,
          turns: true,
          toolCalls: true,
          transcript: true,
        };
  },

  probe() {
    return probeBinary('claude');
  },

  async run({ caseSpec, workspace, mode, io }) {
    if (mode === 'scripted') {
      const r = await spawnScripted({
        command: 'claude',
        args: scriptedArgs(caseSpec),
        cwd: workspace,
        env: agentEnv(),
        timeoutMs: caseSpec.budgets.timeout_seconds * 1000,
      });
      return {
        mode,
        exitCode: r.exitCode,
        timedOut: r.timedOut,
        stdout: r.stdout,
        stderr: r.stderr,
      };
    }
    const startedAtMs = Date.now();
    io.print('');
    io.print(`── attended run: ${caseSpec.id} ──`);
    io.print(`Workspace: ${workspace}`);
    io.print(
      'Open a normal interactive Claude Code session IN THAT DIRECTORY and paste the prompt below.',
    );
    io.print('');
    io.print(caseSpec.prompt);
    io.print('');
    await io.waitForOperator('When the agent is done, press Enter to judge the workspace… ');
    const transcript = findSessionTranscript(workspace, startedAtMs);
    return { mode, exitCode: null, timedOut: false, stdout: '', stderr: '', transcript };
  },

  harvest(outcome) {
    if (outcome.mode === 'scripted') return harvestStreamJson(outcome.stdout);
    if (outcome.transcript === null || outcome.transcript === undefined) return emptyMetrics();
    return harvestSessionTranscript(fs.readFileSync(outcome.transcript, 'utf8'));
  },
};
