/**
 * What the brownfield "What to add" step shows, and the re-renders a
 * preview proposes beside an add.
 *
 * Same standing as `extras.test.ts` and `project.test.ts`: a pure
 * module living in `assets/web/`, tested here because it needs no
 * browser. Driven against the real `keel.project-status` reply for
 * real scaffolds, so the parts are the planner's own reading of a
 * shipped stack — a card in the wrong part would be the page
 * disagreeing with `keel add --list` about the same project — and the
 * sentence under "Not for this project" is held to the one `keel add`
 * really refuses with. The gestures between them are the page's own
 * transitions (`target.js`), posted through the real preview, so "one
 * tick, one plan" is a claim about the run and not about a control.
 * That a card really ticks its neighbours across the redraw is
 * `ui-compose.test.ts`, in a browser.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addVerticalCommand,
  installCommandFor,
  newProjectCommand,
} from '../../../src/domain/contract/commands.js';
import {
  previewQuery,
  projectStatusQuery,
  type InstallPreview,
  type ProjectStatus,
} from '../../../src/domain/contract/queries.js';
import type { Mediator } from '../../../src/domain/kernel/mediator.js';
import {
  additionsGroup,
  additionsSummary,
  refreshChoices,
  serviceLinks,
} from '../../../assets/web/src/additions.js';
import {
  rerender,
  restart,
  toggleRefresh,
  toggleVertical,
} from '../../../assets/web/src/target.js';
import { expectErr, expectOk, installMediator } from '../../support/factory.js';

let cwd: string;
let mediator: Mediator;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-web-additions-'));
  mediator = installMediator({ runDeferred: () => Promise.resolve() });
});

afterEach(async () => {
  await fs.remove(cwd);
});

async function scaffold(stack: string, extra: { layout?: 'monorepo' } = {}): Promise<void> {
  expectOk(
    await mediator.dispatch(
      newProjectCommand({ cwd, stack, answers: {}, interactive: false, dryRun: false, ...extra }),
    ),
  );
}

const status = async (): Promise<ProjectStatus> =>
  expectOk(await mediator.dispatch(projectStatusQuery({ cwd })));

/** The run the page opens on, over a project. */
const opened = () =>
  restart(
    {
      target: { kind: 'add-vertical', verticals: [] },
      answers: {},
      dials: null,
      generation: 0,
      carried: null,
      notice: '',
    },
    { kind: 'add-vertical', verticals: [] },
  );

/** What the page previews for a target, through the real route's query. */
const preview = async (target: object): Promise<InstallPreview> =>
  expectOk(await mediator.dispatch(previewQuery({ cwd, target: target as never, answers: {} })));

const values = (cards: readonly { value: string }[]): string[] => cards.map((card) => card.value);

