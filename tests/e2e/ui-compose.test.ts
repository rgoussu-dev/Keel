/**
 * The Options step's "Also scaffold" group, driven in a real browser:
 * what a preset takes on top of its own, ticked and unticked.
 *
 * The extras used to be a question the preview asked, and the install
 * stops asking a question once it is answered — so the list vanished
 * after the first tick, and the page could post one extra at most and
 * never take it back. They are a control of the Options step now,
 * drawn from `keel.dials`' `verticals`, and a tick is a gesture rather
 * than a field: ticking Infrastructure as code ticks the image and the
 * distribution it needs, unticking the image unticks both.
 *
 * Which boxes a gesture moves is pinned without a browser
 * (`tests/application/web/target.test.ts`), what the group shows too
 * (`extras.test.ts`), and that `keel.dials` then has nothing to add is
 * walked over every shipped preset (`dials.test.ts`). What none of
 * them can see is the page between them: a box that really ticks its
 * neighbours across the re-render every reply causes, the body that
 * actually goes out — **as `watchTraffic` saw it posted**, not as a
 * control claims — the plan redrawn from it, the review saying so, and
 * Generate held shut until the preview of a tick has landed.
 *
 * **No Generate, deliberately.** This rides the `web` shard, which
 * provisions a browser and no JDK, and a real quarkus-rest install
 * queues `gradle wrapper` and `./gradlew spotlessApply`. Nothing here
 * needs one: the claim is about what the page posts, and the plan it
 * posts it for is `keel.preview`'s own. That the order the page posts
 * is the one that keeps `DB_URL` in `deploy/compose.yaml` is pinned at
 * the domain level, by the composition grid's I8.
 *
 * Skip rules are the shared ones (`skipE2E`), and the `describe`
 * carries the browser guard because `beforeAll` launches one.
 */

