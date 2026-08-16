/**
 * End-to-end test for the `web-components` walking skeleton, `basic`
 * layout.
 *
 * Dispatches `keel.new-project` against a real temp directory, then
 * verifies the generated workspace installs, typechecks, tests green
 * and builds a bundle.
 *
 * The modulith cells live in their own files, one per cell, so that
 * "every cell has a suite" is checkable from `ls`. The scaffolding
 * they share — including the headless-Chromium render — is in
 * `tests/support/web-e2e.ts`.
 */

import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { E2E_TIMEOUT_MS, mkTempDir, runStep, scaffold, skipWebE2E } from '../support/web-e2e.js';

let cwd: string;

beforeEach(async () => {
  cwd = await mkTempDir('keel-wc-e2e-');
});

afterEach(async () => {
  await fs.remove(cwd);
});

describe.skipIf(skipWebE2E('npm'))('web-components walking-skeleton e2e', () => {
  it(
    'generates a workspace that installs, typechecks, tests green, and builds',
    async () => {
      await scaffold(
        {
          stack: 'web-components',
          projectName: 'walking-skeleton-e2e',
          buildSystem: 'npm',
        },
        cwd,
      );

      runStep(cwd, 'npm run typecheck', 'npm', ['run', 'typecheck']);
      runStep(cwd, 'npm test', 'npm', ['test']);
      runStep(cwd, 'npm run build', 'npm', ['run', 'build']);

      const bundle = path.join(cwd, 'application', 'web-app', 'dist', 'index.html');
      expect(await fs.pathExists(bundle)).toBe(true);
      const html = await fs.readFile(bundle, 'utf8');
      expect(html).toContain('<acme-greeting>');
    },
    E2E_TIMEOUT_MS,
  );
});
