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
    const script = path.join(caseSpec.dir, oracle.script);
    const r = spawnSync('bash', [script], { cwd: workspace, encoding: 'utf8' });
    if (r.status !== 0) {
      failures.push(`oracle script exited ${r.status}: ${(r.stderr || r.stdout).trim()}`);
    }
  }

  return { pass: failures.length === 0, failures };
}
