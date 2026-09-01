/**
 * Aggregation drops nulls before averaging — a driver that cannot
 * measure a field must not drag the series toward zero — and reports
 * null when nothing at all was measured.
 */

import { describe, expect, it } from 'vitest';
import { aggregate } from '../../evals/lib/metrics.mjs';

describe('aggregate', () => {
  it('computes mean/stddev/min/max over the measured values only', () => {
    expect(aggregate([10, null, 20, null, 30])).toEqual({
      n: 3,
      mean: 20,
      stddev: 8.165,
      min: 10,
      max: 30,
    });
  });

  it('is null when the whole series is unmeasured', () => {
    expect(aggregate([null, null])).toBeNull();
    expect(aggregate([])).toBeNull();
  });
});
