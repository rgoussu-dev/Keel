/**
 * What the Options step's "Also scaffold" group shows.
 *
 * Same standing as `steps.test.ts` and `target.test.ts`: a pure module
 * living in `assets/web/`, tested here because it needs no browser.
 * Driven against the real `keel.dials` reply, so the four parts are
 * the planner's own reading of a shipped preset — a vertical in the
 * wrong part would be the page disagreeing with the terminal's menu
 * about the same preset. That a box really ticks what a card says it
 * needs is `ui-compose.test.ts`, in a browser.
 */

import { describe, expect, it } from 'vitest';
import type { NewProjectTarget } from '../../../src/domain/contract/commands.js';
import { dialsQuery, type DialOptions } from '../../../src/domain/contract/queries.js';
import {
  extrasGroup,
  extrasSummary,
  serviceExtrasGroup,
  servicesExtrasSummary,
} from '../../../assets/web/src/extras.js';
import { expectOk, installMediator } from '../../support/factory.js';

/** The `keel.dials` reply for `stack`, with `extraVerticals` as the page would post them. */
async function dials(
  stack: string,
  extraVerticals?: readonly string[],
  more: Partial<NewProjectTarget> = {},
): Promise<DialOptions> {
  const target: NewProjectTarget = {
    kind: 'new-project',
    stack,
    ...(extraVerticals === undefined ? {} : { extraVerticals }),
    ...more,
  };
  return expectOk(await installMediator().dispatch(dialsQuery({ target })));
}

const values = (cards: readonly { value: string }[]): string[] => cards.map((card) => card.value);

describe('the "Also scaffold" group', () => {
  it('sorts a preset’s verticals into ready, needing another first, and coming with it', async () => {
    const reply = await dials('quarkus-rest');
    const group = extrasGroup(reply, reply.target);
    expect(group).not.toBeNull();
    if (group === null) return;

    expect(values(group.ready)).toContain('containerization');
    expect(values(group.ready)).toContain('ci');
    expect(values(group.needs)).toEqual(['distribution', 'iac']);
    // Nothing the preset already installs is a box to tick.
    expect(group.included.map((vertical) => vertical.id)).toContain('observability');
    expect([...values(group.ready), ...values(group.needs)]).not.toContain('observability');
    // Every box the terminal's menu offers is a box here, and no other.
    expect([...values(group.ready), ...values(group.needs)].sort()).toEqual(
      reply.extraVerticals.map((choice) => choice.id).sort(),
    );
    expect(group.chosen).toEqual([]);
    expect(group.line).toBe('');
  });

  it('keeps what the preset cannot take on screen, collapsed, each with the refusal’s words', async () => {
    const reply = await dials('go-cli');
    const group = extrasGroup(reply, reply.target);
    const persistence = group?.refused.find((line) => line.id === 'persistence');
    expect(persistence).toEqual({
      id: 'persistence',
      title: 'Persistence',
      sentence:
        'Persistence needs an entrypoint this project does not have: HTTP server — a REST endpoint',
    });
    // Not a box: there is nothing to tick.
    expect([...values(group?.ready ?? []), ...values(group?.needs ?? [])]).not.toContain(
      'persistence',
    );
    // Every vertical of the reply is in exactly one part.
    expect(
      [
        ...values(group?.ready ?? []),
        ...values(group?.needs ?? []),
        ...(group?.included ?? []).map((vertical) => vertical.id),
        ...(group?.refused ?? []).map((line) => line.id),
      ].sort(),
    ).toEqual(reply.verticals.map((vertical) => vertical.id).sort());
  });

  it('names what a card needs by the title a person knows it by', async () => {
    const reply = await dials('quarkus-rest');
    const group = extrasGroup(reply, reply.target);
    const card = (id: string) => group?.needs.find((each) => each.value === id);
    expect(card('iac')).toMatchObject({
      label: 'Infrastructure as code',
      badge: 'needs Container image, Distribution',
    });
    expect(card('distribution')?.badge).toBe('needs Container image');
  });

  it('holds the ticked extras in the order the install runs them', async () => {
    const reply = await dials('quarkus-rest', ['iac', 'distribution', 'containerization']);
    expect(extrasGroup(reply, reply.target)?.chosen).toEqual([
      'containerization',
      'distribution',
      'iac',
    ]);
    expect(extrasSummary(reply, reply.target)).toBe(
      'Container image, Distribution, Infrastructure as code',
    );
  });

  it('says in one line what the reply left out or added, and why', async () => {
    const reply = await dials('go-cli', ['persistence', 'ci', 'vcs']);
    const line = extrasGroup(reply, reply.target)?.line ?? '';
    expect(line.startsWith('Left out ')).toBe(true);
    expect(line).toContain('Version control already comes with go-cli');
    expect(line.endsWith('.')).toBe(true);
    // One line, however many moved.
    expect(line).not.toContain('\n');

    const added = await dials('quarkus-rest', ['iac']);
    expect(extrasGroup(added, added.target)?.line).toBe(
      'Added Container image — Distribution needs it installed first; ' +
        'added Distribution — Infrastructure as code needs it installed first.',
    );
  });

  it('draws the agent harness as a switch among what the preset comes with, on unless left out', async () => {
    const on = await dials('go-cli');
    const chip = (reply: DialOptions) =>
      extrasGroup(reply, reply.target)?.included.find(
        (vertical) => vertical.id === 'agent-harness',
      );
    expect(chip(on)).toEqual({ id: 'agent-harness', title: 'Agent harness', on: true });
    // Every other chip is only a chip: there is nothing to untick.
    const others = (extrasGroup(on, on.target)?.included ?? []).filter(
      (vertical) => vertical.id !== 'agent-harness',
    );
    expect(others.length).toBeGreaterThan(0);
    for (const other of others) expect(other).not.toHaveProperty('on');

    // Left out, it is still listed with what the preset comes with —
    // let go rather than gone, so it can be pressed back on — and the
    // boxes are the ones they were.
    const off = await dials('go-cli', undefined, { agentHarness: false });
    expect(chip(off)).toEqual({ id: 'agent-harness', title: 'Agent harness', on: false });
    expect(values(extrasGroup(off, off.target)?.ready ?? [])).toEqual(
      values(extrasGroup(on, on.target)?.ready ?? []),
    );
  });

  it('draws the harness as a plain chip where the reply offers no such dial', async () => {
    // A preset whose harness cannot be left out: the reply says so,
    // whatever the target holds.
    const reply = await dials('go-cli');
    const fixed = { ...reply, agentHarness: false };
    expect(
      extrasGroup(fixed, { ...reply.target, agentHarness: false })?.included.find(
        (vertical) => vertical.id === 'agent-harness',
      ),
    ).toEqual({ id: 'agent-harness', title: 'Agent harness' });
  });

  it('is not there before the first reply lands, nor on a product', async () => {
    expect(extrasGroup(null, { kind: 'new-project', stack: 'quarkus-rest' })).toBeNull();
    const product = await dials('fullstack');
    expect(extrasGroup(product, product.target)).toBeNull();
  });

  it('spells an empty selection for the review, rather than a blank', async () => {
    const reply = await dials('go-cli');
    expect(extrasSummary(reply, reply.target)).toBe('nothing extra');
  });
});

