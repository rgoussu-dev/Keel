/**
 * How a change moves what the page is about to run.
 *
 * Same standing as `steps.test.ts` and `response.test.ts`: a pure
 * module living in `assets/web/`, tested here because it needs no
 * browser. `<keel-app>` stores what these transitions return and
 * redraws; which of the target, the answers, the dials and the
 * request generation a change clears is decided here.
 *
 * Each case below is a state bug the brownfield page shipped. A
 * re-render flag outlived the installed card that set it, so every
 * card picked after it was refused as "nothing to reapply"; answers
 * outlived their card and rode the next one; and a dials reply
 * outlived the pick that superseded it. The browser half — that a
 * card click really takes these paths — is `ui-refusal.test.ts`.
 *
 * Answers also outlive their adapter within one subject — an extra
 * unticked after its question was answered — and an install refuses an
 * answer no adapter of its plan reads, so a preview's reply drops the
 * ones it did not ask for. That case runs the real preview and install.
 *
 * An "Also scaffold" box is a gesture rather than a field: ticking one
 * ticks what it needs, unticking one unticks what needs it. That the
 * route then has nothing to add or drop — the page's closure is the
 * planner's — is proved over every shipped preset by `dials.test.ts`'s
 * walk; which boxes a gesture moves is decided here. The brownfield
 * cards are the same gesture over the project status's `requires`,
 * and an installed vertical's **Re-render** a run of its own that lets
 * the add go; one click on IaC ticking three cards into one plan and
 * one Generate is `ui-compose.test.ts`, in a browser.
 *
 * The greenfield half has one more job: a new preset keeps the dials
 * and the extras and lets `keel.dials` snap them, and once the reply
 * settles the move the run carries one line naming what it could not
 * keep. That round trip through the real route is `dials.test.ts`;
 * which move owes a line, and what the line says, is decided here. It
 * keeps the answers too, held until a preview of the new preset says
 * where each goes — a package moved onto the question the new
 * bootstrap asks for it, a choice the new preset does not offer let
 * go — and that runs the real preview and install.
 *
 * The fixtures are typed against the contract the page reads them
 * from (`ProjectStatus`, `AnswerBinding`, `DialOptions`), so a renamed
 * field fails the typecheck here rather than a card on the page.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { installCommandFor, type NewProjectTarget } from '../../../src/domain/contract/commands.js';
import { catalogQuery, dialsQuery, previewQuery } from '../../../src/domain/contract/queries.js';
import type {
  AnswerBinding,
  AvailableVerticalDescriptor,
  Catalog,
  DialOptions,
  InstallPreview,
  InstalledVerticalDescriptor,
  PendingQuestion,
  ProjectStatus,
  VerticalDescriptor,
} from '../../../src/domain/contract/queries.js';
import {
  answer,
  extrasOf,
  previewed,
  refreshOf,
  rerender,
  rerendering,
  restart,
  retarget,
  settle,
  serviceBuild,
  serviceExtrasOf,
  toggleExtra,
  toggleRefresh,
  toggleVertical,
  verticalsOf,
  withServiceBuild,
} from '../../../assets/web/src/target.js';
import { expectErr, expectOk, installMediator } from '../../support/factory.js';

/** What `<keel-app>` stores between transitions. */
type Run = ReturnType<typeof restart>;

const choice = (id: string): DialOptions['buildSystems'][number] => ({ id, label: id, doc: '' });

/** A `keel.dials` reply written out, held to the contract the route answers with. */
const reply = (dials: DialOptions): DialOptions => dials;

/**
 * A `keel.dials` reply for a JVM preset, settled at `target`: Gradle
 * and the flat layout are the defaults, as the menus' first entries.
 */
const jvmDials = (target: DialOptions['target']): DialOptions => ({
  target,
  buildSystems: [choice('gradle'), choice('maven')],
  moduleLayouts: [choice('basic'), choice('modulith')],
  services: [],
  peerContext: true,
  agentHarness: true,
  extraVerticals: [],
  verticals: [],
  adjustments: [],
});

async function finder(): Promise<Catalog['finder']> {
  const catalog: Catalog = expectOk(await installMediator().dispatch(catalogQuery()));
  return catalog.finder;
}

const vertical = (id: string): VerticalDescriptor => ({
  id,
  title: id,
  description: `what installing ${id} buys`,
  dimensions: [],
});

const installed = (id: string): InstalledVerticalDescriptor => ({
  ...vertical(id),
  installedAt: '2026-04-26T12:00:00Z',
  reapplicable: true,
});

const ready = (id: string): AvailableVerticalDescriptor => ({
  ...vertical(id),
  readiness: 'ready',
  requires: [],
});

const needs = (id: string, requires: readonly string[]): AvailableVerticalDescriptor => ({
  ...vertical(id),
  readiness: 'needs',
  requires,
});

/** A project `keel new` scaffolded: `vcs` is in, `ci` and `dev-env` are not. */
const status: Pick<ProjectStatus, 'installed' | 'available'> = {
  installed: [installed('vcs'), installed('walking-skeleton')],
  available: [ready('ci'), ready('dev-env')],
};

/**
 * An HTTP project's cards, the shipped catalog's one chain among them:
 * the image is ready, the distribution needs it, IaC needs both — in
 * the id order the status lists them in.
 */
const chain: Pick<ProjectStatus, 'installed' | 'available'> = {
  installed: [installed('vcs')],
  available: [
    ready('ci'),
    ready('containerization'),
    needs('distribution', ['containerization']),
    needs('iac', ['containerization', 'distribution']),
  ],
};

/** The question `ci` asks on a TypeScript project, as a preview binds it. */
const PROVIDER: AnswerBinding = { kind: 'answer', adapter: 'ci/ts-pipeline', question: 'provider' };

/** A question the persistence dials ask, wherever they are asked. */
const ENGINE: AnswerBinding = {
  kind: 'answer',
  adapter: 'persistence/database-compose',
  question: 'engine',
};

/** Where the brownfield page opens: on no vertical at all. */
const brownfield = (): Run => ({
  target: { kind: 'add-vertical', verticals: [] },
  answers: {},
  dials: null,
  generation: 0,
  carried: null,
  notice: '',
  held: [],
  identity: [],
});

/** A greenfield page after `keel.dials` has settled `quarkus-rest`. */
const greenfield = (): Run => ({
  target: { kind: 'new-project', stack: 'quarkus-rest', buildSystem: 'gradle' },
  answers: { 'persistence/database-compose': { engine: 'postgres' } },
  dials: jvmDials({ kind: 'new-project', stack: 'quarkus-rest', buildSystem: 'gradle' }),
  generation: 0,
  carried: null,
  notice: '',
  held: [],
  identity: [],
});

/** `quarkus-rest` settled on Maven, the modulith and the peer context — every dial moved. */
const tuned = (): Run => {
  const target = {
    kind: 'new-project',
    stack: 'quarkus-rest',
    buildSystem: 'maven',
    moduleLayout: 'modulith',
    withPeerContext: true,
  } as const;
  return { ...greenfield(), target, dials: jvmDials(target) };
};

