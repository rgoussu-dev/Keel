/**
 * End-to-end test for the `fullstack-rust-cli` product: the
 * `fullstack-rust` smoke on a backend that grows a CLI beside its
 * HTTP unit. It scaffolds the monorepo, verifies the Rust backend
 * (test, build), greets through the CLI binary, then boots the HTTP
 * one and drives the wire the frontend's gateway encodes.
 *
 * It answers `projectName backend`, so both binaries are named for
 * the service: `backend` and `backend-http`. The frontend's `npm
 * install` is faked in its scope, and the backend's deferred `cargo
 * check` in the backend's, as `fullstack-rust.test.ts` fakes them. The
 * backend pulls axum from crates.io, so this test needs network
 * access. The scaffolding is `tests/support/product-e2e.ts`'s, and the
 * skip rules and cargo isolation are `tests/support/rust-e2e.ts`'s.
 */

import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  driveGatewayContract,
  expectComposeBuildContexts,
  scaffoldProduct,
} from '../support/product-e2e.js';
import {
  cargoRun,
  debugBin,
  driveGreetCli,
  E2E_TIMEOUT_MS,
  mkTempDir,
  skipRustE2E,
  withServer,
} from '../support/rust-e2e.js';

let cwd: string;
let cargoHome: string;

beforeEach(async () => {
  cwd = await mkTempDir('keel-fsrustcli-e2e-');
  cargoHome = await mkTempDir('keel-fsrustcli-e2e-cargo-');
});

afterEach(async () => {
  await fs.remove(cwd);
  await fs.remove(cargoHome);
});

describe.skipIf(skipRustE2E)('fullstack-rust-cli e2e (monorepo)', () => {
  it(
    'scaffolds a product whose Rust backend greets through its CLI and serves the gateway wire',
    async () => {
      const { backend, frontend } = await scaffoldProduct(
        {
          stack: 'fullstack-rust-cli',
          fakes: {
            backend: ['walking-skeleton/rust-bootstrap'],
            frontend: ['walking-skeleton/npm-install'],
          },
          answers: { 'walking-skeleton/rust-bootstrap': { projectName: 'backend' } },
        },
        cwd,
      );
      expect(await fs.pathExists(path.join(frontend, 'node_modules'))).toBe(false);
      // The backend's `cargo check` was faked too: nothing is built yet.
      expect(await fs.pathExists(path.join(backend, 'target'))).toBe(false);
      await expectComposeBuildContexts(cwd);

      const project = { root: backend, cargoHome };
      cargoRun(project, ['test']);
      cargoRun(project, ['build']);

      driveGreetCli(debugBin(project, 'backend'), backend);
      // The debug build carries the dev-only CORS accommodation.
      await withServer(
        debugBin(project, 'backend-http'),
        { cwd: backend, env: { ...process.env, PORT: '0' } },
        driveGatewayContract,
      );
    },
    E2E_TIMEOUT_MS,
  );
});
