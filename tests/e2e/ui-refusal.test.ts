/**
 * A refusal the engine raises **while the page is being filled in**,
 * driven in a real browser.
 *
 * The engine has one refusal that reaches a front end from the very
 * bottom of the install: `resolveVertical` hard-fails when no adapter
 * covers a dimension, which is what "this Go CLI has nothing to build
 * a container image from" comes out as. It used to escape
 * `installVertical` as a bare `Error`, and a throw is the one thing an
 * HTTP layer can only read as a crash — so `keel ui` answered **500
 * with a bare string** and the page showed `POST /api/preview failed
 * with 500` for a refusal that names both the missing dimension and
 * the tag that would close it.
 *
 * The domain half of that fix is pinned where it belongs — the
 * mediator normalising a thrown `DomainError`
 * (`tests/domain/core/mediator.test.ts`), the refusal arriving as an
 * `Err` (`preview.test.ts`, `add-containerization.test.ts`), the
 * transport mapping an `Err` to 422 (`tests/application/web/api.test.ts`).
 * What none of them can see is the half the user actually meets:
 * whether the page *shows* it. A banner that renders empty, a plan
 * that sits blank beside it, or a Generate button still live over a
 * run the engine has already refused are all page-level facts, and
 * this is the only kind of test that has eyes.
 *
 * **The project is seeded in-process, with every deferred action
 * faked** — the same trick `dev-compose` uses. The page only needs a
 * manifest whose tags cannot carry `containerization`; running `npm
 * install` to get one would buy this suite a minute and no assertion.
 * Measured on the shipped shape that puts it level with
 * `ui-plugin-stack` and at well under half of `ui-stack-finder`,
 * which floors the three — so it costs the `web` shard no wall clock,
 * that shard having its own floor elsewhere.
 *
 * Skip rules are the shared ones (`skipE2E`), and the `describe`
 * carries the browser guard because `beforeAll` launches one.
 */

import path from 'node:path';
import fs from 'fs-extra';
import { chromium as browserType, type Browser, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newProjectCommand } from '../../src/domain/contract/commands.js';
import type { RunActionsInputs } from '../../src/domain/core/actions.js';
import { expectOk, installMediator } from '../support/factory.js';
import { E2E_TIMEOUT_MS, mkTempDir, runStep, skipE2E } from '../support/web-e2e.js';
import {
  act,
  browserBinary,
  control,
  goToStep,
  repoRoot,
  startUi,
  until,
  watchTraffic,
  type Traffic,
  type UiProcess,
} from '../support/ui-e2e.js';

/**
 * A CLI-shaped TypeScript project: no `arch.server-http`, so the
 * `containerization` vertical has no adapter for its `image`
 * dimension and the engine refuses it from the bottom of the install.
 */
const STACK = 'ts-cli';
const REFUSED = 'containerization';

/** Nothing here is testing a toolchain, so no deferred action runs. */
const fakeActions = (inputs: RunActionsInputs): Promise<void> => {
  void inputs;
  return Promise.resolve();
};

let cwd: string;
let ui: UiProcess;
let browser: Browser;
let page: Page;
let traffic: Traffic;
let mishaps: string[];

describe.skipIf(skipE2E() || browserBinary === null)('keel ui — a refusal on the page', () => {
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
    cwd = await mkTempDir('keel-ui-refusal-e2e-');
    // The real engine writes the real manifest, so the tags the page
    // is refused against are the ones a scaffolded project has.
    expectOk(
      await installMediator({ runDeferred: fakeActions }).dispatch(
        newProjectCommand({
          cwd,
          stack: STACK,
          answers: {},
          interactive: false,
          dryRun: false,
          buildSystem: 'npm',
        }),
      ),
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
    traffic = watchTraffic(page);
    await page.goto(ui.url, { waitUntil: 'domcontentloaded' });
    // A manifest is there, so the page opens on the brownfield rail.
    await until(
      async () => (await page.locator('keel-stepper button[data-step="target"]').count()) > 0,
      'the brownfield rail',
    );
    await act(traffic, () => Promise.resolve());
  }, E2E_TIMEOUT_MS);

  /**
   * A `pageerror` mid-interaction usually leaves the page looking
   * right — the throw aborts the *rest* of a listener, not the part
   * that already ran — so a case can pass its own assertions and
   * still have broken the page. Console errors are not collected
   * here: the browser logs its own line for every non-2xx response,
   * and a 422 is exactly what this suite is asking for.
   */
  afterEach(async () => {
    const seen = [...(mishaps ?? [])];
    await page?.close().catch(() => undefined);
    expect(seen).toEqual([]);
  });

  it(
    'shows the domain’s own refusal rather than a transport failure',
    async () => {
      await goToStep(traffic, page, 'target');
      await act(traffic, () => control(page, 'vertical').selectOption(REFUSED));

      const banner = page.locator('[data-role="error"]');
      await until(async () => (await banner.isVisible()) === true, 'the refusal banner');
      // The code is what a client branches on and the message is what
      // a human reads; `keel.web.http-500` and "failed with 500" are
      // neither, and are what this used to say.
      expect(await banner.locator('.code').textContent()).toBe('keel.uncoverable-vertical');
      const text = (await banner.textContent()) ?? '';
      expect(text).toContain('no adapter covers dimension(s): image');
      // The enabler is the actionable half: it says what shape would
      // carry this vertical.
      expect(text).toContain('arch.server-http');
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'explains the empty plan instead of leaving a blank panel beside it',
    async () => {
      await goToStep(traffic, page, 'target');
      await act(traffic, () => control(page, 'vertical').selectOption(REFUSED));

      // A refused run previews nothing, so the tree would otherwise
      // render as an empty box the eye reads as "no changes".
      await until(
        async () =>
          ((await page.locator('keel-plan .tree').textContent()) ?? '').includes('refused'),
        'the plan to say why it is empty',
      );
      expect(await page.locator('keel-plan keel-file-tree').count()).toBe(0);
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'holds Generate shut on the review step, and names the refusal there',
    async () => {
      await goToStep(traffic, page, 'target');
      await act(traffic, () => control(page, 'vertical').selectOption(REFUSED));
      await goToStep(traffic, page, 'review');

      // The review step is the one place a user arrives at *intending*
      // to commit, so it repeats the reason rather than pointing at it.
      const review = (await page.locator('keel-review').textContent()) ?? '';
      expect(review).toContain('Refused:');
      expect(review).toContain('no adapter covers dimension(s): image');
      expect(await page.locator('#generate').isDisabled()).toBe(true);
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'clears the refusal when a vertical this project can carry is chosen',
    async () => {
      await goToStep(traffic, page, 'target');
      await act(traffic, () => control(page, 'vertical').selectOption(REFUSED));
      await until(
        async () => (await page.locator('[data-role="error"]').isVisible()) === true,
        'the refusal banner',
      );

      // The half a "does it show the error?" test misses: a refusal
      // must not be a state the page cannot leave.
      await act(traffic, () => control(page, 'vertical').selectOption('ci'));
      await until(
        async () => (await page.locator('[data-role="error"]').isVisible()) === false,
        'the refusal to clear',
      );
      await until(
        async () => (await page.locator('keel-plan keel-file-tree li').count()) > 0,
        'the plan to come back',
      );
      await goToStep(traffic, page, 'review');
      expect(await page.locator('#generate').isEnabled()).toBe(true);
    },
    E2E_TIMEOUT_MS,
  );
});