describe('a keel project’s "Also scaffold" boxes', () => {
  it('ticks what a card needs along with it, prerequisites first', () => {
    const iac = toggleVertical(brownfield(), chain, 'iac', true);
    expect(iac.target).toEqual({
      kind: 'add-vertical',
      verticals: ['containerization', 'distribution', 'iac'],
    });
    // What is ticked already stays, once, in the order the cards are
    // listed where nothing ties it to the rest.
    expect(verticalsOf(toggleVertical(iac, chain, 'ci', true).target)).toEqual([
      'ci',
      'containerization',
      'distribution',
      'iac',
    ]);
  });

  it('unticks every card that needs the one unticked, and nothing else', () => {
    const all = toggleVertical(toggleVertical(brownfield(), chain, 'ci', true), chain, 'iac', true);
    expect(verticalsOf(toggleVertical(all, chain, 'containerization', false).target)).toEqual([
      'ci',
    ]);
    expect(verticalsOf(toggleVertical(all, chain, 'iac', false).target)).toEqual([
      'ci',
      'containerization',
      'distribution',
    ]);
    // The last card unticked leaves a run with nothing to add, which
    // the page previews as nothing at all.
    const none = toggleVertical(toggleVertical(all, chain, 'ci', false), chain, 'iac', false);
    expect(
      verticalsOf(
        toggleVertical(
          toggleVertical(none, chain, 'distribution', false),
          chain,
          'containerization',
          false,
        ).target,
      ),
    ).toEqual([]);
  });

  it('leaves what the project has locked: a tick on its box moves nothing', () => {
    // Drawn ticked and disabled, and held so here too: the run is what
    // goes on top — `keel add` of the delta — and a vertical already
    // there neither joins that set nor leaves the project.
    const onCi = toggleVertical(brownfield(), chain, 'ci', true);
    expect(toggleVertical(onCi, chain, 'vcs', true)).toBe(onCi);
    expect(toggleVertical(onCi, chain, 'vcs', false)).toBe(onCi);
    // So is what a monorepo service has from its product.
    const member: Pick<ProjectStatus, 'installed' | 'available' | 'provided'> = {
      installed: [installed('walking-skeleton')],
      available: [ready('ci')],
      provided: [{ ...vertical('containerization'), note: 'the product root builds it' }],
    };
    expect(toggleVertical(brownfield(), member, 'containerization', true)).toEqual(brownfield());
  });

  it('keeps the answers while the set moves, for the next preview to prune', () => {
    const onCi = answer(toggleVertical(brownfield(), status, 'ci', true), {
      binding: PROVIDER,
      value: 'gitlab-ci',
    });
    const both = toggleVertical(onCi, status, 'dev-env', true);
    expect(both.answers).toEqual(onCi.answers);
    // Unticked, `ci` takes nothing with it yet: the preview of the
    // set without it is what knows its question is no longer asked
    // (`previewed`), exactly as for an unticked greenfield extra.
    expect(toggleVertical(both, status, 'ci', false).answers).toEqual(onCi.answers);
  });

  it('re-renders an installed vertical as a run of its own, letting the add go', () => {
    const onCi = answer(toggleVertical(brownfield(), status, 'ci', true), {
      binding: PROVIDER,
      value: 'gitlab-ci',
    });
    const again = rerender(onCi, 'vcs');
    expect(again.target).toEqual({ kind: 'add-vertical', verticals: ['vcs'], reapply: true });
    expect(rerendering(again.target)).toBe('vcs');
    // The answer was `ci`'s. Carried onto the re-render it would reach
    // no adapter the run has, which the install refuses.
    expect(again.answers).toEqual({});

    // Pressed on another installed vertical, the run is that one's.
    expect(rerender(again, 'walking-skeleton').target).toEqual({
      kind: 'add-vertical',
      verticals: ['walking-skeleton'],
      reapply: true,
    });
    // Pressed again on the same one, it lets it go.
    expect(rerender(again, 'vcs').target).toEqual({ kind: 'add-vertical', verticals: [] });
  });

  it('lets the re-render flag go with the first card ticked after it', () => {
    const again = rerender(brownfield(), 'vcs');
    // What this used to post was a reapply of `ci`, refused as
    // `keel.vertical-not-installed`.
    const next = toggleVertical(again, status, 'ci', true);
    expect(next.target).toEqual({ kind: 'add-vertical', verticals: ['ci'] });
    expect(rerendering(next.target)).toBeNull();
  });

  it('takes a proposed re-render up beside the add, and lets it go with the last card', () => {
    const onPersistence = toggleVertical(brownfield(), status, 'dev-env', true);
    const refreshed = toggleRefresh(onPersistence, 'vcs', true);
    expect(refreshed.target).toEqual({
      kind: 'add-vertical',
      verticals: ['dev-env'],
      refresh: ['vcs'],
    });
    expect(refreshOf(refreshed.target)).toEqual(['vcs']);
    // Ticking more keeps it; unticking it lets it go.
    expect(refreshOf(toggleVertical(refreshed, status, 'ci', true).target)).toEqual(['vcs']);
    expect(toggleRefresh(refreshed, 'vcs', false).target).toEqual({
      kind: 'add-vertical',
      verticals: ['dev-env'],
    });
    // Nothing left to add, nothing left to re-render beside it.
    expect(toggleVertical(refreshed, status, 'dev-env', false).target).toEqual({
      kind: 'add-vertical',
      verticals: [],
    });
  });

  it('replaces the target rather than merging a whole one into it', () => {
    // The kind tab says nothing of `reapply` — and merged, that
    // silence was what kept the flag alive for the next card.
    const again = rerender(brownfield(), 'vcs');
    expect(retarget(again, { kind: 'add-vertical', verticals: [] }).target).toEqual({
      kind: 'add-vertical',
      verticals: [],
    });

    // The same silence on the context form: "nothing — a standalone
    // context" is a target without `consumes`, not one keeping the
    // context picked before.
    const consuming = retarget(brownfield(), {
      kind: 'add-module',
      module: 'billing',
      consumes: 'greeting',
    });
    expect(retarget(consuming, { kind: 'add-module', module: 'billing' }).target).toEqual({
      kind: 'add-module',
      module: 'billing',
    });
  });

  it('keeps the answers of a context being renamed', () => {
    // Renaming the context an `add-module` run creates is a typo
    // fixed, not a different run.
    const named = answer(retarget(brownfield(), { kind: 'add-module', module: 'bill' }), {
      binding: ENGINE,
      value: 'mariadb',
    });
    expect(retarget(named, { kind: 'add-module', module: 'billing' }).answers).toEqual(
      named.answers,
    );
  });

  it('reads the verticals of a target, and none of any other', () => {
    expect(verticalsOf({ kind: 'add-vertical', verticals: ['ci', 'iac'] })).toEqual(['ci', 'iac']);
    expect(verticalsOf({ kind: 'add-module', module: 'billing' })).toEqual([]);
    expect(verticalsOf(null)).toEqual([]);
    expect(refreshOf({ kind: 'add-vertical', verticals: ['ci'] })).toEqual([]);
    expect(rerendering({ kind: 'add-vertical', verticals: ['ci'] })).toBeNull();
  });
});

