/**
 * End-to-end test for the `fullstack-go` composite stack — the real
 * cross-service smoke: it scaffolds the monorepo, verifies the Go
 * backend (vet, test, build), then boots it and drives the wire the
 * frontend's gateway encodes — `{"greeting": …}` for a named and an
 * absent-name request, the RFC 9457 rejection, and the CORS header
 * the `go-cors` decoration added for the SPA's dev origin.
 *
 * The frontend's own npm gates are exercised by `fullstack.test.ts`
 * (the frontend is identical); here its `npm install` is faked in the
 * frontend's scope, with the root's `git init`. The backend's two
 * scaffold-time `go mod tidy` runs (go-bootstrap's and
 * go-observability's) run for real in the process's own Go
 * environment, and fetch the OpenTelemetry modules, so the suite needs
 * the network; its vet, test and build run against the Go home every
 * Go suite in the run shares. The scaffolding is
 * `tests/support/product-e2e.ts`'s, and the skip rules and toolchain
 * environment are `tests/support/go-e2e.ts`'s.
 */

import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  E2E_TIMEOUT_MS,
  EXE,
  goRun,
  mkTempDir,
  sharedGoHome,
  skipGoE2E,
  withHttpUnit,
} from '../support/go-e2e.js';
import {
  driveGatewayContract,
  expectComposeBuildContexts,
  scaffoldProduct,
} from '../support/product-e2e.js';

let goHome: string;
let cwd: string;

beforeAll(async () => {
  goHome = await sharedGoHome();
});

beforeEach(async () => {
  cwd = await mkTempDir('keel-fsgo-e2e-');
});

afterEach(async () => {
  await fs.remove(cwd);
});

describe.skipIf(skipGoE2E)('fullstack-go e2e (monorepo)', () => {
  it(
    'scaffolds a product whose Go backend serves the wire the frontend gateway encodes',
    async () => {
      const { backend, frontend } = await scaffoldProduct(
        { stack: 'fullstack-go', fakes: { frontend: ['walking-skeleton/npm-install'] } },
        cwd,
      );
      expect(await fs.pathExists(path.join(frontend, 'node_modules'))).toBe(false);
      await expectComposeBuildContexts(cwd);

      goRun(backend, goHome, ['vet', './...']);
      goRun(backend, goHome, ['test', './...']);
      goRun(backend, goHome, ['build', '-o', `bin/backend-http${EXE}`, './cmd/http']);

      // GO_ENV=dev activates the dev-only CORS accommodation under test;
      // OpenTelemetry stays on, so the backend boots through its real
      // exporter setup, as the Go products' suites alone do.
      await withHttpUnit(
        path.join(backend, 'bin', `backend-http${EXE}`),
        backend,
        (port) => driveGatewayContract(`http://127.0.0.1:${port}`),
        { GO_ENV: 'dev', OTEL_SDK_DISABLED: 'false' },
      );
    },
    E2E_TIMEOUT_MS,
  );
});
