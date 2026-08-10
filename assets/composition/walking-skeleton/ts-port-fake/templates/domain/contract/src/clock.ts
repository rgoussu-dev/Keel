/**
 * Sample driven port: the current time. Domain code that needs "now"
 * depends on this interface — never on `Date` construction — so tests
 * pin time through the fake instead of freezing the world.
 */
export interface Clock {
  /** The current instant. */
  now(): Date;
}
