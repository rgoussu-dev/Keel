/**
 * Grid cell: **Go CLI + HTTP**, `basic` layout — one module, two
 * assembly points (roadmap T.4b).
 *
 * `go-cli-http` is what `arch.cli` + `arch.server-http` produces on
 * Go: one domain under `internal/`, and `cmd/cli` and `cmd/http`
 * wiring it. It is Go's walking skeleton retargeted, at the preset's
 * default setting, which no suite built before: the module vets and
 * tests once, then **both** units are built off it, the CLI greets
 * and the server serves the same wire contract `go-http` does.
 *
 * Go has no build system to choose, so the file name carries no build
 * segment. A `basic` `go-cli` or `go-http` project that
 * `keel add entrypoint` grows is this cell byte for byte (I10), so
 * this suite covers it too. The skip rules, the shared Go home and the
 * drives are `tests/support/go-e2e.ts`'s.
 */

import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  driveGreetCli,
  driveGreetContract,
  E2E_TIMEOUT_MS,
  EXE,
  goRun,
  mkTempDir,
  scaffold,
  sharedGoHome,
  skipGoE2E,
  withHttpUnit,
} from '../support/go-e2e.js';
import { expectLifecycleSkill } from '../support/harness-docs.js';

let goHome: string;
let cwd: string;

beforeAll(async () => {
  goHome = await sharedGoHome();
});

beforeEach(async () => {
  cwd = await mkTempDir('keel-e2e-combo-bas-go-');
});

afterEach(async () => {
  await fs.remove(cwd);
});

describe.skipIf(skipGoE2E)('go-cli-http basic combo e2e', () => {
  it(
    'vets and tests one module, greets from the CLI and serves /greet',
    async () => {
      await scaffold({ stack: 'go-cli-http', projectName: 'skel' }, cwd);
      await expectLifecycleSkill(cwd, 'basic');

      goRun(cwd, goHome, ['vet', './...']);
      goRun(cwd, goHome, ['test', './...']);
      goRun(cwd, goHome, ['build', '-o', `bin/skel${EXE}`, './cmd/cli']);
      goRun(cwd, goHome, ['build', '-o', `bin/skel-http${EXE}`, './cmd/http']);

      driveGreetCli(path.join(cwd, 'bin', `skel${EXE}`), cwd);
      await withHttpUnit(path.join(cwd, 'bin', `skel-http${EXE}`), cwd, driveGreetContract);
    },
    E2E_TIMEOUT_MS,
  );
});
