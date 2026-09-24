/**
 * The planner: whether a vertical can go on a scope, and in what order
 * a set of them installs — read from the declarations alone, with
 * nothing staged and nothing asked.
 *
 * Every surface that offers a vertical asks some version of this
 * question, and each used to answer it its own way: the extras menu
 * flatly, against the union of what a stack's verticals may promote;
 * the `--with` gate by walking the extras in the order typed; the
 * brownfield page not at all. Distribution's need for an image, left
 * as a throw inside `contribute()`, was invisible to all three. This
 * module is the one reading they share — the rule `./compatibility.ts`
 * already applies to conflicts, extended to readiness: one
 * declaration, read by every surface, so a menu, a card and a refusal
 * cannot disagree. The extras menu and `keel.dials`' snap read it
 * through `./dials.ts`, and both front doors through
 * `./plan-refusal.ts`.
 *
 * **What it reads.** A vertical's `dimensions` and its adapters'
 * predicates, as the resolver does; each adapter's
 * {@link Adapter.promotes} — its own share of the vertical's union,
 * which is what stops `distribution` on a Quarkus CLI (native binaries
 * only) from being read as supplying the image `iac` is keyed on; each
 * vertical's {@link Vertical.reads}, to put a reader after what it
 * reads; each vertical's own conflicts; and the conflicts of the pieces
 * already on the scope ({@link PlanScope.rules}), which what a plan adds
 * must not newly break; and, on a monorepo service
 * ({@link PlanScope.member}), each vertical's `placement` — one whose
 * place is a repository root neither goes there nor comes in as a
 * prerequisite, and one needing it is unavailable naming it, as it
 * would plan on a repository of its own. A promotion is read as
 * certain once its adapter matches: planning cannot know an answer
 * that has not been given, so a JVM image counts as both flavours.
 *
 * **How it plans.** A requested set is closed over its prerequisites:
 * the providers of every capability the request cannot yet match,
 * chained back at most {@link MAX_PREREQUISITES} deep, then the
 * smallest set of them (at most that many; past it, the union of
 * each vertical's own) under which some order installs everything —
 * each vertical resolving against the tags the ones before it added,
 * and none of them left matching an adapter a later one's tags
 * exclude. Two equally small sets are a tie, and a tie is refused
 * naming both: the planner never picks between two plugins that
 * supply one capability. The order follows the edges first (a
 * vertical after whatever feeds a tag its adapters mention), then
 * `reads`, then the order the caller named them in — a prerequisite
 * it added going where its id puts it among them, as it would named.
 *
 * **What it proposes.** An install can change what an installed
 * vertical would render — distribution read whether persistence was
 * there — without re-rendering it. {@link refreshProposals} names
 * those after a `keel add`, for the user to take up; the planner never
 * re-renders anything on its own.
 *
 * Pure: a registry and a scope in, data out. Nothing here refuses in
 * words — a refusal is a {@link Plan} kind or a {@link ReadinessGap},
 * and the sentence is built from it where it is spoken.
 */

import type { RefreshProposal } from '../contract/commands.js';
import type { Adapter, Conflict, Tag, Vertical } from '../contract/composition.js';
import type { Registry } from '../contract/ports/registry.js';
import type { Readiness, ReadinessGap, RefreshGap } from '../contract/queries.js';
import { assemblyRefusal, conflictsOf, violatedBy, wouldViolate } from './compatibility.js';
import { matches, matchesPattern } from './predicate.js';
import { IDENTITY_NAMESPACES } from './refusals.js';
import { assemblableStacks } from './registry.js';
import { coverageGap, coversFor } from './resolver.js';
import { ENTRYPOINTS, shapeOfTags } from './stack-wizard.js';
import { stackTagsFor, type Stack } from './stacks.js';

/**
 * How many verticals the planner adds for any one requested vertical,
 * at most — which is also how deep it chains a prerequisite's own
 * prerequisites. Bounds the search at C(n, 3) sets of the providers
 * in reach. A request whose verticals together need more is planned
 * as the union of their own closures, not refused.
 */
export const MAX_PREREQUISITES = 3;

/** Where a plan goes: what the scope carries, and what it already has. */
export interface PlanScope {
  /**
   * The scope's tags — a project's effective tags, or a preset's seed
   * ({@link seedFor}) before anything is written.
   */
  readonly tags: readonly Tag[];
  /** Ids of the verticals already there: installed, or the preset's own. */
  readonly installed: readonly string[];
  /**
   * The rules the pieces already there declare — the installed
   * verticals, and before `keel new` writes anything the preset too.
   * A plan must not newly break one: a vertical whose tags would is
   * not ready here, however well it covers — an installed piece's rule
   * binds what comes after it, exactly as the incoming piece's own
   * rules do. One the scope breaks already is not held against what
   * comes next: that assembly is broken on its own, and a menu over it
   * must still answer. Absent, none.
   */
  readonly rules?: readonly Conflict[];
  /**
   * Set when the scope is a service of a monorepo product — a
   * directory of the product's repository, not a repository of its
   * own (`./scope.ts`) — so a vertical whose place is a repository
   * root ({@link Vertical.placement}) can neither go here nor come in
   * as a prerequisite, and one needing it reads as unavailable,
   * naming it. `provided` are the ids of {@link installed} the product
   * gives the service rather than an install of its own — the
   * repository's version control, the image the product root builds —
   * which a plan on a repository of its own would not have. Absent,
   * the scope is a repository root.
   */
  readonly member?: { readonly provided: readonly string[] };
  /**
   * Ids of {@link installed} a run may re-render beside what it
   * installs — a project on disk's own verticals (`keel add
   * --refresh`), in the order it installed them. Where one of them is
   * all that stops a vertical, the gap says so
   * ({@link ReadinessGap.refresh}) rather than reading as a capability
   * nothing can add. Absent before `keel new` writes anything: a
   * preset's verticals render in that very run.
   */
  readonly refreshable?: readonly string[];
}

