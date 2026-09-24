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
 * An uncovered dimension is a refusal: this project's shape cannot
 * carry the vertical, and the user can act on that. It is thrown as a
 * `RefusalError` (`../contract/refusal.ts`) built by `./refusals.ts`,
 * the builder every other refusal of a vertical comes from, so a
 * refusal that escapes the install engine reaches a front end as the
 * same shape, code and words as one a front door raises ahead of
 * time. An `after` cycle is not: it is an adapter author's bug, thrown
 * as a {@link ResolutionError}.
 *
 * Step 3 is also askable ahead of time, and answered rather than
 * thrown: `coversFor` for a yes/no (what a menu prunes with) and
 * `coverageGap` for the same answer with the missing dimensions and
 * the tags that would cover them attached.
 */

import { DomainError } from '../kernel/result.js';
import { matches, matchesPattern } from './predicate.js';
import { uncoveredRefusal, type RefusalNames } from './refusals.js';
import type { Adapter, Tag, Vertical } from '../contract/composition.js';

/** The code a {@link ResolutionError} carries for an `after` cycle. */
export const CYCLE_CODE = 'keel.adapter-cycle';

/**
 * Thrown when a vertical's surviving adapters order each other in a
 * cycle through `after` — a mistake in the adapters' declarations,
 * never something a user can act on.
 *
 * A `DomainError` all the same, carrying {@link CYCLE_CODE}, so it
 * reaches a front end as a coded failure naming the adapters rather
 * than as an anonymous crash. An uncovered dimension used to be the
 * other kind of this error; it is a refusal the user can act on, and
 * is thrown as one (`RefusalError`, see the module header).
 */
export class ResolutionError extends DomainError {
  constructor(
    message: string,
    readonly verticalId: string,
    readonly adapters: readonly string[],
  ) {
    super(message, CYCLE_CODE);
    this.name = 'ResolutionError';
  }
}

/**
 * Resolves a vertical for a given tag set. Returns the adapters that
 * should run, in execution order.
 *
 * Throws:
 *   - a `RefusalError` (`keel.uncoverable-vertical`, an `unavailable`
 *     refusal) when one or more dimensions are uncovered after
 *     predicate filtering — its sentence names a capability another
 *     vertical adds by that vertical's title when `names` can say
 *     which, as a registry can;
 *   - a {@link ResolutionError} when the surviving adapters' `after`
 *     graph contains a cycle.
 */
export function resolveVertical(
  vertical: Vertical,
  tags: Iterable<Tag>,
  names?: RefusalNames,
): readonly Adapter[] {
  const tagSet: ReadonlySet<Tag> = tags instanceof Set ? tags : new Set(tags);
  const matched = vertical.adapters.filter((a) => matches(a.predicate, tagSet));

  // Thrown from the same {@link coverageGap} a front door answers
  // with, and in the words every refusal of a vertical is written in.
  const gap = gapFrom(vertical, matched, tagSet);
  if (gap !== null) throw uncoveredRefusal(vertical, gap.enablers, names);

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
   * whole answer, and the refusal says it as "an entrypoint this
   * project does not have: HTTP server" (`./refusals.ts`), carrying
   * the tags in its `missing` field. Empty when
   * the vertical has no adapter for a dimension at all, or when the
   * only candidates are ruled out by an `excludes` entry: adding a
   * tag never un-matches one of those.
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
 * only outcome is a refusal eight questions later, which is
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
      stuck,
    );
  }

  return out;
}
