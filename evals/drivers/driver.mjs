/**
 * The AgentDriver port — the rig's one seam onto a coding agent.
 *
 * A driver is a plain object:
 *
 *   {
 *     id: 'claude-code',
 *     modes: ['scripted', 'attended'],
 *     capabilities(mode) → CapabilityManifest,
 *     async probe() → { available, version, detail? },
 *     async run({ caseSpec, workspace, mode, io }) → RunOutcome,
 *     harvest(outcome) → Metrics,
 *   }
 *
 * `run` maps case concepts to the agent's own CLI: autonomy, config
 * isolation (the operator's home-dir settings, skills and MCP servers
 * must not load), prompt delivery, budgets. `harvest` turns whatever
 * the agent left behind (stdout stream, session transcript on disk)
 * into the normalized metrics; every field a manifest declares false
 * is `null` in the harvest, never a guess.
 *
 * The universal floor — oracle verdict, wall time, git diff — is
 * measured by the runner from the workspace, agent-independent, and
 * is deliberately NOT part of this port: a driver that reported its
 * own success could disagree with the oracle, and the oracle wins.
 */

import { spawn } from 'node:child_process';

/**
 * What a driver can measure in a given mode. `null` metric fields in
 * a harvest must line up with `false` here — the verify suites hold
 * drivers to their manifests.
 */
export const CAPABILITY_FIELDS = Object.freeze([
  'structuredOutput',
  'tokens',
  'cost',
  'turns',
  'toolCalls',
  'transcript',
]);

/** The normalized, all-nullable driver-extracted metrics shape. */
export function emptyMetrics() {
  return {
    tokensIn: null,
    tokensOut: null,
    cacheRead: null,
    cacheWrite: null,
    costUsd: null,
    turns: null,
    toolCalls: null,
    bashSearches: null,
  };
}

/**
 * Commands embedded in a Bash/exec tool call that are really
 * searches — the "bash-embedded searches" census the navigation lane
 * cares about: an agent that greps its way around the tree instead of
 * reading the map shows up here.
 */
const SEARCH_COMMAND = /(?:^|[\s|;&(])(?:grep|rg|ag|ack|find|fd)(?:$|\s)/;

/** Whether one shell command string embeds a search. */
export function isSearchCommand(command) {
  return typeof command === 'string' && SEARCH_COMMAND.test(command);
}

/**
 * Spawns the agent process for a scripted run: captures stdout/stderr
 * to `stdoutFile`/collected strings, kills the whole process group at
 * `timeoutMs`, never throws on non-zero exit — a crashed agent is a
 * measurement, not a rig failure.
 */
export function spawnScripted({ command, args, cwd, env, timeoutMs, stdin }) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ exitCode: null, stdout, stderr: `${stderr}${err.message}`, timedOut });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code, stdout, stderr, timedOut });
    });
    if (stdin !== undefined) child.stdin.write(stdin);
    child.stdin.end();
  });
}

/** `probe()` helper: runs `<binary> --version`, 10s cap. */
export async function probeBinary(binary) {
  const r = await spawnScripted({
    command: binary,
    args: ['--version'],
    cwd: process.cwd(),
    env: process.env,
    timeoutMs: 10_000,
  });
  if (r.exitCode !== 0) {
    return {
      available: false,
      version: null,
      detail: r.stderr.trim() || `\`${binary} --version\` exited ${r.exitCode}`,
    };
  }
  return { available: true, version: r.stdout.trim() || r.stderr.trim() };
}