/** One vertical of a planned order, and why it is in it. */
export interface PlannedVertical {
  readonly id: string;
  /**
   * `requested` when the caller named it; otherwise the verticals
   * later in the order that need a capability it adds.
   */
  readonly reason: 'requested' | { readonly neededBy: readonly string[] };
}

/**
 * What {@link plan} makes of a request: an order to install in, or
 * the reason there is none.
 *
 * - `planned` — install `order` as given; `included` lists requested
 *   ids the scope already has, left out of it.
 * - `unknown` — the registry has no vertical by that id.
 * - `unavailable` — nothing keel can add makes that vertical install
 *   here; the first such vertical, in the order requested.
 * - `tied` — equally small sets of prerequisites would each do, and
 *   choosing is the user's: each set, in install order.
 * - `incompatible` — each vertical can be planned alone, but no order
 *   installs them together, even with each one's own prerequisites.
 */
export type Plan =
  | {
      readonly kind: 'planned';
      readonly order: readonly PlannedVertical[];
      readonly included: readonly string[];
    }
  | { readonly kind: 'unknown'; readonly vertical: string }
  | { readonly kind: 'unavailable'; readonly vertical: string; readonly gap: ReadinessGap }
  | { readonly kind: 'tied'; readonly closures: readonly (readonly string[])[] }
  | { readonly kind: 'incompatible'; readonly verticals: readonly string[] };

/**
 * How ready `id` is on `scope` — see {@link Readiness}. `included`
 * when the scope has it, `ready` when it installs alone, `needs` with
 * the smallest set to install first, `unavailable` with the gap and
 * the nearest stacks that carry it.
 *
 * @throws Error when the registry has no vertical `id` — a caller
 * bug: the front doors refuse an unknown id before they plan.
 */
export function readiness(registry: Registry, scope: PlanScope, id: string): Readiness {
  if (scope.installed.includes(id)) return { kind: 'included' };
  const vertical = registry.vertical(id);
  if (vertical === null) throw new Error(`readiness: no vertical '${id}' is registered`);
  if (misplaced(scope, vertical)) return { kind: 'unavailable', gap: placementGap([id]) };
  const closure = closureOf(registry, scope, [vertical]);
  if (closure === null) {
    return { kind: 'unavailable', gap: gapOf(registry, scope, vertical, [vertical]) };
  }
  const prerequisites = prerequisitesIn(closure.placed, [vertical]);
  if (prerequisites.length === 0) return { kind: 'ready' };
  return {
    kind: 'needs',
    prerequisites,
    ...(closure.alternatives.length === 0 ? {} : { alternatives: closure.alternatives }),
  };
}

/**
 * Closes `requested` over its prerequisites and orders the result —
 * see {@link Plan}. Requested ids the scope already has are reported
 * as `included`, and an id named twice is planned once.
 */
export function plan(registry: Registry, scope: PlanScope, requested: readonly string[]): Plan {
  const installed = new Set(scope.installed);
  const wanted: Vertical[] = [];
  const included: string[] = [];
  for (const id of requested) {
    if (installed.has(id)) {
      if (!included.includes(id)) included.push(id);
      continue;
    }
    if (wanted.some((vertical) => vertical.id === id)) continue;
    const vertical = registry.vertical(id);
    if (vertical === null) return { kind: 'unknown', vertical: id };
    wanted.push(vertical);
  }
  const placed = wanted.find((vertical) => misplaced(scope, vertical));
  if (placed !== undefined) {
    return { kind: 'unavailable', vertical: placed.id, gap: placementGap([placed.id]) };
  }

  const closure = closureOf(registry, scope, wanted);
  if (closure !== null) {
    if (closure.alternatives.length > 0) {
      return {
        kind: 'tied',
        closures: [prerequisitesIn(closure.placed, wanted), ...closure.alternatives],
      };
    }
    return { kind: 'planned', order: stepsOf(closure.placed, wanted), included };
  }
  const alone: Closure[] = [];
  for (const vertical of wanted) {
    const own = closureOf(registry, scope, [vertical]);
    if (own === null) {
      return {
        kind: 'unavailable',
        vertical: vertical.id,
        gap: gapOf(registry, scope, vertical, wanted),
      };
    }
    alone.push(own);
  }
  return (
    unionPlan(registry, scope, wanted, alone, included) ?? {
      kind: 'incompatible',
      verticals: wanted.map((vertical) => vertical.id),
    }
  );
}

