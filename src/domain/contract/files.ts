/**
 * A whole-file write, as produced by template rendering and adapter
 * contributions. Lives in its own leaf module so the TemplateSource
 * port and the composition contract can share it without a cycle.
 */
export interface ContributionFile {
  readonly path: string;
  readonly content: Buffer | string;
  /**
   * File mode propagated on Tree commit; set to round-trip
   * executable template files such as `gradlew`.
   */
  readonly mode?: number;
}