describe('a greenfield control', () => {
  it('merges the fields that moved, keeping answers and menus', () => {
    const before = greenfield();
    const next = retarget(before, { moduleLayout: 'modulith' });
    expect(next.target).toEqual({
      kind: 'new-project',
      stack: 'quarkus-rest',
      buildSystem: 'gradle',
      moduleLayout: 'modulith',
    });
    expect(next.answers).toBe(before.answers);
    expect(next.dials).toBe(before.dials);
  });

  it('starts a new preset over from its dials, holding the answers for the next preview', () => {
    const next = retarget(greenfield(), { stack: 'go-http' });
    // The build system goes along; `keel.dials` is what drops it, Go
    // having none to choose.
    expect(next.target).toEqual({ kind: 'new-project', stack: 'go-http', buildSystem: 'gradle' });
    // Held rather than posted: the preview of the new preset says
    // where each still goes (`previewed`).
    expect(next.answers).toEqual({});
    expect(next.held).toEqual([
      {
        adapter: 'persistence/database-compose',
        question: 'engine',
        value: 'postgres',
        identity: false,
      },
    ]);
    expect(next.dials).toBeNull();
  });

  it('carries every dial onto the new preset, a product’s repository layout included', () => {
    const next = retarget(tuned(), { stack: 'quarkus-cli-rest' });
    expect(next.target).toEqual({
      kind: 'new-project',
      stack: 'quarkus-cli-rest',
      buildSystem: 'maven',
      moduleLayout: 'modulith',
      withPeerContext: true,
    });

    const product = retarget(
      {
        ...greenfield(),
        target: { kind: 'new-project', stack: 'fullstack', layout: 'polyrepo' },
      },
      { stack: 'fullstack-spring' },
    );
    expect(product.target).toEqual({
      kind: 'new-project',
      stack: 'fullstack-spring',
      layout: 'polyrepo',
    });
  });

  it('carries the extras onto the new preset, for keel.dials to snap', () => {
    const before = { ...tuned() };
    before.target = { ...before.target, extraVerticals: ['ci', 'containerization'] };
    expect(retarget(before, { stack: 'quarkus-cli' }).target).toEqual({
      kind: 'new-project',
      stack: 'quarkus-cli',
      buildSystem: 'maven',
      moduleLayout: 'modulith',
      withPeerContext: true,
      extraVerticals: ['ci', 'containerization'],
    });
  });

  it('keeps everything when the preset picked is the one already there', () => {
    const before = greenfield();
    const next = retarget(before, { stack: 'quarkus-rest' });
    expect(next.target).toEqual(before.target);
    expect(next.answers).toBe(before.answers);
    expect(next.dials).toBe(before.dials);
  });

  it('leaves the agent harness out like any dial, keeping answers and menus', () => {
    // The chip under "Comes with" moves one field of the preset, as
    // the peer-context box does: the same subject, so nothing resets.
    const before = greenfield();
    const off = retarget(before, { agentHarness: false });
    expect(off.target).toEqual({
      kind: 'new-project',
      stack: 'quarkus-rest',
      buildSystem: 'gradle',
      agentHarness: false,
    });
    expect(off.answers).toBe(before.answers);
    expect(off.dials).toBe(before.dials);
    expect(off.generation).toBe(before.generation + 1);
    // Pressed back on, the field says so until `keel.dials` settles it
    // away — on is what an absent one means.
    expect(retarget(off, { agentHarness: true }).target).toMatchObject({ agentHarness: true });
  });

  it('carries a harness left out onto the new preset, for keel.dials to keep or drop', () => {
    const off = retarget(greenfield(), { agentHarness: false });
    expect(retarget(off, { stack: 'go-http' }).target).toEqual({
      kind: 'new-project',
      stack: 'go-http',
      buildSystem: 'gradle',
      agentHarness: false,
    });
  });

  it('takes a target of another kind whole, and starts over', () => {
    const next = retarget(greenfield(), { kind: 'add-vertical', verticals: [] });
    expect(next.target).toEqual({ kind: 'add-vertical', verticals: [] });
    expect(next.answers).toEqual({});
    expect(next.held).toEqual([]);
    expect(next.dials).toBeNull();
  });

  it("moves one service's build system on a product, keeping the other's", () => {
    // One field carries a pair per service, so a control that posted
    // its own pair alone would leave `keel.dials` to fill the other
    // with its default, and undo the move that service had made.
    const both = 'backend=gradle,frontend=npm';
    expect(withServiceBuild(both, 'backend', 'maven')).toBe('backend=maven,frontend=npm');
    expect(withServiceBuild(undefined, 'frontend', 'pnpm')).toBe('frontend=pnpm');
    expect(serviceBuild(withServiceBuild(both, 'frontend', 'pnpm'), 'backend')).toBe('gradle');
    expect(serviceBuild(both, 'frontend')).toBe('npm');
    expect(serviceBuild(both, 'worker')).toBeUndefined();
    expect(serviceBuild(undefined, 'backend')).toBeUndefined();
  });
});

describe('an answer', () => {
  it('joins the answers under its adapter, leaving the target alone', () => {
    const before = greenfield();
    const next = answer(before, {
      binding: { kind: 'answer', adapter: 'persistence/database-compose', question: 'migrations' },
      value: 'flyway',
    });
    expect(next.answers).toEqual({
      'persistence/database-compose': { engine: 'postgres', migrations: 'flyway' },
    });
    expect(next.target).toBe(before.target);
  });

  it('fills the command field its binding names', () => {
    const fill = (binding: AnswerBinding, value: string): Record<string, unknown> =>
      answer(greenfield(), { binding, value }).target;

    expect(fill({ kind: 'moduleLayout' }, 'modulith').moduleLayout).toBe('modulith');
    expect(fill({ kind: 'layout' }, 'polyrepo').layout).toBe('polyrepo');
    expect(fill({ kind: 'buildSystem' }, 'maven').buildSystem).toBe('maven');
    // One service of a composite names itself in the dial.
    expect(fill({ kind: 'buildSystem', service: 'backend' }, 'maven').buildSystem).toBe(
      'backend=maven',
    );
    expect(fill({ kind: 'withPeerContext' }, 'yes').withPeerContext).toBe(true);
    expect(fill({ kind: 'withPeerContext' }, 'no').withPeerContext).toBe(false);
  });

  it('moves the preset like the picker does', () => {
    const next = answer(greenfield(), { binding: { kind: 'stack' }, value: 'go-http' });
    expect(next.target).toEqual({ kind: 'new-project', stack: 'go-http', buildSystem: 'gradle' });
    expect(next.answers).toEqual({});
    expect(next.held).toEqual(retarget(greenfield(), { stack: 'go-http' }).held);
  });
});

describe('an "Also scaffold" box', () => {
  /**
   * `quarkus-rest`'s extras as `keel.dials` reports them: the image is
   * ready, the distribution needs it, IaC needs both — the one chain
   * the shipped catalog holds — and observability comes with the
   * preset.
   */
  const option = (
    id: string,
    readiness: DialOptions['verticals'][number]['readiness'],
    requires: readonly string[] = [],
  ): DialOptions['verticals'][number] => ({
    id,
    title: id,
    description: '',
    readiness,
    requires,
  });
  const withExtras = (extras: readonly string[]): Run => {
    const target = { kind: 'new-project', stack: 'quarkus-rest', extraVerticals: extras } as const;
    return {
      ...greenfield(),
      target,
      dials: {
        ...jvmDials(target),
        verticals: [
          option('ci', 'ready'),
          option('containerization', 'ready'),
          option('distribution', 'needs', ['containerization']),
          option('iac', 'needs', ['containerization', 'distribution']),
          option('observability', 'included'),
        ],
      },
    };
  };

  it('ticks what a vertical needs along with it', () => {
    expect(extrasOf(toggleExtra(withExtras([]), 'iac', true).target)).toEqual([
      'containerization',
      'distribution',
      'iac',
    ]);
    // What is already ticked stays, once.
    expect(
      extrasOf(toggleExtra(withExtras(['ci', 'containerization']), 'iac', true).target),
    ).toEqual(['ci', 'containerization', 'distribution', 'iac']);
  });

  it('unticks every vertical that needs the one unticked, and nothing else', () => {
    const all = ['ci', 'containerization', 'distribution', 'iac'];
    expect(extrasOf(toggleExtra(withExtras(all), 'containerization', false).target)).toEqual([
      'ci',
    ]);
    expect(extrasOf(toggleExtra(withExtras(all), 'distribution', false).target)).toEqual([
      'ci',
      'containerization',
    ]);
    // Unticking what needed others leaves them: they were ticked too.
    expect(extrasOf(toggleExtra(withExtras(all), 'iac', false).target)).toEqual([
      'ci',
      'containerization',
      'distribution',
    ]);
  });

  it('follows a dependant of a dependant, should requires ever stop listing the whole closure', () => {
    const run = withExtras(['a', 'b', 'c']);
    const chain = {
      ...run,
      dials: {
        ...(run.dials as DialOptions),
        verticals: [option('a', 'ready'), option('b', 'needs', ['a']), option('c', 'needs', ['b'])],
      },
    };
    expect(extrasOf(toggleExtra(chain, 'a', false).target)).toEqual([]);
  });

  it('is a move within the subject: the answers stay, the generation moves on', () => {
    const before = withExtras([]);
    const next = toggleExtra(before, 'ci', true);
    expect(next.answers).toBe(before.answers);
    expect(next.generation).toBe(before.generation + 1);
    expect(next.target).toEqual({
      kind: 'new-project',
      stack: 'quarkus-rest',
      extraVerticals: ['ci'],
    });
  });

  it('ticks the one box before any menu has landed, having nothing to read requires from', () => {
    const blank: Run = { ...greenfield(), dials: null };
    expect(extrasOf(toggleExtra(blank, 'iac', true).target)).toEqual(['iac']);
    expect(extrasOf(blank.target)).toEqual([]);
  });

  /**
   * A polyrepo `fullstack` as `keel.dials` reports it: each service
   * with its own menu, the backend's image chain as `quarkus-rest`'s.
   */
  const product = (services: Record<string, { extraVerticals: string[] }>): Run => {
    const target = {
      kind: 'new-project',
      stack: 'fullstack',
      layout: 'polyrepo',
      services,
    } as const;
    return {
      ...greenfield(),
      target,
      dials: reply({
        target,
        buildSystems: [],
        moduleLayouts: [],
        services: [
          {
            path: 'backend',
            stack: 'quarkus-rest',
            buildSystems: [choice('gradle')],
            verticals: [
              option('containerization', 'ready'),
              option('distribution', 'needs', ['containerization']),
              option('iac', 'needs', ['containerization', 'distribution']),
            ],
          },
          {
            path: 'frontend',
            stack: 'web-components',
            buildSystems: [choice('npm')],
            verticals: [option('dev-env', 'ready')],
          },
        ],
        peerContext: false,
        agentHarness: false,
        extraVerticals: [],
        verticals: [],
        adjustments: [],
      }),
    };
  };

  it('moves only its own service’s selection on a product, reading that service’s menu', () => {
    const ticked = toggleExtra(
      product({ frontend: { extraVerticals: ['dev-env'] } }),
      'iac',
      true,
      'backend',
    );
    expect(serviceExtrasOf(ticked.target, 'backend')).toEqual([
      'containerization',
      'distribution',
      'iac',
    ]);
    expect(serviceExtrasOf(ticked.target, 'frontend')).toEqual(['dev-env']);
    expect(extrasOf(ticked.target)).toEqual([]);
    // Unticking what the rest needs empties the service, and its key
    // goes with it: no service is named with nothing.
    const unticked = toggleExtra(
      { ...ticked, dials: product({}).dials },
      'containerization',
      false,
      'backend',
    );
    expect(unticked.target).toEqual({
      kind: 'new-project',
      stack: 'fullstack',
      layout: 'polyrepo',
      services: { frontend: { extraVerticals: ['dev-env'] } },
    });
  });
});

