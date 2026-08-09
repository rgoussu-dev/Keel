/**
 * System adapter for the Clock port — the real current time.
 */

import type { Clock } from '../../domain/contract/ports/clock.js';

/** Wall-clock time in ISO-8601. */
export const systemClock: Clock = {
  nowIso: () => new Date().toISOString(),
};
