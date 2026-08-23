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
 *
 * Step 3 is also askable ahead of time, and answered rather than
 * thrown: `coversFor` for a yes/no (what a menu prunes with) and
 * `coverageGap` for the same answer with the missing dimensions and
 * the tags that would cover them attached (what a refusal is written
 * from).
 */

import { matches, matchesPattern } from './predicate.js';
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
       * The tags that would close the gap — {@link CoverageGap.enablers},
       * carried here so the thrown refusal says as much as the
       * answered one. The throw is the last line of defence, which
       * makes it the worst place to report only the symptom.
       */
      enablers: readonly Tag[];
    }
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

  // Thrown from the same {@link coverageGap} a front door answers
  // with, so the refusal a user runs into and the one they are shown
  // ahead of time cannot say different things.
  const gap = gapFrom(vertical, matched, tagSet);
  if (gap !== null) {
    throw new ResolutionError(
      `vertical '${vertical.id}': no adapter covers dimension(s): ${gap.dimensions.join(', ')}${describeEnablers(gap.enablers)}`,
      vertical.id,
      'uncovered',
      { kind: 'uncovered', dimensions: gap.dimensions, enablers: gap.enablers },
    );
  }

  return topoSort(matched, vertical.id);
}

/**
 * Why a vertical would not resolve against a tag set: the dimensions
 * left uncovered, and the tags that would cover them.
 */
export interface CoverageGap {
  readonly verticalId: string;
  /** Dimensions no predicate-matching adapter covers. */
  readonly dimensions: readonly string[];
  /**
   * Tags that would close the gap — for each uncovered dimension,
   * the unmet `requires` of the adapter *nearest* to matching (the
   * one missing fewest tags), unioned and sorted.
   *
   * "Nearest" rather than "all candidates" because the union over
   * every adapter that covers a dimension is a list of every stack
   * shape keel supports, which tells a user nothing. On a CLI preset
   * asking for `persistence`, the nearest adapter is the one for
   * that framework, missing only `arch.server-http` — which is the
   * whole answer. Empty when the vertical has no adapter for a
   * dimension at all, or when the only candidates are ruled out by
   * an `excludes` entry: adding a tag never un-matches one of those.
   */
  readonly enablers: readonly Tag[];
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
  return coverageGap(vertical, tags) === null;
}

/**
 * {@link coversFor}, with the reason attached: `null` when the
 * vertical resolves, a {@link CoverageGap} naming what is missing
 * when it does not.
 *
 * Same conservatism, same tag set, one extra job — a caller that
 * refuses ahead of the resolver can say *why* rather than making the
 * user run into the throw to find out.
 */
export function coverageGap(vertical: Vertical, tags: Iterable<Tag>): CoverageGap | null {
  const tagSet: ReadonlySet<Tag> = tags instanceof Set ? tags : new Set(tags);
  return gapFrom(
    vertical,
    vertical.adapters.filter((a) => matches(a.predicate, tagSet)),
    tagSet,
  );
}

/** The gap, given the adapters the predicate filter already kept. */
function gapFrom(
  vertical: Vertical,
  matched: readonly Adapter[],
  tagSet: ReadonlySet<Tag>,
): CoverageGap | null {
  const dimensions = uncoveredDimensions(vertical, matched);
  if (dimensions.length === 0) return null;
  return { verticalId: vertical.id, dimensions, enablers: enablers(vertical, dimensions, tagSet) };
}

/** The enablers as one clause, or nothing when there are none to name. */
function describeEnablers(enabling: readonly Tag[]): string {
  return enabling.length === 0 ? '' : ` — would need ${enabling.join(', ')}`;
}

function enablers(
  vertical: Vertical,
  dimensions: readonly string[],
  tagSet: ReadonlySet<Tag>,
): readonly Tag[] {
  const out = new Set<Tag>();
  for (const dimension of dimensions) {
    let nearest: readonly Tag[] | null = null;
    for (const adapter of vertical.adapters) {
      if (!adapter.covers.includes(dimension)) continue;
      // An adapter an `excludes` entry rules out stays ruled out
      // however many tags are added — it is no one's enabler.
      if ((adapter.predicate.excludes ?? []).some((e) => matchesPattern(e, tagSet))) continue;
      const unmet = (adapter.predicate.requires ?? []).filter((r) => !matchesPattern(r, tagSet));
      if (unmet.length === 0) continue;
      if (nearest === null || unmet.length < nearest.length) nearest = unmet;
    }
    for (const tag of nearest ?? []) out.add(tag);
  }
  return [...out].sort();
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
