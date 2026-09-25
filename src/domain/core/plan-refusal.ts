/**
 * What a front door makes of a plan: the verticals a request installs
 * as, in the order they install — prerequisites included — or the
 * refusal, in words.
 *
 * Both front doors ask it — `keel new --with` of its extras, `keel
 * add` of the verticals it names (and those it re-renders) — over the
 * same planner (`./planner.ts`) that `keel.dials` builds the extras
 * menu from, so what a menu offers as "needs Container image" is what
 * a front door installs Container image for, and never a throw from
 * inside an adapter.
 *
 * A request is a **set**: it is planned by id, whatever order it was
 * named in, so two verticals nothing ties together go in the same way
 * round from any permutation of it — toolchain and persistence both
 * write a README section, and the order they write them in would
 * otherwise follow the order typed. The planner's own last tie-break
 * is the order it is handed; handing it the ids sorted is what makes
 * every permutation stage the same bytes.
 *
 * A request that plans only with verticals it did not name is
 * admitted with them: the planner's closure is installed whole, in
 * its order, and {@link admissionNotes} says so first — "added
 * Container image, Distribution — needed by Infrastructure as code".
 * `keel.dials` snaps a page's extras to the same closure, so the page,
 * `keel new --with` and `keel add` install one set for one request.
 * What is still refused, under `keel.missing-prerequisites`, is
 * a tie: two sets of prerequisites exactly as small, which only the
 * user can choose between.
 *
 * A composite product asks one more question of its services, the same
 * in both phases: what a vertical the product's root does not carry is
 * — there already, or refused ({@link amongServices}).
 */

import { err, ok, type Result } from '../kernel/result.js';
import type { Conflict, Vertical } from '../contract/composition.js';
import type { Registry } from '../contract/ports/registry.js';
import type { Readiness } from '../contract/queries.js';
import type { ElsewhereService, RefusalError } from '../contract/refusal.js';
import { plan, readiness, type Plan, type PlanScope, type PlannedVertical } from './planner.js';
import {
  addedPrerequisitesNote,
  dependencyOrderNote,
  elsewhereRefusal,
  incompatibleRefusal,
  productRootPlacementRefusal,
  tiedRefusal,
  unavailableRefusal,
} from './refusals.js';

/** A request the planner can install, closed over its prerequisites. */
export interface AdmittedSet {
  /**
   * The requested verticals and the prerequisites they need, in the
   * order they install.
   */
  readonly order: readonly Vertical[];
  /**
   * The verticals of {@link order} the request did not name —
   * installed because a named one needs what they add — in install
   * order. Empty when the request named everything it needs.
   */
  readonly added: readonly Vertical[];
  /**
   * The named verticals {@link added} is there for, directly or
   * through another added one, in install order. Empty when nothing
   * was added.
   */
  readonly neededBy: readonly Vertical[];
  /**
   * Whether the order the request was named in could not have been
   * followed: it puts a vertical ahead of one it needs, or reads. Not
   * merely a different order — verticals nothing ties together go in
   * by id, and that is no decision worth a word.
   */
  readonly reordered: boolean;
}

/**
 * Plans `requested` onto `scope` and admits it with the prerequisites
 * it needs, or refuses: a vertical the scope cannot carry
 * (`keel.uncoverable-vertical`, or `keel.incompatible` when what stops
 * it is one of its own rules), a tie between two sets of prerequisites
 * (`keel.missing-prerequisites`, naming each), verticals no order
 * installs together (`keel.incompatible`) — each a `RefusalError`
 * from `./refusals.ts`, in the one sentence both front doors speak:
 * a remedy only one of them has is its front end's to add, from the
 * refusal's fields.
 *
 * Every id in `requested` is registered and none is on the scope
 * already: the front doors refuse an unknown or a repeated id, each in
 * its own words, and set one already there aside with a note of their
 * own, before they plan. Its order changes nothing but
 * {@link AdmittedSet.reordered}.
 */
