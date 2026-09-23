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
 * The fixtures are typed against the contract the page reads them
 * from (`ProjectStatus`, `AnswerBinding`), so a renamed field fails the
 * typecheck here rather than a card on the page.
 */

import { describe, expect, it } from 'vitest';
import type {
  AnswerBinding,
  InstalledVerticalDescriptor,
  ProjectStatus,
  VerticalDescriptor,
} from '../../../src/domain/contract/queries.js';
import { answer, pickVertical, restart, retarget } from '../../../assets/web/src/target.js';

/** What `<keel-app>` stores between transitions. */
interface Run {
  target: { kind: string } & Record<string, unknown>;
  answers: Record<string, Record<string, string>>;
  dials: object | null;
  generation: number;
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
});

/** A greenfield page after `keel.dials` has settled `quarkus-rest`. */
const greenfield = (): Run => ({
  target: { kind: 'new-project', stack: 'quarkus-rest', buildSystem: 'gradle' },
  answers: { 'persistence/database-compose': { engine: 'postgres' } },
  dials: { buildSystem: ['gradle', 'maven'] },
  generation: 0,
});

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

    // Carried onto a reapply, this answer is refused at install as
    // `keel.reapply-frozen-answers`; carried onto a plain install, it
    // is recorded for a vertical that is not installed.
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

  it('starts a new preset over', () => {
    const next = retarget(greenfield(), { stack: 'go-http' });
    expect(next.target).toEqual({ kind: 'new-project', stack: 'go-http' });
    expect(next.answers).toEqual({});
    expect(next.dials).toBeNull();
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
    expect(next.target).toEqual({ kind: 'new-project', stack: 'go-http' });
    expect(next.answers).toEqual({});
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
    });
  });
});