describe('the "What to add" step', () => {
  it('sorts an HTTP project’s verticals into ready, needing another first, and not for it', async () => {
    await scaffold('go-http');
    const reported = await status();
    const group = additionsGroup(reported, { kind: 'add-vertical', verticals: [] });

    expect(values(group.ready)).toEqual(expect.arrayContaining(['ci', 'containerization']));
    expect(values(group.needs)).toEqual(['distribution', 'iac']);
    const iac = group.needs.find((card) => card.value === 'iac');
    expect(iac).toMatchObject({
      label: 'Infrastructure as code',
      meta: 'keel add iac',
      badge: 'needs Container image, Distribution',
    });
    // The gateway has nothing linked to wire: said, not offered.
    expect(group.refused.map((line) => line.id)).toEqual(['gateway']);
    expect([...values(group.ready), ...values(group.needs)]).not.toContain('gateway');
    // Every vertical not installed is in exactly one part.
    expect(
      [
        ...values(group.ready),
        ...values(group.needs),
        ...group.refused.map((line) => line.id),
      ].sort(),
    ).toEqual(reported.available.map((card) => card.id).sort());

    // What is installed is re-rendered from a button of its own, and
    // nothing here is a chip: every piece is one `keel add` names.
    expect(group.rerenderable.map((vertical) => vertical.id)).toEqual(
      reported.installed.map((vertical) => vertical.id),
    );
    expect(group.rerenderable.find((vertical) => vertical.id === 'vcs')).toMatchObject({
      title: 'Version control',
      meta: 'keel add vcs --reapply',
      pressed: false,
    });
    expect(group.chips).toEqual([]);
    expect(group.elsewhere).toEqual([]);
  });

  it('says, collapsed, what a CLI project cannot take — in the words keel add refuses it with', async () => {
    await scaffold('quarkus-cli');
    const group = additionsGroup(await status(), { kind: 'add-vertical', verticals: [] });
    const observability = group.refused.find((line) => line.id === 'observability');
    const refused = expectErr(
      await mediator.dispatch(
        addVerticalCommand({
          cwd,
          verticals: ['observability'],
          answers: {},
          interactive: false,
          dryRun: true,
        }),
      ),
    );
    expect(observability).toEqual({
      id: 'observability',
      title: 'Observability',
      sentence: refused.message,
    });
    expect(observability?.sentence).toBe(
      'Observability needs an entrypoint this project does not have: HTTP server — a REST endpoint',
    );
    expect(values(group.ready)).not.toContain('observability');
  });

  it('points a product root’s verticals into its services, and shows its glue as a chip', async () => {
    await scaffold('fullstack-ts', { layout: 'monorepo' });
    const reported = await status();
    const group = additionsGroup(reported, { kind: 'add-vertical', verticals: [] });

    const persistence = group.elsewhere.find((line) => line.id === 'persistence');
    expect(persistence?.sentence).toBe(
      reported.available.find((card) => card.id === 'persistence')?.refusal?.message,
    );
    expect(group.refused.map((line) => line.id)).not.toContain('persistence');
    // The product's glue is recorded as installed, and no `keel add`
    // names it: a fact about the project, not a Re-render.
    expect(group.chips).toEqual([{ id: 'fullstack', title: 'Product root' }]);
    expect(group.rerenderable.map((vertical) => vertical.id)).not.toContain('fullstack');
    // What the services have is in them, not a gap of the root's.
    expect(group.elsewhere.map((line) => line.id)).toEqual(
      expect.arrayContaining(['agent-harness', 'containerization', 'gateway', 'persistence']),
    );
    // And the way into each: the directory the status reports whole,
    // named by the service's directory and what it is.
    expect(group.services).toEqual([
      { path: path.join(cwd, 'backend'), label: 'Open backend/ (ts-http · npm)' },
      { path: path.join(cwd, 'frontend'), label: 'Open frontend/ (web-components · npm)' },
    ]);
    expect(serviceLinks(reported)).toEqual(group.services);
  });

  it('lists what a monorepo service has from its product, in the words the add answers', async () => {
    await scaffold('fullstack-ts', { layout: 'monorepo' });
    const backend = path.join(cwd, 'backend');
    const reported = expectOk(await mediator.dispatch(projectStatusQuery({ cwd: backend })));
    const group = additionsGroup(reported, { kind: 'add-vertical', verticals: [] });

    expect(group.provided.map((line) => line.id)).toEqual(['containerization', 'vcs']);
    expect(group.services).toEqual([]);
    for (const line of group.provided) {
      const added = expectOk(
        await mediator.dispatch(
          previewQuery({
            cwd: backend,
            target: { kind: 'add-vertical', verticals: [line.id] },
            answers: {},
          }),
        ),
      );
      expect(added.changes).toEqual([]);
      expect(added.notes).toEqual([line.sentence]);
    }
    // A pipeline is refused there, under "Not for this project", in
    // the add's own words.
    const ci = group.refused.find((line) => line.id === 'ci');
    expect(ci?.sentence).toBe(
      reported.available.find((card) => card.id === 'ci')?.refusal?.message,
    );
    expect(ci?.sentence).toMatch(/^Continuous integration cannot go in a monorepo service/);
  });

  it('holds the ticked cards, or the one being re-rendered, and spells them for the review', async () => {
    await scaffold('go-http');
    const reported = await status();
    const ticked = toggleVertical(opened(), reported, 'iac', true);
    const group = additionsGroup(reported, ticked.target);
    expect(group.chosen).toEqual(['containerization', 'distribution', 'iac']);
    expect(group.rerendering).toBeNull();
    expect(additionsSummary(reported, ticked.target)).toEqual({
      adds: 'Container image, Distribution, Infrastructure as code',
      refreshes: '',
    });

    const again = additionsGroup(reported, rerender(ticked, 'vcs').target);
    expect(again.chosen).toEqual([]);
    expect(again.rerendering).toBe('vcs');
    expect(again.rerenderable.find((vertical) => vertical.pressed)?.id).toBe('vcs');
  });

  it('turns one tick on a card that needs others into one plan the add accepts', async () => {
    await scaffold('go-http');
    const reported = await status();
    const { target } = toggleVertical(opened(), reported, 'iac', true);
    const planned = await preview(target);
    // The plan of the three, named as the card's badge names them, is
    // the plan `keel add iac` alone makes: the card said what it
    // needs, and the add installs exactly that.
    const alone = await preview({ kind: 'add-vertical', verticals: ['iac'] });
    expect(planned.changes).toEqual(alone.changes);
    expect(planned.changes.length).toBeGreaterThan(0);
    // And the body the page would post is one the install takes.
    expectOk(
      await mediator.dispatch(
        installCommandFor(target as never, {
          cwd,
          answers: {},
          interactive: false,
          dryRun: true,
        }),
      ),
    );
  });
});

