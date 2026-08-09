/**
 * Adapter resolution for a vertical against a tag set.
 *
 * The pipeline:
 *   1. Filter the vertical's adapters by predicate against the tag
 *      set; adapters whose predicate doesn't match are dropped.
 *   2. Topo-sort the survivors by `after` (errors on cycle). Adapters
 *      whose `after` references an adapter that didn't survive step 1
 *      simply drop those references — `after` is a hint, not a hard
 *      dependency.
 *   3. Verify dimension coverage: every entry in
 *      `vertical.dimensions` must be `covers`'d by at least one
 *      surviving adapter; otherwise hard-fail with a clear message.
 *
 * Failures are thrown as `ResolutionError` so callers can show a
 * structured error to the user instead of a stack trace.
 */

import { matches } from './predicate.js';
import type { Adapter, Tag, Vertical } from '../domain/contract/composition.js';

/**
 * Thrown when adapter resolution fails. The message is intended for
 * direct CLI display; structured fields exist for richer UIs.
 */
export class ResolutionError extends Error {
  constructor(
    message: string,
    readonly verticalId: string,
    readonly kind: 'uncovered' | 'cycle',
    readonly detail: ResolutionErrorDetail,
  ) {
    super(message);
    this.name = 'ResolutionError';
  }
}

export type ResolutionErrorDetail =
  | { kind: 'uncovered'; dimensions: readonly string[] }
  | { kind: 'cycle'; adapters: readonly string[] };

/**
 * Resolves a vertical for a given tag set. Returns the adapters that
 * should run, in execution order.
 *
 * Throws `ResolutionError` when:
 *   - one or more dimensions are uncovered after predicate filtering;
 *   - the surviving adapters' `after` graph contains a cycle.
 */
export function resolveVertical(vertical: Vertical, tags: Iterable<Tag>): readonly Adapter[] {
  const tagSet: ReadonlySet<Tag> = tags instanceof Set ? tags : new Set(tags);
  const matched = vertical.adapters.filter((a) => matches(a.predicate, tagSet));

  const uncovered = uncoveredDimensions(vertical, matched);
  if (uncovered.length > 0) {
    throw new ResolutionError(
      `vertical '${vertical.id}': no adapter covers dimension(s): ${uncovered.join(', ')}`,
      vertical.id,
      'uncovered',
      { kind: 'uncovered', dimensions: uncovered },
    );
  }

  return topoSort(matched, vertical.id);
}

function uncoveredDimensions(vertical: Vertical, matched: readonly Adapter[]): readonly string[] {
  const covered = new Set<string>();
  for (const a of matched) {
    for (const d of a.covers) covered.add(d);
  }
  return vertical.dimensions.filter((d) => !covered.has(d));
}

/**
 * Stable topological sort by `after`. References to adapters not in
 * `adapters` are ignored. Ties broken by adapter id for determinism.
 */
function topoSort(adapters: readonly Adapter[], verticalId: string): readonly Adapter[] {
  const byId = new Map(adapters.map((a) => [a.id, a]));
  const incoming = new Map<string, Set<string>>(); // adapter id -> set of ids it must come after (and that are present)
  for (const a of adapters) {
    const deps = new Set<string>();
    for (const dep of a.after ?? []) {
      if (byId.has(dep)) deps.add(dep);
    }
    incoming.set(a.id, deps);
  }

  const out: Adapter[] = [];
  const ready: string[] = [];
  for (const [id, deps] of incoming) {
    if (deps.size === 0) ready.push(id);
  }
  ready.sort();

  while (ready.length > 0) {
    const next = ready.shift()!;
    const adapter = byId.get(next);
    if (!adapter) continue;
    out.push(adapter);
    incoming.delete(next);
    const newlyReady: string[] = [];
    for (const [id, deps] of incoming) {
      if (deps.delete(next) && deps.size === 0) newlyReady.push(id);
    }
    newlyReady.sort();
    for (const id of newlyReady) ready.push(id);
  }

  if (incoming.size > 0) {
    const stuck = [...incoming.keys()].sort();
    throw new ResolutionError(
      `vertical '${verticalId}': cyclic 'after' graph among adapters: ${stuck.join(', ')}`,
      verticalId,
      'cycle',
      { kind: 'cycle', adapters: stuck },
    );
  }

  return out;
}
