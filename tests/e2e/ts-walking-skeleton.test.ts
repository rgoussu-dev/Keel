/**
 * End-to-end test for the `ts-http` walking skeleton, `basic` layout.
 *
 * Dispatches `keel.new-project` against a real temp directory, then
 * verifies the generated workspace actually installs, typechecks, and
 * its tests pass — the HTTP contract tests boot the `node:http` unit
 * on an ephemeral port, so a green `npm test` proves the slice runs
 * end to end. There is no build step to exercise: Node runs the
 * sources directly.
 *
 * The modulith cells live in their own files, one per cell, so that
 * "every cell has a suite" is checkable from `ls`. The scaffolding
 * they share is in `tests/support/web-e2e.ts`.
 */

import path from 'node:path';
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
  cwd = await mkTempDir('keel-ts-e2e-');
});

afterEach(async () => {
  await fs.remove(cwd);
});

const basic = (pm: PackageManager): Promise<void> =>
  scaffold({ stack: 'ts-http', projectName: 'walking-skeleton-e2e', buildSystem: pm }, cwd);

describe.skipIf(skipWebE2E('npm'))('ts-http walking-skeleton e2e (npm)', () => {
  it(
    'generates a workspace that installs, typechecks, and tests green',
    async () => {
      await basic('npm');
      runStep(cwd, 'npm run typecheck', 'npm', ['run', 'typecheck']);
      runStep(cwd, 'npm test', 'npm', ['test']);
    },
    E2E_TIMEOUT_MS,
  );
});

describe.skipIf(skipWebE2E('pnpm'))('ts-http walking-skeleton e2e (pnpm)', () => {
  it(
    'generates a pnpm workspace that installs, typechecks, and tests green',
    async () => {
      await basic('pnpm');
      expect(await fs.pathExists(path.join(cwd, 'pnpm-workspace.yaml'))).toBe(true);
      runStep(cwd, 'pnpm run typecheck', 'pnpm', ['run', 'typecheck']);
      runStep(cwd, 'pnpm test', 'pnpm', ['test']);
    },
    E2E_TIMEOUT_MS,
  );
});
