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

import { failingTerm, matches } from './predicate.js';
import type { Adapter, Tag, Vertical } from '../contract/composition.js';

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
  | {
      kind: 'uncovered';
      dimensions: readonly string[];
      /**
       * The adapters that *would* have covered one of those
       * dimensions, and the predicate term that kept each one out.
       *
       * The cause, beside the symptom. An uncovered dimension is
       * almost never a missing adapter — it is an adapter present and
       * filtered, and without this the user is told which hole exists
       * but nothing about what would fill it.
       */
      near: readonly NearMiss[];
    }
  | { kind: 'cycle'; adapters: readonly string[] };

/** An adapter that covers an uncovered dimension but did not match. */
export interface NearMiss {
  readonly adapter: string;
  readonly dimension: string;
  /** `requires` — the tag was absent; `excludes` — it was present. */
  readonly kind: 'requires' | 'excludes';
  readonly pattern: string;
}

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
    const near = nearMisses(vertical, uncovered, tagSet);
    throw new ResolutionError(
      `vertical '${vertical.id}': no adapter covers dimension(s): ${uncovered.join(', ')}${describeNear(near)}`,
      vertical.id,
      'uncovered',
      { kind: 'uncovered', dimensions: uncovered, near },
    );
  }

  return topoSort(matched, vertical.id);
}

/**
 * Whether `vertical` would resolve against `tags` — i.e. whether
 * every dimension it declares is covered by an adapter the predicate
 * filter keeps.
 *
 * The same check {@link resolveVertical} hard-fails on, asked ahead
 * of time and answered instead of thrown. What it is for is menus: a
 * vertical offered to a project that cannot take it is a choice whose
 * only outcome is a `ResolutionError` eight questions later, which is
 * exactly the dead end an interactive flow must not walk the user
 * into. Conservative by construction — it sees the tags it is given,
 * not the ones an adapter would promote at install time — so a
 * hidden option is at worst one `keel add` away.
 */
export function coversFor(vertical: Vertical, tags: Iterable<Tag>): boolean {
  const tagSet: ReadonlySet<Tag> = tags instanceof Set ? tags : new Set(tags);
  const matched = vertical.adapters.filter((a) => matches(a.predicate, tagSet));
  return uncoveredDimensions(vertical, matched).length === 0;
}

/**
 * The adapters that cover an uncovered dimension but were filtered
 * out, with the predicate term that did it.
 *
 * Why an uncovered dimension needs this at all: the resolver's hard
 * fail is the last line of defence, so the assemblies reaching it are
 * the ones nobody predicted. "No adapter covers 'entrypoint'" is true
 * and nearly useless — the adapter is right there, wanting a tag the
 * assembly does not carry, and naming that tag turns a dead end into
 * an instruction.
 */
function nearMisses(
  vertical: Vertical,
  uncovered: readonly string[],
  tagSet: ReadonlySet<Tag>,
): readonly NearMiss[] {
  const misses: NearMiss[] = [];
  for (const dimension of uncovered) {
    for (const adapter of vertical.adapters) {
      if (!adapter.covers.includes(dimension)) continue;
      const term = failingTerm(adapter.predicate, tagSet);
      if (term === null) continue;
      misses.push({ adapter: adapter.id, dimension, kind: term.kind, pattern: term.pattern });
    }
  }
  return misses;
}

/**
 * The near misses as one clause, capped.
 *
 * A dimension covered by twenty adapters — the JVM bootstraps — would
 * otherwise print twenty near misses to say one thing. Three is
 * enough to show the shape of what is missing; the rest are in
 * `detail.near` for a UI that wants them.
 */
function describeNear(near: readonly NearMiss[]): string {
  if (near.length === 0) return '';
  const shown = near
    .slice(0, 3)
    .map(
      (miss) =>
        `'${miss.adapter}' ${miss.kind === 'requires' ? 'needs' : 'is ruled out by'} '${miss.pattern}'`,
    );
  const rest = near.length - shown.length;
  return ` — ${shown.join('; ')}${rest > 0 ? `; and ${rest} more` : ''}`;
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
