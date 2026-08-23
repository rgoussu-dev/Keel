/**
 * Unit tests for the registry's summary view over the verticals keel
 * ships, `listVerticals` — what `keel add --list` renders — and for
 * the wider declaration lookup beside it, which must not leak into
 * that menu.
 */

import { describe, expect, it } from 'vitest';
import {
  listVerticalIds,
  listVerticals,
  shippedRegistry,
} from '../../../../src/domain/core/registry.js';
import {
  DECLARED_VERTICALS,
  getDeclaredVertical,
  SHIPPED_VERTICALS,
} from '../../../../src/domain/core/verticals/index.js';

describe('listVerticals', () => {
  it('lists every registered vertical id, sorted, each with a non-empty description', () => {
    const summaries = listVerticals(shippedRegistry);
    expect(summaries.map((v) => v.id)).toEqual(listVerticalIds(shippedRegistry));
    for (const summary of summaries) {
      expect(summary.description.length, `${summary.id} has an empty description`).toBeGreaterThan(
        0,
      );
      expect(summary.description).toBe(shippedRegistry.vertical(summary.id)?.description);
    }
  });

  it('registers exactly the shipped verticals', () => {
    expect(listVerticalIds(shippedRegistry)).toEqual(
      SHIPPED_VERTICALS.map((vertical) => vertical.id).sort(),
    );
  });
});

describe('DECLARED_VERTICALS', () => {
  it('carries every brownfield vertical, under the same object', () => {
    for (const vertical of SHIPPED_VERTICALS) {
      expect(getDeclaredVertical(vertical.id), vertical.id).toBe(vertical);
    }
  });

  it('also resolves the verticals no brownfield flow offers', () => {
    for (const id of ['fullstack', 'bounded-context']) {
      expect(getDeclaredVertical(id)?.id, id).toBe(id);
    }
  });

  it('keeps them off the `keel add --list` menu', () => {
    // The whole reason the declaration lookup is wider than the run's
    // registry: a preset may name `fullstack`, and that must not make
    // it installable.
    const offered = listVerticals(shippedRegistry).map((v) => v.id);
    expect(offered).not.toContain('fullstack');
    expect(offered).not.toContain('bounded-context');
  });

  it('registers every entry under its own id', () => {
    for (const [id, vertical] of Object.entries(DECLARED_VERTICALS)) {
      expect(vertical.id).toBe(id);
    }
  });
});