describe('the proposed re-renders', () => {
  /**
   * `go-http` with its release path installed, then persistence ticked:
   * distribution reads persistence, and its deploy descriptor was
   * rendered without one — the add leaves it so, and proposes the
   * re-render.
   */
  async function released(): Promise<ProjectStatus> {
    await scaffold('go-http');
    expectOk(
      await mediator.dispatch(
        addVerticalCommand({
          cwd,
          verticals: ['containerization', 'distribution'],
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    return status();
  }

  it('offers each one the preview proposes, saying why, and keeps it once taken up', async () => {
    const reported = await released();
    const ticked = toggleVertical(opened(), reported, 'persistence', true);
    const proposed = await preview(ticked.target);
    expect(proposed.refreshProposals?.map((proposal) => proposal.vertical)).toEqual([
      'distribution',
    ]);
    const choices = refreshChoices(proposed, ticked.target, reported);
    expect(choices).toEqual([
      {
        value: 'distribution',
        label: 'Re-render Distribution too',
        doc: 'Reads Persistence, which it was rendered without — re-rendering it rewrites the files it owns.',
      },
    ]);

    // Taken up, the preview no longer proposes it — it is doing it —
    // and the toggle stays, ticked, for the user to let go again.
    const refreshed = toggleRefresh(ticked, 'distribution', true);
    const taken = await preview(refreshed.target);
    expect(taken.refreshProposals ?? []).toEqual([]);
    expect(refreshChoices(taken, refreshed.target, reported).map((choice) => choice.value)).toEqual(
      ['distribution'],
    );
    expect(taken.changes).toContainEqual({ kind: 'modify', path: 'deploy/compose.yaml' });
    // Generated, the re-rendered descriptor carries what it reads.
    expectOk(
      await mediator.dispatch(
        installCommandFor(refreshed.target as never, {
          cwd,
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    expect(await fs.readFile(path.join(cwd, 'deploy', 'compose.yaml'), 'utf8')).toContain('DB_URL');
  });

  it('offers none on a re-render, nor before anything is ticked', async () => {
    const reported = await released();
    const proposal = {
      refreshProposals: [{ vertical: 'distribution', reads: ['persistence'] }],
    };
    expect(refreshChoices(proposal, { kind: 'add-vertical', verticals: [] }, reported)).toEqual([]);
    expect(refreshChoices(proposal, rerender(opened(), 'vcs').target, reported)).toEqual([]);
  });
});
