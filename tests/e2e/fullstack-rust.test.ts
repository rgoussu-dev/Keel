/**
 * End-to-end test for the `fullstack-rust` composite stack — the real
 * cross-service smoke: it scaffolds the monorepo, verifies the Rust
 * backend (test, build), then boots it and drives the wire the
 * frontend's gateway encodes — `{"greeting": …}` for a named and an
 * absent-name request, the RFC 9457 rejection, and the CORS header
 * the `rust-cors` decoration added for the SPA's dev origin.
 *
 * The frontend's own npm gates are exercised by `fullstack.test.ts`
 * (the frontend is identical); here its `npm install` is faked in the
 * frontend's scope, and the backend's deferred `cargo check` in the
 * backend's, as every Rust e2e fakes it. The backend pulls axum from
 * crates.io, so this test needs network access. The scaffolding is
 * `tests/support/product-e2e.ts`'s, and the skip rules and cargo
 * isolation are `tests/support/rust-e2e.ts`'s.
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
  E2E_TIMEOUT_MS,
  mkTempDir,
  skipRustE2E,
  withServer,
} from '../support/rust-e2e.js';

let cwd: string;
let cargoHome: string;

beforeEach(async () => {
  cwd = await mkTempDir('keel-fsrust-e2e-');
  cargoHome = await mkTempDir('keel-fsrust-e2e-cargo-');
});

afterEach(async () => {
  await fs.remove(cwd);
  await fs.remove(cargoHome);
});

describe.skipIf(skipRustE2E)('fullstack-rust e2e (monorepo)', () => {
  it(
    'scaffolds a product whose Rust backend serves the wire the frontend gateway encodes',
    async () => {
      const { backend, frontend } = await scaffoldProduct(
        {
          stack: 'fullstack-rust',
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
