/**
 * `keel add persistence` on the Go modulith — a vertical layered onto
 * a cell rather than a cell itself, the same role
 * `modulith-persistence.test.ts` plays for the JVM.
 *
 * Five packages move, so the toolchain is the only thing that can
 * confirm they landed somewhere the compiler accepts — and `go build`
 * alone cannot, because a slice emitted at the wrong paths and wired
 * to nothing compiles perfectly well. So this asserts the assembly,
 * and then re-runs the facade probe: the new factory widens the
 * aperture, and the wall has to survive it.
 *
 * Its own file because it is a long case, and the file is the unit of
 * CI scheduling: sharing one with the `go-http` cell made that file
 * 135.97s on the runner against a 137.07s shard wall.
 */

import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  addVertical,
  E2E_TIMEOUT_MS,
  goRun,
  goRunFails,
  mkTempDir,
  scaffold,
  sharedGoHome,
  skipGoE2E,
} from '../support/go-e2e.js';

let goHome: string;
let cwd: string;

beforeAll(async () => {
  goHome = await sharedGoHome();
});

beforeEach(async () => {
  cwd = await mkTempDir('keel-e2e-go-persistence-');
});

afterEach(async () => {
  await fs.remove(cwd);
});

describe.skipIf(skipGoE2E)('go-http modulith persistence e2e', () => {
  it(
    'takes the persistence vertical, wires it, and keeps the aperture shut',
    async () => {
      await scaffold({ stack: 'go-http', projectName: 'skel', moduleLayout: 'modulith' }, cwd);
      await addVertical('persistence', cwd);

      goRun(cwd, goHome, ['vet', './...']);
      goRun(cwd, goHome, ['test', './...']);
      goRun(cwd, goHome, ['build', './...']);

      const main = await fs.readFile(path.join(cwd, 'cmd', 'http', 'main.go'), 'utf8');
      expect(main).toContain('greetings := greeting.NewGreetingLogUseCases(');
      expect(main).toContain('resthttp.WithGreetings(resthttp.NewHandler(greeter), greetings)');

      // The slice's ports are as unnameable from the assembly as the
      // greet port was — adding a factory to the facade must not have
      // leaked a type alias alongside it.
      const probe = path.join(cwd, 'cmd', 'http', 'probe.go');
      await fs.writeFile(
        probe,
        'package main\n\nimport "example.com/skel/internal/modules/greeting"\n\nvar _ greeting.GreetingLog\n',
      );
      expect(
        goRunFails(cwd, goHome, ['build', './cmd/...']),
        "naming the slice's port must not compile",
      ).toContain('undefined: greeting.GreetingLog');
      await fs.remove(probe);
    },
    E2E_TIMEOUT_MS,
  );
});
