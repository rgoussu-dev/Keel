/**
 * Composing several verticals into one run, driven in a real browser:
 * the Options step's "Also scaffold" group on an empty directory, and
 * the "What to add" cards on a project already scaffolded.
 *
 * **Greenfield.** The extras used to be a question the preview asked,
 * and the install stops asking a question once it is answered — so
 * the list vanished after the first tick, and the page could post one
 * extra at most and never take it back. They are a control of the
 * Options step now, drawn from `keel.dials`' `verticals`, and a tick
 * is a gesture rather than a field: ticking Infrastructure as code
 * ticks the image and the distribution it needs, unticking the image
 * unticks both. What the preset cannot take is listed too, collapsed,
 * with the reason.
 *
 * **Brownfield.** The cards were one radio group, one vertical per
 * Generate, and half of them on a CLI project a refusal met after the
 * click. They are the same checkboxes now, sorted by what the project
 * status read before anything was clicked: IaC's card says it needs
 * Container image and Distribution, one click ticks all three, and
 * the page makes one plan of them, one Generate, and stays on "What
 * to add" with the report — the next thing to do being to add more,
 * not to pick a directory. On a CLI project, Observability is under
 * "Not for this project" with its sentence before any click.
 *
 * **The harness is a switch.** Under "Comes with", the Agent harness
 * chip is a toggle button: pressed off from the keyboard, the body
 * carries `agentHarness: false`, the command `--no-agent-harness`, the
 * plan no `AGENTS.md` and the review a row saying so; pressed back on,
 * all of it goes again.
 *
 * **A preset move keeps them.** Ticking HTTP on a tuned CLI preset
 * lands on the composed one with the build system, the module layout,
 * the extras and the package still set — the plan redrawn under
 * `org/acme`, from a body that carries them all.
 *
 * Which boxes a gesture moves is pinned without a browser
 * (`tests/application/web/target.test.ts`), what the groups show too
 * (`extras.test.ts`, `additions.test.ts`), and that `keel.dials` then
 * has nothing to add is walked over every shipped preset
 * (`dials.test.ts`). What none of them can see is the page between
 * them: a box that really ticks its neighbours across the re-render
 * every reply causes, the body that actually goes out — **as
 * `watchTraffic` saw it posted**, not as a control claims — the plan
 * redrawn from it, the review saying so, and Generate held shut until
 * the preview of a tick has landed.
 *
 * **One Generate, and not on a JVM stack.** This rides the `web`
 * shard, which provisions a browser and no JDK, and a real
 * quarkus-rest install queues `gradle wrapper` and
 * `./gradlew spotlessApply`. The greenfield claim is about what the
 * page posts, and the plan it posts it for is `keel.preview`'s own;
 * that the order it posts keeps `DB_URL` in `deploy/compose.yaml` is
 * pinned at the domain level, by the composition grid's I8. The one
 * Generate is the brownfield one, on a `ts-http` project seeded
 * in-process with its own deferred actions faked, as `ui-refusal`
 * seeds its: an image, its release path and its infrastructure queue
 * no action there at all, so it needs nothing the shard does not have.
 * The CLI project is seeded the same way and never generated.
 *
 * **A product.** At a composite product's root, "Belongs in a
 * service" opens with a button into each service; the click points
 * the page one directory down, onto that service's "What to add",
 * where what the product gives it is a line and a pipeline — read only
 * at the repository root — is under "Not for this project". Seeded
 * in-process, a TypeScript product, and never generated.
 *
 * Skip rules are the shared ones (`skipE2E`), and each `describe`
 * carries the browser guard because its `beforeAll` launches one.
 */