describe('what a preset move could not keep', () => {
  it('says nothing where the new preset kept every dial', () => {
    const moved = retarget(tuned(), { stack: 'quarkus-cli-rest' });
    const settled = settle(moved, jvmDials({ ...moved.target, kind: 'new-project' }));
    expect(settled.target.buildSystem).toBe('maven');
    expect(settled.notice).toBe('');
    expect(settled.carried).toBeNull();
  });

  it('names each dial moved off its default that the new preset dropped or snapped', () => {
    const moved = retarget(tuned(), { stack: 'fullstack' });
    // What `keel.dials` settles a product at: its own build pairs, a
    // repository layout, and none of the single-project dials.
    const settled = settle(
      moved,
      reply({
        target: {
          kind: 'new-project',
          stack: 'fullstack',
          layout: 'monorepo',
          buildSystem: 'backend=gradle,frontend=npm',
        },
        buildSystems: [],
        moduleLayouts: [],
        services: [
          {
            path: 'backend',
            stack: 'quarkus-rest',
            buildSystems: [choice('gradle')],
            verticals: [],
          },
          {
            path: 'frontend',
            stack: 'web-components',
            buildSystems: [choice('npm')],
            verticals: [],
          },
        ],
        peerContext: false,
        agentHarness: false,
        extraVerticals: [],
        verticals: [],
        adjustments: [],
      }),
    );
    expect(settled.notice).toBe(
      'Moving to fullstack did not keep build system maven, module layout modulith or the peer context.',
    );
  });

  it('names the agent harness a product put back, and keeps quiet where the preset kept it off', () => {
    const off = (): Run => {
      const target = {
        kind: 'new-project',
        stack: 'quarkus-rest',
        buildSystem: 'gradle',
        agentHarness: false,
      } as const;
      return { ...greenfield(), target, dials: jvmDials(target) };
    };
    // Another single preset keeps it off, and the reply says so by
    // carrying it.
    const kept = retarget(off(), { stack: 'quarkus-cli-rest' });
    expect(settle(kept, jvmDials({ ...kept.target, kind: 'new-project' })).notice).toBe('');

    // A product has no such dial — every service carries the harness.
    const moved = retarget(off(), { stack: 'fullstack' });
    const settled = settle(
      moved,
      reply({
        target: {
          kind: 'new-project',
          stack: 'fullstack',
          layout: 'monorepo',
          buildSystem: 'backend=gradle,frontend=npm',
        },
        buildSystems: [],
        moduleLayouts: [],
        services: [
          {
            path: 'backend',
            stack: 'quarkus-rest',
            buildSystems: [choice('gradle')],
            verticals: [],
          },
          {
            path: 'frontend',
            stack: 'web-components',
            buildSystems: [choice('npm')],
            verticals: [],
          },
        ],
        peerContext: false,
        agentHarness: false,
        extraVerticals: [],
        verticals: [],
        adjustments: [],
      }),
    );
    expect(settled.notice).toBe('Moving to fullstack did not keep the agent harness off.');
  });

  it('keeps quiet about a default nobody chose going missing', () => {
    // Gradle and the flat layout were the menus' first entries: Go
    // having no build system to choose is not news to anyone.
    const moved = retarget(greenfield(), { stack: 'go-http' });
    const settled = settle(
      moved,
      reply({
        target: { kind: 'new-project', stack: 'go-http', moduleLayout: 'basic' },
        buildSystems: [],
        moduleLayouts: [choice('basic'), choice('modulith')],
        services: [],
        peerContext: true,
        agentHarness: true,
        extraVerticals: [],
        verticals: [],
        adjustments: [],
      }),
    );
    expect(settled.notice).toBe('');
  });

  it('reads a product’s default builds off its services, so leaving one is quiet too', () => {
    const product: Run = {
      ...greenfield(),
      target: {
        kind: 'new-project',
        stack: 'fullstack',
        layout: 'monorepo',
        buildSystem: 'backend=gradle,frontend=npm',
      },
      dials: reply({
        target: { kind: 'new-project', stack: 'fullstack' },
        buildSystems: [],
        moduleLayouts: [],
        services: [
          {
            path: 'backend',
            stack: 'quarkus-rest',
            buildSystems: [choice('gradle')],
            verticals: [],
          },
          {
            path: 'frontend',
            stack: 'web-components',
            buildSystems: [choice('npm')],
            verticals: [],
          },
        ],
        peerContext: false,
        agentHarness: false,
        extraVerticals: [],
        verticals: [],
        adjustments: [],
      }),
    };
    const moved = retarget(product, { stack: 'quarkus-rest' });
    const settled = settle(moved, jvmDials({ kind: 'new-project', stack: 'quarkus-rest' }));
    expect(settled.notice).toBe('');
  });

  it('forgets a dial picked by hand before the reply landed', () => {
    const moved = retarget(tuned(), { stack: 'ts-cli' });
    const repicked = retarget(moved, { buildSystem: 'pnpm' });
    const settled = settle(repicked, {
      ...jvmDials({
        kind: 'new-project',
        stack: 'ts-cli',
        buildSystem: 'pnpm',
        moduleLayout: 'modulith',
        withPeerContext: true,
      }),
      buildSystems: [choice('npm'), choice('pnpm')],
    });
    // Maven was lost, but to a hand, not to the move — and the
    // modulith and the peer context the move did keep.
    expect(settled.notice).toBe('');
  });

  it('carries the pending dials on through a second move made before the first settled', () => {
    const first = retarget(tuned(), { stack: 'quarkus-cli-rest' });
    const second = retarget(first, { stack: 'go-cli-http' });
    // Nobody saw the first move settle, so the second one is measured
    // from where the user last stood.
    expect(second.carried?.from).toBe('quarkus-rest');
    const settled = settle(
      second,
      reply({
        target: {
          kind: 'new-project',
          stack: 'go-cli-http',
          moduleLayout: 'modulith',
          withPeerContext: true,
        },
        buildSystems: [],
        moduleLayouts: [choice('basic'), choice('modulith')],
        services: [],
        peerContext: true,
        agentHarness: true,
        extraVerticals: [],
        verticals: [],
        adjustments: [],
      }),
    );
    expect(settled.notice).toBe('Moving to go-cli-http did not keep build system maven.');
  });

  it('says the language jumped where the new shape has no preset in the old one', async () => {
    const kotlin: Run = {
      ...greenfield(),
      target: { kind: 'new-project', stack: 'spring-cli-rest-kotlin', buildSystem: 'gradle' },
    };
    const moved = retarget(kotlin, { stack: 'fullstack-spring' });
    const settled = settle(
      moved,
      reply({
        target: { kind: 'new-project', stack: 'fullstack-spring', layout: 'monorepo' },
        buildSystems: [],
        moduleLayouts: [],
        services: [],
        peerContext: false,
        agentHarness: false,
        extraVerticals: [],
        verticals: [],
        adjustments: [],
      }),
      await finder(),
    );
    expect(settled.notice).toBe('Kotlin has no fullstack preset, so the language is now Java.');

    // A framework picked on the new shape before the reply landed does
    // not swallow the jump: the move is still one away from Kotlin.
    const hurried = retarget(moved, { stack: 'fullstack-micronaut' });
    const later = settle(
      hurried,
      reply({
        target: { kind: 'new-project', stack: 'fullstack-micronaut', layout: 'monorepo' },
        buildSystems: [],
        moduleLayouts: [],
        services: [],
        peerContext: false,
        agentHarness: false,
        extraVerticals: [],
        verticals: [],
        adjustments: [],
      }),
      await finder(),
    );
    expect(later.notice).toBe('Kotlin has no fullstack preset, so the language is now Java.');
  });

  it('names a product’s build systems by service, and only the ones it lost', () => {
    const service = (path: string, stack: string, ...ids: string[]) => ({
      path,
      stack,
      buildSystems: ids.map(choice),
      verticals: [],
    });
    const product = (stack: string, ...services: DialOptions['services']): DialOptions => ({
      target: { kind: 'new-project', stack },
      buildSystems: [],
      moduleLayouts: [],
      services,
      peerContext: false,
      agentHarness: false,
      extraVerticals: [],
      verticals: [],
      adjustments: [],
    });
    // Maven for the backend moved one service off its default; npm for
    // the front end is the default, so it is nothing to lose.
    const maven: Run = {
      ...greenfield(),
      target: {
        kind: 'new-project',
        stack: 'fullstack',
        layout: 'monorepo',
        buildSystem: 'backend=maven,frontend=npm',
      },
      dials: product(
        'fullstack',
        service('backend', 'quarkus-rest', 'gradle', 'maven'),
        service('frontend', 'web-components', 'npm', 'pnpm'),
      ),
    };

    // Go builds without one: the backend's Maven is lost, the front
    // end's npm is kept — and the line says the one, not the pair.
    const go = retarget(maven, { stack: 'fullstack-go' });
    const onGo = settle(go, {
      ...product(
        'fullstack-go',
        service('backend', 'go-http'),
        service('frontend', 'web-components', 'npm', 'pnpm'),
      ),
      target: {
        kind: 'new-project',
        stack: 'fullstack-go',
        layout: 'monorepo',
        buildSystem: 'frontend=npm',
      },
    });
    expect(onGo.notice).toBe('Moving to fullstack-go did not keep build system maven for backend.');

    // A product whose services all take their choices keeps quiet.
    const spring = retarget(maven, { stack: 'fullstack-spring' });
    const onSpring = settle(spring, {
      ...product(
        'fullstack-spring',
        service('backend', 'spring-rest', 'gradle', 'maven'),
        service('frontend', 'web-components', 'npm', 'pnpm'),
      ),
      target: {
        kind: 'new-project',
        stack: 'fullstack-spring',
        layout: 'monorepo',
        buildSystem: 'backend=maven,frontend=npm',
      },
    });
    expect(onSpring.notice).toBe('');
  });

  /**
   * `tuned` with `extras` ticked, its menus titling them as the
   * shipped registry does.
   */
  const withExtras = (...extras: string[]): Run => {
    const run = tuned();
    const target = { ...run.target, extraVerticals: extras };
    return {
      ...run,
      target,
      dials: {
        ...jvmDials(target as DialOptions['target']),
        verticals: [
          { id: 'ci', title: 'Continuous integration', description: '', readiness: 'ready' },
          { id: 'containerization', title: 'Container image', description: '', readiness: 'ready' },
          { id: 'dev-env', title: 'Development environment', description: '', readiness: 'ready' },
        ].map((option) => ({ ...option, requires: [] }) as DialOptions['verticals'][number]),
      },
    };
  };

  it('names each extra the new preset could not carry, with the reason keel.dials gave', () => {
    const moved = retarget(withExtras('ci', 'containerization'), { stack: 'quarkus-cli' });
    const because =
      'Container image needs an entrypoint this project does not have: HTTP server — a REST endpoint';
    const settled = settle(moved, {
      ...jvmDials({ ...moved.target, kind: 'new-project', extraVerticals: ['ci'] }),
      adjustments: [{ id: 'containerization', change: 'dropped', because }],
    });
    expect(settled.notice).toBe(
      'Container image dropped: it needs an entrypoint this project does not have: HTTP server — a REST endpoint.',
    );
  });

  it('keeps quiet about an extra the new preset comes with, which it keeps', () => {
    const moved = retarget(withExtras('dev-env'), { stack: 'quarkus-cli-rest' });
    const settled = settle(moved, {
      ...jvmDials({ ...moved.target, kind: 'new-project', extraVerticals: [] }),
      verticals: [
        {
          id: 'dev-env',
          title: 'Development environment',
          description: '',
          readiness: 'included',
          requires: [],
        },
      ],
      adjustments: [
        {
          id: 'dev-env',
          change: 'dropped',
          because: 'Development environment already comes with quarkus-cli-rest',
        },
      ],
    });
    expect(settled.notice).toBe('');
  });

  it('names an extra a reply dropped without a reason by the title the old menu gave it', () => {
    // `keel.dials` gives a reason for every extra it drops; a reply
    // that gives none, and lists nothing to title it by, still names
    // it rather than let it go without a word.
    const moved = retarget(withExtras('ci'), { stack: 'fullstack' });
    const settled = settle(
      moved,
      reply({
        target: {
          kind: 'new-project',
          stack: 'fullstack',
          layout: 'monorepo',
          buildSystem: 'backend=maven,frontend=npm',
        },
        buildSystems: [],
        moduleLayouts: [],
        services: [
          {
            path: 'backend',
            stack: 'quarkus-rest',
            buildSystems: [choice('gradle')],
            verticals: [],
          },
          {
            path: 'frontend',
            stack: 'web-components',
            buildSystems: [choice('npm')],
            verticals: [],
          },
        ],
        peerContext: false,
        agentHarness: false,
        extraVerticals: [],
        verticals: [],
        adjustments: [],
      }),
    );
    expect(settled.notice).toBe(
      'Moving to fullstack did not keep build system maven, module layout modulith, the peer context or Continuous integration.',
    );
  });

  it('sends a single preset’s extras to the one service of a product that takes each', async () => {
    const mediator = installMediator();
    const moved = retarget(withExtras('ci', 'containerization', 'dev-env'), {
      stack: 'fullstack',
    });
    expect(moved.target).toMatchObject({ extraVerticals: ['ci', 'containerization', 'dev-env'] });
    const dials: DialOptions = expectOk(
      await mediator.dispatch(dialsQuery({ target: moved.target as NewProjectTarget })),
    );
    const settled = settle(moved, dials);
    // The development environment goes in the one service that can
    // take it; the image each service already has from the monorepo
    // root is kept by them; the pipeline has nowhere to go, and says
    // why.
    expect(settled.target).toMatchObject({
      services: { frontend: { extraVerticals: ['dev-env'] } },
    });
    expect(settled.target).not.toHaveProperty('extraVerticals');
    expect(settled.notice).toBe(
      'Moving to fullstack did not keep build system maven, module layout modulith or the peer context. ' +
        "Continuous integration dropped: it cannot be installed here: keel installs it at no monorepo product's root yet, and it cannot go in one of the product's services: its pipeline is read only at the repository root, which in a monorepo is the product root — per-service pipelines need the polyrepo layout.",
    );
  });

  it('carries a product’s service extras onto a single preset as its own', async () => {
    const mediator = installMediator();
    const onProduct: Run = {
      ...greenfield(),
      target: {
        kind: 'new-project',
        stack: 'fullstack',
        layout: 'monorepo',
        services: { backend: { extraVerticals: ['persistence'] } },
      },
    };
    const productDials: DialOptions = expectOk(
      await mediator.dispatch(dialsQuery({ target: onProduct.target as NewProjectTarget })),
    );
    const moved = retarget(settle(onProduct, productDials), { stack: 'quarkus-rest' });
    const dials: DialOptions = expectOk(
      await mediator.dispatch(dialsQuery({ target: moved.target as NewProjectTarget })),
    );
    const settled = settle(moved, dials);
    expect(extrasOf(settled.target)).toEqual(['persistence']);
    expect(settled.target).not.toHaveProperty('services');
    expect(settled.notice).toBe('');
  });

  it('forgets the extras ticked by hand before the reply landed', () => {
    const moved = retarget(withExtras('ci', 'containerization'), { stack: 'quarkus-cli' });
    const repicked = retarget(moved, { extraVerticals: ['ci'] });
    const settled = settle(repicked, {
      ...jvmDials({ ...repicked.target, kind: 'new-project', extraVerticals: ['ci'] }),
    });
    expect(settled.notice).toBe('');
  });

  it('lets any later move retire the line', () => {
    const settled = {
      ...greenfield(),
      notice: 'Moving to go-http did not keep build system maven.',
    };
    expect(retarget(settled, { moduleLayout: 'modulith' }).notice).toBe('');
    expect(answer(settled, { binding: ENGINE, value: 'mysql' }).notice).toBe('');
    expect(restart(settled, { kind: 'add-vertical', verticals: [] }).notice).toBe('');
    // A reply settling a move that carried nothing has nothing to add.
    expect(settle(settled, jvmDials(settled.target as DialOptions['target'])).notice).toBe(
      settled.notice,
    );
  });
});

