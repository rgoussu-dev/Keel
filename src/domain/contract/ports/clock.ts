/**
 * The Clock port — the domain's single source of time. Manifest
 * timestamps (`installedAt`, `updatedAt`) come from here so tests
 * pin them with the shipped fixed fake.
 */

/** Supplies the current instant. */
export interface Clock {
  /** The current time as an ISO-8601 string. */
  nowIso(): string;
}
