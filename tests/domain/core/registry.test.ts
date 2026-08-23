/**
 * Building a registry, and what a piece has to survive to get into
 * one.
 *
 * The end-to-end suite (`tests/plugins/`) proves these refusals
 * arrive from a real plugin on disk. This one is about the checks
 * themselves — the cases a fixture directory would need one file
 * each for, and the ordering guarantee menus depend on.
 */

import { describe, expect, it } from 'vitest';
import type { Vertical } from '../../../src/domain/contract/composition.js';
import type { Stack } from '../../../src/domain/contract/stack.js';
import {
  verticalTitle,
  listStackIds,
  listVerticalIds,
  pluginOrigin,
  registryOf,
  REGISTRY_ERROR_CODE,
  shippedRegistry,
  shippedSource,
} from '../../../src/domain/core/registry.js';
import { STACKS } from '../../../src/domain/core/stacks.js';
import { SHIPPED_VERTICALS } from '../../../src/domain/core/verticals/index.js';

/** A vertical with one adapter covering its one dimension. */
function wellFormed(id: string): Vertical {
  return {
    id,
    description: `the ${id} vertical`,
    dimensions: ['only'],
    adapters: [
      { id: `${id}/one`, vertical: id, covers: ['only'], predicate: {}, contribute: () => ({}) },
    ],
  };
}

function stackOn(id: string, vertical: Vertical): Stack {
  return { id, description: `the ${id} stack`, tags: [], verticals: [vertical] };
}

const ACME = pluginOrigin('acme');

/** Whatever `registryOf` threw, as the DomainError it is. */
function refusal(build: () => unknown): Error {
  try {
    build();
  } catch (error) {
    return error as Error;
  }
  throw new Error('expected the registry to refuse');
}

describe('shippedRegistry', () => {
  it('registers exactly what keel ships, and nothing else', () => {
    expect(listStackIds(shippedRegistry)).toEqual(Object.keys(STACKS).sort());
    expect(listVerticalIds(shippedRegistry)).toEqual(
      SHIPPED_VERTICALS.map((vertical) => vertical.id).sort(),
    );
  });
});

describe('registryOf', () => {
  it('keeps shipped pieces ahead of a plugin s, in source order', () => {
    const registry = registryOf([
      shippedSource,
      { origin: ACME, verticals: [wellFormed('acme-a'), wellFormed('acme-b')] },
    ]);
    const ids = registry.verticals().map((vertical) => vertical.id);
    expect(ids.slice(0, SHIPPED_VERTICALS.length)).toEqual(
      SHIPPED_VERTICALS.map((vertical) => vertical.id),
    );
    expect(ids.slice(-2)).toEqual(['acme-a', 'acme-b']);
  });

  it('resolves a plugin s pieces by id alongside the shipped ones', () => {
    const registry = registryOf([shippedSource, { origin: ACME, verticals: [wellFormed('acme')] }]);
    expect(registry.vertical('acme')?.description).toBe('the acme vertical');
    expect(registry.vertical('persistence')?.id).toBe('persistence');
    expect(registry.vertical('nothing')).toBeNull();
    expect(registry.stack('nothing')).toBeNull();
  });

  it('checks the verticals a plugin stack names inline, not only the ones it registers', () => {
    const broken: Vertical = { ...wellFormed('acme'), dimensions: ['only', 'missing'] };
    const error = refusal(() =>
      registryOf([shippedSource, { origin: ACME, stacks: [stackOn('acme-stack', broken)] }]),
    );
    expect(error.message).toContain(ACME);
    expect(error.message).toContain("dimension 'missing'");
  });

  it('refuses a plugin claiming an id another plugin already claimed', () => {
    const error = refusal(() =>
      registryOf([
        { origin: pluginOrigin('one'), verticals: [wellFormed('shared')] },
        { origin: pluginOrigin('two'), verticals: [wellFormed('shared')] },
      ]),
    );
    expect(error.message).toContain("plugin 'two'");
    expect(error.message).toContain("plugin 'one'");
  });

  it('refuses a plugin registering the same id twice, and says so in those words', () => {
    const error = refusal(() =>
      registryOf([{ origin: ACME, verticals: [wellFormed('twice'), wellFormed('twice')] }]),
    );
    expect(error.message).toContain(`${ACME} registers vertical 'twice' twice`);
  });

  it('carries the registry error code, and refuses a piece with no id at all', () => {
    const error = refusal(() =>
      registryOf([{ origin: ACME, stacks: [stackOn('', wellFormed('acme'))] }]),
    );
    expect(error.message).toContain('registers a stack with no id');
    expect((error as { code?: string }).code).toBe(REGISTRY_ERROR_CODE);
  });

  it('spells a title out of the id where a vertical declares none', () => {
    // A plugin's vertical is the case: keel's own all declare one, so
    // the fallback would go untested exactly where it is load-bearing.
    expect(verticalTitle(wellFormed('acme-widget-store'))).toBe('Acme widget store');
    expect(verticalTitle(wellFormed('ci'))).toBe('Ci');
    expect(verticalTitle({ ...wellFormed('ci'), title: 'Continuous integration' })).toBe(
      'Continuous integration',
    );
    // An empty string is a declaration of nothing, not a title.
    expect(verticalTitle({ ...wellFormed('dev-env'), title: '' })).toBe('Dev env');
  });

  it('gives every shipped vertical a title of its own, none of them the fallback', () => {
    // The fallback is a floor, not a plan: `iac` reading "Iac" and
    // `vcs` reading "Vcs" is the whole reason the field exists.
    for (const vertical of SHIPPED_VERTICALS) {
      expect({ id: vertical.id, title: vertical.title }).toEqual({
        id: vertical.id,
        title: expect.any(String),
      });
      expect(vertical.title).not.toBe('');
    }
  });

  it('leaves the shipped pieces untouched when no source follows them', () => {
    const only = registryOf([shippedSource]);
    expect(only.stacks().map((stack) => stack.id)).toEqual(
      shippedRegistry.stacks().map((stack) => stack.id),
    );
  });
});
