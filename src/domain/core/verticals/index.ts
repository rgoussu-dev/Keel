/**
 * Vertical registry — the name → vertical map, in two widths.
 *
 * {@link VERTICALS} is the **menu**: the verticals `keel add` (and
 * other brownfield flows) offer by id. {@link DECLARED_VERTICALS} is
 * the **lookup**: every vertical this repository declares, including
 * the few no brownfield flow offers. A stack preset resolves the
 * verticals it names through the lookup, so naming one is not the
 * same as making it installable.
 *
 * Adding a vertical: import it here and add it to `ALL` (or to
 * `GREENFIELD_ONLY` if no brownfield flow should offer it). The id
 * used is the vertical's own `.id`, so misspellings in the registry
 * are caught at registration time.
 */

import { boundedContextVertical } from './bounded-context.js';
import { ciVertical } from './ci.js';
import { codeStyleVertical } from './code-style.js';
import { containerizationVertical } from './containerization.js';
import { devContainerVertical } from './dev-container.js';
import { devEnvVertical } from './dev-env.js';
import { distributionVertical } from './distribution.js';
import { fullstackVertical } from './fullstack.js';
import { gatewayVertical } from './gateway.js';
import { iacVertical } from './iac.js';
import { observabilityVertical } from './observability.js';
import { persistenceVertical } from './persistence.js';
import { toolchainVertical } from './toolchain.js';
import { vcsVertical } from './vcs.js';
import { walkingSkeletonVertical } from './walking-skeleton.js';
import type { Vertical } from '../../contract/composition.js';

const ALL: readonly Vertical[] = [
  vcsVertical,
  walkingSkeletonVertical,
  codeStyleVertical,
  distributionVertical,
  iacVertical,
  gatewayVertical,
  containerizationVertical,
  ciVertical,
  devEnvVertical,
  devContainerVertical,
  observabilityVertical,
  persistenceVertical,
  toolchainVertical,
];

/**
 * Verticals no brownfield flow offers, and that therefore stay out of
 * {@link VERTICALS}: `fullstack` is the glue a composite product root
 * installs and means nothing on its own, `bounded-context` is driven
 * by `keel add module` rather than named by id. They are still
 * verticals with ids, so {@link DECLARED_VERTICALS} carries them —
 * a stack preset naming one must resolve.
 */
const GREENFIELD_ONLY: readonly Vertical[] = [fullstackVertical, boundedContextVertical];

/** All verticals known to the brownfield registry, keyed by id. */
export const VERTICALS: Readonly<Record<string, Vertical>> = Object.freeze(
  Object.fromEntries(ALL.map((v) => [v.id, v])),
);

/**
 * Every vertical this repository declares, keyed by id — the
 * brownfield registry plus {@link GREENFIELD_ONLY}.
 *
 * The wider map exists because the two questions are different. "What
 * may a user `keel add`?" is {@link VERTICALS}, and it is a menu.
 * "What object does this id name?" is this, and it is a lookup: a
 * stack preset's `verticals: ["vcs", "fullstack", …]` resolves
 * through it, so a preset may name a vertical the brownfield menu
 * does not offer without that vertical becoming installable.
 */
export const DECLARED_VERTICALS: Readonly<Record<string, Vertical>> = Object.freeze(
  Object.fromEntries([...ALL, ...GREENFIELD_ONLY].map((v) => [v.id, v])),
);

/** Returns any declared vertical by id, or null if none bears it. */
export function getDeclaredVertical(id: string): Vertical | null {
  return DECLARED_VERTICALS[id] ?? null;
}

/** Returns the vertical registered under `id`, or null if absent. */
export function getVertical(id: string): Vertical | null {
  return VERTICALS[id] ?? null;
}

/** Lists registered vertical ids in deterministic order. */
export function listVerticalIds(): readonly string[] {
  return Object.keys(VERTICALS).sort();
}

/** One vertical's id + description, for `keel add --list`. */
export interface VerticalSummary {
  readonly id: string;
  readonly description: string;
}

/** Lists every registered vertical's id + description, in deterministic order. */
export function listVerticals(): readonly VerticalSummary[] {
  return listVerticalIds().map((id) => {
    const vertical = VERTICALS[id];
    return { id, description: vertical?.description ?? '' };
  });
}
