/**
 * The `keel ui` stepper, driven in a real browser.
 *
 * The page asks the same four narrowing questions the `keel new`
 * wizard does — what you are building, the language, the framework,
 * the way in — one step at a time. Their narrowing is already
 * unit-tested (`tests/application/web/finder.test.ts`), which steps
 * exist is unit-tested next to it (`steps.test.ts`), and the tree
 * they walk is tested where it is built
 * (`tests/domain/core/handlers/catalog.test.ts`). What none of them
 * can see is the part that lives between: an element that renders the
 * tree into controls, re-renders on every move, and has to keep a
 * choice across a re-render rather than snap the wizard back to its
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
 * suite that minted its own would prove the router accepts a token it
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

import fs from 'fs-extra';
import { chromium as browserType, type Browser, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { E2E_TIMEOUT_MS, mkTempDir, skipE2E } from '../support/web-e2e.js';
import {
  act,
  buildCli,
  adapter,
  browserBinary,
  choice,
  control,
  goToStep,
  hasStep,
  picked,
  railSteps,
  rendered,
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

describe.skipIf(skipE2E() || browserBinary === null)('keel ui — the guided stepper', () => {
  beforeAll(async () => {
    // Compiled rather than assumed, so this suite tests the command
    // and not a stale artefact of whatever ran last — and claimed
    // rather than repeated, because three `keel ui` suites run in
    // parallel and three `tsc` runs into one `dist/` is a torn read
    // waiting to happen. See `buildCli`.
    buildCli();
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
    'opens on the default preset, on the first step, with the whole rail drawn',
    async () => {
      // `fullstack` is first in the catalog and is what a naive
      // `stacks[0]` would land on; the finder's default is what an
      // omitted `--stack` resolves to in a terminal.
      expect(await valueOf(page, 'stack')).toBe('quarkus-cli');
      expect(await railSteps(page)).toEqual([
        'directory',
        'shape',
        'language',
        'framework',
        'entrypoints',
        'options',
        'questions',
        'review',
      ]);
      // Step one is where the run starts, and the plan is already on
      // screen beside it — the whole reason this page beats a flag.
      expect(await page.locator('[data-role="step-title"]').textContent()).toBe('Directory');
      expect(await page.locator('keel-file-tree li').count()).toBeGreaterThan(0);
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'walks the four narrowing steps and shows what each one settled',
    async () => {
      await goToStep(traffic, page, 'shape');
      expect(await picked(page, 'shape', 'backend')).toBe(true);
      await goToStep(traffic, page, 'language');
      expect(await picked(page, 'language', 'java@jvm')).toBe(true);
      await goToStep(traffic, page, 'framework');
      expect(await picked(page, 'framework', 'quarkus')).toBe(true);
      await goToStep(traffic, page, 'entrypoints');
      expect(await adapter(page, 'cli').isChecked()).toBe(true);
      expect(await adapter(page, 'server-http').isChecked()).toBe(false);
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'keeps the language and framework when the shape moves to a product',
    async () => {
      await goToStep(traffic, page, 'framework');
      await act(traffic, () => choice(page, 'framework', 'spring').check());
      await stackIs(page, 'spring-cli');

      await goToStep(traffic, page, 'shape');
      await act(traffic, () => choice(page, 'shape', 'fullstack').check());
      // Java + Spring carried across; the entrypoints could not, a
      // product having its own.
      await stackIs(page, 'fullstack-spring');

      // A product is two services, so the repository-layout dial is
      // there and the adapters step is not.
      expect(await hasStep(page, 'entrypoints')).toBe(false);
      await goToStep(traffic, page, 'options');
      expect(await rendered(page, 'layout')).toBe(true);
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'keeps the entrypoints and the framework when the language moves',
    async () => {
      await goToStep(traffic, page, 'language');
      await act(traffic, () => choice(page, 'language', 'kotlin@jvm').check());
      await stackIs(page, 'quarkus-cli-kotlin');

      // The two steps below the one that moved are the assertion: a
      // wizard that restarted its drill-down would show micronaut
      // here, the first framework alphabetically.
      await goToStep(traffic, page, 'framework');
      expect(await picked(page, 'framework', 'quarkus')).toBe(true);
      await goToStep(traffic, page, 'entrypoints');
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
      // Moving both steps first is what makes the carry visible.
      await goToStep(traffic, page, 'entrypoints');
      await act(traffic, () => adapter(page, 'server-http').click());
      await stackIs(page, 'quarkus-cli-rest');
      await goToStep(traffic, page, 'framework');
      await act(traffic, () => choice(page, 'framework', 'micronaut').check());
      await stackIs(page, 'micronaut-cli-rest');

      await goToStep(traffic, page, 'language');
      await act(traffic, () => choice(page, 'language', 'kotlin@jvm').check());
      await stackIs(page, 'micronaut-cli-rest-kotlin');

      await goToStep(traffic, page, 'framework');
      expect(await picked(page, 'framework', 'micronaut')).toBe(true);
      await goToStep(traffic, page, 'entrypoints');
      expect(await adapter(page, 'cli').isChecked()).toBe(true);
      expect(await adapter(page, 'server-http').isChecked()).toBe(true);
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'composes both entrypoints into one preset, never a two-service product',
    async () => {
      await goToStep(traffic, page, 'language');
      await act(traffic, () => choice(page, 'language', 'kotlin@jvm').check());
      await stackIs(page, 'quarkus-cli-kotlin');

      await goToStep(traffic, page, 'entrypoints');
      await act(traffic, () => adapter(page, 'server-http').click());
      await stackIs(page, 'quarkus-cli-rest-kotlin');

      expect(await adapter(page, 'cli').isChecked()).toBe(true);
      expect(await adapter(page, 'server-http').isChecked()).toBe(true);
      // One project with two entrypoints, so no repository layout to
      // choose — that control is what a `fullstack` product renders,
      // and its absence is how "not two services" is visible.
      await goToStep(traffic, page, 'options');
      expect(await rendered(page, 'layout')).toBe(false);
      expect(await rendered(page, 'moduleLayout')).toBe(true);
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'refuses to clear the last checked adapter, and snaps the control back',
    async () => {
      await goToStep(traffic, page, 'entrypoints');
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
    'drops the framework step for a language that has no frameworks',
    async () => {
      await goToStep(traffic, page, 'language');
      await act(traffic, () => choice(page, 'language', 'go').check());
      await stackIs(page, 'go-cli');

      // Go answers the framework question by existing, so the step is
      // gone rather than showing one disabled option — and the rail is
      // one shorter for it.
      expect(await hasStep(page, 'framework')).toBe(false);
      expect(await hasStep(page, 'entrypoints')).toBe(true);
      await goToStep(traffic, page, 'entrypoints');
      expect(await adapter(page, 'cli').isChecked()).toBe(true);
      expect(await adapter(page, 'server-http').count()).toBe(1);
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'asks a frontend nothing past the shape, there being one preset under it',
    async () => {
      await goToStep(traffic, page, 'shape');
      await act(traffic, () => choice(page, 'shape', 'frontend').check());
      await stackIs(page, 'web-components');

      expect(await railSteps(page)).toEqual([
        'directory',
        'shape',
        'options',
        'questions',
        'review',
      ]);
      expect(await hasStep(page, 'language')).toBe(false);
      expect(await hasStep(page, 'entrypoints')).toBe(false);
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'moves back onto the nearest surviving step when one vanishes underneath',
    async () => {
      // Standing on Framework and picking a language that has none is
      // a step back to Language, not a trip to the start.
      await goToStep(traffic, page, 'framework');
      await goToStep(traffic, page, 'language');
      await act(traffic, () => choice(page, 'language', 'rust').check());
      await stackIs(page, 'rust-cli');
      expect(await page.locator('[data-role="step-title"]').textContent()).toBe('Language');
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'walks Back and Next through the rail one step at a time',
    async () => {
      await act(traffic, () => page.locator('[data-role="next"]').click());
      expect(await page.locator('[data-role="step-title"]').textContent()).toBe('What to build');
      await act(traffic, () => page.locator('[data-role="next"]').click());
      expect(await page.locator('[data-role="step-title"]').textContent()).toBe('Language');
      await act(traffic, () => page.locator('[data-role="back"]').click());
      expect(await page.locator('[data-role="step-title"]').textContent()).toBe('What to build');
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'ends on a review that lists the choices and can jump back to any of them',
    async () => {
      await goToStep(traffic, page, 'review');
      const summary = await page.locator('keel-review .summary').textContent();
      expect(summary).toContain('quarkus-cli');
      expect(summary).toContain('Java');
      expect(summary).toContain('quarkus');
      // The plan is ready, so the one button that writes anything is
      // live — and it is the only one on the page.
      expect(await page.locator('#generate').isEnabled()).toBe(true);

      await act(traffic, () =>
        page.locator('keel-review dd', { hasText: 'Java' }).getByRole('button').click(),
      );
      expect(await page.locator('[data-role="step-title"]').textContent()).toBe('Language');
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'reaches a preset by id from the picker above the rail, and back out again',
    async () => {
      await act(traffic, () => control(page, 'stack').selectOption('fullstack'));
      await stackIs(page, 'fullstack');

      await goToStep(traffic, page, 'shape');
      expect(await picked(page, 'shape', 'fullstack')).toBe(true);
      // …and the control only a product renders is there.
      await goToStep(traffic, page, 'options');
      expect(await rendered(page, 'layout')).toBe(true);

      // Out again: picking a shape is a legitimate move back into the
      // single-project half, and the half of the product's entrypoints
      // a backend can still take comes with it.
      await goToStep(traffic, page, 'shape');
      await act(traffic, () => choice(page, 'shape', 'backend').check());
      await stackIs(page, 'quarkus-rest');
      await goToStep(traffic, page, 'options');
      expect(await rendered(page, 'layout')).toBe(false);
    },
    E2E_TIMEOUT_MS,
  );
});
