/**
 * The `go-http` modulith cell — `--module-layout=modulith`.
 *
 * Two things need a real toolchain here and nothing else can supply
 * them. The first is that the carved tree still compiles, vets and
 * serves the same wire contract — the dial's whole promise is that
 * the layout is the only thing that changed.
 *
 * The second is that the walls are walls. A one-context skeleton
 * cannot violate an inter-context rule on its own, so this drops two
 * probe files into `cmd/` and requires the compiler to reject both:
 * reaching into the context's `internal/` and naming what the facade
 * returns. Without them the layout's central claim — that a consumer
 * must come through the facade — would be asserted by prose alone.
 *
 * `keel add persistence` used to ride along here as a second case and
 * is now `modulith-go-persistence.test.ts`. That is the convention
 * rather than taste: vitest runs the cases inside one file in
 * sequence, so on the runner this file was 135.97s against a 137.07s
 * shard wall — the file *was* the job. The JVM splits
 * `modulith-persistence` off its cell for the same reason.
 */

import path from 'node:path';
import fs from 'fs-extra';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  driveGreetContract,
  E2E_TIMEOUT_MS,
  EXE,
  goRun,
  goRunFails,
  mkTempDir,
  scaffold,
  skipGoE2E,
  withHttpUnit,
} from '../support/go-e2e.js';

let goHome: string;
let cwd: string;

beforeAll(async () => {
  goHome = await mkTempDir('keel-e2e-go-modulith-home-');
});

afterAll(async () => {
  await fs.remove(goHome);
});

beforeEach(async () => {
  cwd = await mkTempDir('keel-e2e-go-modulith-');
});

afterEach(async () => {
  await fs.remove(cwd);
});

const modulith = (): Promise<void> =>
  scaffold({ stack: 'go-http', projectName: 'skel', moduleLayout: 'modulith' }, cwd);

describe.skipIf(skipGoE2E)('go-http modulith e2e', () => {
  it(
    'builds, serves /greet, and holds its walls',
    async () => {
      await modulith();

      goRun(cwd, goHome, ['vet', './...']);
      goRun(cwd, goHome, ['test', './...']);
      goRun(cwd, goHome, ['build', '-o', `bin/skel-http${EXE}`, './cmd/http']);

      // The context's core is unreachable from the assembly.
      const probe = path.join(cwd, 'cmd', 'http', 'probe.go');
      await fs.writeFile(
        probe,
        'package main\n\nimport "example.com/skel/internal/modules/greeting/internal/domain"\n\nvar _ = domain.GreetCommand{}\n',
      );
      expect(
        goRunFails(cwd, goHome, ['build', './cmd/...']),
        'importing a context internal/ must not compile',
      ).toContain('use of internal package');

      // The facade re-exports nothing, so the assembly cannot name the
      // port — and therefore cannot implement it either.
      await fs.writeFile(
        probe,
        'package main\n\nimport "example.com/skel/internal/modules/greeting"\n\nvar _ greeting.Greeter\n',
      );
      expect(
        goRunFails(cwd, goHome, ['build', './cmd/...']),
        "naming the facade's port must not compile",
      ).toContain('undefined: greeting.Greeter');

      await fs.remove(probe);
      goRun(cwd, goHome, ['build', './...']);

      await withHttpUnit(path.join(cwd, 'bin', `skel-http${EXE}`), cwd, driveGreetContract);
    },
    E2E_TIMEOUT_MS,
  );
});
