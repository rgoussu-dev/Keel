/**
 * What the Options step's "Also scaffold" group shows.
 *
 * Same standing as `steps.test.ts` and `target.test.ts`: a pure module
 * living in `assets/web/`, tested here because it needs no browser.
 * Driven against the real `keel.dials` reply, so the three parts are
 * the planner's own reading of a shipped preset — a vertical in the
 * wrong part would be the page disagreeing with the terminal's menu
 * about the same preset. That a box really ticks what a card says it
 * needs is `ui-compose.test.ts`, in a browser.
 */

import { describe, expect, it } from 'vitest';
import type { NewProjectTarget } from '../../../src/domain/contract/commands.js';
import { dialsQuery, type DialOptions } from '../../../src/domain/contract/queries.js';
import { extrasGroup, extrasSummary } from '../../../assets/web/src/extras.js';
import { expectOk, installMediator } from '../../support/factory.js';

/** The `keel.dials` reply for `stack`, with `extraVerticals` as the page would post them. */
async function dials(stack: string, extraVerticals?: readonly string[]): Promise<DialOptions> {
  const target: NewProjectTarget = {
    kind: 'new-project',
    stack,
    ...(extraVerticals === undefined ? {} : { extraVerticals }),
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
