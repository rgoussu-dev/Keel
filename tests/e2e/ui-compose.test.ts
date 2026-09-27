/**
 * Composing several verticals into one run, driven in a real browser:
 * the Options step's "Also scaffold" group, on an empty directory and
 * on a project already scaffolded — one page, one group, for both
 * phases.
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
 * **Brownfield.** A keel project had a step of its own, "What to add",
 * beside a new project's Options — one radio group, one vertical per
 * Generate, and half of them on a CLI project a refusal met after the
 * click. The directory decides the flow now: the page opens a keel
 * project on its Options, where the preset steps have collapsed into
 * one Project step, read-only but for the entrypoint the project can
 * grow, and the same "Also scaffold" group holds what the project has,
 * ticked and locked, beside the boxes sorted by what the project status
 * read before anything was clicked. A tick posts only what it adds.
 * IaC's card says it needs Container image and Distribution, one click
 * ticks all three, and the page makes one plan of them, one Generate,
 * and stays on Options with the report — the three now among what is
 * locked, the next thing to do being to add more, not to pick a
 * directory. On a CLI project, Observability is under "After adding
 * HTTP server" before any click, beside the button that adds the
 * server — which brings it along.
 *
 * **The harness is a switch.** Under "Comes with", the Agent harness
 * chip is a toggle button: pressed off from the keyboard, the body
 * carries `agentHarness: false`, the command `--no-agent-harness`, the
 * plan no `AGENTS.md` and the review a row saying so; pressed back on,
 * all of it goes again.
 *
 * **A product's are its services'.** On `fullstack` each service has a
 * group of its own, read over the scope the product scaffolds it in —
 * persistence ticks in the backend's, is refused in the front end's,
 * and a pipeline is not for either monorepo service — and a tick goes
 * out as that service's (`services`), `--with backend:persistence` on
 * the command line. Never generated: the backend is a JVM one.
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
 * **A product.** At a composite product's root, what its services
 * have is locked under "In its services", naming them, rather than
 * refused; "Belongs in a service" opens with a button into each
 * service; the click points the page one directory down, onto that
 * service's Options, where what the product gives it is locked with
 * where it comes from and a pipeline — read only at the repository
 * root — is under "Not for this project", and the entrypoint the
 * service lacks is not offered, its tab off with the reason. Seeded
 * in-process, a TypeScript product, and never generated.
 *
 * Skip rules are the shared ones (`skipE2E`), and each `describe`
 * carries the browser guard because its `beforeAll` launches one.
 */

