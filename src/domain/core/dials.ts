/**
 * The stack-level dials, and which settings of them the rules still
 * allow.
 *
 * **One declaration, read twice** (`./compatibility.ts`) closed the
 * loop for the terminal: `keel new` refuses an illegal assembly, and
 * its menus keep the illegal choice off the list. It closed it there
 * because a terminal settles one dial before offering the next — the
 * build system, then the module layout filtered against the tag that
 * answer left behind, then the peer context filtered against both.
 * Each menu is computed against a tag set, and the tag set is
 * complete by the time it is needed.
 *
 * A form has nowhere to put that. It shows every dial at once, from a
 * catalog that describes a preset's dials without knowing which
 * combination the user is on — so the moment a rule names two dials
 * together, the form offers a combination the install refuses. This
 * module is the third reading of the same declaration: *given these
 * dials, what may the others still be*. Not a new rule, not a second
 * matcher — the same {@link assemblyRefusal} the install gate runs,
 * asked once per candidate value.
 *
 * It is also where the terminal's own menu filters live, moved here
 * from `handlers/new-project.ts` rather than copied: `keel new`'s
 * questions and `keel.dials`' answers are the same functions, so the
 * two front ends cannot drift.
 *
 * **Nothing here refuses.** {@link dialOptionsFor} answers for an
 * unknown stack, a half-filled target and a combination already
 * illegal alike. A menu that will not answer where the assembly is
 * broken is a menu that cannot be used to fix it; refusing belongs to
 * the install gate, which says so in the rule's own words.
 */

import type { InstallTarget, NewProjectTarget, RepoLayout } from '../contract/commands.js';
import type { Tag, Vertical } from '../contract/composition.js';
import type {
  ChoiceDescriptor,
  DialAdjustment,
  DialOptions,
  ServiceDescriptor,
  VerticalOption,
} from '../contract/queries.js';
import { emitsFor } from './adapters/context-support.js';
import {
  MODULITH_LAYOUT_TAG,
  PEER_CONTEXT_TAG,
  type ModuleLayoutOption,
} from './adapters/module-layout.js';
import { assemblyRefusal, conflictsOf, legalWith, type ConflictSource } from './compatibility.js';
import { plan, readiness, seedFor, type Plan, type PlanScope } from './planner.js';
import {
  alreadyIncludedNote,
  incompatibleSentence,
  tiedPrerequisitesSentence,
  unavailableSentence,
} from './refusals.js';
import { stackTagsFor, type BuildSystemOption, type Stack } from './stacks.js';
import { listVerticals, verticalTitle } from './registry.js';
import type { Registry } from '../contract/ports/registry.js';

/** The default repository layout of a composite install. */
const DEFAULT_REPO_LAYOUT: RepoLayout = 'monorepo';

/**
 * The pieces whose rules govern an assembly of this stack: the preset
 * itself and every vertical it installs. @see assemblyRefusal
 */
export function piecesOf(stack: Stack): readonly ConflictSource[] {
  return [stack, ...stack.verticals];
}

/**
 * Whether any adapter this stack would install actually emits the
 * second bounded context for `tags`.
 *
 * The `Stack`-shaped face of {@link emitsFor}, which `keel add module`
 * calls with the verticals of a project already on disk. Same probe,
 * because a second copy is exactly how the check this guard replaced
 * went stale.
 */
export function emitsPeerContext(stack: Stack, tags: readonly Tag[]): boolean {
  return emitsFor(stack.verticals, PEER_CONTEXT_TAG, tags);
}

/**
 * The build systems worth offering: those some module layout can
 * still complete legally.
 *
 * "Some layout", because this dial settles first and the layout is
 * not chosen yet. Offering a build system that only works under one
 * of two layouts is right — the layout menu narrows next, with this
 * answer in hand. Dropping one that works under neither is what keeps
 * the user off a road with no legal end.
 *
 * The optimism is load-bearing for a *form*, not only for a wizard.
 * Narrowing this dial against the layout as it currently stands would
 * make a legal combination unreachable: with `maven` illegal under
 * the modulith, a user on the modulith could never select maven, and
 * so could never arrive at the perfectly legal `maven` + `basic`.
 * Offered optimistically, the layout snaps to `basic` instead — which
 * is exactly the order the terminal would have asked in.
 */
