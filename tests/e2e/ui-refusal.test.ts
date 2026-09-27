/**
 * A refusal on a keel project's page, driven in a real browser — the
 * one met before the click, the action it carries, and the one only
 * the click can meet.
 *
 * **Before the click.** Picking a card used to be how the page found
 * out whether the project could carry it: about half the cards on a
 * CLI project were a refusal, shown in a banner above a step the user
 * had often scrolled past. The project status reads each card ahead
 * of time now, with the planner `keel add` plans by, so what this
 * `ts-cli` project cannot carry yet — Container image, which has
 * nothing to serve an image from — is not a box to tick, and nothing
 * is previewed to find that out. The bounded-context tab is there too,
 * disabled, saying why.
 *
 * **The action it carries.** What stops Container image is the HTTP
 * server, and this project can grow one: the refusal carries
 * `keel add entrypoint http` as its action, so the card sits under
 * **After adding HTTP server**, beside the button that adds it, rather
 * than under "Not for this project". The button, the entrypoint tab
 * and the Project step's Adapters line each post that one run, which
 * the page previews, spells and reviews as it does a bounded context.
 * That the card and the click carry the same action is pinned below
 * the page (`project-status.test.ts`); that the page takes it is this.
 *
 * **After the click.** Some refusals only the run can meet: a file of
 * the user's in the way (`keel.path-conflict`) — a
 * `.github/workflows/ci.yml` of their own before `ci` — is not a fact
 * about the project's shape, so no card can foresee it. The engine
 * refuses it as data, and the page shows it **where the plan would
 * be**, as an alert, in place of "The reason is above". That the
 * refusal arrives as an `Err` is pinned below the page
 * (`tests/domain/core/mediator.test.ts`, `preview.test.ts`, the
 * composition grid, `tests/application/web/api.test.ts` for the 422);
 * whether the page *shows* it — the alert in the plan column, the
 * plan sitting empty beside it for a reason, the command line dimmed,
 * Generate shut on the review — is a page-level fact, and this is the
 * only kind of test that has eyes. One refusal is enough: the page
 * renders every coded one through the same region.
 *
 * **The page's own state is the other way a pick got refused.** A
 * card for an installed vertical was a re-render, and the flag saying
 * so outlived the card: every card picked after it was posted as a
 * reapply of something not installed. A re-render is a button of its
 * own now, a run of its own, and ticking a card lets it go; an answer
 * given for one add does not ride into a re-render. Which transition
 * clears what is pinned without a browser
 * (`tests/application/web/target.test.ts`); that a click actually
 * takes it is the page-level half.
 *
 * **A project from another harness generation** refuses every card
 * alike, so the page says so once, above them, from the project
 * status — the last case drops the manifest's marker for its own
 * length and puts it back.
 *
 * **The project is seeded in-process, with every deferred action
 * faked** — the same trick `dev-compose` uses. The page only needs a
 * manifest whose tags cannot carry `containerization`; running `npm
 * install` to get one would buy this suite a minute and no assertion.
 * No case generates. Measured on the shipped shape it runs a few
 * seconds above `ui-plugin-stack`, and still under half of
 * `ui-stack-finder`, which floors the `web` shard.
 *
 * Skip rules are the shared ones (`skipE2E`), and the `describe`
 * carries the browser guard because `beforeAll` launches one.
 */

import path from 'node:path';
import fs from 'fs-extra';
import { chromium as browserType, type Browser, type Locator, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newProjectCommand } from '../../src/domain/contract/commands.js';
import { MANIFEST_FILENAME, projectScopeRoot } from '../../src/domain/contract/manifest.js';
import type { RunActionsInputs } from '../../src/domain/core/actions.js';
import { expectOk, installMediator } from '../support/factory.js';
import { E2E_TIMEOUT_MS, mkTempDir, skipE2E } from '../support/web-e2e.js';
import {
  act,
  buildCli,
  browserBinary,
  control,
  goToStep,
  startUi,
  until,
  watchTraffic,
  type Traffic,
  type UiProcess,
} from '../support/ui-e2e.js';