import path from 'node:path';
import fs from 'fs-extra';
import { chromium as browserType, type Browser, type Locator, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  installCommandFor,
  newProjectCommand,
  type InstallTarget,
  type PresetAnswers,
} from '../../src/domain/contract/commands.js';
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
  railSteps,
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
    'keeps the focus on the preset picker moved from the keyboard, and on a text answer tabbed out of',
    async () => {
      const activeId = (): Promise<string | null> =>
        page.evaluate(() => {
          const active = (globalThis as { document?: { activeElement?: { id?: string } } }).document
            ?.activeElement;
          return active?.id ?? null;
        });
      // ArrowDown on a select is a change, and a change moves the
      // target: the picker used to be rebuilt under the keystroke.
      await control(page, 'stack').focus();
      const before = await valueOf(page, 'stack');
      await act(traffic, () => page.keyboard.press('ArrowDown'));
      expect(await valueOf(page, 'stack')).not.toBe(before);
      expect(await activeId()).toBe('stack');
      await act(traffic, () => control(page, 'stack').selectOption(before ?? ''));

      // Tab out of a text answer commits it, and used to rebuild the
      // list it was typed in before the focus could move on.
      await goToStep(traffic, page, 'questions');
      const text = page.locator('keel-question-list input[type="text"]').first();
      await until(async () => (await text.count()) > 0, 'a text question');
      const typed = await text.getAttribute('id');
      await text.fill('org.x');
      await page.keyboard.press('Tab');
      const focused = await activeId();
      expect(focused).not.toBeNull();
      expect(focused).not.toBe('');
      expect(focused).not.toBe(typed);
      await act(traffic, () => Promise.resolve());
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
    'gives each service of a product its own group, and posts a tick under that service',
    async () => {
      await act(traffic, () => control(page, 'stack').selectOption('fullstack'));
      await stackIs(page, 'fullstack');
      await goToStep(traffic, page, 'options');
      const backend = (id: string): Locator => page.locator(`#extras-backend input[value="${id}"]`);
      await until(async () => (await backend('persistence').count()) > 0, 'the backend group');
      // The front end cannot take persistence, and says so in its own
      // group; neither service offers a pipeline in a monorepo, whose
      // place is the product root.
      expect(await page.locator('#extras-frontend input[value="persistence"]').count()).toBe(0);
      expect(await page.locator('#extras-frontend-refused li[data-id="persistence"]').count()).toBe(
        1,
      );
      // …naming the service that can, as `keel new` refuses the pair.
      expect(
        await page.locator('#extras-frontend-refused li[data-id="persistence"]').textContent(),
      ).toContain("Persistence has no adapter for this project's stack; backend/ can take it");
      expect(
        await page.locator('#extras-backend-refused li[data-id="ci"]').textContent(),
      ).toContain('cannot go in a monorepo service');
      expect(
        await page.locator('#extras-backend-included li[data-id="containerization"]').count(),
      ).toBe(1);

      await act(traffic, () => backend('persistence').click());
      expect(await backend('persistence').isChecked()).toBe(true);
      // The body that went out names the service, and the command the
      // pair `--with` takes it as.
      const target = lastBody(traffic)?.target as { services?: unknown; extraVerticals?: unknown };
      expect(target.services).toEqual({ backend: { extraVerticals: ['persistence'] } });
      expect(target.extraVerticals).toBeUndefined();
      expect(await command(page)).toContain('--with backend:persistence');
      await until(() => plansUnder(page, 'migrations'), 'the plan to list the migrations');

      await goToStep(traffic, page, 'review');
      expect(
        await page.locator('keel-review dd', { hasText: 'Persistence in backend/' }).count(),
      ).toBe(1);
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
      expect(await page.locator('[data-role="preset-notice"]').textContent()).toBe('');

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

/**
 * A box of a keel project's "Also scaffold" group that still ticks, by
 * the vertical it stands for — never one of what the project has.
 */
const card = (page: Page, id: string): Locator =>
  page.locator(`#extras-ready input[value="${id}"], #extras-needs input[value="${id}"]`);

/** A box of what a keel project has: ticked, and locked. */
const locked = (page: Page, id: string): Locator =>
  page.locator(`#extras-installed input[value="${id}"]`);

/** Whether a card is drawn ticked right now. */
const cardTicked = async (page: Page, id: string): Promise<boolean> =>
  (await card(page, id).count()) > 0 && (await card(page, id).isChecked());

/** Opens the page on the project `ui` serves and waits for a keel project's rail. */
async function openProject(url: string, into: Page, seen: Traffic): Promise<void> {
  await into.goto(url, { waitUntil: 'domcontentloaded' });
  await until(
    async () => (await into.locator('keel-stepper button[data-step="project"]').count()) > 0,
    "a keel project's rail",
  );
  await act(seen, () => Promise.resolve());
  await goToStep(seen, into, 'options');
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
    'opens a keel project on Options, what it has ticked and locked, and previews only what a tick adds',
    async () => {
      await tab.goto(projectUi.url, { waitUntil: 'domcontentloaded' });
      await until(
        async () => (await tab.locator('[data-role="step-title"]').textContent()) === 'Options',
        'the page to open on Options',
      );
      await act(seen, () => Promise.resolve());
      // One page: the directory decided the flow, and the preset steps
      // are one step on this rail, read-only but for its ways in.
      expect(await railSteps(tab)).toEqual([
        'directory',
        'project',
        'options',
        'questions',
        'review',
      ]);
      // What the project has sits in the same group, ticked for good,
      // each vertical with a Re-render of its own.
      for (const id of ['vcs', 'walking-skeleton', 'observability']) {
        expect(await locked(tab, id).isChecked(), id).toBe(true);
        expect(await locked(tab, id).isDisabled(), id).toBe(true);
        expect(await tab.locator(`#rerender-${id}`).count(), id).toBe(1);
        expect(await card(tab, id).count(), id).toBe(0);
      }
      expect(await tab.locator('#extras-title').textContent()).toBe('Also scaffold');
      // Nothing ticked yet, so nothing to preview.
      expect(seen.posted('/api/preview')).toEqual([]);

      await act(seen, () => card(tab, 'ci').click());
      // The body that went out is the delta, and only it.
      const previews = seen.posted('/api/preview') as { target: unknown }[];
      expect(previews[previews.length - 1]?.target).toEqual({
        kind: 'add-vertical',
        verticals: ['ci'],
      });
      expect(await command(tab)).toBe('keel add ci --yes');
      await until(
        async () => (await tab.locator('keel-plan keel-file-tree li').count()) > 0,
        'the plan of the tick',
      );
      expect(await locked(tab, 'vcs').isChecked()).toBe(true);

      // What the project is, where a new one's preset steps would ask
      // it: words, not tags, and nothing to change but its ways in.
      await goToStep(seen, tab, 'project');
      const profile = tab.locator('#project-profile');
      expect(await profile.locator('dt').allTextContents()).toEqual([
        'Preset',
        'Building',
        'Language',
        'Adapters',
        'Build system',
        'Module layout',
      ]);
      expect(await profile.locator('dd > span').allTextContents()).toEqual([
        'ts-http',
        'Backend or tool',
        'TypeScript (Node)',
        'HTTP server',
        'npm',
        'basic',
      ]);
      expect(await tab.locator('#project-installed li[data-id="vcs"]').textContent()).toBe(
        'Version control',
      );
      // The one control on the step: the CLI the project can grow, on
      // the line that says what its ways in are.
      const controls = tab.locator(
        'keel-add-form input, keel-add-form select, keel-add-form button',
      );
      expect(await controls.count()).toBe(1);
      const offer = profile.locator('dd', { hasText: 'HTTP server' }).getByRole('button');
      expect(await offer.textContent()).toBe('Add CLI');
      expect(await offer.getAttribute('title')).toBe('keel add entrypoint cli');
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'stays on the directory moved to last, whatever answers late, and keeps no other’s project',
    async () => {
      await openProject(projectUi.url, tab, seen);
      const moveTo = async (dir: string): Promise<void> => {
        const input = tab.locator('keel-target-picker .path-input');
        if ((await input.count()) === 0) await goToStep(seen, tab, 'directory');
        await tab.locator('keel-target-picker .path-input').fill(dir);
        await tab.locator('keel-target-picker .path-input').press('Enter');
      };
      // The CLI project's status answers late: the page moves on to the
      // HTTP project before it lands.
      let release = (): void => undefined;
      const held = new Promise<void>((resolve) => (release = resolve));
      let asked = false;
      await tab.route(
        (url) => url.pathname === '/api/project' && url.searchParams.get('path') === cli,
        async (route) => {
          asked = true;
          await held;
          await route.continue();
        },
      );
      await moveTo(cli);
      await until(() => Promise.resolve(asked), "the CLI project's status to be asked");
      // Not through `act`: the network cannot go quiet while the CLI
      // project's status is held.
      await moveTo(project);
      await until(
        async () => (await tab.locator('keel-target-picker .path-input').inputValue()) === project,
        'the move to the HTTP project to land',
      );
      release();
      await act(seen, () => Promise.resolve());

      // The reply that came last was about a directory the page had
      // left: the page is the HTTP project's, through and through.
      expect(await tab.locator('keel-target-picker .path-input').inputValue()).toBe(project);
      await goToStep(seen, tab, 'project');
      expect(await tab.locator('#project-profile dd').first().textContent()).toBe('ts-http');
      await goToStep(seen, tab, 'review');
      expect(await tab.locator('keel-review').textContent()).toContain(project);
      expect(await tab.locator('keel-review').textContent()).not.toContain(cli);

      // A directory that cannot be read leaves nothing of the last one
      // to post to it: no project, no card, no plan.
      const broken = await mkTempDir('keel-ui-compose-broken-e2e-');
      try {
        await fs.outputFile(path.join(broken, '.claude', '.keel-manifest.json'), '{ not json');
        await act(seen, () => moveTo(broken));
        expect(await tab.locator('[data-role="step-title"]').textContent()).toBe('Directory');
        expect(await tab.locator('keel-plan [data-role="refusal"]').isHidden()).toBe(false);
        expect(await railSteps(tab)).not.toContain('project');
        const before = seen.posted('/api/preview').length;
        await act(seen, () => railStep(tab, 'review').click());
        expect(seen.posted('/api/preview')).toHaveLength(before);
        expect(await tab.locator('keel-add-form').count()).toBe(0);
      } finally {
        await fs.remove(broken);
      }
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'reviews the answers an add will post, as a new project’s review does',
    async () => {
      await openProject(projectUi.url, tab, seen);
      await act(seen, () => card(tab, 'persistence').click());
      await goToStep(seen, tab, 'questions');
      const migrations = tab.locator('keel-question-list select[id$="--migrations"]');
      await until(async () => (await migrations.count()) > 0, 'the migrations question');
      await act(seen, () => migrations.selectOption('liquibase'));
      await goToStep(seen, tab, 'review');
      const review = tab.locator('keel-review');
      expect(await review.textContent()).toContain('Questions');
      expect(await review.textContent()).toMatch(/1 answered/);
      expect(await command(tab)).toContain(
        '--set persistence/database-compose:migrations=liquibase',
      );
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'shows what only the server a CLI project can grow stops before any click, under that action',
    async () => {
      await openProject(cliUi.url, tab, seen);
      // Not "not for this project": for it, one command away.
      expect(await tab.locator('#extras-refused').count()).toBe(0);
      const grow = tab.locator('#extras-grow-http');
      expect(await grow.locator('h4').textContent()).toBe('After adding HTTP server');
      expect(await grow.locator('#grow-http').textContent()).toBe('Add HTTP server');
      const observability = grow.locator('li[data-id="observability"]');
      expect(await observability.locator('.refused-title').textContent()).toBe('Observability');
      expect(await observability.textContent()).toContain('Comes with it.');
      expect(await grow.locator('li[data-id="persistence"]').textContent()).toContain(
        'Added after it.',
      );
      expect(await card(tab, 'observability').count()).toBe(0);
      // Before any click: nothing has been previewed to find it out.
      expect(seen.posted('/api/preview')).toEqual([]);
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'ticks what a card needs with it, and makes one plan, one Generate, staying on Options',
    async () => {
      await openProject(projectUi.url, tab, seen);
      const iac = tab.locator('#extras-needs .card', { has: tab.locator('input[value="iac"]') });
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
      // The page stays where the next thing to do is, and what it
      // added is among what the project has: ticked, locked, and
      // re-rendered from a button of its own.
      expect(await tab.locator('[data-role="step-title"]').textContent()).toBe('Options');
      for (const id of CHAIN) {
        expect(await tab.locator(`#rerender-${id}`).count(), id).toBe(1);
        expect(await card(tab, id).count(), id).toBe(0);
        expect(await locked(tab, id).isChecked(), id).toBe(true);
        expect(await locked(tab, id).isDisabled(), id).toBe(true);
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
    'shows at the root what its services have, and opens one, where what the product gives it is said, not offered',
    async () => {
      await openProject(productUi.url, tab, seen);
      const elsewhere = tab.locator('#extras-elsewhere');
      const services = elsewhere.locator('#extras-services button');
      expect(await services.allTextContents()).toEqual([
        'Open backend/ (ts-http · npm)',
        'Open frontend/ (web-components · npm)',
      ]);
      expect(await elsewhere.locator('li[data-id="persistence"]').textContent()).toContain(
        'Persistence belongs to a service, not to the product root — it goes in backend/',
      );
      // What no service of a monorepo can carry says so, and the way
      // forward: the release it needs is per-service only in a polyrepo.
      expect(await elsewhere.locator('li[data-id="iac"]').textContent()).toMatch(
        /none of its services can carry it, since it needs Distribution, .*per-service releases need the polyrepo layout$/,
      );
      // What both services have is there, not somewhere to go: locked
      // apart from what the root installed, naming them.
      const there = tab.locator('#extras-in-services [data-id="containerization"]');
      expect(await there.textContent()).toContain(
        'Container image is already there: backend/ and frontend/ have it',
      );
      expect(await there.locator('input').isDisabled()).toBe(true);
      expect(await there.locator('input').isChecked()).toBe(true);
      expect(await elsewhere.locator('li[data-id="containerization"]').count()).toBe(0);
      expect(await locked(tab, 'containerization').count()).toBe(0);
      expect(await tab.locator('#extras-in-services-title').textContent()).toBe('In its services');

      await act(seen, () => services.first().click());
      const image = tab.locator('#extras-installed [data-id="containerization"]');
      await until(async () => (await image.count()) > 0, "the backend's Options");
      expect(await tab.locator('[data-role="step-title"]').textContent()).toBe('Options');
      expect(await tab.locator('#extras-elsewhere').count()).toBe(0);
      // What the product gives it is there, locked, saying where from —
      // and with no Re-render: nothing here installed it.
      expect(await image.textContent()).toContain(
        'Container image is already there: the product root builds it for this service',
      );
      expect(await locked(tab, 'containerization').isDisabled()).toBe(true);
      expect(await tab.locator('#rerender-containerization').count()).toBe(0);
      // A pipeline is not offered in a monorepo service: it is said,
      // with why, before any click — collapsed, since it answers a
      // question rather than asking one.
      expect(await card(tab, 'ci').count()).toBe(0);
      const refused = tab.locator('#extras-refused');
      expect(await refused.getAttribute('open')).toBeNull();
      expect(await refused.locator('summary').textContent()).toMatch(
        /^Not for this project \(\d+\)$/,
      );
      expect(await refused.locator('li[data-id="ci"]').textContent()).toContain(
        'Continuous integration cannot go in a monorepo service',
      );
      await refused.locator('summary').click();
      expect(await refused.locator('li[data-id="ci"]').isVisible()).toBe(true);
      // Nor is an entrypoint offered: the product records this service
      // by its stack. The tab says so rather than going missing.
      expect(await tab.locator('#extras-grow-cli').count()).toBe(0);
      expect(await tab.locator('#tab-entrypoint').isDisabled()).toBe(true);
      expect(await tab.locator('#entrypoint-refusal').textContent()).toContain(
        'this project is a service of a product',
      );
      expect(await card(tab, 'persistence').count()).toBe(1);
      expect(seen.posted('/api/install')).toEqual([]);
    },
    E2E_TIMEOUT_MS,
  );
});

/* ---- a product generated under the polyrepo layout -------------- */

describe.skipIf(skipE2E() || browserBinary === null)(
  'keel ui — generating a polyrepo product',
  () => {
    let empty: string;
    let emptyUi: UiProcess;
    let chromium: Browser;
    let tab: Page;
    let seen: Traffic;
    let errors: string[];

    beforeAll(async () => {
      buildCli();
      empty = await mkTempDir('keel-ui-compose-polyrepo-e2e-');
      emptyUi = await startUi(empty);
      chromium = await browserType.launch({
        ...(browserBinary === null ? {} : { executablePath: browserBinary }),
        args: ['--no-sandbox'],
      });
    }, E2E_TIMEOUT_MS);

    afterAll(async () => {
      await chromium?.close().catch(() => undefined);
      await emptyUi?.stop().catch(() => undefined);
      if (empty) await fs.remove(empty).catch(() => undefined);
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
      'lands on the directory, its services listed, rather than on a stranger preset',
      async () => {
        // A polyrepo product is its services, each a repository with a
        // manifest of its own; the root it was generated in holds none.
        // The install is run in-process from the body the page posts,
        // its deferred actions faked — a real one would `npm install`
        // both services — and answered with its own report.
        await tab.route(
          (url) => url.pathname === '/api/install',
          async (route) => {
            const body = route.request().postDataJSON() as {
              cwd: string;
              target: InstallTarget;
              answers: PresetAnswers;
            };
            const report = expectOk(
              await installMediator({ runDeferred: fakeActions }).dispatch(
                installCommandFor(body.target, {
                  cwd: body.cwd,
                  answers: body.answers,
                  interactive: false,
                  dryRun: false,
                }),
              ),
            );
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify(report),
            });
          },
        );
        await tab.goto(emptyUi.url, { waitUntil: 'domcontentloaded' });
        await until(
          async () => (await tab.locator('#stack').count()) > 0,
          'a new project’s preset picker',
        );
        await act(seen, () => control(tab, 'stack').selectOption('fullstack-ts'));
        await stackIs(tab, 'fullstack-ts');
        await goToStep(seen, tab, 'options');
        await act(seen, () => control(tab, 'layout').selectOption('polyrepo'));
        await goToStep(seen, tab, 'review');
        await until(() => tab.locator('#generate').isEnabled(), 'Generate');
        await act(seen, () => tab.locator('#generate').click());

        await until(
          async () =>
            (await tab.locator('keel-plan').textContent())?.includes('Done — fullstack-ts') ===
            true,
          'the report',
        );
        expect(await tab.locator('[data-role="step-title"]').textContent()).toBe('Directory');
        expect(await tab.locator('keel-target-picker').textContent()).toContain('2 folders');
        // Not a new project's Options, a stranger preset's dials over
        // the product just made, one click from a second Generate: the
        // directory, each service a folder of it.
        expect(seen.posted('/api/install')).toHaveLength(1);
        expect((await fs.readdir(empty)).sort()).toEqual(['backend', 'frontend']);
      },
      E2E_TIMEOUT_MS,
    );
  },
);
