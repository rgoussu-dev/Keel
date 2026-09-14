/**
 * The terminal-bench rule, as a command: **every case ships a
 * reference solution, and the rig proves it**.
 *
 * A task case is a claim in two halves — the injected specification
 * fails on the scaffold as emitted, and the reference `solve.sh`
 * makes it pass — and both halves rot. A template change that moves
 * a wiring file breaks the second; a scaffold that starts shipping
 * the feature breaks the first, and an eval whose oracle is already
 * green measures nothing while looking perfectly healthy.
 *
 * No agent runs here, so this is not billed and not gated on
 * `KEEL_RUN_EVALS`. It does need the family's real toolchain: the
 * oracle is the project's own build.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { judge } from './oracle.mjs';

/** What one case's solvability check found. */
export const UNSOLVED = 'the oracle was already green before the reference solution ran';

/**
 * Proves one case solvable against a freshly prepared workspace.
 *
 * @param caseSpec  a loaded case (with `dir`).
 * @param workspace  a prepared workspace — scaffolded, grown, set up.
 * @returns `{ id, ok, failures }`.
 */
export function proveSolvable(caseSpec, workspace) {
  const failures = [];
  const solve = path.join(caseSpec.dir, 'solve.sh');
  if (!fs.existsSync(solve)) {
    return { id: caseSpec.id, ok: false, failures: [`no reference solution at ${solve}`] };
  }
  if (judge(workspace, caseSpec).pass) failures.push(UNSOLVED);

  const r = spawnSync('bash', [solve], {
    cwd: workspace,
    encoding: 'utf8',
    timeout: caseSpec.budgets.timeout_seconds * 1000,
    killSignal: 'SIGKILL',
  });
  if (r.status !== 0) {
    failures.push(`solve.sh exited ${r.status}: ${(r.stderr || r.stdout).trim().slice(-1200)}`);
    return { id: caseSpec.id, ok: false, failures };
  }

  const solved = judge(workspace, caseSpec);
  if (!solved.pass) failures.push(...solved.failures.map((f) => `after solve.sh: ${f}`));
  return { id: caseSpec.id, ok: failures.length === 0, failures };
}
