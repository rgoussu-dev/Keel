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
  Catalog,
  DialOptions,
  InstalledVerticalDescriptor,
  ProjectStatus,
  VerticalDescriptor,
} from '../../../src/domain/contract/queries.js';
import {
  answer,
  pickVertical,
  previewed,
  restart,
  retarget,
  settle,
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
});

/** A project `keel new` scaffolded: `vcs` is in, `ci` and `dev-env` are not. */
const status: Pick<ProjectStatus, 'installed' | 'available'> = {
  installed: [installed('vcs'), installed('walking-skeleton')],
  available: [vertical('ci'), vertical('dev-env')],
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
  target: { kind: 'add-vertical', vertical: '' },
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

describe('a vertical card', () => {
  it('re-renders an installed vertical and installs any other', () => {
    expect(pickVertical(status, 'vcs')).toEqual({
      kind: 'add-vertical',
      vertical: 'vcs',
      reapply: true,
    });
    expect(pickVertical(status, 'ci')).toEqual({
      kind: 'add-vertical',
      vertical: 'ci',
      reapply: false,
    });
  });

  it('lets the re-render flag go with the installed card that set it', () => {
    const onInstalled = retarget(brownfield(), pickVertical(status, 'vcs'));
    expect(onInstalled.target.reapply).toBe(true);

    // What this used to post was a reapply of `ci`, refused as
    // `keel.vertical-not-installed`.
    const next = retarget(onInstalled, pickVertical(status, 'ci'));
    expect(next.target).toEqual({ kind: 'add-vertical', vertical: 'ci', reapply: false });
  });

  it('replaces the target rather than merging a whole one into it', () => {
    // The kind tab says nothing of `reapply` — and merged, that
    // silence was what kept the flag alive for the next card.
    const onInstalled = retarget(brownfield(), pickVertical(status, 'vcs'));
    expect(retarget(onInstalled, { kind: 'add-vertical', vertical: '' }).target).toEqual({
      kind: 'add-vertical',
      vertical: '',
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

  it('clears the answers when another card is picked', () => {
    const onCi = answer(retarget(brownfield(), pickVertical(status, 'ci')), {
      binding: PROVIDER,
      value: 'gitlab-ci',
    });
    expect(onCi.answers).toEqual({ 'ci/ts-pipeline': { provider: 'gitlab-ci' } });

    // Carried onto a reapply, this answer is refused at install —
    // no adapter the re-render runs reads it; carried onto a plain
    // install of another vertical, it is refused the same way.
    expect(retarget(onCi, pickVertical(status, 'vcs')).answers).toEqual({});
    expect(retarget(onCi, pickVertical(status, 'dev-env')).answers).toEqual({});
  });

  it('keeps the answers while the subject stays the same', () => {
    const onCi = answer(retarget(brownfield(), pickVertical(status, 'ci')), {
      binding: PROVIDER,
      value: 'gitlab-ci',
    });
    expect(retarget(onCi, pickVertical(status, 'ci')).answers).toEqual(onCi.answers);

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
    const next = retarget(greenfield(), { kind: 'add-vertical', vertical: '' });
    expect(next.target).toEqual({ kind: 'add-vertical', vertical: '' });
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
    // A set answer travels comma-joined and lands as a list.
    expect(
      fill({ kind: 'extraVerticals' }, 'containerization, distribution,').extraVerticals,
    ).toEqual(['containerization', 'distribution']);
  });

  it('moves the preset like the picker does', () => {
    const next = answer(greenfield(), { binding: { kind: 'stack' }, value: 'go-http' });
    expect(next.target).toEqual({ kind: 'new-project', stack: 'go-http', buildSystem: 'gradle' });
    expect(next.answers).toEqual({});
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
    expect(restart(settled, { kind: 'add-vertical', vertical: '' }).notice).toBe('');
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
    expect(superseded(restart(inFlight, { kind: 'add-vertical', vertical: '' }))).toBe(true);
  });

  it('keeps moving forward, so no later transition can reuse an id', () => {
    const first = retarget(brownfield(), pickVertical(status, 'vcs'));
    const second = retarget(first, pickVertical(status, 'ci'));
    const third = restart(second, { kind: 'add-vertical', vertical: '' });
    expect([first.generation, second.generation, third.generation]).toEqual([1, 2, 3]);
  });
});

describe('pointing the page at a directory', () => {
  it('starts the run over at the target given', () => {
    const next = restart(greenfield(), { kind: 'add-vertical', vertical: '' });
    expect(next).toEqual({
      target: { kind: 'add-vertical', vertical: '' },
      answers: {},
      dials: null,
      generation: 1,
      carried: null,
      notice: '',
    });
  });
});
