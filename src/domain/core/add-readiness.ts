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
 *   - {@link productRootReading}, which a composite product's root
 *     answers first: a capability belongs to one of its services —
 *     where those that could have it have it, it is there already;
 *   - the planner, over the scope `./scope.ts` reads for the directory
 *     — this project's effective tags, its installed verticals, and the
 *     rules those declare, and in a monorepo service what the product
 *     gives it and where it stands in the repository — through
 *     `./plan-refusal.ts`, whose {@link foresee} words a vertical asked
 *     alone exactly as `admit` words the plan of it: in a monorepo
 *     service, naming one of the product's other services that could
 *     take what this one cannot, or has it (`./scope.ts` `siblingsOf`).
 *
 * {@link addReadiness} composes them for one vertical, as a card reads
 * it; the front door composes them for the set it was given — both over
 * {@link addScopeOf}, whose scope carries the project as each entrypoint
 * it could grow would leave it, so a vertical only that entrypoint stops
 * is refused naming it as the way in, on the card and on the click
 * alike. The composition grid holds the two to each other through
 * `keel.preview` (I4). What is not here is the harness-generation gate:
 * it refuses every vertical alike (but the harness itself, outside a
 * monorepo product root), so a status reports it once, not on every
 * card.
 */

import type { Vertical } from '../contract/composition.js';
import type { Registry } from '../contract/ports/registry.js';
import type { ElsewhereService, RefusalError } from '../contract/refusal.js';
import { growthOf, grownScope } from './growth.js';
import { amongServices, foresee, readinessAmong } from './plan-refusal.js';
import { readiness, type GrownScope, type PlanScope } from './planner.js';
import {
  planScopeOf,
  productPlaceOf,
  productServiceScopes,
  siblingsOf,
  type DirectoryScope,
} from './scope.js';
import { ENTRYPOINTS } from './stack-wizard.js';

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
 * `provisionsHere`) nor, at a product root, in its services already
 * ({@link productRootReading}), and `where` holds a manifest. `scope`
 * is {@link addScopeOf} `where`, which a caller asking of every vertical
 * reads once.
 */
export function addReadiness(
  registry: Registry,
  where: DirectoryScope,
  vertical: Vertical,
  scope: PlanScope = addScopeOf(registry, where),
): AddReadiness {
  const atRoot = productRootReading(registry, where, vertical);
  if (atRoot?.kind === 'included') {
    throw new Error(`addReadiness: '${vertical.id}' is there already, in the product's services`);
  }
  if (atRoot !== null) return { readiness: 'unavailable', requires: [], refusal: atRoot.refusal };
  const { readiness: ready, refusal } = foresee(
    registry,
    scope,
    vertical,
    siblingsOf(registry, where),
  );
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
 * The scope `keel add` plans onto in `where`, a directory holding a
 * manifest — `./scope.ts`'s {@link planScopeOf}, `except` the
 * installed verticals the run re-renders — with each back entrypoint
 * the project lacks that `keel add entrypoint` would add there, grown
 * ({@link PlanScope.grown}): so a vertical only that entrypoint stops is
 * refused carrying the command as its action, and a card and the add
 * carry the same. None inside a monorepo product, at its root or below
 * it, which the command refuses; none where growth refuses the
 * project, or the planner what growth installs. Never offered where
 * the command would refuse.
 */
export function addScopeOf(
  registry: Registry,
  where: DirectoryScope,
  except: readonly string[] = [],
): PlanScope {
  const scope = planScopeOf(registry, where, except);
  const manifest = where.manifest;
  if (manifest === null || productPlaceOf(where) !== null) return scope;
  const grown = ENTRYPOINTS.filter(
    (entry) => entry.side === 'back' && !manifest.tags.includes(entry.tag),
  ).flatMap((entry): GrownScope[] => {
    const growth = growthOf(registry, manifest, entry.word);
    const after = growth.kind === 'grows' ? grownScope(registry, manifest, growth) : null;
    return after === null ? [] : [{ entrypoint: entry.tag, scope: after }];
  });
  return grown.length === 0 ? scope : { ...scope, grown };
}

/**
 * What a composite product's root makes of a vertical it cannot carry
 * itself: there already, in the services `paths` names — `services`
 * is how ready it is in each, which a re-render of it at the root is
 * refused naming — or refused.
 */
export type ProductRootReading =
  | {
      readonly kind: 'included';
      readonly paths: readonly string[];
      readonly services: readonly ElsewhereService[];
    }
  | { readonly kind: 'refused'; readonly refusal: RefusalError };

/**
 * A composite product's root holds services, and a capability belongs
 * to one of them: whatever the planner reads the root itself as unable
 * to carry is answered from how ready it is in each service — read
 * from each service's own manifest, or its preset where there is none,
 * as a monorepo service of this root — rather than with the gap of
 * whichever adapter family sits nearest to a root's near-empty tag
 * set, which is advice for a different product. The agent harness is
 * no exception: the root carries a harness of its own, and the
 * planner reads a service's as not for it.
 *
 * The answer is the one `keel new --with` gives the same vertical on
 * the product (`./plan-refusal.ts` `amongServices`, which both read):
 * where no service could take it and those that could have it have it,
 * it is there already — `keel add` of it is an Ok that installs
 * nothing, and a status lists it as provided; a vertical placed at a
 * repository root (`Vertical.placement`) is refused, since this root
 * is the repository's and no service of it can take one; anything else
 * is refused as belonging elsewhere (`keel.wrong-scope`), naming the
 * services and how ready it is in each. Null anywhere but a product
 * root, and for what a root does carry.
 *
 * Asked by the front door of each vertical it is named, before it
 * plans them (`admit`), and of each it re-renders; by
 * {@link addReadiness} of a card; and by the status, of what it lists
 * as provided.
 */
export function productRootReading(
  registry: Registry,
  where: DirectoryScope,
  vertical: Vertical,
): ProductRootReading | null {
  const root = where.manifest;
  if (root === null || root.services.length === 0) return null;
  if (readiness(registry, planScopeOf(registry, where), vertical.id).kind !== 'unavailable') {
    return null;
  }
  const services = readinessAmong(
    registry,
    productServiceScopes(registry, root, where.services),
    vertical.id,
  );
  // Only a monorepo product writes a root manifest.
  const answer = amongServices(registry, vertical, services, true);
  return answer.kind === 'included' ? { ...answer, services } : answer;
}
