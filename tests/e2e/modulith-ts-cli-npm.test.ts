/**
 * The `ts-cli` modulith cell on **npm** —
 * `--module-layout=modulith --build-system=npm`.
 *
 * Nothing about this layout can be checked without a real install.
 * Its central claim is that a bounded context is reachable only
 * through the two entry points its `exports` map publishes, and an
 * `exports` map is inert until something resolves against it —
 * emitted-file assertions would pass over a map that publishes
 * everything. So this installs for real and then requires three
 * separate refusals: `tsc` on a deep package import, Node on the same
 * import at runtime, and dependency-cruiser on the relative path that
 * walks around both — probed from `application/cli`, the assembly
 * this stack actually ships.
 *
 * The two package managers are not duplicates of each other, which is
 * why they are two cells. npm hoists every workspace member into the
 * root `node_modules`, hiding missing dependency declarations; pnpm's
 * isolated store does not, so a package that borrows a type package
 * from a sibling typechecks under one and fails under the other.
 */

import path from 'node:path';
import { spawnSync } from 'node:child_process';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  E2E_TIMEOUT_MS,
  mkTempDir,
  runFails,
  runStep,
  scaffold,
  skipWebE2E,
} from '../support/web-e2e.js';

const PM = 'npm' as const;

let cwd: string;

beforeEach(async () => {
  cwd = await mkTempDir('keel-ts-cli-modulith-npm-e2e-');
});

afterEach(async () => {
  await fs.remove(cwd);
});

describe.skipIf(skipWebE2E(PM))(`ts-cli modulith e2e (${PM})`, () => {
  it(
    'installs, typechecks, tests, lints, runs — and refuses every way past the aperture',
    async () => {
      await scaffold(
        {
          stack: 'ts-cli',
          projectName: 'walking-skeleton-e2e',
          buildSystem: PM,
          moduleLayout: 'modulith',
        },
        cwd,
      );
      runStep(cwd, `${PM} run typecheck`, PM, ['run', 'typecheck']);
      runStep(cwd, `${PM} test`, PM, ['test']);
      runStep(cwd, `${PM} run lint`, PM, ['run', 'lint']);

      // The assembly runs: the greeting on stdout, the domain's no as
      // exit code 2 — the CLI counterpart of hitting /greet.
      const greeted = spawnSync('node', ['application/cli/src/main.ts', '--name', 'E2E'], {
        cwd,
        encoding: 'utf8',
      });
      expect(greeted.status).toBe(0);
      expect(greeted.stdout).toBe('Hello, E2E!\n');
      const rejected = spawnSync('node', ['application/cli/src/main.ts', '--name', '  '], {
        cwd,
        encoding: 'utf8',
      });
      expect(rejected.status).toBe(2);
      expect(rejected.stderr).toContain('name must not be blank');

      const deep = '@acme/greeting/src/domain/core/internal/greet-handler.ts';
      const probe = path.join(cwd, 'application', 'cli', 'src', 'probe.ts');

      // tsc refuses the deep import…
      await fs.writeFile(probe, `export { createGreetHandler } from '${deep}';\n`);
      expect(runFails(path.join(cwd, 'application', 'cli'), 'npx', ['tsc', '--noEmit'])).toContain(
        'TS2307',
      );

      // …and so does Node, which is the half a type-only wall would
      // miss entirely. Probed from the assembly rather than the repo
      // root: under pnpm only a package that declares the dependency
      // can see it at all, and "not installed" is a different refusal
      // from "not published".
      expect(
        runFails(path.join(cwd, 'application', 'cli'), 'node', [
          '-e',
          `import(${JSON.stringify(deep)})`,
        ]),
      ).toContain('ERR_PACKAGE_PATH_NOT_EXPORTED');

      // The relative path walks around both, and is exactly what the
      // emitted dependency-cruiser config is for.
      await fs.writeFile(
        probe,
        "export { createGreetHandler } from '../../../modules/greeting/src/domain/core/internal/greet-handler.ts';\n",
      );
      expect(runFails(cwd, PM, ['run', 'lint'])).toContain('context-through-its-aperture');

      // A domain file reaching for its own adapters is the other rule
      // the map cannot see.
      await fs.remove(probe);
      const inward = path.join(cwd, 'modules', 'greeting', 'src', 'domain', 'core', 'probe.ts');
      await fs.writeFile(inward, "export { systemClock } from '../../infra/clock/index.ts';\n");
      expect(runFails(cwd, PM, ['run', 'lint'])).toContain('domain-owns-no-adapters');
      await fs.remove(inward);

      runStep(cwd, `${PM} run lint`, PM, ['run', 'lint']);
    },
    E2E_TIMEOUT_MS,
  );
});
