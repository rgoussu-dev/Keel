/**
 * End-to-end test for the `ts-cli` walking skeleton, `basic` layout —
 * the CLI twin of `ts-walking-skeleton.test.ts`.
 *
 * Dispatches `keel.new-project` against a real temp directory, then
 * verifies the generated workspace actually installs, typechecks,
 * tests green, and **runs**: the emitted assembly is executed with
 * real flags, so the greeting on stdout and the exit codes (0 for a
 * greeting, 2 for a domain rejection) prove the slice end to end.
 * There is no build step to exercise: Node runs the sources directly.
 *
 * The modulith cells live in their own files, one per cell, so that
 * "every cell has a suite" is checkable from `ls`. The scaffolding
 * they share is in `tests/support/web-e2e.ts`.
 */

import path from 'node:path';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  E2E_TIMEOUT_MS,
  mkTempDir,
  runStep,
  scaffold,
  skipWebE2E,
  type PackageManager,
} from '../support/web-e2e.js';

let cwd: string;

beforeEach(async () => {
  cwd = await mkTempDir('keel-ts-cli-e2e-');
});

afterEach(async () => {
  await fs.remove(cwd);
});

const basic = (pm: PackageManager): Promise<void> =>
  scaffold({ stack: 'ts-cli', projectName: 'walking-skeleton-e2e', buildSystem: pm }, cwd);

const runCli = (args: readonly string[]): SpawnSyncReturns<string> =>
  spawnSync('node', ['application/cli/src/main.ts', ...args], { cwd, encoding: 'utf8' });

const provesTheSliceRuns = (): void => {
  const greeted = runCli(['--name', 'E2E']);
  expect(greeted.status).toBe(0);
  expect(greeted.stdout).toBe('Hello, E2E!\n');

  const rejected = runCli(['--name', '  ']);
  expect(rejected.status).toBe(2);
  expect(rejected.stderr).toContain('name must not be blank');
};

describe.skipIf(skipWebE2E('npm'))('ts-cli walking-skeleton e2e (npm)', () => {
  it(
    'generates a workspace that installs, typechecks, tests, and runs',
    async () => {
      await basic('npm');
      runStep(cwd, 'npm run typecheck', 'npm', ['run', 'typecheck']);
      runStep(cwd, 'npm test', 'npm', ['test']);
      provesTheSliceRuns();
    },
    E2E_TIMEOUT_MS,
  );
});

describe.skipIf(skipWebE2E('pnpm'))('ts-cli walking-skeleton e2e (pnpm)', () => {
  it(
    'generates a pnpm workspace that installs, typechecks, tests, and runs',
    async () => {
      await basic('pnpm');
      expect(await fs.pathExists(path.join(cwd, 'pnpm-workspace.yaml'))).toBe(true);
      runStep(cwd, 'pnpm run typecheck', 'pnpm', ['run', 'typecheck']);
      runStep(cwd, 'pnpm test', 'pnpm', ['test']);
      provesTheSliceRuns();
    },
    E2E_TIMEOUT_MS,
  );
});