describe('a preview reply', () => {
  it('keeps the answers its plan still asks for, and drops the rest before an install sees them', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'keel-previewed-'));
    try {
      const mediator = installMediator();
      const target = (run: Run): NewProjectTarget => run.target as unknown as NewProjectTarget;
      const preview = async (run: Run) =>
        expectOk(
          await mediator.dispatch(previewQuery({ cwd, target: target(run), answers: run.answers })),
        );
      const install = (run: Run) =>
        mediator.dispatch(
          installCommandFor(target(run), {
            cwd,
            answers: run.answers,
            interactive: false,
            dryRun: true,
          }),
        );

      const ticked = answer(retarget(greenfield(), { extraVerticals: ['persistence'] }), {
        binding: ENGINE,
        value: 'mariadb',
      });
      const asked = previewed(ticked, await preview(ticked));
      expect(asked.answers).toEqual({ 'persistence/database-compose': { engine: 'mariadb' } });
      // The reply the page was waiting for, not a move of its own.
      expect(asked.generation).toBe(ticked.generation);

      // Unticking the extra keeps the subject, and so the answer — which
      // nothing in the plan reads any more, and the install refuses.
      const unticked = retarget(asked, { extraVerticals: [] });
      expect(unticked.answers).toEqual(asked.answers);
      expect(expectErr(await install(unticked)).code).toBe('keel.unknown-answer');

      const heard = previewed(unticked, await preview(unticked));
      expect(heard.answers).toEqual({});
      expectOk(await install(heard));
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('keeps an answer the preview read under a sibling’s key, which the install reads too', async () => {
    // A Quarkus REST bootstrap's package on quarkus-cli-rest, whose CLI
    // bootstrap asks: the preview binds the question to the key it was
    // read under, so the page keeps it — and posts what it previewed.
    const cwd = await mkdtemp(path.join(tmpdir(), 'keel-previewed-'));
    try {
      const mediator = installMediator();
      const target: NewProjectTarget = { kind: 'new-project', stack: 'quarkus-cli-rest' };
      const run: Run = {
        ...greenfield(),
        target: { kind: 'new-project', stack: 'quarkus-cli-rest' },
        answers: { 'walking-skeleton/quarkus-rest-bootstrap': { basePackage: 'org.acme' } },
      };
      const preview = expectOk(
        await mediator.dispatch(previewQuery({ cwd, target, answers: run.answers })),
      );
      const kept = previewed(run, preview);
      expect(kept.answers).toEqual(run.answers);
      expect(preview.unusedAnswers).toBeUndefined();
      const installed = expectOk(
        await mediator.dispatch(
          installCommandFor(target, {
            cwd,
            answers: kept.answers,
            interactive: false,
            dryRun: true,
          }),
        ),
      );
      expect(installed.changes).toEqual(preview.changes);
      expect(installed.changes.some((change) => change.path.includes('org/acme'))).toBe(true);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('drops an unasked question of an adapter it keeps', () => {
    const run = answer(greenfield(), {
      binding: { kind: 'answer', adapter: 'persistence/database-compose', question: 'migrations' },
      value: 'flyway',
    });
    const questions = [{ binding: ENGINE }, { binding: { kind: 'stack' } }];
    expect(previewed(run, { questions }).answers).toEqual({
      'persistence/database-compose': { engine: 'postgres' },
    });
  });
});

describe('the answers a preset move holds', () => {
  const bootstrap = (id: string, question: string): AnswerBinding => ({
    kind: 'answer',
    adapter: `walking-skeleton/${id}-bootstrap`,
    question,
  });
  const BRANCH: AnswerBinding = {
    kind: 'answer',
    adapter: 'vcs/git-init',
    question: 'defaultBranch',
  };

  /** A question as a preview reports it, held to the contract the page reads it from. */
  const pending = (
    binding: AnswerBinding,
    value: string,
    more: Partial<PendingQuestion> = {},
  ): PendingQuestion => ({
    id: binding.kind === 'answer' ? binding.question : binding.kind,
    prompt: '',
    doc: '',
    default: value,
    value,
    memory: 'sticky',
    binding,
    ...more,
  });
  const shared = { shared: 'project' } as const;

  /**
   * `quarkus-rest` with a package, a branch and an engine answered,
   * after the preview that asked them: the package marked as the
   * project's identity.
   */
  const answered = (): Run =>
    previewed(
      {
        ...greenfield(),
        answers: {
          'walking-skeleton/quarkus-rest-bootstrap': { basePackage: 'org.acme' },
          'vcs/git-init': { defaultBranch: 'trunk' },
          'persistence/database-compose': { engine: 'mariadb' },
        },
      },
      {
        questions: [
          pending(bootstrap('quarkus-rest', 'basePackage'), 'org.acme', shared),
          pending(BRANCH, 'trunk'),
          pending(ENGINE, 'mariadb'),
        ],
      },
    );

  it('holds every answer a move leaves, marking the ones about the project’s identity', () => {
    const moved = retarget(answered(), { stack: 'go-http' });
    expect(moved.answers).toEqual({});
    expect(moved.held).toEqual([
      {
        adapter: 'walking-skeleton/quarkus-rest-bootstrap',
        question: 'basePackage',
        value: 'org.acme',
        identity: true,
      },
      { adapter: 'vcs/git-init', question: 'defaultBranch', value: 'trunk', identity: false },
      {
        adapter: 'persistence/database-compose',
        question: 'engine',
        value: 'mariadb',
        identity: false,
      },
    ]);
    // A second move before any preview holds the same, measured from
    // the same preview's marks.
    expect(retarget(moved, { stack: 'quarkus-cli-rest' }).held).toEqual(moved.held);
    // So does a move within the preset before it: the marks are the
    // last preview's until the next one replies.
    const maven = retarget(answered(), { buildSystem: 'maven' });
    expect(retarget(maven, { stack: 'go-http' }).held).toEqual(moved.held);
  });

  it('places a held answer back on its question, and previews again for it', () => {
    const moved = retarget(answered(), { stack: 'spring-rest' });
    const first = previewed(moved, {
      questions: [
        pending(bootstrap('spring-rest', 'basePackage'), 'com.example', shared),
        pending(BRANCH, 'main'),
      ],
    });
    expect(first.answers).toEqual({
      'walking-skeleton/spring-rest-bootstrap': { basePackage: 'org.acme' },
      'vcs/git-init': { defaultBranch: 'trunk' },
    });
    // That reply shows `com.example` and `main`: not the run's plan any
    // more, so the page asks again.
    expect(first.generation).toBe(moved.generation + 1);
    expect(first.held).toEqual([moved.held[2]]);

    const second = previewed(first, {
      questions: [
        pending(bootstrap('spring-rest', 'basePackage'), 'org.acme', shared),
        pending(BRANCH, 'trunk'),
      ],
    });
    expect(second.answers).toEqual(first.answers);
    expect(second.generation).toBe(first.generation);
    // Nothing left to place: what is still held is let go.
    expect(second.held).toEqual([]);
  });

  it('moves an identity answer onto its own id only, and only onto one question', () => {
    // A product's two names, moved to a single project asking one: the
    // first takes it, the other has nowhere to go.
    const product: Run = {
      ...greenfield(),
      answers: {
        'walking-skeleton/quarkus-rest-bootstrap': { projectName: 'api', basePackage: 'org.acme' },
        'walking-skeleton/wc-spa-bootstrap': { projectName: 'web' },
        'observability/monitoring-compose': { projectName: 'metrics' },
      },
      identity: [
        'walking-skeleton/quarkus-rest-bootstrap:projectName',
        'walking-skeleton/quarkus-rest-bootstrap:basePackage',
        'walking-skeleton/wc-spa-bootstrap:projectName',
      ],
    };
    const moved = retarget(product, { stack: 'go-http' });
    const placed = previewed(moved, {
      questions: [
        pending(bootstrap('go', 'modulePath'), 'example.com/walking-skeleton', shared),
        pending(bootstrap('go', 'projectName'), 'walking-skeleton', shared),
      ],
    });
    // The package has no question of its id on Go, and an answer that
    // was never the project's identity is not moved onto one.
    expect(placed.answers).toEqual({ 'walking-skeleton/go-bootstrap': { projectName: 'api' } });
    expect(placed.identity).toEqual([
      'walking-skeleton/go-bootstrap:modulePath',
      'walking-skeleton/go-bootstrap:projectName',
    ]);
  });

  it('moves by the marks alone: an unmarked answer stays put, a marked one skips an unmarked question', () => {
    // A plugin's adapter may ask a `projectName` of its own, about
    // itself rather than the project. Sharing the id is not sharing
    // the meaning, in either direction.
    const METRICS: AnswerBinding = {
      kind: 'answer',
      adapter: 'acme/metrics',
      question: 'projectName',
    };
    const GO_NAME = pending(bootstrap('go', 'projectName'), 'walking-skeleton', shared);

    const unmarked = retarget(
      { ...greenfield(), answers: { 'acme/metrics': { projectName: 'metrics' } } },
      { stack: 'go-http' },
    );
    expect(previewed(unmarked, { questions: [GO_NAME] }).answers).toEqual({});

    const marked = retarget(
      {
        ...greenfield(),
        answers: { 'walking-skeleton/quarkus-rest-bootstrap': { projectName: 'shop' } },
        identity: ['walking-skeleton/quarkus-rest-bootstrap:projectName'],
      },
      { stack: 'go-http' },
    );
    expect(
      previewed(marked, { questions: [pending(METRICS, 'metrics'), GO_NAME] }).answers,
    ).toEqual({ 'walking-skeleton/go-bootstrap': { projectName: 'shop' } });
  });

  it('keeps an identity answer to its own question, even once that one is answered again', () => {
    // Its own question is where it belongs. Answered there since the
    // move, it is superseded — not moved onto another service's name.
    const moved = retarget(
      {
        ...greenfield(),
        answers: { 'walking-skeleton/quarkus-rest-bootstrap': { projectName: 'shop' } },
        identity: ['walking-skeleton/quarkus-rest-bootstrap:projectName'],
      },
      { stack: 'fullstack' },
    );
    const given = answer(moved, {
      binding: bootstrap('quarkus-rest', 'projectName'),
      value: 'api',
    });
    const placed = previewed(given, {
      questions: [
        pending(bootstrap('quarkus-rest', 'projectName'), 'api', shared),
        pending(bootstrap('wc-spa', 'projectName'), 'walking-skeleton', shared),
      ],
    });
    expect(placed.answers).toEqual({
      'walking-skeleton/quarkus-rest-bootstrap': { projectName: 'api' },
    });
    expect(placed.generation).toBe(given.generation);
  });

  it('gives two identity answers of one id a question each, in the order they were given', () => {
    // A product whose services both change family — no two shipped
    // products differ in both, but a plugin's can: each name takes the
    // first question of its id nothing has taken yet.
    const product = retarget(
      {
        ...greenfield(),
        answers: {
          'walking-skeleton/quarkus-rest-bootstrap': { projectName: 'api' },
          'walking-skeleton/wc-spa-bootstrap': { projectName: 'web' },
        },
        identity: [
          'walking-skeleton/quarkus-rest-bootstrap:projectName',
          'walking-skeleton/wc-spa-bootstrap:projectName',
        ],
      },
      { stack: 'acme-product' },
    );
    const placed = previewed(product, {
      questions: [
        pending(bootstrap('go', 'projectName'), 'walking-skeleton', shared),
        pending(bootstrap('ts-cli', 'projectName'), 'walking-skeleton', shared),
      ],
    });
    expect(placed.answers).toEqual({
      'walking-skeleton/go-bootstrap': { projectName: 'api' },
      'walking-skeleton/ts-cli-bootstrap': { projectName: 'web' },
    });
  });

  it('leaves behind a choice the new question does not offer', () => {
    const moved = retarget(answered(), { stack: 'go-http' });
    const choices = (...values: string[]) =>
      values.map((value) => ({ value, label: value, doc: '' }));
    const placed = previewed(moved, {
      questions: [pending(ENGINE, 'postgres', { choices: choices('postgres') })],
    });
    // Posted, MariaDB would be `keel.invalid-answer` on Go — a refusal
    // with no question on screen to change it at.
    expect(placed.answers).toEqual({});
    expect(placed.generation).toBe(moved.generation);
    expect(placed.held).toEqual([]);

    // A selection is held to its choices one value at a time.
    const selection: Run = {
      ...moved,
      held: [
        { adapter: 'x/y', question: 'some', value: 'a,c', identity: false },
        { adapter: 'x/y', question: 'many', value: 'a,b', identity: false },
      ],
    };
    const both = { kind: 'multi-select', choices: choices('a', 'b') } as const;
    expect(
      previewed(selection, {
        questions: [
          pending({ kind: 'answer', adapter: 'x/y', question: 'some' }, '', both),
          pending({ kind: 'answer', adapter: 'x/y', question: 'many' }, '', both),
        ],
      }).answers,
    ).toEqual({ 'x/y': { many: 'a,b' } });
  });

  it('previews once where the reply already shows each answer it places', () => {
    // `trunk` chosen where `trunk` is what the new preset would have
    // said anyway: the reply is the run's plan, and is drawn.
    const moved = retarget(answered(), { stack: 'go-http' });
    const placed = previewed(moved, { questions: [pending(BRANCH, 'trunk')] });
    expect(placed.answers).toEqual({ 'vcs/git-init': { defaultBranch: 'trunk' } });
    expect(placed.generation).toBe(moved.generation);
    expect(placed.held).toEqual([]);
  });

  it('never places a held answer over one given since', () => {
    const moved = retarget(answered(), { stack: 'go-http' });
    const given = answer(moved, { binding: BRANCH, value: 'develop' });
    const placed = previewed(given, { questions: [pending(BRANCH, 'develop')] });
    expect(placed.answers).toEqual({ 'vcs/git-init': { defaultBranch: 'develop' } });
    expect(placed.generation).toBe(given.generation);
  });

  /**
   * `<keel-app>`'s loop after a move, through the real queries: settle
   * the dials, preview, place what is held — and again while placing
   * moved the plan, as the page previews again.
   */
  async function roundTrip(cwd: string, run: Run): Promise<{ run: Run; preview: InstallPreview }> {
    const mediator = installMediator();
    let current = run;
    for (let round = 0; round < 5; round += 1) {
      const target = current.target as unknown as NewProjectTarget;
      const settled = settle(current, expectOk(await mediator.dispatch(dialsQuery({ target }))));
      const preview = expectOk(
        await mediator.dispatch(
          previewQuery({
            cwd,
            target: settled.target as unknown as NewProjectTarget,
            answers: settled.answers,
          }),
        ),
      );
      const next = previewed(settled, preview);
      if (next.generation === settled.generation) return { run: next, preview };
      current = next;
    }
    throw new Error('the preview loop never settled');
  }

  /** What a dry-run install of the run's body stages. */
  const installOf = async (cwd: string, run: Run) =>
    expectOk(
      await installMediator().dispatch(
        installCommandFor(run.target as unknown as NewProjectTarget, {
          cwd,
          answers: run.answers,
          interactive: false,
          dryRun: true,
        }),
      ),
    );

  it('carries a package within the family and a name across it, as the install writes them', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'keel-held-'));
    try {
      const opened = await roundTrip(cwd, {
        ...greenfield(),
        target: { kind: 'new-project', stack: 'quarkus-rest' },
        answers: {},
        dials: null,
      });
      const bootstrapOf = (stack: string) => `walking-skeleton/${stack}-bootstrap`;
      const given = [
        { binding: bootstrap('quarkus-rest', 'basePackage'), value: 'org.acme' },
        { binding: bootstrap('quarkus-rest', 'projectName'), value: 'shop' },
        { binding: BRANCH, value: 'trunk' },
      ].reduce((run, answered) => answer(run, answered), opened.run);
      const onRest = await roundTrip(cwd, given);

      // Ticking the CLI adapter: the CLI bootstrap asks for the package now.
      const onCliRest = await roundTrip(cwd, retarget(onRest.run, { stack: 'quarkus-cli-rest' }));
      expect(onCliRest.run.answers).toEqual({
        [bootstrapOf('quarkus-cli')]: { basePackage: 'org.acme', projectName: 'shop' },
        'vcs/git-init': { defaultBranch: 'trunk' },
      });
      expect(onCliRest.preview.unusedAnswers).toBeUndefined();
      expect(onCliRest.preview.changes.some((change) => change.path.includes('org/acme'))).toBe(
        true,
      );
      expect((await installOf(cwd, onCliRest.run)).changes).toEqual(onCliRest.preview.changes);

      // On to Go: the name goes along, the package has no question there.
      const onGo = await roundTrip(cwd, retarget(onCliRest.run, { stack: 'go-http' }));
      expect(onGo.run.answers).toEqual({
        [bootstrapOf('go')]: { projectName: 'shop' },
        'vcs/git-init': { defaultBranch: 'trunk' },
      });
      expect((await installOf(cwd, onGo.run)).changes).toEqual(onGo.preview.changes);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it('lets a MariaDB go on Go rather than post it into a refusal', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'keel-held-'));
    try {
      const opened = await roundTrip(cwd, {
        ...greenfield(),
        target: { kind: 'new-project', stack: 'quarkus-rest', extraVerticals: ['persistence'] },
        answers: {},
        dials: null,
      });
      const onJvm = await roundTrip(cwd, answer(opened.run, { binding: ENGINE, value: 'mariadb' }));
      expect(onJvm.run.answers).toEqual({ 'persistence/database-compose': { engine: 'mariadb' } });

      const onGo = await roundTrip(cwd, retarget(onJvm.run, { stack: 'go-http' }));
      expect(extrasOf(onGo.run.target)).toEqual(['persistence']);
      expect(onGo.run.answers).toEqual({});
      expect(onGo.run.held).toEqual([]);
      await installOf(cwd, onGo.run);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it.each(['monorepo', 'polyrepo'])(
    'carries a package and a name into a product’s backend, %s, as the install writes them',
    async (layout) => {
      // A product's backend is asked by the same bootstrap as the
      // preset it came from, so the answers land on their own
      // questions; the front end, asked by another, keeps its defaults.
      // The layout picked before the first reply is a move within the
      // product, which leaves what is held alone.
      const cwd = await mkdtemp(path.join(tmpdir(), 'keel-held-'));
      try {
        const opened = await roundTrip(cwd, {
          ...greenfield(),
          target: { kind: 'new-project', stack: 'quarkus-rest' },
          answers: {},
          dials: null,
        });
        const given = [
          { binding: bootstrap('quarkus-rest', 'basePackage'), value: 'org.acme' },
          { binding: bootstrap('quarkus-rest', 'projectName'), value: 'shop' },
        ].reduce((run, answered) => answer(run, answered), opened.run);
        const onRest = await roundTrip(cwd, given);

        const moved = retarget(retarget(onRest.run, { stack: 'fullstack' }), { layout });
        const onProduct = await roundTrip(cwd, moved);
        expect(onProduct.run.target).toMatchObject({ stack: 'fullstack', layout });
        expect(onProduct.run.answers).toEqual({
          'walking-skeleton/quarkus-rest-bootstrap': {
            basePackage: 'org.acme',
            projectName: 'shop',
          },
        });
        expect(onProduct.preview.changes.some((change) => change.path.includes('org/acme'))).toBe(
          true,
        );
        expect((await installOf(cwd, onProduct.run)).changes).toEqual(onProduct.preview.changes);
      } finally {
        await rm(cwd, { recursive: true, force: true });
      }
    },
  );
});

describe('the request in flight', () => {
  /**
   * `<keel-app>` claims a generation when a request starts and drops
   * the reply if the generation has moved by the time it lands. A
   * `keel.dials` reply carries a whole target, so one computed for the
   * previous pick and adopted after the next would undo the pick.
   */
  it('is superseded by every transition', () => {
    const inFlight = greenfield();
    const superseded = (next: Run): boolean => next.generation !== inFlight.generation;

    expect(superseded(retarget(inFlight, { moduleLayout: 'modulith' }))).toBe(true);
    expect(superseded(retarget(inFlight, { stack: 'go-http' }))).toBe(true);
    expect(superseded(answer(inFlight, { binding: ENGINE, value: 'mysql' }))).toBe(true);
    expect(superseded(answer(inFlight, { binding: { kind: 'buildSystem' }, value: 'maven' }))).toBe(
      true,
    );
    expect(superseded(restart(inFlight, { kind: 'add-vertical', verticals: [] }))).toBe(true);
  });

  it('keeps moving forward, so no later transition can reuse an id', () => {
    const first = rerender(brownfield(), 'vcs');
    const second = toggleVertical(first, status, 'ci', true);
    const third = toggleRefresh(second, 'vcs', true);
    const fourth = restart(third, { kind: 'add-vertical', verticals: [] });
    expect([first, second, third, fourth].map((run) => run.generation)).toEqual([1, 2, 3, 4]);
  });
});

describe('pointing the page at a directory', () => {
  it('starts the run over at the target given', () => {
    const next = restart(greenfield(), { kind: 'add-vertical', verticals: [] });
    expect(next).toEqual({
      target: { kind: 'add-vertical', verticals: [] },
      answers: {},
      dials: null,
      generation: 1,
      carried: null,
      notice: '',
      held: [],
      identity: [],
    });
  });
});
