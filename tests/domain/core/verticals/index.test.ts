/**
 * Unit tests for the vertical registry's summary view, `listVerticals`
 * — what `keel add --list` renders — and for the wider lookup beside
 * it, which must not leak into that menu.
 */

import { describe, expect, it } from 'vitest';
import {
  DECLARED_VERTICALS,
  getDeclaredVertical,
  listVerticalIds,
  listVerticals,
  VERTICALS,
} from '../../../../src/domain/core/verticals/index.js';

describe('listVerticals', () => {
  it('lists every registered vertical id, sorted, each with a non-empty description', () => {
    const summaries = listVerticals();
    expect(summaries.map((v) => v.id)).toEqual(listVerticalIds());
    for (const summary of summaries) {
      expect(summary.description.length, `${summary.id} has an empty description`).toBeGreaterThan(
        0,
      );
      expect(summary.description).toBe(VERTICALS[summary.id]?.description);
    }
  });
});

describe('DECLARED_VERTICALS', () => {
  it('carries every brownfield vertical, under the same object', () => {
    for (const [id, vertical] of Object.entries(VERTICALS)) {
      expect(getDeclaredVertical(id), id).toBe(vertical);
    }
  });

  it('also resolves the verticals no brownfield flow offers', () => {
    for (const id of ['fullstack', 'bounded-context']) {
      expect(getDeclaredVertical(id)?.id, id).toBe(id);
    }
  });

  it('keeps them off the `keel add --list` menu', () => {
    // The whole reason for two registries: a preset may name
    // `fullstack`, and that must not make it installable.
    const offered = listVerticals().map((v) => v.id);
    expect(offered).not.toContain('fullstack');
    expect(offered).not.toContain('bounded-context');
  });

  it('registers every entry under its own id', () => {
    for (const [id, vertical] of Object.entries(DECLARED_VERTICALS)) {
      expect(vertical.id).toBe(id);
    }
  });
});
