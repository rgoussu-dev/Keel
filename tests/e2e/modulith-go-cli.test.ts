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
import { spawnSync } from 'node:child_process';
import fs from 'fs-extra';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  E2E_TIMEOUT_MS,
  EXE,
  goRun,
  goRunFails,
  mkTempDir,
  scaffold,
  skipGoE2E,
} from '../support/go-e2e.js';

let goHome: string;
let cwd: string;

beforeAll(async () => {
  goHome = await mkTempDir('keel-e2e-go-cli-modulith-home-');
});

afterAll(async () => {
  await fs.remove(goHome);
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

      const run = spawnSync(path.join(cwd, 'bin', `skel${EXE}`), ['--name', 'E2E'], {
        cwd,
        encoding: 'utf8',
      });
      expect(run.status).toBe(0);
      expect(run.stdout).toBe('Hello, E2E!\n');

      const rejected = spawnSync(path.join(cwd, 'bin', `skel${EXE}`), ['--name', '  '], {
        cwd,
        encoding: 'utf8',
      });
      expect(rejected.status).toBe(2);
      expect(rejected.stderr).toContain('name must not be empty');

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