export function admit(
  registry: Registry,
  scope: PlanScope,
  requested: readonly Vertical[],
): Result<AdmittedSet> {
  const named = requested.map((vertical) => vertical.id);
  const set = [...requested].sort(idOrder);
  const planned = plan(
    registry,
    scope,
    set.map((vertical) => vertical.id),
  );
  const byId = (id: string): Vertical => {
    const found = registry.vertical(id);
    if (found === null)
      throw new Error(`admit: the planner named '${id}', which is not registered`);
    return found;
  };
  switch (planned.kind) {
    case 'planned': {
      const added = planned.order.filter((step) => step.reason !== 'requested');
      // Planned as named, the planner keeps the named order wherever
      // nothing ties one vertical to another — so it moves one only
      // for a dependency, which is what a report says. What it adds
      // is not a move: the note naming it says where it goes.
      const asNamed = plan(registry, scope, named);
      return ok({
        order: planned.order.map((step) => byId(step.id)),
        added: added.map((step) => byId(step.id)),
        neededBy: added.length === 0 ? [] : needing(planned.order, set).map(byId),
        reordered:
          asNamed.kind !== 'planned' ||
          asNamed.order
            .filter((step) => step.reason === 'requested')
            .some((step, index) => step.id !== named[index]),
      });
    }
    case 'unknown':
      throw new Error(`admit: '${planned.vertical}' is not registered — refuse it before planning`);
    default:
      return err(planRefusal(registry, set, planned, scope.rules));
  }
}

/** {@link foresee}'s answer: the planner's readiness, and the refusal it earns. */
export interface Foreseen {
  readonly readiness: Readiness;
  /**
   * What {@link admit} refuses the vertical with, asked alone: set on
   * `unavailable`, and on a `needs` whose prerequisites are tied;
   * null wherever it is admitted.
   */
  readonly refusal: RefusalError | null;
}

/**
 * How ready `vertical` is on `scope`, with the refusal a front door
 * would give it — the planner's {@link readiness}, worded as
 * {@link admit} words the plan of that one vertical, so a card or a
 * menu read ahead of time and the refusal met on the click are one
 * sentence under one code. `vertical` is registered and not on the
 * scope already.
 */
export function foresee(registry: Registry, scope: PlanScope, vertical: Vertical): Foreseen {
  const ready = readiness(registry, scope, vertical.id);
  switch (ready.kind) {
    case 'unavailable':
      return {
        readiness: ready,
        refusal: planRefusal(
          registry,
          [vertical],
          { kind: 'unavailable', vertical: vertical.id, gap: ready.gap },
          scope.rules,
        ),
      };
    case 'needs':
      return {
        readiness: ready,
        refusal:
          ready.alternatives === undefined
            ? null
            : planRefusal(
                registry,
                [vertical],
                { kind: 'tied', closures: [ready.prerequisites, ...ready.alternatives] },
                scope.rules,
              ),
      };
    default:
      return { readiness: ready, refusal: null };
  }
}

/** {@link amongServices}' answer: there already, in `paths`; or refused, and why. */
export type AmongServices =
  | { readonly kind: 'included'; readonly paths: readonly string[] }
  | { readonly kind: 'refused'; readonly refusal: RefusalError };

/**
 * What a composite product makes of `vertical` where its root does not
 * carry it, from how ready it is in each service (`services`, in the
 * product's order) — the one reading `keel new --with` on a product
 * (`./dials.ts` `routeExtra`, once it has sent a vertical exactly one
 * service admits there) and `keel add` at a product root
 * (`./add-readiness.ts`, which sends nothing anywhere) both answer by,
 * so the two phases cannot tell one fact apart:
 *
 *   - placed at a repository root, asked of a monorepo product: no
 *     service can take it, since each is a directory of the repository
 *     the root is — refused as nothing keel has installing it there
 *     (`keel.uncoverable-vertical`);
 *   - admitted by no service, and one or more has it: it is there
 *     already — `included`, naming those services — set aside with a
 *     note rather than refused, as what a single project comes with is;
 *   - otherwise it belongs to a service, and the refusal names each
 *     with its readiness (`keel.wrong-scope`): one a service could take
 *     goes there, the refusal naming where — even where another service
 *     has it — one several could take is the user's to place, and one
 *     none has or can take is said so.
 */