export function legalBuildSystems(
  stack: Stack,
  options: readonly BuildSystemOption[],
): readonly BuildSystemOption[] {
  const layouts: readonly (Tag | null)[] = stack.moduleLayouts?.map((o) => o.tag) ?? [null];
  const offered = options.filter((option) =>
    layouts.some(
      (layout) =>
        assemblyRefusal(piecesOf(stack), stackTagsFor(stack, option.tag, layout)) === null,
    ),
  );
  // Every option refused is not a menu, it is a refusal — and the
  // assembly gate is the thing that says so, in the rule's own words.
  // Handing the dial back unfiltered lets the run reach it.
  return offered.length === 0 ? options : offered;
}

/**
 * The module layouts worth offering, given the build system already
 * settled — exact rather than optimistic, since this is the last dial
 * to put a tag on the assembly.
 */
export function legalModuleLayouts(
  stack: Stack,
  buildTag: Tag | null,
  options: readonly ModuleLayoutOption[],
): readonly ModuleLayoutOption[] {
  const offered = options.filter(
    (option) =>
      assemblyRefusal(piecesOf(stack), stackTagsFor(stack, buildTag, option.tag)) === null,
  );
  return offered.length === 0 ? options : offered;
}

/**
 * Whether the peer context may be switched on, given the dials as
 * they stand. Two questions, and they are different in kind:
 *
 *   - **the rules** — `legalWith`, the same declaration the assembly
 *     gate refuses by, read as a filter. Today that is the layout
 *     rule (`peer-context-needs-modulith`); tomorrow it is whatever a
 *     piece declares, including one arriving from outside this
 *     repository.
 *   - **the capability** — whether this stack's adapters emit a peer
 *     context at all, asked hypothetically against the layout that
 *     creates the seam. A peer-context adapter declares `covers: []`,
 *     so the resolver's uncovered-dimension hard-fail structurally
 *     cannot speak for it and the flag would otherwise be a silent
 *     no-op.
 */
export function peerContextOffered(
  stack: Stack,
  buildTag: Tag | null,
  layoutTag: Tag | null,
): boolean {
  return (
    legalWith(conflictsOf(piecesOf(stack)), stackTagsFor(stack, buildTag, layoutTag), [
      PEER_CONTEXT_TAG,
    ]) && emitsPeerContext(stack, stackTagsFor(stack, buildTag, MODULITH_LAYOUT_TAG))
  );
}

/**
 * The scope a preset's extras are planned onto, before anything is
 * written: the tags its dials settled plus what its own verticals
 * promote on the way past ({@link seedFor}), and its own verticals as
 * already there.
 */
export function presetScope(stack: Stack, tags: readonly Tag[]): PlanScope {
  return {
    tags: seedFor(stack, tags),
    installed: stack.verticals.map((vertical) => vertical.id),
  };
}

/**
 * Every vertical of this preset an extras control shows — the
 * preset's own (`included`), and every other one the planner reads as
 * `ready` or `needs` on the tags its dials have settled — with what
 * each needs installed first. In the registry's order.
 *
 * The planner's reading (`./planner.ts`), not a probe of its own: the
 * same one both front doors refuse by, so a choice offered here is
 * one they accept once its `requires` are named with it. That is what
 * the flat probe this replaced could not be. It saw the tags the
 * preset settles and what its own verticals may promote, never what
 * another *extra* would add — so `iac`, which needs the image
 * `distribution` publishes, was never offered, and `distribution`,
 * whose need for an image was a throw inside its adapter, was offered
 * everywhere and refused on install.
 */
