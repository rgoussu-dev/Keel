/**
 * The oracle: judges the final workspace state — never agent output.
 * Exit-code semantics differ per agent (documented for two of eight),
 * so the workspace is the only floor every agent shares.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** Parses `key=value` lines; later duplicates win, blanks ignored. */
export function parseAnswers(text) {
  const answers = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    answers[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return answers;
}

/**
 * Judges one finished run. Returns `{ pass, failures }` — every
 * failed expectation listed, not just the first, so a red run reads
 * as a diagnosis.
 */
export function judge(workspace, caseSpec) {
  const failures = [];
  const oracle = caseSpec.oracle;

  if (oracle.answers !== undefined) {
    if (typeof oracle.answers_file !== 'string' || oracle.answers_file === '') {
      failures.push("oracle.answers requires 'answers_file' naming the file to judge");
    } else {
      const file = path.join(workspace, oracle.answers_file);
      if (!fs.existsSync(file)) {
        failures.push(`answers file '${oracle.answers_file}' was not written`);
      } else {
        const got = parseAnswers(fs.readFileSync(file, 'utf8'));
        for (const [key, expected] of Object.entries(oracle.answers)) {
          const actual = got[key];
          if (actual === undefined) failures.push(`answer '${key}' missing`);
          else if (actual !== expected)
            failures.push(`answer '${key}': expected '${expected}', got '${actual}'`);
        }
      }
    }
  }

  if (oracle.clean_worktree === true) {
    const status = spawnSync('git', ['status', '--porcelain'], {
      cwd: workspace,
      encoding: 'utf8',
    });
    if (status.status !== 0) {
      failures.push('clean_worktree needs a git repository with a pinned baseline');
    } else {
      const dirty = status.stdout
        .split('\n')
        .filter((l) => l.trim() !== '')
        .map((l) => l.slice(3));
      if (dirty.length > 0) failures.push(`worktree not clean: ${dirty.join(', ')}`);
    }
  }

  if (oracle.script !== undefined) {
    // A task oracle runs the project's real build, so it gets the
    // case's own wall-clock budget: a wedged Gradle daemon must cost
    // one case, never the campaign.
    const seconds = caseSpec.budgets?.timeout_seconds;
    const r = spawnSync('bash', [path.join(caseSpec.dir, oracle.script)], {
      cwd: workspace,
      encoding: 'utf8',
      ...(seconds === undefined ? {} : { timeout: seconds * 1000, killSignal: 'SIGKILL' }),
    });
    if (r.error?.code === 'ETIMEDOUT') {
      failures.push(`oracle script timed out after ${String(seconds)}s`);
    } else if (r.status !== 0) {
      failures.push(`oracle script exited ${r.status}: ${tail(r.stderr || r.stdout)}`);
    }
  }

  return { pass: failures.length === 0, failures };
}

/** The last few lines of a build log — enough to diagnose, short enough to read. */
function tail(output, lines = 12) {
  return (output ?? '').trim().split('\n').slice(-lines).join('\n');
}
