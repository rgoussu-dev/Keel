/**
 * The report both `keel docs` commands answer with, built once so the
 * two cannot describe the same computation differently.
 */

import type { DocsReport, DocsRegionRecord } from '../../contract/commands.js';
import type { TreeChange } from '../../contract/ports/tree.js';
import type { IndexDrift } from '../docs-index.js';
import type { DocsIndexRegion } from '../docs-index.js';

/** Assembles a {@link DocsReport} from one projection and what it staged. */
export function docsReport(inputs: {
  readonly regions: readonly DocsIndexRegion[];
  readonly drift: readonly IndexDrift[];
  readonly unindexed: readonly string[];
  readonly changes: readonly TreeChange[];
  readonly committed: boolean;
}): DocsReport {
  // Per document rather than per region: two of the three regions
  // live in the root, and the tree stages a file, not a span of one.
  const touched = new Set(inputs.changes.map((change) => change.path));
  const regions: DocsRegionRecord[] = inputs.regions.map((region) => ({
    target: region.target,
    region: region.region.begin,
    rows: region.rows.length,
    changed: touched.has(region.target),
  }));
  return {
    regions,
    drift: inputs.drift.map((d) => ({
      target: d.target,
      ...(d.region === null ? {} : { region: d.region }),
      detail: d.detail,
    })),
    unindexed: inputs.unindexed,
    changes: inputs.changes,
    committed: inputs.committed,
  };
}
