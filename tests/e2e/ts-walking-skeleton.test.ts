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

const runFails = (cwd: string, cmd: string, args: readonly string[]): string => {
  const r = spawnSync(cmd, [...args], { cwd, encoding: 'utf8' });
  if (r.status === 0) {
    throw new Error(`${cmd} ${args.join(' ')} unexpectedly succeeded\nstdout:\n${r.stdout}`);
  }
  return `${r.stdout}${r.stderr}`;
};

const scaffold = async (buildSystem: 'npm' | 'pnpm', moduleLayout?: string): Promise<void> => {
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
        ...(moduleLayout !== undefined ? { moduleLayout } : {}),
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

/**
 * The modulith layout, end to end, on both package managers.
 *
 * Nothing about this layout can be checked without a real install.
 * Its central claim is that a bounded context is reachable only
 * through the two entry points its `exports` map publishes, and an
 * `exports` map is inert until something resolves against it —
 * emitted-file assertions would pass over a map that publishes
 * everything. So each case installs for real and then requires three
 * separate refusals: `tsc` on a deep package import, Node on the same
 * import at runtime, and dependency-cruiser on the relative path that
 * walks around both.
 *
 * The pnpm case is not a duplicate. npm hoists every workspace member
 * into the root `node_modules`, which hides missing dependency
 * declarations; pnpm's isolated store does not, so a package that
 * borrows a type package from a sibling typechecks under one and
 * fails under the other.
 */
const modulithSuite = (pm: 'npm' | 'pnpm'): void => {
  describe.skipIf(optedOut || !onPath(pm) || (onCI && !optedIn))(
    `ts-http modulith e2e (${pm})`,
    () => {
      it(
        'installs, typechecks, tests, lints — and refuses every way past the aperture',
        async () => {
          await scaffold(pm, 'modulith');
          runStep(cwd, `${pm} run typecheck`, pm, ['run', 'typecheck']);
          runStep(cwd, `${pm} test`, pm, ['test']);
          runStep(cwd, `${pm} run lint`, pm, ['run', 'lint']);

          const deep = '@acme/greeting/src/domain/core/internal/greet-handler.ts';
          const probe = path.join(cwd, 'application', 'rest', 'src', 'probe.ts');

          // tsc refuses the deep import…
          await fs.writeFile(probe, `export { createGreetHandler } from '${deep}';\n`);
          expect(
            runFails(path.join(cwd, 'application', 'rest'), 'npx', ['tsc', '--noEmit']),
          ).toContain('TS2307');

          // …and so does Node, which is the half a type-only wall
          // would miss entirely. Probed from the assembly rather than
          // the repo root: under pnpm only a package that declares
          // the dependency can see it at all, and "not installed" is
          // a different refusal from "not published".
          expect(
            runFails(path.join(cwd, 'application', 'rest'), 'node', [
              '-e',
              `import(${JSON.stringify(deep)})`,
            ]),
          ).toContain('ERR_PACKAGE_PATH_NOT_EXPORTED');

          // The relative path walks around both, and is exactly what
          // the emitted dependency-cruiser config is for.
          await fs.writeFile(
            probe,
            "export { createGreetHandler } from '../../../modules/greeting/src/domain/core/internal/greet-handler.ts';\n",
          );
          expect(runFails(cwd, pm, ['run', 'lint'])).toContain('context-through-its-aperture');

          // A domain file reaching for its own adapters is the other
          // rule the map cannot see.
          await fs.remove(probe);
          const inward = path.join(cwd, 'modules', 'greeting', 'src', 'domain', 'core', 'probe.ts');
          await fs.writeFile(inward, "export { systemClock } from '../../infra/clock/index.ts';\n");
          expect(runFails(cwd, pm, ['run', 'lint'])).toContain('domain-owns-no-adapters');
          await fs.remove(inward);

          runStep(cwd, `${pm} run lint`, pm, ['run', 'lint']);
        },
        E2E_TIMEOUT_MS,
      );
    },
  );
};

modulithSuite('npm');
modulithSuite('pnpm');