export function verticalOptions(
  registry: Registry,
  stack: Stack,
  tags: readonly Tag[],
): readonly VerticalOption[] {
  const scope = presetScope(stack, tags);
  const options: VerticalOption[] = [];
  for (const summary of listVerticals(registry)) {
    const ready = readiness(registry, scope, summary.id);
    if (ready.kind === 'unavailable') continue;
    options.push({
      ...summary,
      readiness: ready.kind,
      requires:
        ready.kind === 'needs' && ready.alternatives === undefined ? ready.prerequisites : [],
    });
  }
  return options;
}

/**
 * Whether an option of {@link verticalOptions} is on the extras menu:
 * every one but the preset's own — ready, or ready once others are.
 */
export function offeredAsExtra(option: VerticalOption): boolean {
  return option.readiness !== 'included';
}

/** Every tag installing `verticals` may promote, in one flat list. */
export function promotedBy(verticals: readonly Vertical[]): readonly Tag[] {
  return verticals.flatMap((vertical) => vertical.promotes ?? []);
}

/**
 * `requested` snapped to what installs on this preset: each id, by id,
 * kept where the planner can install it beside the ones kept before
 * it, dropped where it cannot, then the whole set closed over its
 * prerequisites and put in the order the install runs them — with an
 * {@link DialAdjustment} for every id added or dropped: the dropped
 * ones first, the added ones after them in install order.
 *
 * A set, like `--with`: taken by id, so the order a page ticks its
 * boxes in cannot change what is kept or the order it installs in. A
 * vertical tied between two providers is tried again once the rest is
 * kept, since one of the rest may be the provider that settles it —
 * the front door plans the set whole, and would accept it.
 *
 * The closure is the one both front doors install for a set that
 * leaves a prerequisite out, so a form ticking `iac` posts
 * `containerization, distribution, iac` back — the plan the command
 * line would run for `--with iac` — and says why.
 */
export function snapExtras(
  registry: Registry,
  stack: Stack,
  tags: readonly Tag[],
  requested: readonly string[],
): { readonly extras: readonly string[]; readonly adjustments: readonly DialAdjustment[] } {
  const scope = presetScope(stack, tags);
  const kept: string[] = [];
  const adjustments: DialAdjustment[] = [];
  const drop = (id: string, because: string): void => {
    adjustments.push({ id, change: 'dropped', because });
  };
  const unregistered = (id: string): string => `no vertical '${id}' is registered`;
  const candidates: Vertical[] = [];
  for (const id of [...new Set(requested)].sort()) {
    const vertical = registry.vertical(id);
    if (vertical === null) drop(id, unregistered(id));
    else if (scope.installed.includes(id)) drop(id, alreadyIncludedNote(vertical, stack.id));
    else candidates.push(vertical);
  }
  const tied: Vertical[] = [];
  const keep = (vertical: Vertical, retry: boolean): void => {
    const tried = plan(registry, scope, [...kept, vertical.id]);
    if (tried.kind === 'planned') kept.push(vertical.id);
    else if (tried.kind === 'tied' && retry) tied.push(vertical);
    else drop(vertical.id, refusalOf(registry, vertical, tried));
  };
  for (const vertical of candidates) keep(vertical, true);
  for (const vertical of tied) keep(vertical, false);
  kept.sort();
  const closed = plan(registry, scope, kept);
  if (closed.kind !== 'planned') return { extras: kept, adjustments };
  for (const step of closed.order) {
    if (step.reason === 'requested') continue;
    const titles = step.reason.neededBy
      .flatMap((other) => registry.vertical(other) ?? [])
      .map(verticalTitle);
    const who =
      titles.length === 0
        ? 'the rest of the selection needs'
        : `${titles.join(' and ')} ${titles.length === 1 ? 'needs' : 'need'}`;
    adjustments.push({ id: step.id, change: 'added', because: `${who} it installed first` });
  }
  return { extras: closed.order.map((step) => step.id), adjustments };
}

