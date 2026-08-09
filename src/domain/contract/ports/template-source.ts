/**
 * The TemplateSource port — how composition adapters obtain rendered
 * template trees and canonical text assets without touching the
 * filesystem or a template engine themselves. Identifiers are paths
 * relative to the package's asset root (e.g.
 * `composition/walking-skeleton/quarkus-cli-bootstrap/templates`);
 * only the adapter in `infrastructure/template` knows where assets
 * physically live and what `.ejs` means.
 */

import type { ContributionFile } from '../composition.js';

/** Renders template trees and reads canonical assets. */
export interface TemplateSource {
  /**
   * Renders every file under the template tree `templateId` as a
   * contribution rooted at `targetRoot`. Returns the contributions;
   * nothing is written anywhere.
   */
  render(
    templateId: string,
    targetRoot: string,
    vars: Readonly<Record<string, unknown>>,
  ): Promise<ContributionFile[]>;
  /** Reads a single canonical text asset, e.g. `project/CLAUDE.md`. */
  readText(assetId: string): Promise<string>;
}