export function amongServices(
  registry: Registry,
  vertical: Vertical,
  services: readonly ElsewhereService[],
  monorepo: boolean,
): AmongServices {
  if (monorepo && vertical.placement?.scope === 'repository') {
    return { kind: 'refused', refusal: productRootPlacementRefusal(registry, vertical) };
  }
  const admitting = services.some(
    (service) => service.readiness === 'ready' || service.readiness === 'needs',
  );
  const having = services.filter((service) => service.readiness === 'included');
  if (!admitting && having.length > 0) {
    return { kind: 'included', paths: having.map((service) => service.path) };
  }
  return { kind: 'refused', refusal: elsewhereRefusal(registry, vertical, services) };
}

/**
 * The refusal a plan that is not `planned` is written as, for
 * `requested` — the set it was asked of, by id — on a scope whose
 * pieces declare `rules` (`PlanScope.rules`), which a gap may name.
 * What `keel.dials` drops an extra with too, so a page's reason and a
 * front door's refusal are one sentence.
 */
export function planRefusal(
  registry: Registry,
  requested: readonly Vertical[],
  planned: Exclude<Plan, { readonly kind: 'planned' } | { readonly kind: 'unknown' }>,
  rules: readonly Conflict[] = [],
): RefusalError {
  const byId = (id: string): Vertical => {
    const found = registry.vertical(id);
    if (found === null) {
      throw new Error(`planRefusal: the planner named '${id}', which is not registered`);
    }
    return found;
  };
  switch (planned.kind) {
    case 'unavailable':
      return unavailableRefusal(registry, byId(planned.vertical), planned.gap, rules);
    case 'tied':
      return tiedRefusal(
        registry,
        requested,
        planned.closures.map((closure) => closure.map(byId)),
      );
    case 'incompatible':
      return incompatibleRefusal(registry, planned.verticals.map(byId));
  }
}

/**
 * What a report says of an admitted set before anything else, one
 * sentence each: the prerequisites it added and what needs them, then
 * the order it installs in when the order named could not be kept.
 * Empty when the set went in as named.
 */
export function admissionNotes(admitted: AdmittedSet): readonly string[] {
  return [
    ...(admitted.added.length > 0
      ? [addedPrerequisitesNote(admitted.added, admitted.neededBy)]
      : []),
    ...(admitted.reordered ? [dependencyOrderNote(admitted.order)] : []),
  ];
}

/**
 * The requested ids that need something the request left out: those
 * an added vertical is needed by, directly or through another added
 * one — in plan order. All of them when the plan says no more.
 */
function needing(
  order: readonly PlannedVertical[],
  requested: readonly Vertical[],
): readonly string[] {
  const found = new Set<string>();
  const seen = new Set<string>();
  const visit = (id: string): void => {
    if (seen.has(id)) return;
    seen.add(id);
    const step = order.find((candidate) => candidate.id === id);
    if (step === undefined) return;
    if (step.reason === 'requested') found.add(id);
    else for (const later of step.reason.neededBy) visit(later);
  };
  for (const step of order) {
    if (step.reason !== 'requested') for (const later of step.reason.neededBy) visit(later);
  }
  const ids = order.filter((step) => found.has(step.id)).map((step) => step.id);
  return ids.length > 0 ? ids : requested.map((vertical) => vertical.id);
}

/** By id: the order a set is handed to the planner in. */
function idOrder(a: Vertical, b: Vertical): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
