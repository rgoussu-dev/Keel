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
 * has to be parsed rather than assumed.
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
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'fs-extra';
import { chromium as browserType, type Browser, type Locator, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { chromium, E2E_TIMEOUT_MS, mkTempDir, runStep, skipE2E } from '../support/web-e2e.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Where the greenfield form lives; every selector is scoped to it. */
const FORM = 'keel-new-form';

/** Long enough for a cold `tsc` plus a browser launch, short of a hang. */
const SETTLE_MS = 20_000;

/**
 * How long the page must go without touching the network before it
 * counts as settled. Comfortably above `<keel-app>`'s 120 ms preview
 * debounce, so a change that has not yet fired its request cannot be
 * mistaken for one that has already finished.
 */
const QUIET_MS = 400;

/**
 * The probed browser as an **absolute** path, or null.
 *
 * The shared probe answers with a bare command name when it finds one
 * on PATH — `google-chrome` on a GitHub-hosted runner, where no
 * Playwright download layout exists. That is enough for the other
 * browser-driven suites, which hand it to `spawn` and let PATH
 * resolution do the rest; Playwright instead stats `executablePath`
 * against the working directory and refuses a name it cannot find
 * there. Resolving here rather than widening the probe keeps the two
 * consumers honest about what each of them needs.
 */
const browserBinary = ((): string | null => {
  if (chromium === null || path.isAbsolute(chromium)) return chromium;
  const found = spawnSync(process.platform === 'win32' ? 'where' : 'which', [chromium], {
    encoding: 'utf8',
  });
  return found.status === 0 ? (found.stdout.split('\n')[0]?.trim() ?? null) : null;
})();

/* ---- the server under test ------------------------------------- */

/** A running `keel ui`, and how to stop it. */
interface UiProcess {
  /** The address the CLI printed, token and all. */
  readonly url: string;
  stop(): Promise<void>;
}

/**
 * Spawns `keel ui --port 0` in `cwd` and waits for the URL it prints.
 *
 * The regex reads the token out of the line rather than the line's
 * wording: `keel ui: serving on …` is a log message, not a contract,
 * where `?token=` is the thing the page actually depends on.
 */
async function startUi(cwd: string): Promise<UiProcess> {
  const child: ChildProcess = spawn(
    process.execPath,
    [path.join(repoRoot, 'bin', 'keel.js'), 'ui', '--port', '0', '--host', '127.0.0.1'],
    {
      cwd,
      // Chalk would otherwise wrap the URL in escape sequences on a
      // runner that sets FORCE_COLOR for its own output.
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  let output = '';
  child.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString()));
  child.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString()));
  let exited: number | null = null;
  child.once('exit', (code) => (exited = code));

  const stop = (): Promise<void> =>
    new Promise<void>((resolve) => {
      if (exited !== null || child.exitCode !== null) return resolve();
      child.once('exit', () => resolve());
      child.kill();
    });

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const found = /http:\/\/\S+\?token=[A-Za-z0-9_-]+/.exec(output);
    if (found) return { url: found[0], stop };
    if (exited !== null) {
      throw new Error(`keel ui exited before printing a URL (code ${exited})\n${output}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await stop();
  throw new Error(`keel ui never printed a URL\n${output}`);
}

/* ---- driving the page ------------------------------------------ */

/**
 * Waits for `check` to hold, polling rather than sleeping.
 *
 * Every wait here is over a control the form re-creates on each
 * render, so a locator resolved once is stale by the next frame —
 * re-resolving on every poll is what makes these assertions about
 * the rendered state rather than about a node that used to exist.
 */
async function until(check: () => Promise<boolean>, what: string): Promise<void> {
  const deadline = Date.now() + SETTLE_MS;
  for (;;) {
    if (await check()) return;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** Counts the page's requests, so an interaction can wait for quiet. */
interface Traffic {
  /** Marks now as activity, so the quiet window restarts. */
  touch(): void;
  /** Whether nothing is in flight and nothing has happened recently. */
  quiet(): boolean;
}

function watchTraffic(page: Page): Traffic {
  let inFlight = 0;
  let lastAt = Date.now();
  const mark = (delta: number): void => {
    inFlight += delta;
    lastAt = Date.now();
  };
  page.on('request', () => mark(1));
  page.on('requestfinished', () => mark(-1));
  page.on('requestfailed', () => mark(-1));
  return {
    touch: () => (lastAt = Date.now()),
    quiet: () => inFlight === 0 && Date.now() - lastAt > QUIET_MS,
  };
}

/**
 * Performs an interaction and waits for the preview loop to go quiet.
 *
 * `<keel-app>` answers a change twice — synchronously, then again
 * when the debounced preview returns — and the second render replaces
 * the form element. Acting on a control in the window between the two
 * would dispatch its `target-changed` from a node that is about to be
 * detached, and a detached node's event never reaches the app. So
 * every interaction is followed by a quiet window rather than by an
 * assertion alone.
 */
async function act(traffic: Traffic, interaction: () => Promise<unknown>): Promise<void> {
  await interaction();
  traffic.touch();
  await until(() => Promise.resolve(traffic.quiet()), 'the preview loop to go quiet');
}

/**
 * A control of the greenfield form, by the id its facet carries.
 *
 * Not always a `<select>`: the entrypoint facet is a checkbox group
 * whose `id` sits on the caption, which is exactly what makes
 * {@link rendered} the right way to ask whether a facet is on the
 * page at all.
 */
const control = (page: Page, id: string): Locator => page.locator(`${FORM} #${id}`);

/** An entrypoint checkbox, by the adapter id it carries. */
const adapter = (page: Page, id: string): Locator =>
  page.locator(`${FORM} input[type="checkbox"][value="${id}"]`);

/** The value of a `<select>`, or null when the form does not render it. */
async function valueOf(page: Page, id: string): Promise<string | null> {
  try {
    const found = control(page, id);
    return (await found.count()) === 0 ? null : await found.inputValue({ timeout: 1_000 });
  } catch {
    // Replaced between the count and the read; the caller retries.
    return null;
  }
}

/** Waits until the form reports `stack` as the chosen preset. */
const stackIs = (page: Page, stack: string): Promise<void> =>
  until(async () => (await valueOf(page, 'stack')) === stack, `the stack to become ${stack}`);

/**
 * Whether a facet is on the page at all. The narrowing controls drop
 * out where they have nothing to ask, so absence is an assertion.
 */
const rendered = async (page: Page, id: string): Promise<boolean> =>
  (await control(page, id).count()) > 0;

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
