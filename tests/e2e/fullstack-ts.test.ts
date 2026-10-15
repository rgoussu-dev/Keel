/**
 * End-to-end test for the `fullstack-ts` composite stack — the real
 * cross-service smoke: it scaffolds the monorepo, verifies the
 * TypeScript backend (install, typecheck, test), then boots its REST
 * assembly and drives the wire the frontend's gateway encodes —
 * `{"greeting": …}` for a named and an absent-name request, the
 * RFC 9457 rejection, and the CORS header and preflight the `ts-cors`
 * decoration added for the SPA's dev origin.
 *
 * The frontend's own npm gates are exercised by `fullstack.test.ts`
 * (the frontend is identical); here its `npm install` is faked in the
 * frontend's scope, with the root's `git init`. The backend queues the
 * same action id, and its install runs for real: the fake is keyed by
 * scope. The scaffolding is `tests/support/product-e2e.ts`'s, and the
 * skip rules and the REST assembly's start and stop are
 * `tests/support/web-e2e.ts`'s.
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
  E2E_TIMEOUT_MS,
  mkTempDir,
  runStep,
  skipWebE2E,
  withRestAssembly,
} from '../support/web-e2e.js';

let cwd: string;

beforeEach(async () => {
  cwd = await mkTempDir('keel-fsts-e2e-');
});

afterEach(async () => {
  await fs.remove(cwd);
});

describe.skipIf(skipWebE2E('npm'))('fullstack-ts e2e (monorepo)', () => {
  it(
    'scaffolds a product whose TypeScript backend serves the wire the frontend gateway encodes',
    async () => {
      const { backend, frontend } = await scaffoldProduct(
        { stack: 'fullstack-ts', fakes: { frontend: ['walking-skeleton/npm-install'] } },
        cwd,
      );
      expect(await fs.pathExists(path.join(frontend, 'node_modules'))).toBe(false);
      expect(await fs.pathExists(path.join(backend, 'node_modules'))).toBe(true);
      await expectComposeBuildContexts(cwd);

      runStep(backend, 'npm run typecheck', 'npm', ['run', 'typecheck']);
      runStep(backend, 'npm test', 'npm', ['test']);

      // `withCors` is a no-op under NODE_ENV=production, so the boot
      // says development: the dev-only accommodation is what is under test.
      await withRestAssembly(
        backend,
        (baseUrl) =>
          driveGatewayContract(baseUrl, {
            problemContentType: 'application/problem+json; charset=utf-8',
          }),
        { NODE_ENV: 'development' },
      );
    },
    E2E_TIMEOUT_MS,
  );
});