import fs from 'fs-extra';
import { chromium as browserType, type Browser, type Locator, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { E2E_TIMEOUT_MS, mkTempDir, skipE2E } from '../support/web-e2e.js';
import {
  act,
  buildCli,
  browserBinary,
  control,
  goToStep,
  railStep,
  stackIs,
  startUi,
  until,
  watchTraffic,
  type Traffic,
  type UiProcess,
} from '../support/ui-e2e.js';

/** A preset whose extras hold the shipped catalog's one chain. */
const STACK = 'quarkus-rest';
/** Infrastructure as code needs a distribution, which needs an image. */
const CHAIN = ['containerization', 'distribution', 'iac'];

/** One "Also scaffold" box, by the vertical it stands for. */
const box = (page: Page, id: string): Locator => page.locator(`#extras input[value="${id}"]`);

/** Whether a box is drawn ticked right now. */
const ticked = async (page: Page, id: string): Promise<boolean> =>
  (await box(page, id).count()) > 0 && (await box(page, id).isChecked());

/** The extras of the last body the page posted to `POST /api/preview`. */
const lastPreviewed = (traffic: Traffic): unknown => {
  const bodies = traffic.posted('/api/preview') as { target?: { extraVerticals?: unknown } }[];
  return bodies[bodies.length - 1]?.target?.extraVerticals;
};

/** Whether the plan beside the step lists `deploy/compose.yaml`. */
const plansCompose = async (page: Page): Promise<boolean> =>
  (await page
    .locator('keel-plan keel-file-tree li.dir')
    .filter({ has: page.locator(':scope > .row .name', { hasText: /^deploy\/$/ }) })
    .locator('li .name', { hasText: /^compose\.yaml$/ })
    .count()) > 0;

/** The copyable command, which is derived from the body the page posts. */
const command = async (page: Page): Promise<string> =>
  ((await page.locator('keel-plan [data-role="cli-text"]').textContent()) ?? '')
    .replace(/\s+/g, ' ')
    .trim();

let cwd: string;
let ui: UiProcess;
let browser: Browser;
let page: Page;
let traffic: Traffic;
let mishaps: string[];

describe.skipIf(skipE2E() || browserBinary === null)('keel ui — composing extras', () => {
  beforeAll(async () => {
    // Compiled rather than assumed, so this suite tests the command
    // and not a stale artefact of whatever ran last — and claimed
    // rather than repeated, because the `keel ui` suites run in
    // parallel and several `tsc` runs into one `dist/` is a torn read
    // waiting to happen. See `buildCli`.
    buildCli();
    // Empty, so the page opens on the greenfield rail.
    cwd = await mkTempDir('keel-ui-compose-e2e-');
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
    await act(traffic, () => control(page, 'stack').selectOption(STACK));
    await stackIs(page, STACK);
    await goToStep(traffic, page, 'options');
  }, E2E_TIMEOUT_MS);

  /**
   * A `pageerror` mid-interaction usually leaves the page looking
   * right — the throw aborts the *rest* of a listener, not the part
   * that already ran — so a case can pass its own assertions and still
   * have broken the page.
   */
  afterEach(async () => {
    const seen = [...(mishaps ?? [])];
    await page?.close().catch(() => undefined);
    expect(seen).toEqual([]);
  });

  it(
    'sorts the extras into ready, needing another first, and coming with the preset',
    async () => {
      await until(async () => (await box(page, 'ci').count()) > 0, 'the extras to render');
      expect(await page.locator('#extras-ready input[value="containerization"]').count()).toBe(1);
      const iac = page.locator('#extras-needs .card', {
        has: page.locator('input[value="iac"]'),
      });
      expect(await iac.locator('.badge').textContent()).toBe('needs Container image, Distribution');
      // What the preset already installs is a chip, not a box: there
      // is nothing to untick.
      const included = page.locator('#extras-included li');
      expect(await included.allTextContents()).toContain('Observability');
      expect(await page.locator('#extras input[value="observability"]').count()).toBe(0);
      // Nothing is ticked yet, and the body says so rather than leaving
      // the question open for the preview to ask.
      expect(lastPreviewed(traffic)).toEqual([]);
      expect(await page.locator('#q-extraVerticals').count()).toBe(0);
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'ticks what a vertical needs with it, and posts the whole set in the order it installs',
    async () => {
      await act(traffic, () => box(page, 'iac').click());
      for (const id of CHAIN) expect(await ticked(page, id), id).toBe(true);
      expect(await ticked(page, 'ci')).toBe(false);

      // The body that went out, not a control describing it: the
      // closure, image first.
      expect(lastPreviewed(traffic)).toEqual(CHAIN);
      expect(await command(page)).toContain(`--with ${CHAIN.join(',')}`);
      await until(() => plansCompose(page), 'the plan to list deploy/compose.yaml');
      // The group stays, so the next tick is one click away — the
      // question it replaced vanished after its first answer.
      expect(await box(page, 'ci').count()).toBe(1);
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'unticks every vertical that needs the box unticked',
    async () => {
      await act(traffic, () => box(page, 'iac').click());
      await act(traffic, () => box(page, 'containerization').click());
      for (const id of CHAIN) expect(await ticked(page, id), id).toBe(false);
      expect(lastPreviewed(traffic)).toEqual([]);
      expect(await plansCompose(page)).toBe(false);
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'keeps the focus on a box ticked from the keyboard, across the redraw',
    async () => {
      await box(page, 'ci').focus();
      await act(traffic, () => page.keyboard.press('Space'));
      expect(await ticked(page, 'ci')).toBe(true);
      expect(
        await page.evaluate(() => {
          const active = (globalThis as { document?: { activeElement?: { value?: string } } })
            .document?.activeElement;
          return active?.value ?? null;
        }),
      ).toBe('ci');
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'lists the extras on the review, with a way back to them',
    async () => {
      await act(traffic, () => box(page, 'iac').click());
      await goToStep(traffic, page, 'review');
      const row = page.locator('keel-review dd', {
        hasText: 'Container image, Distribution, Infrastructure as code',
      });
      expect(await row.count()).toBe(1);
      // Every question is on its default, and the row says so rather
      // than calling each one answered.
      const questions = page.locator('keel-review dd', { hasText: 'answered' });
      expect(await questions.textContent()).toMatch(/^0 answered, \d+ on (its|their) defaults?/);
      // No Generate: the web shard has no JDK for a real Quarkus
      // install. The button is live, which is all this suite claims.
      expect(await page.locator('#generate').isEnabled()).toBe(true);

      await act(traffic, () => row.getByRole('button').click());
      expect(await page.locator('[data-role="step-title"]').textContent()).toBe('Options');
      for (const id of CHAIN) expect(await ticked(page, id), id).toBe(true);
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'holds Generate shut from a tick until the preview of it lands',
    async () => {
      // The preview is what prunes the answers to the ones its plan
      // asks, so a body posted between a tick and its preview would
      // carry what the last plan approved for a run that is gone. The
      // preview is held here, so that window stays open to look at.
      let release = (): void => undefined;
      const held = new Promise<void>((resolve) => (release = resolve));
      let sent = false;
      await page.route(
        (url) => url.pathname === '/api/preview',
        async (route) => {
          sent = true;
          await held;
          await route.continue();
        },
      );
      await box(page, 'ci').click();
      await until(() => Promise.resolve(sent), 'the preview of the tick to be sent');
      await railStep(page, 'review').click();
      await until(
        async () => (await page.locator('[data-role="step-title"]').textContent()) === 'Review',
        'the review step to render',
      );
      expect(await page.locator('#generate').isDisabled()).toBe(true);
      expect(await page.locator('keel-review').textContent()).toContain('Waiting for the plan');

      release();
      await until(() => page.locator('#generate').isEnabled(), 'Generate once the plan lands');
    },
    E2E_TIMEOUT_MS,
  );
});
