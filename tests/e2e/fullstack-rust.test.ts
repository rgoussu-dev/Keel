/**
 * End-to-end test for the `fullstack-rust` composite stack — the real
 * cross-service smoke: it scaffolds the monorepo, verifies the Rust
 * backend (test, build), then boots it and drives the wire the
 * frontend's gateway encodes — `{"greeting": …}` for a named and an
 * absent-name request, the RFC 9457 rejection, and the CORS header
 * the `rust-cors` decoration added for the SPA's dev origin.
 *
 * The frontend's own npm gates are exercised by the quarkus-pair
 * fullstack e2e (the frontend is identical); here `npm install` is
 * no-op'd alongside the actions every Rust e2e fakes. The backend
 * pulls axum from crates.io, so this test needs network access. Skip
 * rules and cargo isolation live in `tests/support/rust-e2e.ts`.
 */

import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cargoRun,
  debugBin,
  E2E_TIMEOUT_MS,
  mkTempDir,
  scaffold,
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
      const project = await scaffold(
        {
          stack: 'fullstack-rust',
          projectName: 'backend',
          alsoStubbed: ['walking-skeleton/npm-install'],
          servicePath: 'backend',
        },
        cwd,
        cargoHome,
      );

      expect(await fs.pathExists(path.join(cwd, 'frontend', 'package.json'))).toBe(true);
      expect(await fs.pathExists(path.join(project.root, 'contract', 'greet.openapi.yaml'))).toBe(
        true,
      );

      cargoRun(project, ['test']);
      cargoRun(project, ['build']);

      await withServer(
        debugBin(project, 'backend-http'),
        { cwd: project.root, env: { ...process.env, PORT: '0' } },
        async (base) => {
          // The wire the frontend gateway encodes, per the contract.
          const named = await fetch(`${base}/greet?name=E2E`);
          expect(named.status).toBe(200);
          expect(await named.json()).toEqual({ greeting: 'Hello, E2E!' });
          expect(named.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');

          const defaulted = await fetch(`${base}/greet`);
          expect(defaulted.status).toBe(200);
          expect(await defaulted.json()).toEqual({ greeting: 'Hello, world!' });

          const rejected = await fetch(`${base}/greet?name=`);
          expect(rejected.status).toBe(400);
          expect(rejected.headers.get('content-type')).toBe('application/problem+json');

          // The debug build carries the dev-only CORS accommodation.
          const preflight = await fetch(`${base}/greet`, {
            method: 'OPTIONS',
            headers: { 'access-control-request-headers': 'x-requested-with' },
          });
          expect(preflight.status).toBe(204);
          expect(preflight.headers.get('access-control-allow-methods')).toBe('GET');
          expect(preflight.headers.get('access-control-allow-headers')).toBe('x-requested-with');
        },
      );
    },
    E2E_TIMEOUT_MS,
  );
});