/**
 * The plan for a request every vertical of which plans alone, but no
 * set of at most {@link MAX_PREREQUISITES} serves together — which is
 * the bound, not a conflict, when their prerequisites are disjoint:
 * two verticals needing two each. The bound is per vertical, so the
 * union of their own closures is tried; null when that does not order
 * either, and the verticals are incompatible.
 *
 * A vertical's own tie stands unless the request settles it: the
 * option that adds fewest verticals beyond those requested is taken
 * when it is the only one that does, and otherwise the tie is the
 * plan's.
 */
function unionPlan(
  registry: Registry,
  scope: PlanScope,
  wanted: readonly Vertical[],
  alone: readonly Closure[],
  included: readonly string[],
): Plan | null {
  const requested = new Set(wanted.map((vertical) => vertical.id));
  const extra = new Set<string>();
  for (const [index, own] of alone.entries()) {
    const options = [prerequisitesIn(own.placed, [wanted[index] as Vertical]), ...own.alternatives];
    const beyond = options.map((ids) => ids.filter((id) => !requested.has(id)).length);
    const fewest = Math.min(...beyond);
    const settled = options.filter((_, at) => beyond[at] === fewest);
    if (settled.length > 1) return { kind: 'tied', closures: options };
    for (const id of settled[0] ?? []) if (!requested.has(id)) extra.add(id);
  }
  const providers = registry.verticals().filter((vertical) => extra.has(vertical.id));
  const placed = orderOf(mergedById(providers, wanted), scope);
  return placed === null ? null : { kind: 'planned', order: stepsOf(placed, wanted), included };
}

/**
 * The installed verticals a run should re-render and does not — see
 * {@link RefreshProposal}: those whose `reads` names a vertical the
 * run installed (`incoming`), and those whose adapters the tags the
 * run leaves (`after`) resolve differently from the tags the project
 * had (`before`). `installed` is every vertical to consider, in the
 * order they were installed; one the registry does not know (a
 * product's glue) is passed over, and so is anything in `incoming`.
 *
 * A proposal and never a step of the plan: re-rendering overwrites
 * what a vertical owns, so it is the user's to ask for, and it
 * replaces a persistent "stale" flag, which could never clear — a
 * re-rendered vertical keeps its place and its `installedAt`.
 *
 * Read from the tags an install actually left rather than from the
 * promotions {@link plan} assumes, which count a JVM image as both
 * flavours: which adapters a vertical resolves to is an answer's
 * consequence here, and the answer has been given.
 */
export function refreshProposals(
  registry: Registry,
  installed: readonly string[],
  incoming: readonly string[],
  before: readonly Tag[],
  after: readonly Tag[],
): readonly RefreshProposal[] {
  const was = asSet(before);
  const now = asSet(after);
  const proposals: RefreshProposal[] = [];
  for (const id of installed) {
    if (incoming.includes(id)) continue;
    const vertical = registry.vertical(id);
    if (vertical === null) continue;
    const reads = incoming.filter((other) => (vertical.reads ?? []).includes(other));
    const then = matchingIds(vertical, was);
    const later = matchingIds(vertical, now);
    const changed = then.join(' ') !== later.join(' ');
    if (reads.length === 0 && !changed) continue;
    proposals.push({
      vertical: id,
      reads,
      ...(changed ? { adapters: { before: then, after: later } } : {}),
    });
  }
  return proposals;
}

/**
 * The adapters of `verticals` that could run when they install onto
 * `tags` in one run: every `requires` met by `tags` or by a tag one of
 * them may promote, and no `excludes` met by `tags` already. A
 * superset of what the run resolves — a run only ever adds tags — so a
 * front door can refuse, before a question is asked, an answer none of
 * them could read, and leave the exact check to the staged run.
 */
export function reachableAdapters(
  verticals: readonly Vertical[],
  tags: readonly Tag[],
): readonly Adapter[] {
  const now = asSet(tags);
  const reach = new Set([...tags, ...verticals.flatMap((vertical) => vertical.promotes ?? [])]);
  return verticals.flatMap((vertical) =>
    vertical.adapters.filter(
      (adapter) =>
        matches({ requires: adapter.predicate.requires ?? [] }, reach) &&
        matches({ excludes: adapter.predicate.excludes ?? [] }, now),
    ),
  );
}

/** The ids of `vertical`'s adapters whose predicate `tags` matches, in declaration order. */
function matchingIds(vertical: Vertical, tags: ReadonlySet<Tag>): readonly string[] {
  return vertical.adapters
    .filter((adapter) => matches(adapter.predicate, tags))
    .map((adapter) => adapter.id);
}

/**
 * The tags a preset's scope carries before anything is written:
 * `tags` (the stack's, with its dials folded in) plus what its own
 * verticals promote, replayed in install order through the adapters
 * that match — so a vertical sees what the ones before it added, and
 * an adapter that never runs on this stack adds nothing.
 */
export function seedFor(stack: Stack, tags: readonly Tag[]): readonly Tag[] {
  const running = new Set(tags);
  for (const vertical of stack.verticals) {
    for (const tag of promotionsOn(vertical, running)) running.add(tag);
  }
  return [...running];
}

/**
 * Whether `vertical` resolves against `tags`: every dimension
 * covered ({@link coversFor}). A vertical declaring no dimensions —
 * `gateway`, whose adapters are selected by peer tags alone — applies
 * only where some adapter matches, since otherwise it would "install"
 * nothing and be recorded as there.
 */
