/**
 * The **observable shape** of one stack preset, and the projection
 * that reduces the resolved registry to it.
 *
 * Every field of a `Stack` other than `tags`, `projects` and the two
 * free-text strings is a reference to something registered under an
 * id — a vertical, a build system, a module layout, a sibling stack.
 * This projection replaces each reference with the id it resolved
 * from, which turns the registry into plain comparable data: exactly
 * what `tests/domain/core/stack-registry.test.ts` freezes against
 * `stack-registry.golden.json`.
 *
 * Absent optionals normalise to empty arrays so the golden is
 * uniform; the data file distinguishes them by omission, which is
 * how a stack that declares no dials stays distinguishable from one
 * that declares an empty list (the schema forbids the latter).
 */

import type { Stack } from '../../src/domain/core/stacks.js';

/** One resolved preset, with every reference reduced to its id. */
export interface StackShape {
  readonly id: string;
  readonly description: string;
  readonly tags: readonly string[];
  /** Selectable build-system ids, in offer order (first is default). */
  readonly buildSystems: readonly string[];
  /** Selectable module-layout ids, in offer order (first is default). */
  readonly moduleLayouts: readonly string[];
  /** Vertical ids, in install order. */
  readonly verticals: readonly string[];
  readonly projects: readonly string[];
  readonly services: readonly ServiceShape[];
  readonly conflicts: readonly ConflictShape[];
}

/** One service of a composite preset, with its verticals as ids. */
export interface ServiceShape {
  readonly path: string;
  readonly stack: string;
  readonly extraVerticals: readonly string[];
}

/** One declared incompatibility, already pure data. */
export interface ConflictShape {
  readonly id: string;
  readonly when: readonly string[];
  readonly unless: readonly string[];
  readonly reason: string;
}

/** Projects one stack onto its {@link StackShape}. */
export function describeStack(stack: Stack): StackShape {
  return {
    id: stack.id,
    description: stack.description,
    tags: [...stack.tags],
    buildSystems: (stack.buildSystems ?? []).map((option) => option.id),
    moduleLayouts: (stack.moduleLayouts ?? []).map((option) => option.id),
    verticals: stack.verticals.map((vertical) => vertical.id),
    projects: [...(stack.projects ?? [])],
    services: (stack.services ?? []).map((service) => ({
      path: service.path,
      stack: service.stack,
      extraVerticals: (service.extraVerticals ?? []).map((vertical) => vertical.id),
    })),
    conflicts: (stack.conflicts ?? []).map((conflict) => ({
      id: conflict.id,
      when: [...conflict.when],
      unless: [...(conflict.unless ?? [])],
      reason: conflict.reason,
    })),
  };
}

/** Projects a whole registry, preserving iteration order. */
export function describeStacks(stacks: Iterable<Stack>): readonly StackShape[] {
  return [...stacks].map(describeStack);
}
