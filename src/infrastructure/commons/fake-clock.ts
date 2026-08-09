/**
 * Canonical fake for the Clock port: a pinned instant, settable by
 * the test as time needs to advance.
 */

import type { Clock } from '../../domain/contract/ports/clock.js';

/** Clock fake frozen at a settable instant. */
export class FakeClock implements Clock {
  constructor(private instant: string) {}

  nowIso(): string {
    return this.instant;
  }

  /** Moves the fake to a new instant. */
  set(instant: string): void {
    this.instant = instant;
  }
}
