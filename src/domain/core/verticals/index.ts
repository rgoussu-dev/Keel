/**
 * The verticals keel itself declares, in two widths.
 *
 * {@link SHIPPED_VERTICALS} is the **menu**: the verticals `keel add`
 * (and other brownfield flows) offer by id, and the source
 * `domain/core/registry.ts` folds into every {@link Registry}.
 * {@link DECLARED_VERTICALS} is the **lookup**: every vertical this
 * repository declares, including the few no brownfield flow offers.
 * A stack preset resolves the verticals it names through the lookup,
 * so naming one is not the same as making it installable.
 *
 * Adding a vertical: import it here and add it to
 * {@link SHIPPED_VERTICALS} (or to `GREENFIELD_ONLY` if no brownfield
 * flow should offer it). The id used is the vertical's own `.id`, so
 * misspellings are caught at registration time.
 *
 * Reading a *run's* catalog — by id, as a menu, as summaries —
 * happens through the {@link Registry} port instead, because that
 * catalog is not this list: it is this list plus whatever a plugin
 * registered.
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

/** Every vertical keel ships that a brownfield flow may install. */
export const SHIPPED_VERTICALS: readonly Vertical[] = [
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
 * {@link SHIPPED_VERTICALS}: `fullstack` is the glue a composite product root
 * installs and means nothing on its own, `bounded-context` is driven
 * by `keel add module` rather than named by id. They are still
 * verticals with ids, so {@link DECLARED_VERTICALS} carries them —
 * a stack preset naming one must resolve.
 */
const GREENFIELD_ONLY: readonly Vertical[] = [fullstackVertical, boundedContextVertical];

/**
 * Every vertical this repository declares, keyed by id — the
 * brownfield registry plus {@link GREENFIELD_ONLY}.
 *
 * The wider map exists because the two questions are different. "What
 * may a user `keel add`?" is {@link SHIPPED_VERTICALS}, and it is a
 * menu.
 * "What object does this id name?" is this, and it is a lookup: a
 * stack preset's `verticals: ["vcs", "fullstack", …]` resolves
 * through it, so a preset may name a vertical the brownfield menu
 * does not offer without that vertical becoming installable.
 */
export const DECLARED_VERTICALS: Readonly<Record<string, Vertical>> = Object.freeze(
  Object.fromEntries([...SHIPPED_VERTICALS, ...GREENFIELD_ONLY].map((v) => [v.id, v])),
);

/** Returns any declared vertical by id, or null if none bears it. */
export function getDeclaredVertical(id: string): Vertical | null {
  return DECLARED_VERTICALS[id] ?? null;
}