export function applies(vertical: Vertical, tags: Iterable<Tag>): boolean {
  const tagSet = asSet(tags);
  if (vertical.dimensions.length > 0) return coversFor(vertical, tagSet);
  return vertical.adapters.some((adapter) => matches(adapter.predicate, tagSet));
}

/**
 * What `adapter` may promote: its own {@link Adapter.promotes}, or
 * its vertical's union when it declares none.
 */
export function adapterPromotes(vertical: Vertical, adapter: Adapter): readonly Tag[] {
  return adapter.promotes ?? vertical.promotes ?? [];
}

/** One vertical placed in an order. */
interface Placed {
  readonly vertical: Vertical;
  /** The adapters that matched where it was placed. */
  readonly adapters: readonly Adapter[];
  /** The tags it added that were not there before it. */
  readonly added: readonly Tag[];
}

/** The smallest closure found, and any other exactly as small. */
interface Closure {
  readonly placed: readonly Placed[];
  /** The other equally small sets' prerequisites, in install order. */
  readonly alternatives: readonly (readonly string[])[];
}

/**
 * The smallest set of providers under which `requested` installs,
 * ordered — or null when no set of at most {@link MAX_PREREQUISITES}
 * does.
 */
function closureOf(
  registry: Registry,
  scope: PlanScope,
  requested: readonly Vertical[],
): Closure | null {
  const pool = providersOf(registry, scope, requested);
  for (let size = 0; size <= Math.min(MAX_PREREQUISITES, pool.length); size++) {
    const found: (readonly Placed[])[] = [];
    for (const extra of subsets(pool, size)) {
      const placed = orderOf(mergedById(extra, requested), scope);
      if (placed !== null) found.push(placed);
    }
    const [first, ...others] = found;
    if (first !== undefined) {
      return {
        placed: first,
        alternatives: others.map((placed) => prerequisitesIn(placed, requested)),
      };
    }
  }
  return null;
}

/**
 * `added` — verticals a plan brings in unasked — merged into
 * `requested` by id, keeping `requested`'s own order: the order handed
 * to {@link orderOf}, whose last tie-break it is. A vertical nothing
 * ties to the others then lands where its id puts it, whether it was
 * named or added — so a request naming its prerequisites and one
 * leaving them to the plan install in one order (`keel.dials` settles
 * to a fixed point, and the manifest records one order) — while the
 * named verticals keep the order they were named in among themselves,
 * which is what a report reads a move off.
 */
function mergedById(added: readonly Vertical[], requested: readonly Vertical[]): Vertical[] {
  const queue = [...added].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const merged: Vertical[] = [];
  for (const vertical of requested) {
    while (queue.length > 0 && (queue[0]?.id ?? '') < vertical.id) merged.push(queue.shift()!);
    merged.push(vertical);
  }
  return [...merged, ...queue];
}

/**
 * Every registered vertical that could feed the request: a provider
 * of a capability some requested adapter requires and the scope
 * lacks, then its providers in turn, at most
 * {@link MAX_PREREQUISITES} deep. Read from every adapter's declared
 * promotes, so the pool is a superset; which of them actually match
 * is the ordering's to find out. In registry order.
 */
function providersOf(
  registry: Registry,
  scope: PlanScope,
  requested: readonly Vertical[],
): readonly Vertical[] {
  const tags = asSet(scope.tags);
  const taken = new Set([...scope.installed, ...requested.map((vertical) => vertical.id)]);
  const chosen = new Set<string>();
  let frontier: readonly Vertical[] = requested;
  for (let depth = 0; depth < MAX_PREREQUISITES && frontier.length > 0; depth++) {
    const wanted = frontier.flatMap(requiresOf).filter((pattern) => !matchesPattern(pattern, tags));
    frontier = registry
      .verticals()
      .filter(
        (vertical) =>
          !taken.has(vertical.id) &&
          !chosen.has(vertical.id) &&
          !misplaced(scope, vertical) &&
          promotesAny(vertical, wanted),
      );
    for (const vertical of frontier) chosen.add(vertical.id);
  }
  return registry.verticals().filter((vertical) => chosen.has(vertical.id));
}

/**
 * An install order for `set` onto `scope`, or null when there is none.
 *
 * A depth-first search: at each step, the verticals that resolve
 * against the tags so far and whose rules hold are tried — first those
 * nothing left in the set feeds, then those reading nothing left in
 * it, then in the order given — and a step that leaves any placed
 * vertical matching an adapter its new tags exclude, or breaking one
 * of its rules or one of the scope's own ({@link PlanScope.rules}), is
 * taken back. So an order is only ever one the install would run
 * cleanly start to finish, and where several would, the one the edges
 * and the reads prefer.
 */
