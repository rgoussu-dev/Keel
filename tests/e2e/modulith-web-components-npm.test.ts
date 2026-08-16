/**
 * The `web-components` modulith cell on **npm** —
 * `--module-layout=modulith --build-system=npm`.
 *
 * Two of its claims need the real toolchain. The first is the usual
 * one: the carved workspace still installs, typechecks, tests and
 * builds, because the layout is supposed to be the only thing that
 * changed.
 *
 * The second is specific to the browser and is the reason the import
 * map exists at all. A package that defines custom elements must be
 * loaded **once** per page: two bundles each inlining a copy throw
 * `NotSupportedError` on the second registration, and that throw
 * aborts the rest of that bundle's registrations — so part of the page
 * silently stops upgrading, with nothing in the console anyone reads.
 * No emitted-file assertion can see that. So this asserts what the
 * bundler actually produced, and then a real browser renders it.
 *
 * The two package managers are two cells rather than one because pnpm's
 * isolated store refuses what npm's hoisting hides — a package that
 * borrows a dependency from a sibling resolves under one and not the
 * other, and a bundler reaches for those files at build time.
 */

import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  chromium,
  E2E_TIMEOUT_MS,
  mkTempDir,
  renderInChromium,
  runStep,
  scaffold,
  skipWebE2E,
} from '../support/web-e2e.js';

const PM = 'npm' as const;

let cwd: string;

beforeEach(async () => {
  cwd = await mkTempDir('keel-wc-modulith-npm-e2e-');
});

afterEach(async () => {
  await fs.remove(cwd);
});

const modulith = (): Promise<void> =>
  scaffold(
    {
      stack: 'web-components',
      projectName: 'walking-skeleton-e2e',
      buildSystem: PM,
      moduleLayout: 'modulith',
    },
    cwd,
  );

describe.skipIf(skipWebE2E(PM))(`web-components modulith e2e (${PM})`, () => {
  it(
    'builds a bundle that leaves the design system to the import map',
    async () => {
      await modulith();

      runStep(cwd, `${PM} run typecheck`, PM, ['run', 'typecheck']);
      runStep(cwd, `${PM} test`, PM, ['test']);
      runStep(cwd, `${PM} run lint`, PM, ['run', 'lint']);
      runStep(cwd, `${PM} run build`, PM, ['run', 'build']);

      const dist = path.join(cwd, 'application', 'web-app', 'dist');
      const html = await fs.readFile(path.join(dist, 'index.html'), 'utf8');
      expect(html).toContain('<acme-greeting-view>');
      expect(html).toContain('"@acme/design-system": "/vendor/design-system.js"');

      // The map's target exists, and the design system is in it…
      const vendor = await fs.readFile(path.join(dist, 'vendor', 'design-system.js'), 'utf8');
      expect(vendor).toContain('acme-button');
      expect(await fs.pathExists(path.join(dist, 'vendor', 'design-system.css'))).toBe(true);

      // …and not in the app chunk, which keeps the bare specifier for
      // the browser to resolve. The app defines exactly its own one
      // element; every design-system registration is in the external.
      const chunks = await fs.readdir(path.join(dist, 'assets'));
      const app = await fs.readFile(
        path.join(dist, 'assets', chunks.find((f) => f.endsWith('.js')) ?? ''),
        'utf8',
      );
      expect(app).toContain('@acme/design-system');
      expect(app.match(/customElements\.define/g)).toHaveLength(1);
      expect(vendor.match(/customElements\.define/g)?.length ?? 0).toBeGreaterThan(1);
    },
    E2E_TIMEOUT_MS,
  );

  /**
   * The other half: a real browser, because "the page renders" is not
   * something a bundle inspection can claim. Headless Chromium loads
   * the built bundle from a static server and dumps the DOM after the
   * module graph has run; a page whose element never upgraded shows
   * an empty `<acme-greeting-view>` and fails here.
   *
   * Skipped when no Chromium is on the box — the bundle assertions
   * above still run.
   */
  it.skipIf(chromium === null)(
    'upgrades its elements in a real browser',
    async () => {
      await modulith();
      runStep(cwd, `${PM} run build`, PM, ['run', 'build']);
      const dom = await renderInChromium(path.join(cwd, 'application', 'web-app', 'dist'));
      // The context's element upgraded…
      expect(dom).toMatch(/<acme-greeting-view>[\s\S]*<form>/);
      // …and so did the design system's, through the import map.
      expect(dom).toContain('<acme-button type="submit"><button');
      expect(dom).toContain('<acme-greeting-card');
    },
    E2E_TIMEOUT_MS,
  );
});
