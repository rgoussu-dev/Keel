/**
 * The `keel ui` stack finder, driven in a real browser.
 *
 * The three facets — language, user-side adapters, framework — are
 * the browser half of the `keel new` drill-down. Their narrowing is
 * already unit-tested (`tests/application/web/finder.test.ts`) and
 * the tree they walk is tested where it is built
 * (`tests/domain/core/handlers/catalog.test.ts`). What neither can
 * see is the part that lives between them: an element that renders
 * the tree into controls, re-renders on every move, and has to keep
 * a choice across a re-render rather than snap the form back to its
 * defaults.
 *
 * That gap is not theoretical. `<keel-new-form>` rebuilds its whole
 * subtree on each change and `<keel-app>` replaces the element
 * itself, so *every* assertion here is about state surviving a DOM
 * replacement — which is exactly what a pure-function test cannot
 * assert and what the page was verified by hand for, once, and never
 * since.
 *
 * **The whole binary, not the server module.** This spawns
 * `keel ui --port 0` as a child process and reads the URL it prints,
 * because the token in that URL is the page's only credential: a
 * suite that mints its own would prove the router accepts a token it
 * was handed, not that the CLI hands the browser one that works. The
 * port is 0 so parallel suites cannot collide, which means the URL
 * has to be parsed rather than assumed. That spawn, and the
 * settle-after-every-interaction dance below it, live in
 * `tests/support/ui-e2e.ts` — shared with `ui-plugin-stack`, which
 * opens the same page in a directory holding a keel plugin.
 *
 * **Why the browser guard sits on the `describe`.** The other
 * browser-driven suites (`modulith-web-components-*`,
 * `add-module-wc`) put `it.skipIf(chromium === null)` on the one case
 * that renders, because their other cases run without one. Here every
 * case needs the browser and `beforeAll` launches it, so the same
 * condition has to be hoisted — an `it`-level guard would leave the
 * hook launching a Chromium that is not there.
 *
 * Skip rules are the shared ones (`skipE2E`): off on CI unless
 * `KEEL_RUN_E2E=1`, off anywhere with `KEEL_SKIP_E2E=1`. No package
 * manager is probed, because none is run.
 */

