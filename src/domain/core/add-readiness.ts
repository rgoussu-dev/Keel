/**
 * How `keel add <vertical>` would answer on a project already on disk,
 * asked before it runs — the one reading behind the brownfield cards
 * (`keel.project-status`), `keel add --list` and the add front door
 * itself.
 *
 * The page used to list every vertical not installed and learn which
 * of them the project could carry by clicking: the refusal arrived
 * after the pick, and about half the cards on a CLI project were one.
 * A card cannot be read any other way than the front door reads the
 * click, or the two drift — so both are built here, from the same two
 * pieces:
 *
 *   - {@link productRootRefusal}, which a composite product's root
 *     answers first: a capability belongs to one of its services;
 *   - the planner, over the scope `./scope.ts` reads for the directory
 *     — this project's effective tags, its installed verticals, and the
 *     rules those declare, and in a monorepo service what the product
 *     gives it and where it stands in the repository — through
 *     `./plan-refusal.ts`, whose {@link foresee} words a vertical asked
 *     alone exactly as `admit` words the plan of it.
 *
 * {@link addReadiness} composes them for one vertical, as a card reads
 * it; the front door composes them for the set it was given. The
 * composition grid holds the two to each other through `keel.preview`
 * (I4). What is not here is the harness-generation gate: it refuses
 * every vertical alike (but the harness itself), so a status reports it
 * once, not on every card.
 */

import type { Vertical } from '../contract/composition.js';
import type { Registry } from '../contract/ports/registry.js';
import type { ElsewhereService, RefusalError } from '../contract/refusal.js';
import { foresee } from './plan-refusal.js';
import { readiness } from './planner.js';
import { elsewhereRefusal, elsewhereService, productRootPlacementRefusal } from './refusals.js';
import { planScopeOf, serviceScopeOf, type DirectoryScope } from './scope.js';

/** How ready one vertical is for `keel add` here, as a card reads it. */
export interface AddReadiness {
  /**
   * `ready` — it installs on its own; `needs` — it installs with
   * {@link requires} first; `unavailable` — {@link refusal} is what
   * `keel add` says instead.
   */
  readonly readiness: 'ready' | 'needs' | 'unavailable';
  /** What installs first, in install order; empty unless an admitted `needs`. */
  readonly requires: readonly string[];
  /**
   * What `keel add <id>` refuses it with, word for word: set on every
   * `unavailable`, and on a `needs` whose prerequisites are tied.
   */
  readonly refusal: RefusalError | null;
}

/**
 * How ready `vertical` is for `keel add` on the project `where` holds,
 * and the refusal where there is one — what the front door answers
 * `keel add <vertical>` with, before any file moves, the
 * harness-generation gate aside. `vertical` is registered, neither
 * installed here nor given by the product (`./scope.ts`
 * `provisionsHere`), and `where` holds a manifest.
 */
export function addReadiness(
  registry: Registry,
  where: DirectoryScope,
  vertical: Vertical,
): AddReadiness {
  const misplaced = productRootRefusal(registry, where, vertical);
  if (misplaced !== null) return { readiness: 'unavailable', requires: [], refusal: misplaced };
  const { readiness: ready, refusal } = foresee(registry, planScopeOf(registry, where), vertical);
  switch (ready.kind) {
    case 'ready':
      return { readiness: 'ready', requires: [], refusal: null };
    case 'needs':
      return {
        readiness: 'needs',
        requires: refusal === null ? ready.prerequisites : [],
        refusal,
      };
    case 'unavailable':
      return { readiness: 'unavailable', requires: [], refusal };
    case 'included':
      throw new Error(`addReadiness: '${vertical.id}' is there already`);
  }
}

/**
 * A composite product's root holds services, and a capability belongs
 * to one of them: whatever the planner reads the root itself as unable
 * to carry is refused as belonging elsewhere (`keel.wrong-scope`),
 * naming the service directories and how ready it is in each — read
 * from each service's own manifest, or its preset where there is none,
 * as a monorepo service of this root — rather than with the gap of
 * whichever adapter family sits nearest to a root's near-empty tag
 * set, which is advice for a different product. The agent harness is
 * no exception: the root carries a harness of its own, and the
 * planner reads a service's as not for it.
 *
 * A vertical placed at a repository root (`Vertical.placement`) is
 * the one not sent anywhere: this root is the repository's, and no
 * service of it can take one — so it is refused here, as nothing keel
 * has installing it at a product root. Null anywhere but a product
 * root, and for what a root does carry.
 *
 * Asked by the front door of each vertical it is named, before it
 * plans them (`admit`), and by {@link addReadiness} of a card.
 */
export function productRootRefusal(
  registry: Registry,
  where: DirectoryScope,
  vertical: Vertical,
): RefusalError | null {
  const root = where.manifest;
  if (root === null || root.services.length === 0) return null;
  if (readiness(registry, planScopeOf(registry, where), vertical.id).kind !== 'unavailable') {
    return null;
  }
  if (vertical.placement?.scope === 'repository') {
    return productRootPlacementRefusal(registry, vertical);
  }
  const services: ElsewhereService[] = where.services.map((service) => {
    const scope = serviceScopeOf(registry, root, service);
    return scope === null
      ? { path: service.ref.path, stack: service.ref.stack, readiness: 'unavailable' }
      : elsewhereService(
          service.ref.path,
          service.ref.stack,
          readiness(registry, scope, vertical.id),
        );
  });
  return elsewhereRefusal(registry, vertical, services);
}
