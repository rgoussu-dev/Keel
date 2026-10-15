/**
 * End-to-end test for the `fullstack` composite stack (monorepo
 * layout).
 *
 * Dispatches `keel.new-project` against a real temp directory, then
 * verifies the frontend service — whose greet slice the gateway
 * adapter rewired to call the backend — actually installs,
 * typechecks, tests green (domain slice through the fake gateway,
 * design system under happy-dom, gateway fake contract), and
 * produces the deployable bundle.
 *
 * This is the product suite that builds the frontend, which is the
 * same on every product; the others build their backend and fake the
 * frontend's install. The backend's own build is exercised by the
 * Quarkus e2e suites; here `walking-skeleton/gradle-wrapper` is faked
 * in the backend's scope, with the root's `vcs/git-init`, so this test
 * costs one `npm install`, not a Gradle distribution download. The
 * scaffolding is `tests/support/product-e2e.ts`'s, and the skip rules
 * are the npm suites' (`tests/support/web-e2e.ts`).
 */

import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { expectComposeBuildContexts, scaffoldProduct } from '../support/product-e2e.js';
import { E2E_TIMEOUT_MS, mkTempDir, runStep, skipWebE2E } from '../support/web-e2e.js';

let cwd: string;

beforeEach(async () => {
  cwd = await mkTempDir('keel-fullstack-e2e-');
});

afterEach(async () => {
  await fs.remove(cwd);
});

describe.skipIf(skipWebE2E('npm'))('fullstack e2e (monorepo)', () => {
  it(
    'scaffolds a product whose gateway-wired frontend installs, typechecks, tests green, and builds',
    async () => {
      const { backend, frontend } = await scaffoldProduct(
        { stack: 'fullstack', fakes: { backend: ['walking-skeleton/gradle-wrapper'] } },
        cwd,
      );
      expect(await fs.pathExists(path.join(frontend, 'node_modules'))).toBe(true);
      expect(await fs.pathExists(path.join(backend, 'settings.gradle.kts'))).toBe(true);
      // The wrapper is what `gradle wrapper` writes: absent, the fake hit the backend's scope.
      expect(await fs.pathExists(path.join(backend, 'gradlew'))).toBe(false);
      await expectComposeBuildContexts(cwd);

      runStep(frontend, 'npm run typecheck', 'npm', ['run', 'typecheck']);
      runStep(frontend, 'npm test', 'npm', ['test']);
      runStep(frontend, 'npm run build', 'npm', ['run', 'build']);

      const bundle = path.join(frontend, 'application', 'web-app', 'dist');
      expect(await fs.pathExists(path.join(bundle, 'index.html'))).toBe(true);
      const assets = await fs.readdir(path.join(bundle, 'assets'));
      const js = assets.find((f) => f.endsWith('.js'));
      expect(js).toBeDefined();
      const compiled = await fs.readFile(path.join(bundle, 'assets', js ?? ''), 'utf8');
      expect(compiled).toContain('/greet');
    },
    E2E_TIMEOUT_MS,
  );
});