function orderOf(set: readonly Vertical[], scope: PlanScope): readonly Placed[] | null {
  const standing = standsOn(scope);
  const rank = new Map(set.map((vertical, index) => [vertical.id, index]));
  const search = (
    remaining: readonly Vertical[],
    running: ReadonlySet<Tag>,
    placed: readonly Placed[],
  ): readonly Placed[] | null => {
    if (remaining.length === 0) return placed;
    const tried = remaining
      .filter((vertical) => fits(vertical, running))
      .map((vertical) => ({
        vertical,
        key: [
          remaining.some((other) => other !== vertical && feeds(other, vertical, running)) ? 1 : 0,
          (vertical.reads ?? []).some((id) => remaining.some((other) => other.id === id)) ? 1 : 0,
          rank.get(vertical.id) ?? 0,
        ],
      }))
      .sort((a, b) => compareKeys(a.key, b.key));
    for (const { vertical } of tried) {
      const adapters = vertical.adapters.filter((adapter) => matches(adapter.predicate, running));
      const next = new Set(running);
      const added: Tag[] = [];
      for (const tag of adapters.flatMap((adapter) => adapterPromotes(vertical, adapter))) {
        if (next.has(tag)) continue;
        next.add(tag);
        added.push(tag);
      }
      const all = [...placed, { vertical, adapters, added }];
      if (!all.every((step) => holds(step, next)) || !standing(next)) continue;
      const found = search(
        remaining.filter((other) => other !== vertical),
        next,
        all,
      );
      if (found !== null) return found;
    }
    return null;
  };
  return search(set, asSet(scope.tags), []);
}

/**
 * Whether a tag set still honours the scope's own rules — none broken
 * that the scope did not break already. @see PlanScope.rules
 */
function standsOn(scope: PlanScope): (tags: ReadonlySet<Tag>) => boolean {
  const rules = scope.rules ?? [];
  if (rules.length === 0) return () => true;
  const already = new Set(violatedBy(rules, scope.tags).map((conflict) => conflict.id));
  return (tags) => violatedBy(rules, tags).every((conflict) => already.has(conflict.id));
}

/** Whether `vertical` can be placed on `tags`: it applies, and its rules hold. */
function fits(vertical: Vertical, tags: ReadonlySet<Tag>): boolean {
  return applies(vertical, tags) && assemblyRefusal([vertical], tags) === null;
}

/**
 * Whether a placed vertical still stands on `tags`: none of the
 * adapters it resolved to is excluded by them, and none of its rules
 * is broken — the check each later fold re-runs, since a tag added
 * after a vertical installs is one its adapters never saw.
 */
function holds(step: Placed, tags: ReadonlySet<Tag>): boolean {
  const excluded = step.adapters.some((adapter) =>
    (adapter.predicate.excludes ?? []).some((pattern) => matchesPattern(pattern, tags)),
  );
  return !excluded && violatedBy(conflictsOf([step.vertical]), tags).length === 0;
}

/**
 * Whether `provider`, placed on `tags`, would add a tag some adapter
 * of `vertical` requires or excludes — an edge the order follows, so
 * a vertical resolves after whatever decides which of its adapters
 * run.
 */
function feeds(provider: Vertical, vertical: Vertical, tags: ReadonlySet<Tag>): boolean {
  const promoted = new Set(promotionsOn(provider, tags));
  if (promoted.size === 0) return false;
  return vertical.adapters.some((adapter) =>
    [...(adapter.predicate.requires ?? []), ...(adapter.predicate.excludes ?? [])].some((pattern) =>
      matchesPattern(pattern, promoted),
    ),
  );
}

/** What installing `vertical` onto `tags` may add: its matching adapters' promotes. */
function promotionsOn(vertical: Vertical, tags: ReadonlySet<Tag>): readonly Tag[] {
  return vertical.adapters
    .filter((adapter) => matches(adapter.predicate, tags))
    .flatMap((adapter) => adapterPromotes(vertical, adapter));
}

/** Whether some adapter of `vertical` declares a tag one of `patterns` matches. */
function promotesAny(vertical: Vertical, patterns: readonly Tag[]): boolean {
  if (patterns.length === 0) return false;
  const promoted = new Set(
    vertical.adapters.flatMap((adapter) => adapterPromotes(vertical, adapter)),
  );
  return patterns.some((pattern) => matchesPattern(pattern, promoted));
}

function requiresOf(vertical: Vertical): readonly Tag[] {
  return vertical.adapters.flatMap((adapter) => adapter.predicate.requires ?? []);
}

/** The ids of an order that are not among `requested`, in order. */
function prerequisitesIn(placed: readonly Placed[], requested: readonly Vertical[]): string[] {
  return placed
    .map((step) => step.vertical.id)
    .filter((id) => !requested.some((vertical) => vertical.id === id));
}

/**
 * The order as a caller reads it: each prerequisite with the later
 * verticals whose adapters require a tag it added.
 */
function stepsOf(
  placed: readonly Placed[],
  requested: readonly Vertical[],
): readonly PlannedVertical[] {
  return placed.map((step, index) => {
    const id = step.vertical.id;
    if (requested.some((vertical) => vertical.id === id)) return { id, reason: 'requested' };
    const added = new Set(step.added);
    const neededBy = placed
      .slice(index + 1)
      .filter((later) =>
        requiresOf(later.vertical).some((pattern) => matchesPattern(pattern, added)),
      )
      .map((later) => later.vertical.id);
    return { id, reason: { neededBy } };
  });
}

/**
 * Why `vertical` is unavailable on `scope`: the unmet tags of its
 * nearest adapter, each traced back — a capability some vertical
 * could add is replaced by what that vertical's nearest adapter lacks
 * here, to the same depth the planner searches — and sorted into what
 * would change the answer, with the nearest stacks that carry it; and
 * the rules it breaks — its own, against the scope's tags, and the
 * scope's, against what it would add. `alongside` is the request it
 * was asked in (itself included), which a re-render would plan with.
 */