import path from 'node:path';
import fs from 'fs-extra';
import { chromium as browserType, type Browser, type Locator, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newProjectCommand } from '../../src/domain/contract/commands.js';
import type { RunActionsInputs } from '../../src/domain/core/actions.js';
import { expectOk, installMediator } from '../support/factory.js';
import { E2E_TIMEOUT_MS, mkTempDir, skipE2E } from '../support/web-e2e.js';
import {
  act,
  adapter,
  buildCli,
  browserBinary,
  control,
  goToStep,
  railStep,
  stackIs,
  startUi,
  until,
  valueOf,
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

/** Whether the plan beside the step lists `name` at the project's root. */
const plansAtRoot = async (page: Page, name: string): Promise<boolean> =>
  (await page
    .locator('keel-plan keel-file-tree > ul > li:not(.dir) > .row > .name', {
      hasText: new RegExp(`^${name.replace(/\./g, '\\.')}$`),
    })
    .count()) > 0;

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

/** Whether the plan beside the step has a directory path running through `segment`. */
const plansUnder = async (page: Page, segment: string): Promise<boolean> =>
  ((await page.locator('keel-plan keel-file-tree').textContent()) ?? '').includes(segment);

/** The last body the page posted to `POST /api/preview`. */
const lastBody = (traffic: Traffic): { target?: unknown; answers?: unknown } | undefined => {
  const bodies = traffic.posted('/api/preview') as { target?: unknown; answers?: unknown }[];
  return bodies[bodies.length - 1];
};

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
      // What it cannot take is said, collapsed, rather than left out:
      // nothing is linked here for a gateway to wire.
      const refused = page.locator('#extras-refused');
      expect(await refused.getAttribute('open')).toBeNull();
      expect(await refused.locator('li[data-id="gateway"]').textContent()).toContain(
        'no linked project serves it here',
      );
      expect(await page.locator('#extras input[value="gateway"]').count()).toBe(0);
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
    'leaves the agent harness out from its chip, says so in the command, and puts it back',
    async () => {
      const harness = page.locator('#agentHarness');
      await until(async () => (await harness.count()) > 0, 'the harness switch to render');
      // A chip among what the preset comes with, pressed: it is on.
      expect(
        await page.locator('#extras-included li[data-id="agent-harness"] button').count(),
      ).toBe(1);
      expect(await harness.getAttribute('aria-pressed')).toBe('true');
      expect(await harness.textContent()).toBe('Agent harness');
      await until(() => plansAtRoot(page, 'AGENTS.md'), 'the plan to list AGENTS.md');

      await harness.focus();
      await act(traffic, () => page.keyboard.press('Enter'));
      expect(await harness.getAttribute('aria-pressed')).toBe('false');
      // The focus stays on the switch across the redraw.
      expect(
        await page.evaluate(
          () =>
            (globalThis as { document?: { activeElement?: { id?: string } } }).document
              ?.activeElement?.id ?? null,
        ),
      ).toBe('agentHarness');
      expect(await page.locator('#agentHarness-hint').textContent()).toContain('left out');
      // The body that went out, the line that would run it, and the
      // plan it draws: the project without its agent documents.
      expect((lastBody(traffic)?.target as { agentHarness?: unknown }).agentHarness).toBe(false);
      expect(await command(page)).toContain('--no-agent-harness');
      await until(async () => !(await plansAtRoot(page, 'AGENTS.md')), 'AGENTS.md to leave');
      expect(await plansAtRoot(page, 'build.gradle.kts')).toBe(true);

      await goToStep(traffic, page, 'review');
      const row = page.locator('keel-review dd', { hasText: 'left out' });
      expect(await row.count()).toBe(1);
      await act(traffic, () => row.getByRole('button').click());
      expect(await page.locator('[data-role="step-title"]').textContent()).toBe('Options');

      await act(traffic, () => page.locator('#agentHarness').click());
      expect(await page.locator('#agentHarness').getAttribute('aria-pressed')).toBe('true');
      expect(lastBody(traffic)?.target).not.toHaveProperty('agentHarness');
      expect(await command(page)).not.toContain('--no-agent-harness');
      await until(() => plansAtRoot(page, 'AGENTS.md'), 'AGENTS.md to come back');
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'keeps the dials, the extras and the package when ticking HTTP moves the preset',
    async () => {
      // Tuned on the CLI preset: Maven, the modulith, a pipeline, and
      // the package the project lives under.
      await act(traffic, () => control(page, 'stack').selectOption('quarkus-cli'));
      await stackIs(page, 'quarkus-cli');
      await goToStep(traffic, page, 'options');
      await act(traffic, () => control(page, 'buildSystem').selectOption('maven'));
      await act(traffic, () => control(page, 'moduleLayout').selectOption('modulith'));
      await act(traffic, () => box(page, 'ci').click());
      await goToStep(traffic, page, 'questions');
      const basePackage = control(page, 'q-walking-skeleton-quarkus-cli-bootstrap--basePackage');
      await act(traffic, async () => {
        await basePackage.fill('org.acme');
        await basePackage.blur();
      });
      await until(() => plansUnder(page, 'org/acme'), 'the plan to move under org/acme');

      // Ticking HTTP lands on another preset, which used to start all
      // four over: Gradle, the flat layout, no pipeline, com/example.
      await goToStep(traffic, page, 'entrypoints');
      await act(traffic, () => adapter(page, 'server-http').click());
      await stackIs(page, 'quarkus-cli-rest');
      await until(() => plansUnder(page, 'org/acme'), 'the new preset’s plan under org/acme');
      expect(await plansUnder(page, 'com/example')).toBe(false);
      expect(await page.locator('[data-role="preset-notice"]').count()).toBe(0);

      // The body that went out, not a control describing it.
      expect(lastBody(traffic)?.target).toEqual({
        kind: 'new-project',
        stack: 'quarkus-cli-rest',
        buildSystem: 'maven',
        moduleLayout: 'modulith',
        withPeerContext: false,
        extraVerticals: ['ci'],
      });
      expect(lastBody(traffic)?.answers).toEqual({
        'walking-skeleton/quarkus-cli-bootstrap': { basePackage: 'org.acme' },
      });
      await goToStep(traffic, page, 'options');
      expect(await valueOf(page, 'buildSystem')).toBe('maven');
      expect(await valueOf(page, 'moduleLayout')).toBe('modulith');
      expect(await ticked(page, 'ci')).toBe(true);
      // No Generate: the web shard has no JDK for a real Quarkus install.
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

/* ---- the brownfield half ---------------------------------------- */

/** Nothing here is testing a toolchain, so no deferred action runs while seeding. */
const fakeActions = (inputs: RunActionsInputs): Promise<void> => {
  void inputs;
  return Promise.resolve();
};

/** Scaffolds `stack` into a fresh directory, in-process, and returns it. */
async function seeded(stack: string, buildSystem: string, prefix: string): Promise<string> {
  const dir = await mkTempDir(prefix);
  expectOk(
    await installMediator({ runDeferred: fakeActions }).dispatch(
      newProjectCommand({
        cwd: dir,
        stack,
        answers: {},
        interactive: false,
        dryRun: false,
        buildSystem,
      }),
    ),
  );
  return dir;
}

/** One card's box on the "What to add" step, by the vertical it stands for. */
const card = (page: Page, id: string): Locator => page.locator(`#additions input[value="${id}"]`);

/** Whether a card is drawn ticked right now. */
const cardTicked = async (page: Page, id: string): Promise<boolean> =>
  (await card(page, id).count()) > 0 && (await card(page, id).isChecked());

/** Opens the page on the project `ui` serves and waits for the brownfield rail. */
async function openProject(url: string, into: Page, seen: Traffic): Promise<void> {
  await into.goto(url, { waitUntil: 'domcontentloaded' });
  await until(
    async () => (await into.locator('keel-stepper button[data-step="target"]').count()) > 0,
    'the brownfield rail',
  );
  await act(seen, () => Promise.resolve());
  await goToStep(seen, into, 'target');
}

describe.skipIf(skipE2E() || browserBinary === null)('keel ui — composing an add', () => {
  let project: string;
  let cli: string;
  let projectUi: UiProcess;
  let cliUi: UiProcess;
  let chromium: Browser;
  let tab: Page;
  let seen: Traffic;
  let errors: string[];

  beforeAll(async () => {
    buildCli();
    // An HTTP project, where the one chain of the shipped catalog is
    // there to compose; and a CLI project, where much is not.
    project = await seeded('ts-http', 'npm', 'keel-ui-compose-add-e2e-');
    cli = await seeded('quarkus-cli', 'gradle', 'keel-ui-compose-cli-e2e-');
    [projectUi, cliUi] = await Promise.all([startUi(project), startUi(cli)]);
    chromium = await browserType.launch({
      ...(browserBinary === null ? {} : { executablePath: browserBinary }),
      args: ['--no-sandbox'],
    });
  }, E2E_TIMEOUT_MS);

  afterAll(async () => {
    await chromium?.close().catch(() => undefined);
    await projectUi?.stop().catch(() => undefined);
    await cliUi?.stop().catch(() => undefined);
    if (project) await fs.remove(project).catch(() => undefined);
    if (cli) await fs.remove(cli).catch(() => undefined);
  }, E2E_TIMEOUT_MS);

  beforeEach(async () => {
    tab = await chromium.newPage();
    errors = [];
    tab.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    seen = watchTraffic(tab);
  }, E2E_TIMEOUT_MS);

  afterEach(async () => {
    const found = [...(errors ?? [])];
    await tab?.close().catch(() => undefined);
    expect(found).toEqual([]);
  });

  it(
    'shows what a CLI project cannot carry before any click, each with its sentence',
    async () => {
      await openProject(cliUi.url, tab, seen);
      const refused = tab.locator('#add-refused');
      // Collapsed: it answers a question rather than asking one.
      expect(await refused.getAttribute('open')).toBeNull();
      const observability = refused.locator('li[data-id="observability"]');
      expect(await observability.locator('.refused-title').textContent()).toBe('Observability');
      expect(await observability.textContent()).toContain(
        'Observability needs an entrypoint this project does not have: HTTP server — a REST endpoint',
      );
      expect(await card(tab, 'observability').count()).toBe(0);
      // Before any click: nothing has been previewed to find it out.
      expect(seen.posted('/api/preview')).toEqual([]);
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'ticks what a card needs with it, and makes one plan, one Generate, staying on What to add',
    async () => {
      await openProject(projectUi.url, tab, seen);
      const iac = tab.locator('#add-needs .card', { has: tab.locator('input[value="iac"]') });
      expect(await iac.locator('.badge').textContent()).toBe('needs Container image, Distribution');

      const before = seen.posted('/api/preview').length;
      await act(seen, () => card(tab, 'iac').click());
      for (const id of CHAIN) expect(await cardTicked(tab, id), id).toBe(true);
      expect(await cardTicked(tab, 'ci')).toBe(false);
      // One plan: the whole set, in one body, as it went out.
      const previews = seen.posted('/api/preview') as { target: { verticals?: unknown } }[];
      expect(previews.length - before).toBe(1);
      expect(previews[previews.length - 1]?.target.verticals).toEqual(CHAIN);
      expect(await command(tab)).toBe(`keel add ${CHAIN.join(' ')} --yes`);
      await until(() => plansCompose(tab), 'the plan to list deploy/compose.yaml');

      await goToStep(seen, tab, 'review');
      expect(
        await tab
          .locator('keel-review dd', {
            hasText: 'Container image, Distribution, Infrastructure as code',
          })
          .count(),
      ).toBe(1);
      await until(() => tab.locator('#generate').isEnabled(), 'Generate');
      await act(seen, () => tab.locator('#generate').click());
      await until(
        async () => (await tab.locator('keel-plan [data-role="report"]').isVisible()) === true,
        'the report',
      );

      // One Generate, for the three.
      const installs = seen.posted('/api/install') as { target: { verticals?: unknown } }[];
      expect(installs.map((body) => body.target.verticals)).toEqual([CHAIN]);
      expect(await tab.locator('keel-plan [data-role="report"]').textContent()).toContain(
        `Done — ${CHAIN.join(' ')}`,
      );
      // The page stays where the next thing to do is.
      expect(await tab.locator('[data-role="step-title"]').textContent()).toBe('What to add');
      for (const id of CHAIN) {
        expect(await tab.locator(`#rerender-${id}`).count(), id).toBe(1);
        expect(await card(tab, id).count(), id).toBe(0);
      }
      expect(await fs.pathExists(path.join(project, 'deploy', 'compose.yaml'))).toBe(true);
    },
    E2E_TIMEOUT_MS,
  );
});

/* ---- a product's scopes ----------------------------------------- */

describe.skipIf(skipE2E() || browserBinary === null)('keel ui — a product and its services', () => {
  let product: string;
  let productUi: UiProcess;
  let chromium: Browser;
  let tab: Page;
  let seen: Traffic;
  let errors: string[];

  beforeAll(async () => {
    buildCli();
    // A TypeScript product, so nothing here would need a JDK — and
    // nothing is generated anyway: the claim is where the page goes.
    product = await mkTempDir('keel-ui-compose-product-e2e-');
    expectOk(
      await installMediator({ runDeferred: fakeActions }).dispatch(
        newProjectCommand({
          cwd: product,
          stack: 'fullstack-ts',
          layout: 'monorepo',
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    productUi = await startUi(product);
    chromium = await browserType.launch({
      ...(browserBinary === null ? {} : { executablePath: browserBinary }),
      args: ['--no-sandbox'],
    });
  }, E2E_TIMEOUT_MS);

  afterAll(async () => {
    await chromium?.close().catch(() => undefined);
    await productUi?.stop().catch(() => undefined);
    if (product) await fs.remove(product).catch(() => undefined);
  }, E2E_TIMEOUT_MS);

  beforeEach(async () => {
    tab = await chromium.newPage();
    errors = [];
    tab.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    seen = watchTraffic(tab);
  }, E2E_TIMEOUT_MS);

  afterEach(async () => {
    const found = [...(errors ?? [])];
    await tab?.close().catch(() => undefined);
    expect(found).toEqual([]);
  });

  it(
    'opens a service from the root, where what the product gives it is said, not offered',
    async () => {
      await openProject(productUi.url, tab, seen);
      const elsewhere = tab.locator('#add-elsewhere');
      const services = elsewhere.locator('#add-services button');
      expect(await services.allTextContents()).toEqual([
        'Open backend/ (ts-http · npm)',
        'Open frontend/ (web-components · npm)',
      ]);
      expect(await elsewhere.locator('li[data-id="persistence"]').textContent()).toContain(
        'Persistence belongs to a service, not to the product root — it goes in backend/',
      );

      await act(seen, () => services.first().click());
      await until(
        async () => (await tab.locator('#add-provided').count()) > 0,
        "the backend's What to add",
      );
      expect(await tab.locator('[data-role="step-title"]').textContent()).toBe('What to add');
      expect(await tab.locator('#add-elsewhere').count()).toBe(0);
      expect(
        await tab.locator('#add-provided li[data-id="containerization"]').textContent(),
      ).toContain('Container image is already there: the product root builds it for this service');
      // A pipeline is not offered in a monorepo service: it is said,
      // with why, before any click.
      expect(await card(tab, 'ci').count()).toBe(0);
      expect(await tab.locator('#add-refused li[data-id="ci"]').textContent()).toContain(
        'Continuous integration cannot go in a monorepo service',
      );
      expect(await card(tab, 'persistence').count()).toBe(1);
      expect(seen.posted('/api/install')).toEqual([]);
    },
    E2E_TIMEOUT_MS,
  );
});
