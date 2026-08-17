/**
 * Vertical registry — the set of verticals `keel add` (and other
 * brownfield flows) can install by id. Greenfield stacks declare their
 * own list of verticals and don't need this registry.
 *
 * Adding a vertical: import it here and add it to {@link VERTICALS}.
 * The id used is the vertical's own `.id`, so misspellings in the
 * registry are caught at registration time.
 */

import { ciVertical } from './ci.js';
import { containerizationVertical } from './containerization.js';
import { devEnvVertical } from './dev-env.js';
import { distributionVertical } from './distribution.js';
import { gatewayVertical } from './gateway.js';
import { observabilityVertical } from './observability.js';
import { persistenceVertical } from './persistence.js';
import { vcsVertical } from './vcs.js';
import { walkingSkeletonVertical } from './walking-skeleton.js';
import type { Vertical } from '../../contract/composition.js';

const ALL: readonly Vertical[] = [
  vcsVertical,
  walkingSkeletonVertical,
  distributionVertical,
  gatewayVertical,
  containerizationVertical,
  ciVertical,
  devEnvVertical,
  observabilityVertical,
  persistenceVertical,
];

/** All verticals known to the brownfield registry, keyed by id. */
export const VERTICALS: Readonly<Record<string, Vertical>> = Object.freeze(
  Object.fromEntries(ALL.map((v) => [v.id, v])),
);

/** Returns the vertical registered under `id`, or null if absent. */
export function getVertical(id: string): Vertical | null {
  return VERTICALS[id] ?? null;
}

/** Lists registered vertical ids in deterministic order. */
export function listVerticalIds(): readonly string[] {
  return Object.keys(VERTICALS).sort();
}
