/**
 * Unit tests for the vertical registry's summary view, `listVerticals`
 * — what `keel add --list` renders.
 */

import { describe, expect, it } from 'vitest';
import {
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
