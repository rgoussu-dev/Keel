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
 */

import { err, ok, type Result } from '../kernel/result.js';
import type { Vertical } from '../contract/composition.js';
import type { Registry } from '../contract/ports/registry.js';
import type { RefusalError } from '../contract/refusal.js';
import { plan, type Plan, type PlanScope, type PlannedVertical } from './planner.js';
import {
  addedPrerequisitesNote,
  dependencyOrderNote,
  incompatibleRefusal,
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
      return err(planRefusal(registry, set, planned));
  }
}

/**
 * The refusal a plan that is not `planned` is written as, for
 * `requested` — the set it was asked of, by id. What `keel.dials` drops
 * an extra with too, so a page's reason and a front door's refusal are
 * one sentence.
 */
export function planRefusal(
  registry: Registry,
  requested: readonly Vertical[],
  planned: Exclude<Plan, { readonly kind: 'planned' } | { readonly kind: 'unknown' }>,
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
      return unavailableRefusal(registry, byId(planned.vertical), planned.gap);
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