/** The sentence `vertical` is dropped from a selection with, from the plan that refused it. */
function refusalOf(registry: Registry, vertical: Vertical, tried: Plan): string {
  const verticals = (ids: readonly string[]): Vertical[] =>
    ids.flatMap((other) => registry.vertical(other) ?? []);
  switch (tried.kind) {
    case 'unavailable':
      return unavailableSentence(vertical, tried.gap);
    case 'tied':
      return tiedPrerequisitesSentence([vertical], tried.closures.map(verticals));
    case 'incompatible':
      return incompatibleSentence(verticals(tried.verticals));
    case 'unknown':
      return `no vertical '${tried.vertical}' is registered`;
    case 'planned':
      throw new Error(`refusalOf: '${vertical.id}' planned`);
  }
}

/**
 * The menus a target's dials still leave open, and the target they
 * settle at — the whole of `keel.dials`.
 *
 * Settling runs the dials in the order the install resolves them, so
 * a preference the rules refuse is dropped exactly where the terminal
 * would never have offered it. Which is why the answer is a *target*
 * and not four independent menus: a form that picked its own value
 * per menu would be reimplementing that order, and the two would part
 * company the first time a rule spanned three dials.
 */
export function dialOptionsFor(registry: Registry, target: InstallTarget): DialOptions {
  if (target.kind !== 'new-project') return undialled(target);
  const stack = target.stack === undefined ? null : registry.stack(target.stack);
  return stack === null ? undialled(target) : stackDials(registry, stack, target);
}

/**
 * {@link dialOptionsFor} for a stack already in hand — the whole of
 * the computation, with only the registry lookup taken off the front.
 *
 * Split out because a rule is a property of the *pieces*, not of the
 * registry: a preset assembled from a plugin's stack has to get the
 * same answer as one keel ships, and a test proving the menus and the
 * gate agree has to be able to say so about a rule no shipped preset
 * declares. The registry stays in the signature all the same — the
 * extras menu is a question about every vertical this run may
 * install, which is exactly what the registry is.
 */
export function stackDials(
  registry: Registry,
  stack: Stack,
  target: NewProjectTarget,
): DialOptions {
  return stack.services === undefined
    ? singleDials(registry, stack, target)
    : compositeDials(registry, stack, target);
}

/** A target with no stack-level dials at all — every brownfield one. */
function undialled(target: InstallTarget): DialOptions {
  return {
    target,
    buildSystems: [],
    moduleLayouts: [],
    services: [],
    peerContext: false,
    extraVerticals: [],
    verticals: [],
    adjustments: [],
  };
}

function singleDials(registry: Registry, stack: Stack, target: NewProjectTarget): DialOptions {
  const buildSystems = legalBuildSystems(stack, stack.buildSystems ?? []);
  const build = prefer(buildSystems, target.buildSystem);
  const moduleLayouts = legalModuleLayouts(stack, build?.tag ?? null, stack.moduleLayouts ?? []);
  const layout = prefer(moduleLayouts, target.moduleLayout);

  const peerContext = peerContextOffered(stack, build?.tag ?? null, layout?.tag ?? null);
  const withPeerContext = target.withPeerContext === true && peerContext;
  // The tags the install gate plans the extras onto: the dials', and
  // the peer context's when it is switched on.
  const tags = [
    ...stackTagsFor(stack, build?.tag ?? null, layout?.tag ?? null),
    ...(withPeerContext ? [PEER_CONTEXT_TAG] : []),
  ];
  const verticals = verticalOptions(registry, stack, tags);
  const snapped = snapExtras(registry, stack, tags, target.extraVerticals ?? []);

  return {
    target: {
      kind: 'new-project',
      stack: stack.id,
      ...(build === null ? {} : { buildSystem: build.id }),
      ...(layout === null ? {} : { moduleLayout: layout.id }),
      // Always set, never omitted. An absent `withPeerContext` is
      // what makes the install *ask*, and a front end reading this
      // has already been handed the choice as a menu of its own.
      withPeerContext,
      // Pinned like every other dial — to `[]` when the caller named
      // none — and snapped to its closure when they named some. It
      // used to be left absent so `keel.preview` would keep asking
      // the extras question, which was then the only place a caller
      // was offered the list; but a question the install stops asking
      // once answered is a control that vanishes after its first
      // tick. The list is `verticals` below now, a menu like the
      // others, and a front end that renders it must not also be
      // asked it.
      extraVerticals: snapped.extras,
    },
    buildSystems: buildSystems.map(asChoice),
    moduleLayouts: moduleLayouts.map(asChoice),
    services: [],
    peerContext,
    extraVerticals: verticals.filter(offeredAsExtra).map(verticalChoice),
    verticals,
    adjustments: snapped.adjustments,
  };
}

