/**
 * `keel ui` opened in a project that ships a keel **plugin**.
 *
 * The claim under test is a negative one, and it is the reason the
 * plugin work needed no change to `keel ui`: the page asks the
 * mediator for `keel.catalog` and renders whatever comes back, so a
 * stack keel never shipped has to appear on the finder's facets, be
 * selectable, and resolve — with nothing in the page, the server, or
 * the query aware that a plugin exists.
 *
 * A page-level suite is the only place that claim can be checked.
 * `tests/plugins/` proves the catalog *contains* the plugin's stack;
 * what it cannot see is a facet built from a language node keel has
 * no label for, a `<select>` whose option set the element rebuilds on
 * every change, or a `pageerror` thrown inside a listener — which
 * leaves the form looking right and silently aborts the rest of that
 * handler.
 *
 * **The whole binary, in a directory with a plugin in it.** The
 * plugin is discovered by the CLI's composition root from its own
 * cwd, so the fixture has to be on disk before `keel ui` starts;
 * nothing here injects a registry. That is the seam being exercised.
 *
 * Rides the `web` shard, which already declares `browser` in
 * `tools:`. Skip rules are the shared ones (`skipE2E`), and the
 * `describe` carries the browser guard because `beforeAll` launches
 * one — an `it`-level guard would leave the hook launching a Chromium
 * that is not there.
 */

import path from 'node:path';
import fs from 'fs-extra';
import { chromium as browserType, type Browser, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { E2E_TIMEOUT_MS, mkTempDir, runStep, skipE2E } from '../support/web-e2e.js';
import {
  act,
  browserBinary,
  control,
  rendered,
  repoRoot,
  stackIs,
  startUi,
  valueOf,
  watchTraffic,
  type Traffic,
  type UiProcess,
} from '../support/ui-e2e.js';
import { PLUGINS_DIR } from '../../src/infrastructure/registry/plugin-loader.js';

/** The fixture's ids, and the language node its tags spell. */
const PLUGIN = 'acme';
const STACK = 'acme-widget';
const LANGUAGE = 'acme';

let cwd: string;
let ui: UiProcess;
let browser: Browser;
let page: Page;
let traffic: Traffic;
let mishaps: string[];

describe.skipIf(skipE2E() || browserBinary === null)('keel ui — a plugin stack on the page', () => {
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
    // Empty but for the plugin, so the page opens on the greenfield
    // form and the CLI finds the plugin where a real project keeps
    // one.
    cwd = await mkTempDir('keel-ui-plugin-e2e-');
    await fs.copy(
      path.join(repoRoot, 'tests', 'support', 'fixtures', 'plugins', PLUGIN),
      path.join(cwd, PLUGINS_DIR, PLUGIN),
    );
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
    // The plugin changes nothing about where the page opens: an
    // omitted `--stack` still resolves to keel's own default.
    await stackIs(page, 'quarkus-cli');
    await act(traffic, () => Promise.resolve());
  }, E2E_TIMEOUT_MS);

  afterEach(async () => {
    const seen = [...(mishaps ?? [])];
    await page?.close().catch(() => undefined);
    expect(seen).toEqual([]);
  });

  it(
    "offers the plugin's language on the finder, beside the shipped ones",
    async () => {
      const languages = await control(page, 'language').locator('option').allTextContents();
      // `lang.acme` is a language nobody labelled, so the node is
      // spelled from the tag itself — which is what "derived, not
      // enumerated" has to mean for a plugin to reach the facet at
      // all.
      expect(languages.join(' ')).toContain(LANGUAGE);
      // Still every shipped language too: registering a plugin adds,
      // it does not replace.
      expect(languages.join(' ')).toContain('Java');
      expect(languages.join(' ')).toContain('Go');
    },
    E2E_TIMEOUT_MS,
  );

  it(
    "resolves the plugin's preset when its language is chosen",
    async () => {
      await act(traffic, () => control(page, 'language').selectOption(LANGUAGE));
      await stackIs(page, STACK);

      // The plugin's stack declares both dials, so the page has to
      // render them — from the descriptor, not from a list of stacks
      // it knows.
      expect(await rendered(page, 'moduleLayout')).toBe(true);
      // One language, one framework: the framework facet answers its
      // question by existing and drops out, exactly as it does for Go.
      expect(await rendered(page, 'framework')).toBe(false);
      // A single project, not a product.
      expect(await rendered(page, 'layout')).toBe(false);
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'reaches the plugin stack by id too, and comes back out to a shipped one',
    async () => {
      await act(traffic, () => control(page, 'stack').selectOption(STACK));
      await stackIs(page, STACK);
      expect(await valueOf(page, 'language')).toBe(LANGUAGE);

      // Out again: a plugin's preset is not a trap the form cannot
      // leave, which is the half a "does it appear?" test misses.
      await act(traffic, () => control(page, 'language').selectOption('go'));
      await stackIs(page, 'go-cli');
      expect(await rendered(page, 'framework')).toBe(false);
    },
    E2E_TIMEOUT_MS,
  );
});
