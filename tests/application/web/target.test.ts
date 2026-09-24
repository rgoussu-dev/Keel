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
 * and lets `keel.dials` snap them, and once the reply settles the move
 * the run carries one line naming what it could not keep. That
 * round trip through the real route is `dials.test.ts`; which move owes
 * a line, and what the line says, is decided here.
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
import { catalogQuery, previewQuery } from '../../../src/domain/contract/queries.js';
import type {
  AnswerBinding,
  AvailableVerticalDescriptor,
  Catalog,
  DialOptions,
  InstalledVerticalDescriptor,
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
  toggleExtra,
  toggleRefresh,
  toggleVertical,
  verticalsOf,
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
});

/** A greenfield page after `keel.dials` has settled `quarkus-rest`. */
const greenfield = (): Run => ({
  target: { kind: 'new-project', stack: 'quarkus-rest', buildSystem: 'gradle' },
  answers: { 'persistence/database-compose': { engine: 'postgres' } },
  dials: jvmDials({ kind: 'new-project', stack: 'quarkus-rest', buildSystem: 'gradle' }),
  generation: 0,
  carried: null,
  notice: '',
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

describe('the "What to add" cards', () => {
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

  it('starts a new preset over, but for its dials', () => {
    const next = retarget(greenfield(), { stack: 'go-http' });
    // The build system goes along; `keel.dials` is what drops it, Go
    // having none to choose.
    expect(next.target).toEqual({ kind: 'new-project', stack: 'go-http', buildSystem: 'gradle' });
    expect(next.answers).toEqual({});
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

  it('leaves the extras behind for now, with the answers', () => {
    const before = { ...tuned() };
    before.target = { ...before.target, extraVerticals: ['ci'] };
    expect(retarget(before, { stack: 'quarkus-cli-rest' }).target.extraVerticals).toBeUndefined();
  });

  it('keeps everything when the preset picked is the one already there', () => {
    const before = greenfield();
    const next = retarget(before, { stack: 'quarkus-rest' });
    expect(next.target).toEqual(before.target);
    expect(next.answers).toBe(before.answers);
    expect(next.dials).toBe(before.dials);
  });

  it('takes a target of another kind whole, and starts over', () => {
    const next = retarget(greenfield(), { kind: 'add-vertical', verticals: [] });
    expect(next.target).toEqual({ kind: 'add-vertical', verticals: [] });
    expect(next.answers).toEqual({});
    expect(next.dials).toBeNull();
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
          { path: 'backend', stack: 'quarkus-rest', buildSystems: [choice('gradle')] },
          { path: 'frontend', stack: 'web-components', buildSystems: [choice('npm')] },
        ],
        peerContext: false,
        extraVerticals: [],
        verticals: [],
        adjustments: [],
      }),
    );
    expect(settled.notice).toBe(
      'Moving to fullstack did not keep build system maven, module layout modulith or the peer context.',
    );
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
          { path: 'backend', stack: 'quarkus-rest', buildSystems: [choice('gradle')] },
          { path: 'frontend', stack: 'web-components', buildSystems: [choice('npm')] },
        ],
        peerContext: false,
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
    });
    const product = (stack: string, ...services: DialOptions['services']): DialOptions => ({
      target: { kind: 'new-project', stack },
      buildSystems: [],
      moduleLayouts: [],
      services,
      peerContext: false,
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
    });
  });
});
