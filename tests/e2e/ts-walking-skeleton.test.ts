/**
 * End-to-end test for the `walking-skeleton` vertical's TypeScript
 * backend realization.
 *
 * Dispatches `keel.new-project` against a real temp directory with
 * the `ts-http` stack, then verifies the generated workspace
 * actually installs, typechecks, and its tests pass — the HTTP
 * contract tests boot the `node:http` unit on an ephemeral port, so
 * a green `npm test` proves the slice runs end to end. There is no
 * build step to exercise: Node runs the sources directly.
 *
 * As in the other e2e tests, the only CI-shaped side effect
 * (`vcs/git-init`) is replaced with a no-op; the
 * `walking-skeleton/npm-install` action runs for real. Skip rules
 * mirror the Quarkus e2e:
 *   - skipped automatically when `npm` is missing from PATH;
 *   - skipped on CI by default; opt in with `KEEL_RUN_E2E=1`;
 *   - opt out locally with `KEEL_SKIP_E2E=1`.
 */

import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runActions, type RunActionsInputs } from '../../src/domain/core/actions.js';
import { newProjectCommand } from '../../src/domain/contract/commands.js';
import type { DeferredAction } from '../../src/domain/contract/composition.js';
import { expectOk, installMediator } from '../support/factory.js';

const E2E_TIMEOUT_MS = 10 * 60 * 1000;

const stubActions =
  (stubbed: ReadonlySet<string>) =>
  (inputs: RunActionsInputs): Promise<void> => {
    const rewritten = inputs.actions.map((a): DeferredAction => {
      if (!stubbed.has(a.id)) return a;
      return {
        id: a.id,
        description: `${a.description} [faked: no-op]`,
        run: () => Promise.resolve(),
      };
    });
    return runActions({ ...inputs, actions: rewritten });
  };

const onPath = (cmd: string): boolean => {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  return spawnSync(probe, [cmd], { stdio: 'ignore' }).status === 0;
};

const runStep = (cwd: string, step: string, cmd: string, args: readonly string[]): void => {
  const r = spawnSync(cmd, [...args], { cwd, encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(
      `${step} failed (exit ${r.status})\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`,
    );
  }
};

const optedIn = process.env.KEEL_RUN_E2E === '1';
const optedOut = process.env.KEEL_SKIP_E2E === '1';
const onCI = process.env.CI === 'true';

let cwd: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-ts-e2e-'));
});

afterEach(async () => {
  await fs.remove(cwd);
});

const scaffold = async (buildSystem: 'npm' | 'pnpm'): Promise<void> => {
  const mediator = installMediator({
    keelVersion: '0.0.0-e2e',
    runDeferred: stubActions(new Set(['vcs/git-init'])),
  });
  expectOk(
    await mediator.dispatch(
      newProjectCommand({
        cwd,
        stack: 'ts-http',
        answers: {
          'walking-skeleton/ts-http-bootstrap': {
            npmScope: 'acme',
            projectName: 'walking-skeleton-e2e',
          },
          'vcs/git-init': { remote: '', defaultBranch: 'main' },
        },
        interactive: false,
        dryRun: false,
        buildSystem,
      }),
    ),
  );
  expect(await fs.pathExists(path.join(cwd, 'node_modules'))).toBe(true);
  expect(await fs.pathExists(path.join(cwd, '.git'))).toBe(false);
};

describe.skipIf(optedOut || !onPath('npm') || (onCI && !optedIn))(
  'ts-http walking-skeleton e2e (npm)',
  () => {
    it(
      'generates a workspace that installs, typechecks, and tests green',
      async () => {
        await scaffold('npm');
        runStep(cwd, 'npm run typecheck', 'npm', ['run', 'typecheck']);
        runStep(cwd, 'npm test', 'npm', ['test']);
      },
      E2E_TIMEOUT_MS,
    );
  },
);

describe.skipIf(optedOut || !onPath('pnpm') || (onCI && !optedIn))(
  'ts-http walking-skeleton e2e (pnpm)',
  () => {
    it(
      'generates a pnpm workspace that installs, typechecks, and tests green',
      async () => {
        await scaffold('pnpm');
        expect(await fs.pathExists(path.join(cwd, 'pnpm-workspace.yaml'))).toBe(true);
        runStep(cwd, 'pnpm run typecheck', 'pnpm', ['run', 'typecheck']);
        runStep(cwd, 'pnpm test', 'pnpm', ['test']);
      },
      E2E_TIMEOUT_MS,
    );
  },
);