/**
 * A CLI-shaped TypeScript project: no `arch.server-http`, so the
 * `containerization` vertical has no adapter for its `image`
 * dimension — which the status reads before any click, in the words
 * `keel add containerization` would refuse it with.
 */
const STACK = 'ts-cli';
const UNCARRIED = 'containerization';
/** What the project can grow to carry it, and the one run that does. */
const GROWN = 'http';
const GROW_COMMAND = 'keel add entrypoint http --yes';

/**
 * Installed by `keel new` on this stack, so it has a Re-render; and
 * one that is not, which asks a question of its own — and whose
 * workflow file, seeded by hand, is in the way of the run.
 */
const INSTALLED = 'vcs';
const AVAILABLE = 'ci';
const OTHER = 'dev-env';
/** The one question `ci` asks here, by the id its control carries. */
const PROVIDER = 'q-ci-ts-pipeline--provider';
/** The file `ci` writes, which a user may already have. */
const WORKFLOW = path.join('.github', 'workflows', 'ci.yml');
const CONFLICT =
  "'.github/workflows/ci.yml' already exists, and keel does not overwrite a file this run did not write";

/**
 * A box of the Options step's "Also scaffold" group that still ticks,
 * by the vertical it stands for — never one of what the project has.
 */
const card = (page: Page, id: string): Locator =>
  page.locator(`#extras-ready input[value="${id}"], #extras-needs input[value="${id}"]`);

/** The plan column's alert region. */
const refusal = (page: Page): Locator => page.locator('keel-plan [data-role="refusal"]');

