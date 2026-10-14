/**
 * The `go-cli` modulith cell — `--module-layout=modulith`.
 *
 * The cell the grid was missing. `go-http` has been built under this
 * layout since the dial landed; the CLI shape never had been, and the
 * two do not share an assembly: `cmd/cli` wires a driving adapter
 * that turns flags into the command, where `cmd/http` wires a
 * handler. A layout bug that only reaches the flag path would have
 * shipped green.
 */

import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  driveGreetCli,
  E2E_TIMEOUT_MS,
  EXE,
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
  cwd = await mkTempDir('keel-e2e-go-cli-modulith-');
});

afterEach(async () => {
  await fs.remove(cwd);
});

describe.skipIf(skipGoE2E)('go-cli modulith e2e', () => {
  it(
    'builds, greets, rejects a blank name, and holds its walls',
    async () => {
      await scaffold({ stack: 'go-cli', projectName: 'skel', moduleLayout: 'modulith' }, cwd);

      goRun(cwd, goHome, ['vet', './...']);
      goRun(cwd, goHome, ['test', './...']);
      goRun(cwd, goHome, ['build', '-o', `bin/skel${EXE}`, './cmd/cli']);

      driveGreetCli(path.join(cwd, 'bin', `skel${EXE}`), cwd);

      // The same two walls the HTTP cell checks, from the CLI
      // assembly — which is a different package reaching the same
      // context, and therefore a different chance to have leaked.
      const probe = path.join(cwd, 'cmd', 'cli', 'probe.go');
      await fs.writeFile(
        probe,
        'package main\n\nimport "example.com/skel/internal/modules/greeting/internal/domain"\n\nvar _ = domain.GreetCommand{}\n',
      );
      expect(goRunFails(cwd, goHome, ['build', './cmd/...'])).toContain('use of internal package');

      await fs.writeFile(
        probe,
        'package main\n\nimport "example.com/skel/internal/modules/greeting"\n\nvar _ greeting.Greeter\n',
      );
      expect(goRunFails(cwd, goHome, ['build', './cmd/...'])).toContain(
        'undefined: greeting.Greeter',
      );

      await fs.remove(probe);
      goRun(cwd, goHome, ['build', './...']);
    },
    E2E_TIMEOUT_MS,
  );
});
