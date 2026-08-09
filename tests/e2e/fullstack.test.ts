/**
 * End-to-end test for the `fullstack` composite stack (monorepo
 * layout).
 *
 * Dispatches `keel.new-project` against a real temp directory, then
 * verifies the frontend service — whose greet slice the gateway
 * adapter rewired to call the backend — actually installs,
 * typechecks, tests green (domain slice through the fake gateway,
 * design system under happy-dom, gateway fake contract), and
 * produces the deployable bundle.
 *
 * The backend's own build is exercised by the Quarkus e2e suites;
 * here `vcs/git-init` and `walking-skeleton/gradle-wrapper` are
 * no-op'd so this test costs one `npm install`, not a Gradle
 * distribution download. Skip rules mirror the other npm e2e:
 * skipped without `npm` on PATH, skipped on CI unless
 * `KEEL_RUN_E2E=1`, opt out locally with `KEEL_SKIP_E2E=1`.
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
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-fullstack-e2e-'));
});

afterEach(async () => {
  await fs.remove(cwd);
});

describe.skipIf(skipE2E)('fullstack e2e (monorepo)', () => {
  it(
    'scaffolds a product whose gateway-wired frontend installs, typechecks, tests green, and builds',
    async () => {
      const mediator = installMediator({
        keelVersion: '0.0.0-e2e',
        runDeferred: stubActions(new Set(['vcs/git-init', 'walking-skeleton/gradle-wrapper'])),
      });
      expectOk(
        await mediator.dispatch(
          newProjectCommand({
            cwd,
            stack: 'fullstack',
            answers: {},
            interactive: false,
            dryRun: false,
          }),
        ),
      );

      const frontend = path.join(cwd, 'frontend');
      expect(await fs.pathExists(path.join(frontend, 'node_modules'))).toBe(true);
      expect(await fs.pathExists(path.join(cwd, 'backend', 'settings.gradle.kts'))).toBe(true);

      runStep(frontend, 'npm run typecheck', ['run', 'typecheck']);
      runStep(frontend, 'npm test', ['test']);
      runStep(frontend, 'npm run build', ['run', 'build']);

      const bundle = path.join(frontend, 'application', 'web-app', 'dist');
      expect(await fs.pathExists(path.join(bundle, 'index.html'))).toBe(true);
      const assets = await fs.readdir(path.join(bundle, 'assets'));
      const js = assets.find((f) => f.endsWith('.js'));
      expect(js).toBeDefined();
      const compiled = await fs.readFile(path.join(bundle, 'assets', js ?? ''), 'utf8');
      expect(compiled).toContain('/greet');
    },
    E2E_TIMEOUT_MS,
  );
});
