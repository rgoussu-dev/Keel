/**
 * End-to-end tests for the Go walking skeleton, `basic` layout.
 *
 * Dispatches `keel.new-project` against a real temp directory with
 * the `go-cli` and `go-http` stacks, then verifies each generated
 * project actually vets, tests, and builds with the local Go
 * toolchain — and that the produced binaries behave: the CLI prints
 * its greeting, the HTTP unit serves `/greet` for real.
 *
 * The modulith cells live in their own files, one per cell, so that
 * "every cell has a suite" is checkable from `ls` and so that the
 * slowest one does not floor this file. The scaffolding they share is
 * in `tests/support/go-e2e.ts`.
 */

import path from 'node:path';
import { spawnSync } from 'node:child_process';
import fs from 'fs-extra';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  driveGreetContract,
  E2E_TIMEOUT_MS,
  EXE,
  goRun,
  mkTempDir,
  scaffold,
  skipGoE2E,
  withHttpUnit,
} from '../support/go-e2e.js';

let goHome: string;
let cwd: string;

beforeAll(async () => {
  goHome = await mkTempDir('keel-e2e-go-home-');
});

afterAll(async () => {
  await fs.remove(goHome);
});

beforeEach(async () => {
  cwd = await mkTempDir('keel-e2e-go-');
});

afterEach(async () => {
  await fs.remove(cwd);
});

describe.skipIf(skipGoE2E)('walking-skeleton Go e2e', () => {
  it(
    'go-cli: generates a project that vets, tests, builds, and runs',
    async () => {
      await scaffold({ stack: 'go-cli', projectName: 'skel' }, cwd);

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
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'go-http: generates a project that tests, builds, and serves /greet',
    async () => {
      await scaffold({ stack: 'go-http', projectName: 'skel' }, cwd);

      goRun(cwd, goHome, ['test', './...']);
      goRun(cwd, goHome, ['build', '-o', `bin/skel-http${EXE}`, './cmd/http']);

      await withHttpUnit(path.join(cwd, 'bin', `skel-http${EXE}`), cwd, driveGreetContract);
    },
    E2E_TIMEOUT_MS,
  );
});