describe('a product’s "Also scaffold", one per service', () => {
  it('sorts each service’s verticals as its own scope reads them', async () => {
    const reply = await dials('fullstack');
    const backend = serviceExtrasGroup(reply, reply.target, 'backend');
    const frontend = serviceExtrasGroup(reply, reply.target, 'frontend');
    expect(values(backend?.ready ?? [])).toEqual(['persistence', 'toolchain']);
    expect(values(frontend?.ready ?? [])).toEqual(['dev-env', 'toolchain']);
    // What the monorepo root gives a service comes with it; what only
    // a repository root reads is not for it, in `keel add`'s words.
    expect(backend?.included.map((vertical) => vertical.id)).toContain('containerization');
    expect(backend?.refused.find((line) => line.id === 'ci')?.sentence).toMatch(
      /^Continuous integration cannot go in a monorepo service: /,
    );
    // No chip is a switch on a product.
    expect(backend?.included.every((vertical) => vertical.on === undefined)).toBe(true);
    expect(serviceExtrasGroup(reply, reply.target, 'worker')).toBeNull();
    expect(serviceExtrasGroup(null, reply.target, 'backend')).toBeNull();
  });

  it('holds each service’s selection, and says what the reply moved in it', async () => {
    const reply = await dials('fullstack', ['persistence'], { layout: 'polyrepo' });
    const backend = serviceExtrasGroup(reply, reply.target, 'backend');
    expect(backend?.chosen).toEqual(['persistence']);
    expect(backend?.line).toBe(
      'Added Persistence — Persistence goes in backend/, the one service of fullstack that can take it.',
    );
    expect(serviceExtrasGroup(reply, reply.target, 'frontend')?.line).toBe('');
    expect(servicesExtrasSummary(reply, reply.target)).toBe('Persistence in backend/');
    const none = await dials('fullstack');
    expect(servicesExtrasSummary(none, none.target)).toBe('nothing extra');
  });
});
