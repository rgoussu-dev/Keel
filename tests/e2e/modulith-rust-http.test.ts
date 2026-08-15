/**
 * End-to-end test for `rust-http` under `--module-layout=modulith`.
 *
 * The second of the two Rust modulith cells. Beyond building and
 * serving, it asserts the property the layout is bought for: the web
 * framework belongs to the **assembly**, not to the workspace, so no
 * context crate compiles against axum. Under `basic` there is one
 * crate and that distinction cannot be made.
 *
 * Its own file rather than another `it` in the CLI cell's, because
 * vitest runs the tests inside one file in sequence and this one
 * compiles tokio from a cold registry.
 */

import path from 'node:path';
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
} from '../support/rust-e2e.js';

let cargoHome: string;
let cwd: string;

beforeAll(async () => {
  cargoHome = await mkTempDir('keel-e2e-rust-modulith-http-home-');
});

afterAll(async () => {
  await fs.remove(cargoHome);
});

beforeEach(async () => {
  cwd = await mkTempDir('keel-e2e-rust-modulith-http-');
});

afterEach(async () => {
  await fs.remove(cwd);
});

describe.skipIf(skipRustE2E)('rust-http modulith e2e', () => {
  it(
    'scaffolds a workspace that tests, builds, and serves /greet',
    async () => {
      const project = await scaffold(
        { stack: 'rust-http', projectName: 'skel', moduleLayout: 'modulith' },
        cwd,
        cargoHome,
      );

      const root = await fs.readFile(path.join(cwd, 'Cargo.toml'), 'utf8');
      expect(root).toContain('[workspace]');
      expect(root).toContain('"application/http",');

      // The transport lives with the assembly. A context crate that
      // compiled against axum would mean the hexagon had leaked into
      // its own infrastructure.
      const assembly = await fs.readFile(
        path.join(cwd, 'application', 'http', 'Cargo.toml'),
        'utf8',
      );
      expect(assembly).toContain('axum = ');
      for (const crate of ['domain/contract', 'domain/core', 'user-side/service']) {
        const manifest = await fs.readFile(
          path.join(cwd, 'modules', 'greeting', ...crate.split('/'), 'Cargo.toml'),
          'utf8',
        );
        expect(manifest).not.toContain('axum');
        expect(manifest).not.toContain('tokio');
      }

      cargoRun(project, ['test', '--workspace']);
      cargoRun(project, ['build']);

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
        },
      );
    },
    E2E_TIMEOUT_MS,
  );
});