function gapOf(
  registry: Registry,
  scope: PlanScope,
  vertical: Vertical,
  alongside: readonly Vertical[],
): ReadinessGap {
  const refresh = refreshGap(registry, scope, vertical, alongside);
  if (refresh !== null) {
    return { entrypoint: [], peer: [], identity: [], rules: [], nearestStacks: [], refresh };
  }
  if (scope.member !== undefined) {
    // What stops it may be only where it was asked: planned on a
    // repository of its own, it would come with a vertical whose place
    // is a repository root. That is the whole gap — a stack, an
    // entrypoint or a link would change nothing here.
    const anywhere = closureOf(registry, repositoryOf(scope), [vertical]);
    const placed = (anywhere?.placed ?? [])
      .map((step) => step.vertical)
      .filter((step) => step.placement?.scope === 'repository')
      .map((step) => step.id);
    if (placed.length > 0) return placementGap(placed);
  }
  const tags = asSet(scope.tags);
  const acquirable = acquirableIn(registry);
  const entrypoint = new Set<Tag>();
  const peer = new Set<Tag>();
  const identity = new Set<Tag>();
  const explain = (unmet: readonly Tag[], depth: number, seen: ReadonlySet<Tag>): void => {
    for (const tag of unmet) {
      if (ENTRYPOINT_TAGS.has(tag)) entrypoint.add(tag);
      else if (tag.startsWith(PEER_NAMESPACE)) peer.add(tag);
      else {
        const deeper =
          depth < MAX_PREREQUISITES && !seen.has(tag)
            ? supplierGap(registry, tags, acquirable, tag)
            : [];
        if (deeper.length === 0) identity.add(tag);
        else explain(deeper, depth + 1, new Set([...seen, tag]));
      }
    }
  };
  explain(unmetOf(vertical, tags, acquirable), 0, new Set());
  return {
    entrypoint: [...entrypoint].sort(),
    peer: [...peer].sort(),
    identity: [...identity].sort(),
    rules: [
      ...new Set(
        [
          ...violatedBy(conflictsOf([vertical]), tags),
          ...wouldViolate(scope.rules ?? [], tags, promotionsOn(vertical, tags)),
        ].map((conflict) => conflict.id),
      ),
    ],
    nearestStacks: nearestStacks(registry, scope, vertical),
  };
}

/**
 * The installed vertical whose re-render, beside `alongside`, would let
 * `vertical` install — see {@link ReadinessGap.refresh} — or null when
 * none would. Only one that promotes a capability `vertical` requires
 * and the scope lacks is tried, one at a time: planned as if it were
 * not there yet, as `keel add --refresh` plans it, with the rest of the
 * request. A re-render changes only which adapters a vertical renders
 * through, so one that could never supply what is missing is no
 * answer, and the first that plans is — in the order the project
 * installed them.
 */
function refreshGap(
  registry: Registry,
  scope: PlanScope,
  vertical: Vertical,
  alongside: readonly Vertical[],
): RefreshGap | null {
  const tags = asSet(scope.tags);
  const wanted = requiresOf(vertical).filter((pattern) => !matchesPattern(pattern, tags));
  for (const id of scope.refreshable ?? []) {
    const installed = registry.vertical(id);
    if (installed === null || !promotesAny(installed, wanted)) continue;
    const without: PlanScope = {
      ...scope,
      installed: scope.installed.filter((other) => other !== id),
      refreshable: [],
    };
    const request = [...alongside.filter((other) => other.id !== id), installed];
    const closure = closureOf(registry, without, request);
    if (closure === null) continue;
    return { verticals: [id], prerequisites: prerequisitesIn(closure.placed, request) };
  }
  return null;
}

/**
 * Whether `vertical` is placed at a repository root and `scope` is a
 * monorepo service — somewhere it can neither go nor be planned in.
 * @see PlanScope.member
 */
function misplaced(scope: PlanScope, vertical: Vertical): boolean {
  return scope.member !== undefined && vertical.placement?.scope === 'repository';
}

/**
 * The gap of a vertical stopped only by where it was asked: `ids` are
 * the verticals whose place is a repository root — it, or what it
 * would be planned with there.
 */
function placementGap(ids: readonly string[]): ReadinessGap {
  return {
    entrypoint: [],
    peer: [],
    identity: [],
    rules: [],
    nearestStacks: [],
    repositoryOnly: ids,
  };
}

/**
 * A monorepo service's scope as a repository of its own: without what
 * the product gave it, and without the placement a member keeps.
 */
function repositoryOf(scope: PlanScope): PlanScope {
  const provided = scope.member?.provided ?? [];
  return {
    tags: scope.tags,
    installed: scope.installed.filter((id) => !provided.includes(id)),
    ...(scope.rules === undefined ? {} : { rules: scope.rules }),
  };
}

/** The `arch.*` tags the stack finder offers as ways in. */
const ENTRYPOINT_TAGS: ReadonlySet<Tag> = new Set(ENTRYPOINTS.map((entry) => entry.tag));

/** What a linked project projects onto this one (`keel link`). */
const PEER_NAMESPACE = 'peer.';

/** The identity namespaces a preset offers as dials: its build system and module layout. */
const DIAL_NAMESPACES: readonly string[] = ['pkg.', 'layout.'];

