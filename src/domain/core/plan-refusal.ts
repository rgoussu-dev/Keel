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
 * What is still refused, under {@link MISSING_PREREQUISITES_CODE}, is
 * a tie: two sets of prerequisites exactly as small, which only the
 * user can choose between.
 */

import { DomainError, err, ok, type Result } from '../kernel/result.js';
import type { Vertical } from '../contract/composition.js';
import type { Registry } from '../contract/ports/registry.js';
import { assemblyRefusal } from './compatibility.js';
import { plan, type PlanScope, type PlannedVertical } from './planner.js';
import {
  addedPrerequisitesNote,
  dependencyOrderNote,
  incompatibleSentence,
  MISSING_PREREQUISITES_CODE,
  tiedPrerequisitesSentence,
  unavailableSentence,
} from './refusals.js';
import { UNCOVERED_CODE } from './resolver.js';

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

/** How a front door words what only it can say. */
export interface AdmissionWording {
  /**
   * Wraps the sentence a vertical the scope cannot carry is refused
   * with — for a remedy only this front door has (`drop it from
   * --with`). Absent, the sentence stands alone.
   */
  readonly unavailable?: (vertical: Vertical, sentence: string) => string;
}

/**
 * Plans `requested` onto `scope` and admits it with the prerequisites
 * it needs, or refuses: a vertical the scope cannot carry
 * (`keel.uncoverable-vertical`, or `keel.incompatible` when what stops
 * it is one of its own rules), a tie between two sets of prerequisites
 * (`keel.missing-prerequisites`, naming each), verticals no order
 * installs together (`keel.incompatible`).
 *
 * Every id in `requested` is registered and none is on the scope
 * already: the front doors refuse an unknown or a repeated id, each in
 * its own words, before they plan. Its order changes nothing but
 * {@link AdmittedSet.reordered}.
 */
export function admit(
  registry: Registry,
  scope: PlanScope,
  requested: readonly Vertical[],
  wording: AdmissionWording = {},
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
    case 'unavailable': {
      const vertical = byId(planned.vertical);
      if (planned.gap.rules.length > 0) {
        const rule = assemblyRefusal([vertical], scope.tags);
        if (rule !== null) {
          return err(
            new DomainError(
              `vertical '${vertical.id}' cannot be installed here: ${rule}`,
              'keel.incompatible',
            ),
          );
        }
      }
      const sentence = unavailableSentence(vertical, planned.gap);
      return err(
        new DomainError(wording.unavailable?.(vertical, sentence) ?? sentence, UNCOVERED_CODE),
      );
    }
    case 'tied':
      return err(
        new DomainError(
          tiedPrerequisitesSentence(
            set,
            planned.closures.map((closure) => closure.map(byId)),
          ),
          MISSING_PREREQUISITES_CODE,
        ),
      );
    case 'incompatible':
      return err(
        new DomainError(incompatibleSentence(planned.verticals.map(byId)), 'keel.incompatible'),
      );
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