/**
 * A composite product's dials: the repository layout and one build
 * system per service.
 *
 * No rule can reach them, and saying so is the point of the empty
 * `moduleLayouts`. The repository layout seeds no tag at all, and a
 * service is a full install of its own stack in its own scope — the
 * product root never assembles their tags together, so there is no
 * combination for a {@link Conflict} to bite on. The module layout,
 * the peer context and the extras are not dials here either: the
 * install refuses all three on a composite, so a settled target must
 * not carry them.
 */
function compositeDials(registry: Registry, stack: Stack, target: NewProjectTarget): DialOptions {
  const chosen = readServiceBuildSystems(target.buildSystem);
  const services: ServiceDescriptor[] = [];
  const pairs: string[] = [];
  for (const service of stack.services ?? []) {
    const serviceStack = registry.stack(service.stack);
    const options = serviceStack?.buildSystems ?? [];
    services.push({
      path: service.path,
      stack: service.stack,
      buildSystems: options.map(asChoice),
    });
    const build = prefer(options, chosen.get(service.path));
    if (build !== null) pairs.push(`${service.path}=${build.id}`);
  }
  return {
    target: {
      kind: 'new-project',
      stack: stack.id,
      layout: target.layout ?? DEFAULT_REPO_LAYOUT,
      ...(pairs.length === 0 ? {} : { buildSystem: pairs.join(',') }),
    },
    buildSystems: [],
    moduleLayouts: [],
    services,
    peerContext: false,
    extraVerticals: [],
    verticals: [],
    adjustments: [],
  };
}

/**
 * Reads a composite `--build-system` string as the *preference* it is
 * here: `path=id` pairs, and anything unreadable simply ignored.
 *
 * Tolerant on purpose, and that is what keeps it distinct from the
 * install handler's parser rather than a copy of it. There, a
 * malformed pair is a command to refuse with the services spelled
 * out; here it is a stale control value, and the answer is the
 * default the menu already offers.
 */
function readServiceBuildSystems(raw: string | undefined): ReadonlyMap<string, string> {
  const pairs = new Map<string, string>();
  for (const entry of (raw ?? '').split(',')) {
    const separator = entry.indexOf('=');
    if (separator <= 0) continue;
    const path = entry.slice(0, separator).trim();
    const id = entry.slice(separator + 1).trim();
    if (path !== '' && id !== '') pairs.set(path, id);
  }
  return pairs;
}

/** The requested option where the menu still offers it, else its default. */
function prefer<T extends { readonly id: string }>(
  options: readonly T[],
  requested: string | undefined,
): T | null {
  return options.find((option) => option.id === requested) ?? options[0] ?? null;
}

const asChoice = (option: BuildSystemOption | ModuleLayoutOption): ChoiceDescriptor => ({
  id: option.id,
  label: option.label,
  doc: option.doc,
});

const verticalChoice = (vertical: VerticalOption): ChoiceDescriptor => ({
  id: vertical.id,
  label: vertical.title,
  doc: vertical.description,
});
