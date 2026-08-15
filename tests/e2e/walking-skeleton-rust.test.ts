/**
 * End-to-end tests for the Rust walking skeleton under the `basic`
 * layout.
 *
 * Scaffolds the `rust-cli` and `rust-http` stacks into real temp
 * directories through the mediator, then verifies each generated
 * project actually tests and builds with the local Rust toolchain —
 * and that the produced binaries behave: the CLI prints its greeting,
 * the HTTP unit serves `/greet` for real.
 *
 * The modulith layout's cells are `modulith-rust-cli.test.ts` and
 * `modulith-rust-http.test.ts`; the shared scaffolding, skip rules
 * and cargo isolation live in `tests/support/rust-e2e.ts`.
 *
 * A fresh `CARGO_HOME` is shared across the tests in this file —
 * cold-fetching the registry index once is slow enough. The
 * `rust-cli` skeleton is dependency-free; `rust-http` pulls axum from
 * crates.io, so that test needs network access.
 */

import { spawnSync } from 'node:child_process';
import fs from 'fs-extra';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  cargoRun,
  debugBin,
  E2E_TIMEOUT_MS,
  mkTempDir,
  scaffold,
  skipRustE2E,
  withServer,
  type RustProject,
} from '../support/rust-e2e.js';

let cargoHome: string;
let cwd: string;

beforeAll(async () => {
  cargoHome = await mkTempDir('keel-e2e-rust-home-');
});

afterAll(async () => {
  await fs.remove(cargoHome);
});

beforeEach(async () => {
  cwd = await mkTempDir('keel-e2e-rust-');
});

afterEach(async () => {
  await fs.remove(cwd);
});

const buildProject = async (stack: string): Promise<RustProject> => {
  const project = await scaffold({ stack, projectName: 'skel' }, cwd, cargoHome);
  cargoRun(project, ['test']);
  cargoRun(project, ['build']);
  return project;
};

describe.skipIf(skipRustE2E)('walking-skeleton Rust e2e', () => {
  it(
    'rust-cli: generates a project that tests, builds, and runs',
    async () => {
      const project = await buildProject('rust-cli');

      const bin = debugBin(project, 'skel');
      const run = spawnSync(bin, ['--name', 'E2E'], { cwd: project.root, encoding: 'utf8' });
      expect(run.status).toBe(0);
      expect(run.stdout).toBe('Hello, E2E!\n');

      const rejected = spawnSync(bin, ['--name', '  '], { cwd: project.root, encoding: 'utf8' });
      expect(rejected.status).toBe(2);
      expect(rejected.stderr).toContain('name must not be empty');
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'rust-http: generates a project that tests, builds, and serves /greet',
    async () => {
      const project = await buildProject('rust-http');

      await withServer(
        debugBin(project, 'skel-http'),
        {
          cwd: project.root,
          env: { ...process.env, PORT: '0', OTEL_SDK_DISABLED: 'true' },
        },
        async (base) => {
          const ok = await fetch(`${base}/greet?name=E2E`);
          expect(ok.status).toBe(200);
          expect(await ok.json()).toEqual({ greeting: 'Hello, E2E!' });

          const defaulted = await fetch(`${base}/greet`);
          expect(defaulted.status).toBe(200);
          expect(await defaulted.json()).toEqual({ greeting: 'Hello, world!' });

          const rejected = await fetch(`${base}/greet?name=`);
          expect(rejected.status).toBe(400);
          expect(rejected.headers.get('content-type')).toBe('application/problem+json');

          // Observability seam: both probes answer, and the correlation
          // id round-trips (echoed when supplied, minted when absent).
          expect((await fetch(`${base}/health/live`)).status).toBe(200);
          expect((await fetch(`${base}/health/ready`)).status).toBe(200);
          const correlated = await fetch(`${base}/greet?name=E2E`, {
            headers: { 'X-Correlation-Id': 'corr-e2e' },
          });
          expect(correlated.headers.get('x-correlation-id')).toBe('corr-e2e');
          const minted = await fetch(`${base}/greet?name=E2E`);
          expect(minted.headers.get('x-correlation-id')).toBeTruthy();
        },
      );
    },
    E2E_TIMEOUT_MS,
  );
});