/**
 * The unmet `requires` of the adapter nearest to matching — per
 * uncovered dimension ({@link coverageGap}), or across every adapter
 * for a vertical that declares none. Empty when the adapters in reach
 * are ruled out by an `excludes` entry instead.
 */
function unmetOf(
  vertical: Vertical,
  tags: ReadonlySet<Tag>,
  acquirable: ReadonlySet<Tag>,
): readonly Tag[] {
  if (vertical.dimensions.length === 0) {
    return nearestUnmet(vertical.adapters, tags, acquirable) ?? [];
  }
  const unmet = new Set<Tag>();
  for (const dimension of coverageGap(vertical, tags)?.dimensions ?? []) {
    const covering = vertical.adapters.filter((adapter) => adapter.covers.includes(dimension));
    for (const tag of nearestUnmet(covering, tags, acquirable) ?? []) unmet.add(tag);
  }
  return [...unmet].sort();
}

/**
 * The unmet `requires` of the adapter among `adapters` nearest to
 * matching, and not excluded by `tags`; null when all are.
 *
 * Nearest counts first what no install can add and is neither an
 * entrypoint nor a linked project — the project's language,
 * framework, runtime, build system or layout — then what no install
 * can add at all, and only
 * then every unmet tag. A plain count would call a Quarkus-native
 * adapter, two identity tags away from a Go CLI, as near as the Go
 * image one that needs only the HTTP entrypoint and an image some
 * vertical builds; the gap would then read as "no adapter for this
 * stack" where the truth is "no HTTP entrypoint". And a Spring CLI is
 * one tag from each of distribution's Quarkus-native adapter (the
 * framework) and its JVM image one (the entrypoint): the entrypoint is
 * the gap a sibling preset closes — `spring-cli-rest` — while the
 * framework is the project itself.
 *
 * Ahead of all that but an adapter keel could reach by adding
 * verticals, one only a dial away — a build system or a module
 * layout, and nothing else fixed: a Quarkus CLI on Maven is a dial
 * from distribution's native adapter (Gradle) and an entrypoint from
 * its JVM image one, and the project is a Quarkus CLI either way — so
 * the gap is the build system, not an HTTP server it never meant to
 * have.
 */
function nearestUnmet(
  adapters: readonly Adapter[],
  tags: ReadonlySet<Tag>,
  acquirable: ReadonlySet<Tag>,
): readonly Tag[] | null {
  let nearest: { readonly unmet: readonly Tag[]; readonly key: readonly number[] } | null = null;
  for (const adapter of adapters) {
    if ((adapter.predicate.excludes ?? []).some((pattern) => matchesPattern(pattern, tags))) {
      continue;
    }
    const unmet = (adapter.predicate.requires ?? []).filter(
      (pattern) => !matchesPattern(pattern, tags),
    );
    const fixed = unmet.filter((pattern) => !matchesPattern(pattern, acquirable));
    const identity = fixed.filter(
      (pattern) => !ENTRYPOINT_TAGS.has(pattern) && !pattern.startsWith(PEER_NAMESPACE),
    ).length;
    const dialOnly =
      fixed.length > 0 &&
      fixed.every((pattern) => DIAL_NAMESPACES.some((ns) => pattern.startsWith(ns)));
    const key = [fixed.length === 0 ? 0 : dialOnly ? 1 : 2, identity, fixed.length, unmet.length];
    if (nearest === null || compareKeys(key, nearest.key) < 0) nearest = { unmet, key };
  }
  return nearest?.unmet ?? null;
}

/**
 * Every tag some registered vertical's adapters may promote — what an
 * install can add to a project, as opposed to what its preset seeded.
 */
export function acquirableIn(registry: Registry): ReadonlySet<Tag> {
  return new Set(
    registry
      .verticals()
      .flatMap((vertical) =>
        vertical.adapters.flatMap((adapter) => adapterPromotes(vertical, adapter)),
      ),
  );
}

/**
 * What stops any vertical supplying `pattern` here: the unmet tags
 * of the nearest adapter that promotes it, or — when that adapter
 * matches — what its vertical lacks. Empty when nothing promotes it,
 * or nothing that does can say more, and the tag is then the gap.
 */
function supplierGap(
  registry: Registry,
  tags: ReadonlySet<Tag>,
  acquirable: ReadonlySet<Tag>,
  pattern: Tag,
): readonly Tag[] {
  let nearest: { readonly vertical: Vertical; readonly unmet: readonly Tag[] } | null = null;
  for (const vertical of registry.verticals()) {
    const suppliers = vertical.adapters.filter((adapter) =>
      matchesPattern(pattern, new Set(adapterPromotes(vertical, adapter))),
    );
    const unmet = nearestUnmet(suppliers, tags, acquirable);
    if (unmet !== null && (nearest === null || unmet.length < nearest.unmet.length)) {
      nearest = { vertical, unmet };
    }
  }
  if (nearest === null) return [];
  return nearest.unmet.length > 0 ? nearest.unmet : unmetOf(nearest.vertical, tags, acquirable);
}