import path from 'node:path';
import fs from 'fs-extra';
import { chromium as browserType, type Browser, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { E2E_TIMEOUT_MS, mkTempDir, runStep, skipE2E } from '../support/web-e2e.js';
import {
  act,
  adapter,
  browserBinary,
  control,
  rendered,
  repoRoot,
  stackIs,
  valueOf,
  startUi,
  watchTraffic,
  type Traffic,
  type UiProcess,
} from '../support/ui-e2e.js';

/* ---- fixtures --------------------------------------------------- */

let cwd: string;
let ui: UiProcess;
let browser: Browser;
let page: Page;
let traffic: Traffic;
let mishaps: string[];

describe.skipIf(skipE2E() || browserBinary === null)('keel ui — the stack finder facets', () => {
  beforeAll(async () => {
    // `bin/keel.js` loads `dist/`, and the e2e job installs without
    // building. Compiling here is what makes this suite test the
    // command rather than a stale artefact of whatever ran last.
    runStep(
      repoRoot,
      'tsc -p tsconfig.build.json',
      path.join(repoRoot, 'node_modules', '.bin', 'tsc'),
      ['-p', 'tsconfig.build.json'],
    );
    // An empty directory, so the page opens on the greenfield form
    // rather than the brownfield one.
    cwd = await mkTempDir('keel-ui-facets-e2e-');
    ui = await startUi(cwd);
    browser = await browserType.launch({
      ...(browserBinary === null ? {} : { executablePath: browserBinary }),
      args: ['--no-sandbox'],
    });
  }, E2E_TIMEOUT_MS);

  afterAll(async () => {
    // Each step guarded, so a failure in one still releases the rest:
    // a surviving `keel ui` holds a port and a node process for the
    // remainder of the run.
    await browser?.close().catch(() => undefined);
    await ui?.stop().catch(() => undefined);
    if (cwd) await fs.remove(cwd).catch(() => undefined);
  }, E2E_TIMEOUT_MS);

  beforeEach(async () => {
    page = await browser.newPage();
    mishaps = [];
    page.on('pageerror', (error) => mishaps.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') mishaps.push(`console.error: ${message.text()}`);
    });
    traffic = watchTraffic(page);
    await page.goto(ui.url, { waitUntil: 'domcontentloaded' });
    await stackIs(page, 'quarkus-cli');
    await act(traffic, () => Promise.resolve());
  });

  /**
   * The "no page errors throughout" claim, asserted where it cannot
   * be forgotten. A `pageerror` mid-interaction usually leaves the
   * form looking right — the throw aborts the *rest* of a listener,
   * not the part that already ran — so a case can pass its own
   * assertions and still have broken the page.
   */
  afterEach(async () => {
    const seen = [...(mishaps ?? [])];
    await page?.close().catch(() => undefined);
    expect(seen).toEqual([]);
  });

  it(
    'opens on the default preset, not on the alphabetically first stack',
    async () => {
      // `fullstack` is first in the catalog and is what a naive
      // `stacks[0]` would land on; the finder's default is what an
      // omitted `--stack` resolves to in a terminal.
      expect(await valueOf(page, 'stack')).toBe('quarkus-cli');
      expect(await valueOf(page, 'language')).toBe('java@jvm');
      expect(await valueOf(page, 'framework')).toBe('quarkus');
      expect(await adapter(page, 'cli').isChecked()).toBe(true);
      expect(await adapter(page, 'server-http').isChecked()).toBe(false);
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'keeps the entrypoints and the framework when the language moves',
    async () => {
      await act(traffic, () => control(page, 'language').selectOption('kotlin@jvm'));
      await stackIs(page, 'quarkus-cli-kotlin');

      // The two facets below the one that moved are the assertion:
      // a form that restarted its drill-down would show micronaut
      // here, the first framework alphabetically.
      expect(await valueOf(page, 'framework')).toBe('quarkus');
      expect(await adapter(page, 'cli').isChecked()).toBe(true);
      expect(await adapter(page, 'server-http').isChecked()).toBe(false);
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'carries a non-default entrypoint set and framework across the language move',
    async () => {
      // The case above moves off the finder's own defaults, where a
      // language change lands on the same preset whether it carried
      // anything or not — dropping the carry-over silently passes it.
      // Moving both facets first is what makes the carry visible.
      await act(traffic, () => adapter(page, 'server-http').click());
      await stackIs(page, 'quarkus-cli-rest');
      await act(traffic, () => control(page, 'framework').selectOption('micronaut'));
      await stackIs(page, 'micronaut-cli-rest');

      await act(traffic, () => control(page, 'language').selectOption('kotlin@jvm'));
      await stackIs(page, 'micronaut-cli-rest-kotlin');

      expect(await valueOf(page, 'framework')).toBe('micronaut');
      expect(await adapter(page, 'cli').isChecked()).toBe(true);
      expect(await adapter(page, 'server-http').isChecked()).toBe(true);
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'composes both entrypoints into one preset, never a two-service product',
    async () => {
      await act(traffic, () => control(page, 'language').selectOption('kotlin@jvm'));
      await stackIs(page, 'quarkus-cli-kotlin');

      await act(traffic, () => adapter(page, 'server-http').click());
      await stackIs(page, 'quarkus-cli-rest-kotlin');

      expect(await adapter(page, 'cli').isChecked()).toBe(true);
      expect(await adapter(page, 'server-http').isChecked()).toBe(true);
      expect(await valueOf(page, 'framework')).toBe('quarkus');
      // One project with two entrypoints, so no repository layout to
      // choose — that control is what a `fullstack` product renders,
      // and its absence is how "not two services" is visible.
      expect(await rendered(page, 'layout')).toBe(false);
      expect(await rendered(page, 'moduleLayout')).toBe(true);
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'refuses to clear the last checked adapter, and snaps the control back',
    async () => {
      await act(traffic, () => adapter(page, 'server-http').click());
      await stackIs(page, 'quarkus-cli-rest');
      await act(traffic, () => adapter(page, 'cli').click());
      await stackIs(page, 'quarkus-rest');

      // A real `.click()`, not `.uncheck()`: Playwright's `uncheck`
      // asserts the box ends up unchecked and would time out here for
      // the very reason this case exists — the handler puts it back.
      await act(traffic, () => adapter(page, 'server-http').click());

      expect(await adapter(page, 'server-http').isChecked()).toBe(true);
      expect(await valueOf(page, 'stack')).toBe('quarkus-rest');
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'drops the framework facet for a language that has no frameworks',
    async () => {
      await act(traffic, () => control(page, 'language').selectOption('go'));
      await stackIs(page, 'go-cli');

      // Go answers the framework question by existing, so the control
      // is gone rather than showing one disabled option.
      expect(await rendered(page, 'framework')).toBe(false);
      expect(await adapter(page, 'cli').isChecked()).toBe(true);
      expect(await adapter(page, 'server-http').count()).toBe(1);
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'drops both narrowing facets for a language that reaches one preset',
    async () => {
      await act(traffic, () => control(page, 'language').selectOption('typescript@browser'));
      await stackIs(page, 'web-components');

      expect(await rendered(page, 'framework')).toBe(false);
      expect(await rendered(page, 'entrypoints')).toBe(false);
      expect(await adapter(page, 'cli').count()).toBe(0);
      expect(await valueOf(page, 'language')).toBe('typescript@browser');
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'shows the product placeholder for a fullstack stack, and comes back out of it',
    async () => {
      await act(traffic, () => control(page, 'stack').selectOption('fullstack'));
      await stackIs(page, 'fullstack');

      // A product names no language, so the language facet has
      // nothing to select and the other two have nothing to narrow.
      expect(await valueOf(page, 'language')).toBe('');
      expect(await control(page, 'language').locator('option').first().textContent()).toContain(
        'fullstack product',
      );
      expect(await rendered(page, 'entrypoints')).toBe(false);
      expect(await rendered(page, 'framework')).toBe(false);
      // …and the control only a product renders is there instead.
      expect(await rendered(page, 'layout')).toBe(true);

      // Picking a language from the placeholder is a legitimate move
      // back into the single-project half. With nothing to carry
      // over, it lands on the language's own defaults.
      await act(traffic, () => control(page, 'language').selectOption('java@jvm'));
      await stackIs(page, 'micronaut-cli');

      expect(await valueOf(page, 'language')).toBe('java@jvm');
      expect(await rendered(page, 'layout')).toBe(false);
      expect(await adapter(page, 'cli').isChecked()).toBe(true);
    },
    E2E_TIMEOUT_MS,
  );
});
