/**
 * The mediator every e2e suite scaffolds through, holding each suite
 * to the cells it claims (roadmap T.2c, DT10's dynamic half).
 *
 * `support-tier.json` says which suite builds which dial cell, and
 * `support-tier.test.ts` holds that to `tests/e2e/` and the shard
 * matrix in `verify`. Neither can read what a suite actually
 * dispatches: 15 of the 138 scaffolds T.2b counted take a dial from a helper's
 * default. So {@link e2eMediator} is {@link installMediator} with one
 * check in front of `keel.new-project`: it settles the target through
 * `keel.dials` and asserts the settled cell is one the running file
 * claims ({@link claimsOf}) — a row's cell for a proving suite, which
 * scaffolds it with no extras, or a cell its role seeds. And when the
 * file ends, every cell it claims was scaffolded by a test that ran.
 *
 * **The hooks are this module's.** Importing it registers one
 * `beforeAll` and one `afterAll` on the importing test file, so no
 * suite calls anything for them: the first names the running file,
 * the second checks it scaffolded what it claims (D1). Under vitest's
 * default per-file isolation a module is evaluated once per test file,
 * so the record is the file's; `support-tier.test.ts` holds the config
 * to that. A file every test of which skips runs neither hook, and in
 * one where any test skipped the completeness check is skipped whole,
 * since which cells the skipped test would have reached is not known —
 * G2 is what keeps a proving suite's shard from skipping it. A failed
 * test is not excused: it ran.
 *
 * `tests/support-tier.test.ts` (D0) holds that no e2e suite or helper
 * calls `installMediator(` itself.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, expect } from 'vitest';
import type { NewProjectCommand, NewProjectTarget } from '../../src/domain/contract/commands.js';
import { dialsQuery } from '../../src/domain/contract/queries.js';
import type { InstallDeps } from '../../src/domain/core/handlers/deps.js';
import type { Action } from '../../src/domain/kernel/action.js';
import type { Mediator } from '../../src/domain/kernel/mediator.js';
import { cellLine, claimsOf, commandTarget, namesExtras } from './e2e-claims.js';
import { expectOk, installMediator } from './factory.js';

const e2eDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'e2e');

let running: string | null = null;
const scaffolded = new Set<string>();

function suiteOf(file: string | null): string | null {
  if (file === null || path.dirname(file) !== e2eDir || !file.endsWith('.test.ts')) return null;
  return path.basename(file, '.test.ts');
}

interface TaskLike {
  readonly mode?: string;
  readonly result?: { readonly state?: string };
  readonly tasks?: readonly TaskLike[];
}

function skippedAny(task: TaskLike): boolean {
  if (task.tasks !== undefined) return task.tasks.some(skippedAny);
  return task.mode === 'skip' || task.mode === 'todo' || task.result?.state === 'skip';
}

beforeAll((file) => {
  running = (file as { readonly filepath?: string }).filepath ?? null;
});

afterAll((file) => {
  const suite = suiteOf(running);
  if (suite === null || skippedAny(file as TaskLike)) return;
  const missing = [...claimsOf(suite).cells].filter((cell) => !scaffolded.has(cell)).sort();
  expect(missing, `${suite} claims cells it never scaffolded: ${missing.join('; ')}`).toEqual([]);
});

async function check(mediator: Mediator, command: NewProjectCommand): Promise<void> {
  const suite = suiteOf(running);
  if (suite === null)
    throw new Error(`e2eMediator scaffolds for a tests/e2e suite, not ${running}`);
  const settled = expectOk(await mediator.dispatch(dialsQuery({ target: commandTarget(command) })))
    .target as NewProjectTarget;
  const cell = cellLine(settled);
  const claims = claimsOf(suite);
  expect(
    [...claims.cells],
    `${suite} scaffolds '${cell}', which it claims neither as a row of support-tier.json nor as a seed of its role in e2e-roles.ts`,
  ).toContain(cell);
  if (claims.kind === 'proves') {
    expect(
      namesExtras(settled),
      `${suite} proves '${cell}', so it scaffolds it with no extras`,
    ).toBe(false);
  }
  scaffolded.add(cell);
}

/**
 * {@link installMediator} over `overrides`, checking each
 * `keel.new-project` it dispatches against the cells the running e2e
 * suite claims, before it scaffolds. Every other action passes through
 * untouched.
 */
export function e2eMediator(overrides: Partial<InstallDeps> = {}): Mediator {
  const mediator = installMediator(overrides);
  return {
    async dispatch(action) {
      if ((action as Action).kind === 'keel.new-project') {
        await check(mediator, action as unknown as NewProjectCommand);
      }
      return mediator.dispatch(action);
    },
  };
}