/** The copyable command, which is derived from the body the page posts. */
const command = async (page: Page): Promise<string> =>
  ((await page.locator('keel-plan [data-role="cli-text"]').textContent()) ?? '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Runs `body` with a workflow of the user's own where `ci` writes
 * one, and takes it away after: the run is refused for as long as it
 * is there, and every other case needs `ci` to install.
 */
async function withUserWorkflow(body: () => Promise<void>): Promise<void> {
  const file = path.join(cwd, WORKFLOW);
  await fs.outputFile(file, 'name: mine\n');
  try {
    await body();
  } finally {
    await fs.remove(path.join(cwd, '.github'));
  }
}

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
    // Compiled rather than assumed, so this suite tests the command
    // and not a stale artefact of whatever ran last — and claimed
    // rather than repeated, because three `keel ui` suites run in
    // parallel and three `tsc` runs into one `dist/` is a torn read
    // waiting to happen. See `buildCli`.
    buildCli();
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
    // A manifest is there, so the page opens on a keel project's rail.
    await until(
      async () => (await page.locator('keel-stepper button[data-step="project"]').count()) > 0,
      "a keel project's rail",
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
    'says before any click what this project cannot carry yet, beside the action that lets it in',
    async () => {
      await goToStep(traffic, page, 'options');
      // Under the entrypoint that lets it in, not under "Not for this
      // project": this CLI, scaffolded with no extras, lacks nothing
      // else.
      const grow = page.locator(`#extras-grow-${GROWN}`);
      expect(await grow.locator('h4').textContent()).toBe('After adding HTTP server');
      const line = grow.locator(`li[data-id="${UNCARRIED}"]`);
      expect(await line.locator('.refused-title').textContent()).toBe('Container image');
      expect(await line.textContent()).toContain('Added after it.');
      expect(await grow.locator('li[data-id="observability"]').textContent()).toContain(
        'Comes with it.',
      );
      expect(await page.locator('#extras-refused').count()).toBe(0);
      // Not a box: there is nothing to pick, so nothing to be refused on.
      expect(await card(page, UNCARRIED).count()).toBe(0);
      // Nothing was previewed to find that out.
      expect(traffic.posted('/api/preview')).toEqual([]);

      // Nor is the bounded-context tab missing: it is off, and says why.
      const tab = page.locator('#tab-module');
      expect(await tab.isDisabled()).toBe(true);
      expect(await tab.getAttribute('aria-describedby')).toBe('module-refusal');
      // A sentence in the user's words: capitalised, the rule's id kept
      // in the status's data, and the flag it names on one line.
      const reason = page.locator('#module-refusal');
      expect(await reason.textContent()).toMatch(/^A bounded context needs the modulith layout/);
      expect(await reason.textContent()).not.toContain("rule '");
      expect(await reason.locator('code.flag').allTextContents()).toEqual([
        '--module-layout=modulith',
      ]);
      expect(
        await reason.locator('code.flag').evaluate(
          (node) =>
            (
              globalThis as unknown as {
                getComputedStyle: (element: unknown) => { whiteSpace: string };
              }
            ).getComputedStyle(node).whiteSpace,
        ),
      ).toBe('nowrap');
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'takes the action a refusal carries, and previews and reviews it as a context is',
    async () => {
      await goToStep(traffic, page, 'options');
      const button = page.locator(`#grow-${GROWN}`);
      expect(await button.textContent()).toBe('Add HTTP server');
      expect(await button.getAttribute('aria-pressed')).toBe('false');
      await act(traffic, () => button.click());

      // One run, the one the refusal names: posted as the entrypoint,
      // spelled as the command, planned as the preset with both.
      const previews = traffic.posted('/api/preview') as { target: unknown }[];
      expect(previews[previews.length - 1]?.target).toEqual({
        kind: 'add-entrypoint',
        entrypoint: GROWN,
      });
      await until(async () => (await command(page)) === GROW_COMMAND, 'the growth command');
      await until(
        async () => (await page.locator('keel-plan keel-file-tree li').count()) > 0,
        'the plan of the growth',
      );
      expect(await refusal(page).isVisible()).toBe(false);
      expect(await page.locator('keel-plan keel-file-tree').textContent()).toContain('rest');
      // The tab that holds it, pressed, with what comes and what follows.
      const tab = page.locator('#tab-entrypoint');
      expect(await tab.getAttribute('aria-pressed')).toBe('true');
      const chosen = page.locator(`#entrypoint input[value="${GROWN}"]`);
      expect(await chosen.isChecked()).toBe(true);
      // All the run installs, and the harness this project has, which
      // it re-renders; the gateway apart, waiting on a link too.
      const form = (await page.locator('keel-add-form').textContent()) ?? '';
      expect(form).toContain('Comes with it: Development environment, Observability.');
      expect(form).toContain('the agent harness is re-rendered to speak of both');
      expect(form).toContain('Added after it, once a linked project serves it: Service gateway.');

      // The review names it as it names a context, and Generate is live.
      await goToStep(traffic, page, 'review');
      const review = page.locator('keel-review');
      expect(await review.locator('dt', { hasText: /^Entrypoint$/ }).count()).toBe(1);
      expect(await review.textContent()).toContain('HTTP server');
      expect(await page.locator('#generate').isEnabled()).toBe(true);

      // The Project step's Adapters line offers the same run, pressed.
      await goToStep(traffic, page, 'project');
      const offer = page.locator(`#offer-entrypoint-${GROWN}`);
      expect(await offer.getAttribute('aria-pressed')).toBe('true');
      expect(await offer.getAttribute('title')).toBe('keel add entrypoint http');

      // And back to the verticals: another subject, another plan.
      await goToStep(traffic, page, 'options');
      await act(traffic, () => page.locator('#tab-vertical').click());
      await act(traffic, () => card(page, AVAILABLE).check());
      await until(
        async () => (await command(page)) === `keel add ${AVAILABLE} --yes`,
        'the add command',
      );
      expect(await page.locator(`#grow-${GROWN}`).getAttribute('aria-pressed')).toBe('false');

      // The tab opens the same run, on the entrypoint the project can grow.
      await act(traffic, () => page.locator('#tab-entrypoint').click());
      await until(
        async () => (await command(page)) === GROW_COMMAND,
        'the growth command, from the tab',
      );
      expect(await page.locator(`#entrypoint input[value="${GROWN}"]`).isChecked()).toBe(true);

      // And so does the Project step's offer, from a vertical again.
      await act(traffic, () => page.locator('#tab-vertical').click());
      await act(traffic, () => card(page, AVAILABLE).check());
      await until(
        async () => (await command(page)) === `keel add ${AVAILABLE} --yes`,
        'the add command, again',
      );
      await goToStep(traffic, page, 'project');
      expect(await offer.getAttribute('aria-pressed')).toBe('false');
      await act(traffic, () => offer.click());
      await until(
        async () => (await command(page)) === GROW_COMMAND,
        'the growth command, from the Project step',
      );
      expect(await offer.getAttribute('aria-pressed')).toBe('true');

      // Nothing was generated: growing a TypeScript project queues its
      // package manager, which this suite never runs.
      expect(traffic.posted('/api/install')).toEqual([]);
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'shows a refusal only the run can meet where the plan would be, as an alert',
    async () => {
      await withUserWorkflow(async () => {
        await goToStep(traffic, page, 'options');
        await act(traffic, () => card(page, AVAILABLE).check());

        const alert = refusal(page);
        await until(async () => await alert.isVisible(), 'the refusal in the plan column');
        expect(await alert.getAttribute('role')).toBe('alert');
        // The code is what a client branches on and the message is what
        // a human reads; `keel.web.http-500` and "failed with 500" are
        // neither, and are what this used to say.
        expect(await alert.locator('.code').textContent()).toBe('keel.path-conflict');
        expect(await alert.textContent()).toContain(CONFLICT);
        expect(await alert.textContent()).toContain('keel refuses this run');
        // In place of the plan, not beside a blank one — and not a
        // pointer to a banner somewhere else.
        expect(await page.locator('keel-plan keel-file-tree').count()).toBe(0);
        expect(await page.locator('keel-plan').textContent()).not.toContain('The reason is above');
        // The command is still the one the choices spell, so it stays —
        // dimmed, and saying the terminal would refuse it too.
        const line = page.locator('keel-plan [data-role="cli-text"]');
        expect(await line.getAttribute('class')).toContain('refused');
        expect(await page.locator('keel-plan [data-role="cli-refused"]').isVisible()).toBe(true);
      });
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'holds Generate shut on the review step, and names the refusal there',
    async () => {
      await withUserWorkflow(async () => {
        await goToStep(traffic, page, 'options');
        await act(traffic, () => card(page, AVAILABLE).check());
        await goToStep(traffic, page, 'review');

        // The review step is the one place a user arrives at *intending*
        // to commit, so it repeats the reason rather than pointing at it.
        const review = (await page.locator('keel-review').textContent()) ?? '';
        expect(review).toContain('Refused:');
        expect(review).toContain(CONFLICT);
        expect(await page.locator('#generate').isDisabled()).toBe(true);
      });
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'clears the refusal when the card is let go and another is ticked',
    async () => {
      await withUserWorkflow(async () => {
        await goToStep(traffic, page, 'options');
        await act(traffic, () => card(page, AVAILABLE).check());
        await until(async () => await refusal(page).isVisible(), 'the refusal');

        // The half a "does it show the error?" test misses: a refusal
        // must not be a state the page cannot leave.
        await act(traffic, () => card(page, AVAILABLE).uncheck());
        await act(traffic, () => card(page, OTHER).check());
        await until(async () => !(await refusal(page).isVisible()), 'the refusal to clear');
        await until(
          async () => (await page.locator('keel-plan keel-file-tree li').count()) > 0,
          'the plan to come back',
        );
        expect(
          await page.locator('keel-plan [data-role="cli-text"]').getAttribute('class'),
        ).not.toContain('refused');
        await goToStep(traffic, page, 'review');
        expect(await page.locator('#generate').isEnabled()).toBe(true);
      });
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'lets a re-render go with the first card ticked after it',
    async () => {
      await goToStep(traffic, page, 'options');
      await act(traffic, () => page.locator(`#rerender-${INSTALLED}`).click());
      await until(
        async () => (await command(page)) === `keel add ${INSTALLED} --reapply --yes`,
        'the re-render command',
      );
      expect(await page.locator(`#rerender-${INSTALLED}`).getAttribute('aria-pressed')).toBe(
        'true',
      );

      await act(traffic, () => card(page, AVAILABLE).check());
      // What this used to post was a reapply of `ci`, refused as
      // `keel.vertical-not-installed` with `keel add ci --reapply` on
      // the copyable line.
      await until(
        async () => (await command(page)) === `keel add ${AVAILABLE} --yes`,
        'the plain install command',
      );
      expect(await page.locator(`#rerender-${INSTALLED}`).getAttribute('aria-pressed')).toBe(
        'false',
      );
      await until(
        async () => (await page.locator('keel-plan keel-file-tree li').count()) > 0,
        'the plan',
      );
      expect(await refusal(page).isVisible()).toBe(false);
      await goToStep(traffic, page, 'review');
      expect(await page.locator('#generate').isEnabled()).toBe(true);
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'leaves the answers given for an add behind when a re-render is pressed',
    async () => {
      await goToStep(traffic, page, 'options');
      await act(traffic, () => card(page, AVAILABLE).check());
      await goToStep(traffic, page, 'questions');
      await act(traffic, () => control(page, PROVIDER).selectOption('gitlab-ci'));
      await until(
        async () => (await command(page)).includes('--set'),
        'the answer to reach the command',
      );

      await goToStep(traffic, page, 'options');
      await act(traffic, () => page.locator(`#rerender-${INSTALLED}`).click());
      // The answer was `ci`'s. Carried here it would ride a reapply
      // that runs no adapter reading it, which `POST /api/install`
      // refuses; it must not reach the command line either.
      await until(
        async () => (await command(page)) === `keel add ${INSTALLED} --reapply --yes`,
        'a command with no answer on it',
      );
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'says once, above the cards, that a project from another harness generation refuses them',
    async () => {
      // Picking card after card to meet the same refusal is what the
      // status's one field spares: the page reads it before any pick.
      await goToStep(traffic, page, 'options');
      expect(await page.locator('[data-role="harness-generation"]').count()).toBe(0);

      const file = path.join(projectScopeRoot(cwd), MANIFEST_FILENAME);
      const original = await fs.readFile(file, 'utf8');
      const { harnessGeneration: _dropped, ...unmarked } = JSON.parse(original) as Record<
        string,
        unknown
      >;
      await fs.writeFile(file, JSON.stringify(unmarked));
      try {
        // Opened afresh from the URL: the page claims its token off the
        // address bar on load, and a reload would have none to claim.
        await page.goto(ui.url, { waitUntil: 'domcontentloaded' });
        await until(
          async () => (await page.locator('keel-stepper button[data-step="project"]').count()) > 0,
          "a keel project's rail",
        );
        await goToStep(traffic, page, 'options');
        const notice = page.locator('[data-role="harness-generation"]');
        await until(async () => (await notice.count()) === 1, 'one generation notice');
        // A note, not a live region: it does not change while the page
        // is on this project, and the form is rebuilt on every pick.
        expect(await notice.getAttribute('role')).toBe('note');
        expect(await notice.textContent()).toContain('every card but Agent harness is refused');
      } finally {
        await fs.writeFile(file, original);
      }
    },
    E2E_TIMEOUT_MS,
  );
});
