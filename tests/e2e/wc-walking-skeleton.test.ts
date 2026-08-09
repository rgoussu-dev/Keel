/**
 * End-to-end test for the `walking-skeleton` vertical's frontend
 * realization.
 *
 * Dispatches `keel.new-project` against a real temp directory with
 * the `web-components` stack, then verifies the generated workspace
 * actually installs, typechecks, its tests pass, and `vite build`
 * produces the deployable static bundle.
 *
 * As in the Quarkus e2e, the only CI-shaped side effect
 * (`vcs/git-init`) is replaced with a no-op; the
 * `walking-skeleton/npm-install` action runs for real, since the
 * installed node_modules is the entrypoint to the
 * typecheck/test/build we want to exercise.
 *
 * Cost: `npm install` downloads TypeScript, Vite and Vitest from the
 * registry (network required; ~1 minute cold). Skip rules mirror the
 * Quarkus e2e:
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

const runStep = (cwd: string, step: string, args: readonly string[]): void => {
  const r = spawnSync('npm', [...args], { cwd, encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(
      `${step} failed (exit ${r.status})\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`,
    );
  }
};

const optedIn = process.env.KEEL_RUN_E2E === '1';
const optedOut = process.env.KEEL_SKIP_E2E === '1';
const onCI = process.env.CI === 'true';
const skipE2E = optedOut || !onPath('npm') || (onCI && !optedIn);

let cwd: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-wc-e2e-'));
});

afterEach(async () => {
  await fs.remove(cwd);
});

describe.skipIf(skipE2E)('web-components walking-skeleton e2e', () => {
  it(
    'generates a workspace that installs, typechecks, tests green, and builds',
    async () => {
      const mediator = installMediator({
        keelVersion: '0.0.0-e2e',
        runDeferred: stubActions(new Set(['vcs/git-init'])),
      });
      expectOk(
        await mediator.dispatch(
          newProjectCommand({
            cwd,
            stack: 'web-components',
            answers: {
              'walking-skeleton/wc-spa-bootstrap': {
                npmScope: 'acme',
                projectName: 'walking-skeleton-e2e',
              },
              'vcs/git-init': { remote: '', defaultBranch: 'main' },
            },
            interactive: false,
            dryRun: false,
          }),
        ),
      );

      // Sanity check: the install action ran (node_modules present),
      // git was stubbed out.
      expect(await fs.pathExists(path.join(cwd, 'node_modules'))).toBe(true);
      expect(await fs.pathExists(path.join(cwd, '.git'))).toBe(false);

      runStep(cwd, 'npm run typecheck', ['run', 'typecheck']);
      runStep(cwd, 'npm test', ['test']);
      runStep(cwd, 'npm run build', ['run', 'build']);

      const bundle = path.join(cwd, 'application', 'web-app', 'dist', 'index.html');
      expect(await fs.pathExists(bundle)).toBe(true);
      const html = await fs.readFile(bundle, 'utf8');
      expect(html).toContain('<acme-greeting>');
    },
    E2E_TIMEOUT_MS,
  );
});