/**
 * The single-service stacks that carry `vertical` — on this scope's
 * dials where they offer them, and their defaults where they do not,
 * it is theirs already, installs alone, or installs once keel adds
 * what it needs — and are nearest this scope: the same language and
 * framework over any other, then the fewest identity tags apart (the
 * preset's own language, framework, runtime, entrypoints, build system
 * and layout; a tag some vertical promotes is not identity). Only the
 * nearest are listed, by id, and never one of another shape: a back
 * end is no answer for a front end.
 */
function nearestStacks(registry: Registry, scope: PlanScope, vertical: Vertical): string[] {
  const acquirable = acquirableIn(registry);
  const identityOf = (tags: readonly Tag[]): ReadonlySet<Tag> =>
    new Set(
      tags.filter(
        (tag) => IDENTITY_NAMESPACES.some((ns) => tag.startsWith(ns)) && !acquirable.has(tag),
      ),
    );
  const here = identityOf(scope.tags);
  const kinOf = (tags: readonly Tag[]): number =>
    sameUnder(tags, scope.tags, 'lang.') && sameUnder(tags, scope.tags, 'framework.') ? 0 : 1;
  const shape = shapeOfTags(scope.tags);

  const scored: { readonly id: string; readonly key: readonly number[] }[] = [];
  for (const stack of assemblableStacks(registry)) {
    if (stack.services !== undefined) continue;
    // A back end is no stack to scaffold a front end as instead.
    if (shape !== null && shapeOfTags(stack.tags) !== shape) continue;
    // On this scope's dials where the stack offers them: the preset a
    // Maven project was scaffolded from does not carry what only its
    // Gradle setting does, so it is no answer to that project.
    const tags = tagsOnDialsOf(stack, scope.tags);
    if (!carries(registry, stack, tags, vertical)) continue;
    scored.push({ id: stack.id, key: [kinOf(tags), distance(here, identityOf(tags))] });
  }
  const best = scored.reduce<readonly number[] | null>(
    (min, entry) => (min === null || compareKeys(entry.key, min) < 0 ? entry.key : min),
    null,
  );
  return best === null
    ? []
    : scored.filter((entry) => compareKeys(entry.key, best) === 0).map((entry) => entry.id);
}

/** Whether `stack`, on `tags`, has `vertical` or can be planned to. */
function carries(
  registry: Registry,
  stack: Stack,
  tags: readonly Tag[],
  vertical: Vertical,
): boolean {
  if (stack.verticals.some((own) => own.id === vertical.id)) return true;
  const scope: PlanScope = {
    tags: seedFor(stack, tags),
    installed: stack.verticals.map((own) => own.id),
    rules: conflictsOf([stack, ...stack.verticals]),
  };
  return closureOf(registry, scope, [vertical]) !== null;
}

/**
 * The scope a preset scaffolds on its default dials: its tags as its
 * own verticals leave them, and those verticals — plus `extras`, the
 * verticals a composite product installs in that service of its own
 * accord — as already there. What a front door plans against for a
 * service it has no manifest for.
 */
export function defaultScope(stack: Stack, extras: readonly string[] = []): PlanScope {
  return {
    tags: seedFor(stack, defaultTags(stack)),
    installed: [...stack.verticals.map((own) => own.id), ...extras],
    rules: conflictsOf([stack, ...stack.verticals]),
  };
}

/** A stack's tags on its default dials. */
function defaultTags(stack: Stack): readonly Tag[] {
  return stackTagsFor(
    stack,
    stack.buildSystems?.[0]?.tag ?? null,
    stack.moduleLayouts?.[0]?.tag ?? null,
  );
}

/**
 * A stack's tags on the dials `tags` records — its build system and
 * module layout, where it offers the one `tags` holds — and on its
 * defaults for any it does not.
 */
function tagsOnDialsOf(stack: Stack, tags: readonly Tag[]): readonly Tag[] {
  const pick = (options: readonly { readonly tag: Tag }[] | undefined): Tag | null =>
    options?.find((option) => tags.includes(option.tag))?.tag ?? options?.[0]?.tag ?? null;
  return stackTagsFor(stack, pick(stack.buildSystems), pick(stack.moduleLayouts));
}

/** Whether two tag lists carry the same tags under `namespace`. */
function sameUnder(a: readonly Tag[], b: readonly Tag[], namespace: string): boolean {
  const under = (tags: readonly Tag[]) =>
    tags
      .filter((tag) => tag.startsWith(namespace))
      .sort()
      .join(' ');
  return under(a) === under(b);
}

/** The size of the symmetric difference of two tag sets. */
function distance(a: ReadonlySet<Tag>, b: ReadonlySet<Tag>): number {
  let apart = 0;
  for (const tag of a) if (!b.has(tag)) apart++;
  for (const tag of b) if (!a.has(tag)) apart++;
  return apart;
}

/** Every `size`-element subset of `items`, in index order. */
function* subsets<T>(items: readonly T[], size: number, from = 0): Generator<readonly T[]> {
  if (size === 0) {
    yield [];
    return;
  }
  for (let index = from; index <= items.length - size; index++) {
    for (const rest of subsets(items, size - 1, index + 1)) yield [items[index] as T, ...rest];
  }
}

function compareKeys(a: readonly number[], b: readonly number[]): number {
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const delta = (a[index] ?? 0) - (b[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

function asSet(tags: Iterable<Tag>): ReadonlySet<Tag> {
  return tags instanceof Set ? tags : new Set(tags);
}
