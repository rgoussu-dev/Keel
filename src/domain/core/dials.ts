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

import type {
  InstallTarget,
  NewProjectTarget,
  RepoLayout,
  ServiceExtras,
} from '../contract/commands.js';
import { AGENT_HARNESS_TAG, type Tag, type Vertical } from '../contract/composition.js';
import type {
  ChoiceDescriptor,
  DialAdjustment,
  DialOptions,
  ServiceDialOptions,
  VerticalOption,
} from '../contract/queries.js';
import type { RefusalError } from '../contract/refusal.js';
import { emitsFor } from './adapters/context-support.js';
import {
  MODULITH_LAYOUT_TAG,
  PEER_CONTEXT_TAG,
  type ModuleLayoutOption,
} from './adapters/module-layout.js';
import { assemblyRefusal, conflictsOf, legalWith, type ConflictSource } from './compatibility.js';
import { plan, readiness, seedFor, type Plan, type PlanScope } from './planner.js';
import { foresee, planRefusal } from './plan-refusal.js';
import {
  alreadyIncludedNote,
  elsewhereRefusal,
  productRootPlacementRefusal,
  routedExtraNote,
} from './refusals.js';
import { presetServiceScope, presetServiceTags, type PresetService } from './scope.js';
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
 * promote on the way past ({@link seedFor}), its own verticals as
 * already there, and the rules the preset and they declare — which an
 * extra's tags must not break.
 */
export function presetScope(stack: Stack, tags: readonly Tag[]): PlanScope {
  return {
    tags: seedFor(stack, tags),
    installed: stack.verticals.map((vertical) => vertical.id),
    rules: conflictsOf(piecesOf(stack)),
  };
}

/**
 * Every registered vertical as an extras control shows it for this
 * preset — the preset's own (`included`), those the planner reads as
 * `ready` or `needs` on the tags its dials have settled, with what
 * each needs installed first, and the rest (`unavailable`), each with
 * the refusal `keel new --with` would give it. In the registry's
 * order.
 *
 * The planner's reading (`./planner.ts`), not a probe of its own: the
 * same one both front doors refuse by, worded as they word it
 * (`./plan-refusal.ts`'s `foresee`), so a choice offered here is one
 * they accept once its `requires` are named with it, and a reason
 * shown here is the sentence they refuse with. That is what the flat
 * probe this replaced could not be. It saw the tags the preset
 * settles and what its own verticals may promote, never what another
 * *extra* would add — so `iac`, which needs the image `distribution`
 * publishes, was never offered, and `distribution`, whose need for an
 * image was a throw inside its adapter, was offered everywhere and
 * refused on install.
 *
 * What the preset cannot carry is listed rather than left out, as a
 * brownfield card is: "does it take persistence?" is a question the
 * page should answer where it is asked, not by the option's absence.
 */
export function verticalOptions(
  registry: Registry,
  stack: Stack,
  tags: readonly Tag[],
): readonly VerticalOption[] {
  return scopeOptions(registry, presetScope(stack, tags));
}

/**
 * Every registered vertical as an extras control shows it on `scope` —
 * {@link verticalOptions}' reading, over a scope already in hand: a
 * service of a product ({@link presetServiceScope}) as much as a
 * preset.
 */
export function scopeOptions(registry: Registry, scope: PlanScope): readonly VerticalOption[] {
  const options: VerticalOption[] = [];
  for (const summary of listVerticals(registry)) {
    const vertical = registry.vertical(summary.id);
    if (vertical === null) continue;
    const { readiness: ready, refusal } = foresee(registry, scope, vertical);
    options.push({
      ...summary,
      readiness: ready.kind,
      requires:
        ready.kind === 'needs' && ready.alternatives === undefined ? ready.prerequisites : [],
      ...(refusal === null
        ? {}
        : { refusal: { code: refusal.code, message: refusal.message, refusal: refusal.refusal } }),
    });
  }
  return options;
}

/**
 * Whether an option of {@link verticalOptions} is on the extras menu:
 * ready, or ready once others are — not the preset's own, and not one
 * it cannot carry.
 */
export function offeredAsExtra(option: VerticalOption): boolean {
  return option.readiness === 'ready' || option.readiness === 'needs';
}

/** Every tag installing `verticals` may promote, in one flat list. */
export function promotedBy(verticals: readonly Vertical[]): readonly Tag[] {
  return verticals.flatMap((vertical) => vertical.promotes ?? []);
}

/** The vertical `keel new --no-agent-harness` leaves out of a preset. */
const AGENT_HARNESS = 'agent-harness';

/** The code `keel new` refuses a harness it cannot leave out with. */
export const INVALID_AGENT_HARNESS_CODE = 'keel.invalid-agent-harness';

/**
 * `stack` as `keel new --no-agent-harness` installs it: its own
 * verticals, less the agent harness.
 */
export function withoutHarness(stack: Stack): Stack {
  return {
    ...stack,
    verticals: stack.verticals.filter((vertical) => vertical.id !== AGENT_HARNESS),
  };
}

/**
 * Whether `stack`'s own tags or verticals switch the agent harness on
 * — what makes `--no-agent-harness` meaningless on it, and refused.
 */
export function harnessActivatedBy(stack: Stack): boolean {
  return [...stack.tags, ...promotedBy(stack.verticals)].includes(AGENT_HARNESS_TAG);
}

/** Whether installing `vertical` switches the agent harness on. */
export function activatesHarness(vertical: Vertical): boolean {
  return vertical.promotes?.includes(AGENT_HARNESS_TAG) ?? false;
}

/**
 * Whether installing `vertical` on `scope` switches the agent harness
 * back on: it activates the harness itself, or the plan installs a
 * prerequisite with it that does. A harness brought in to satisfy
 * another vertical is a harness all the same, so `--no-agent-harness`
 * refuses the two alike rather than install one unasked.
 */
export function switchesHarnessOn(
  registry: Registry,
  scope: PlanScope,
  vertical: Vertical,
): boolean {
  if (activatesHarness(vertical)) return true;
  const planned = plan(registry, scope, [vertical.id]);
  return (
    planned.kind === 'planned' &&
    planned.order.some((step) => activatesHarnessById(registry, step.id))
  );
}

function activatesHarnessById(registry: Registry, id: string): boolean {
  const vertical = registry.vertical(id);
  return vertical !== null && activatesHarness(vertical);
}

/**
 * Whether the agent harness is a dial of `stack` — a harness the
 * preset comes with and `keel new --no-agent-harness` can leave out.
 *
 * A single-service preset, since a composite product refuses the flag
 * (each of its services carries the harness); one that installs the
 * harness at all, since leaving out what is not there is no choice;
 * and one that, without it, does not switch it straight back on
 * through its own tags or verticals, which the install refuses too.
 */
export function harnessOptional(stack: Stack): boolean {
  return (
    stack.services === undefined &&
    stack.verticals.some((vertical) => vertical.id === AGENT_HARNESS) &&
    !harnessActivatedBy(withoutHarness(stack))
  );
}

/**
 * The sentence `keel new` refuses `--with <id>` beside
 * `--no-agent-harness` in, where `id` would switch the harness back on
 * — and the reason `keel.dials` drops it from a selection that leaves
 * the harness out, word for word.
 */
export function harnessOptOutSentence(id: string): string {
  return id === AGENT_HARNESS
    ? '--no-agent-harness cannot be combined with --with agent-harness'
    : `--no-agent-harness cannot be combined with --with ${id}: it switches the agent harness back on`;
}

/**
 * `options` as they read on a preset installed without its agent
 * harness ({@link withoutHarness}): the harness itself still
 * `included` — the preset's own, left out by the target and there to
 * put back, which no extras box offers — and every other vertical that
 * would switch it back on ({@link switchesHarnessOn}: itself, or a
 * prerequisite it `requires`) `unavailable`, with the refusal
 * `keel new` gives the pair. Both front ends' menus read them so:
 * `keel new`'s extras question and `keel.dials`.
 */
export function harnessLeftOut(
  registry: Registry,
  options: readonly VerticalOption[],
): readonly VerticalOption[] {
  const activates = (id: string): boolean => activatesHarnessById(registry, id);
  return options.map((option): VerticalOption => {
    const { refusal: _refusal, ...rest } = option;
    if (option.id === AGENT_HARNESS) return { ...rest, readiness: 'included', requires: [] };
    if (!activates(option.id) && !option.requires.some(activates)) return option;
    return {
      ...rest,
      readiness: 'unavailable',
      requires: [],
      refusal: { code: INVALID_AGENT_HARNESS_CODE, message: harnessOptOutSentence(option.id) },
    };
  });
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
 *
 * With `agentHarness` false, `stack` is the preset without its
 * harness ({@link withoutHarness}), and a vertical that would switch
 * it back on ({@link switchesHarnessOn}) is dropped in the sentence
 * `keel new` refuses the pair in — never kept for the closure to bring
 * the harness back as its prerequisite.
 */
export function snapExtras(
  registry: Registry,
  stack: Stack,
  tags: readonly Tag[],
  requested: readonly string[],
  agentHarness = true,
): SnappedExtras {
  return snapOnto(
    registry,
    presetScope(stack, tags),
    requested,
    (vertical) => alreadyIncludedNote(vertical, stack.id),
    agentHarness,
  );
}

/** What {@link snapExtras} settles a selection at, and what it moved. */
export interface SnappedExtras {
  readonly extras: readonly string[];
  readonly adjustments: readonly DialAdjustment[];
}

/**
 * {@link snapExtras} over a scope already in hand — a service of a
 * product as much as a preset — with `included` the sentence a
 * vertical already on it is dropped in.
 */
export function snapOnto(
  registry: Registry,
  scope: PlanScope,
  requested: readonly string[],
  included: (vertical: Vertical) => string,
  agentHarness = true,
): SnappedExtras {
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
    else if (scope.installed.includes(id)) drop(id, included(vertical));
    else if (!agentHarness && switchesHarnessOn(registry, scope, vertical)) {
      drop(id, harnessOptOutSentence(id));
    } else candidates.push(vertical);
  }
  const tied: Vertical[] = [];
  const keep = (vertical: Vertical, retry: boolean): void => {
    const tried = plan(registry, scope, [...kept, vertical.id]);
    if (tried.kind === 'planned') kept.push(vertical.id);
    else if (tried.kind === 'tied' && retry) tied.push(vertical);
    else drop(vertical.id, refusalOf(registry, scope, vertical, tried));
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

/**
 * The sentence `vertical` is dropped from a selection with, from the
 * plan that refused it — the refusal a front door would give it
 * (`./plan-refusal.ts`), word for word.
 */
function refusalOf(registry: Registry, scope: PlanScope, vertical: Vertical, tried: Plan): string {
  switch (tried.kind) {
    case 'unknown':
      return `no vertical '${tried.vertical}' is registered`;
    case 'planned':
      throw new Error(`refusalOf: '${vertical.id}' planned`);
    default:
      return planRefusal(registry, [vertical], tried, scope.rules).message;
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
    agentHarness: false,
    extraVerticals: [],
    verticals: [],
    adjustments: [],
  };
}

function singleDials(registry: Registry, preset: Stack, target: NewProjectTarget): DialOptions {
  // The harness first, as `keel new` settles it: every menu below is
  // read over the preset as it will be installed.
  const agentHarness = harnessOptional(preset);
  const harnessOff = agentHarness && target.agentHarness === false;
  const stack = harnessOff ? withoutHarness(preset) : preset;
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
  const options = verticalOptions(registry, stack, tags);
  const verticals = harnessOff ? harnessLeftOut(registry, options) : options;
  // A product's per-service extras, carried onto a single preset by a
  // front end moving between them, are this preset's extras here: a
  // single project is every service at once, and `keel new` refuses a
  // service's path on it, so the settled target must not carry one.
  const snapped = snapExtras(
    registry,
    stack,
    tags,
    [...(target.extraVerticals ?? []), ...serviceExtrasOf(target)],
    !harnessOff,
  );

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
      // Only ever `false`: on is what an absent field means, and a
      // preset whose harness cannot be left out has no such dial.
      ...(harnessOff ? { agentHarness: false } : {}),
    },
    buildSystems: buildSystems.map(asChoice),
    moduleLayouts: moduleLayouts.map(asChoice),
    services: [],
    peerContext,
    agentHarness,
    extraVerticals: verticals.filter(offeredAsExtra).map(verticalChoice),
    verticals,
    adjustments: snapped.adjustments,
  };
}

/**
 * A composite product's dials: the repository layout, and each
 * service's build system and extras.
 *
 * No rule spans the services, and saying so is the point of the empty
 * `moduleLayouts`. The repository layout seeds no tag at all, and a
 * service is a full install of its own stack in its own scope — the
 * product root never assembles their tags together, so there is no
 * combination for a {@link Conflict} to bite on. The module layout,
 * the peer context and the harness are not dials here: the install
 * refuses all three on a composite, so a settled target must not
 * carry them.
 *
 * The extras are each service's: a menu per service
 * (`ServiceDialOptions.verticals`) read over the scope `keel new`
 * plans that service's extras onto — on the build system settled for
 * it, and under the monorepo layout with what the product root gives
 * it — and the service's selection (`target.services`) snapped to
 * that scope as a single preset's is, each adjustment naming the
 * service. Extras named without a service — `keel new --with`'s bare
 * ids, or a single preset's selection carried onto the product — go
 * to the one service that can take each ({@link routeExtra}), as the
 * install sends them, and are dropped with the install's refusal where
 * none or several can; the settled target carries them in that
 * service's selection, never bare. The top-level `extraVerticals` and
 * `verticals` read what a bare id does here.
 */
function compositeDials(registry: Registry, stack: Stack, target: NewProjectTarget): DialOptions {
  const layout = target.layout ?? DEFAULT_REPO_LAYOUT;
  const monorepo = layout === 'monorepo';
  const chosen = readServiceBuildSystems(target.buildSystem);
  const builds = new Map<string, BuildSystemOption | null>();
  for (const service of stack.services ?? []) {
    const options = registry.stack(service.stack)?.buildSystems ?? [];
    builds.set(service.path, prefer(options, chosen.get(service.path)));
  }
  const scopes = productScopes(
    registry,
    stack,
    presetServicesOf(registry, stack),
    (path) => builds.get(path)?.tag ?? null,
    monorepo,
  );

  const adjustments: DialAdjustment[] = [];
  const requested = new Map(
    scopes.map(({ service }) => [
      service.path,
      [...(target.services?.[service.path]?.extraVerticals ?? [])],
    ]),
  );
  for (const [path, extras] of Object.entries(target.services ?? {})) {
    if (requested.has(path)) continue;
    for (const id of extras.extraVerticals) {
      adjustments.push({
        id,
        change: 'dropped',
        because: `${stack.id} has no service at ${path}/`,
      });
    }
  }
  for (const id of [...new Set(target.extraVerticals ?? [])].sort()) {
    const vertical = registry.vertical(id);
    if (vertical === null) {
      adjustments.push({ id, change: 'dropped', because: `no vertical '${id}' is registered` });
      continue;
    }
    if (stack.verticals.some((own) => own.id === id)) {
      adjustments.push({ id, change: 'dropped', because: alreadyIncludedNote(vertical, stack.id) });
      continue;
    }
    const routed = routeExtra(registry, scopes, vertical, monorepo);
    if (routed.kind === 'refused') {
      adjustments.push({ id, change: 'dropped', because: routed.refusal.message });
      continue;
    }
    requested.get(routed.path)?.push(id);
    adjustments.push({
      id,
      change: 'added',
      service: routed.path,
      because: routedExtraNote(vertical, routed.path, stack.id),
    });
  }

  const services: ServiceDialOptions[] = [];
  const extras: Record<string, ServiceExtras> = {};
  for (const { service, scope } of scopes) {
    const snapped = snapOnto(
      registry,
      scope,
      requested.get(service.path) ?? [],
      serviceIncludedNote(stack, service),
    );
    adjustments.push(
      ...snapped.adjustments.map((adjustment) => ({ ...adjustment, service: service.path })),
    );
    if (snapped.extras.length > 0) extras[service.path] = { extraVerticals: snapped.extras };
    services.push({
      path: service.path,
      stack: service.stack.id,
      buildSystems: (service.stack.buildSystems ?? []).map(asChoice),
      verticals: scopeOptions(registry, scope),
    });
  }
  const pairs = [...builds].flatMap(([path, build]) =>
    build === null ? [] : [`${path}=${build.id}`],
  );
  const verticals = productOptions(registry, stack, scopes, monorepo);
  return {
    target: {
      kind: 'new-project',
      stack: stack.id,
      layout,
      ...(pairs.length === 0 ? {} : { buildSystem: pairs.join(',') }),
      ...(Object.keys(extras).length === 0 ? {} : { services: extras }),
    },
    buildSystems: [],
    moduleLayouts: [],
    services,
    peerContext: false,
    agentHarness: false,
    extraVerticals: verticals.filter(offeredAsExtra).map(verticalChoice),
    verticals,
    adjustments,
  };
}

/** One service of a product, and the scope its extras plan onto. */
export interface ServicePlanScope {
  readonly service: PresetService;
  readonly scope: PlanScope;
}

/**
 * The services of the product preset `product` a registry can
 * scaffold, in the product's order: each naming a registered
 * single-service preset. The install refuses a product naming any
 * other; a menu leaves it out.
 */
export function presetServicesOf(registry: Registry, product: Stack): readonly PresetService[] {
  return (product.services ?? []).flatMap((service) => {
    const stack = registry.stack(service.stack);
    return stack === null || stack.services !== undefined
      ? []
      : [{ path: service.path, stack, extraVerticals: service.extraVerticals ?? [] }];
  });
}

/**
 * Each of `services` with the scope its extras plan onto
 * ({@link presetServiceScope}), on the build system `buildTagOf` says
 * was chosen for it and the repository layout.
 */
export function productScopes(
  registry: Registry,
  product: Stack,
  services: readonly PresetService[],
  buildTagOf: (path: string) => Tag | null,
  monorepo: boolean,
): readonly ServicePlanScope[] {
  return services.map((service) => ({
    service,
    scope: presetServiceScope(
      registry,
      product,
      service,
      presetServiceTags(service, buildTagOf(service.path), services),
      monorepo,
    ),
  }));
}

/** Where {@link routeExtra} sends a vertical, or why it sends it nowhere. */
export type Routed =
  | { readonly kind: 'routed'; readonly path: string }
  | { readonly kind: 'refused'; readonly refusal: RefusalError };

/**
 * Where `vertical`, named for a composite product without a service,
 * goes: to the one service whose scope admits it — ready, or ready
 * once its prerequisites are in. Where none does, or several, it goes
 * nowhere, and the refusal is the one `keel add` gives it at the
 * product root: a vertical whose place is a repository root, asked of
 * a monorepo product, cannot go in any of its services
 * (`keel.uncoverable-vertical`); any other belongs to a service, and
 * the refusal names each with its readiness there
 * (`keel.wrong-scope`) — so a vertical two services could each take
 * is the user's to place. `vertical` is not the product's own.
 */
export function routeExtra(
  registry: Registry,
  scopes: readonly ServicePlanScope[],
  vertical: Vertical,
  monorepo: boolean,
): Routed {
  const read = scopes.map(({ service, scope }) => ({
    path: service.path,
    stack: service.stack.id,
    readiness: readiness(registry, scope, vertical.id).kind,
  }));
  const admitting = read.filter(
    (service) => service.readiness === 'ready' || service.readiness === 'needs',
  );
  const [only] = admitting;
  if (admitting.length === 1 && only !== undefined) return { kind: 'routed', path: only.path };
  if (monorepo && vertical.placement?.scope === 'repository') {
    return { kind: 'refused', refusal: productRootPlacementRefusal(registry, vertical) };
  }
  return { kind: 'refused', refusal: elsewhereRefusal(registry, vertical, read) };
}

/**
 * The sentence a vertical already on a product's service is set aside
 * in: it comes with the service's preset, or with the product — the
 * verticals the product installs in it, and under the monorepo layout
 * what its root gives it.
 */
export function serviceIncludedNote(
  product: Stack,
  service: PresetService,
): (vertical: Vertical) => string {
  return (vertical) =>
    alreadyIncludedNote(
      vertical,
      service.stack.verticals.some((own) => own.id === vertical.id) ? service.stack.id : product.id,
    );
}

/**
 * Every registered vertical as `keel new --with` reads it on a product
 * named without a service: the product's own `included`; one a single
 * service can take, as that service reads it; and the rest
 * `unavailable`, with the refusal {@link routeExtra} gives it.
 */
function productOptions(
  registry: Registry,
  product: Stack,
  scopes: readonly ServicePlanScope[],
  monorepo: boolean,
): readonly VerticalOption[] {
  return listVerticals(registry).flatMap((summary): VerticalOption[] => {
    const vertical = registry.vertical(summary.id);
    if (vertical === null) return [];
    if (product.verticals.some((own) => own.id === summary.id)) {
      return [{ ...summary, readiness: 'included', requires: [] }];
    }
    const routed = routeExtra(registry, scopes, vertical, monorepo);
    if (routed.kind === 'refused') {
      const { code, message, refusal } = routed.refusal;
      return [
        { ...summary, readiness: 'unavailable', requires: [], refusal: { code, message, refusal } },
      ];
    }
    const scope = scopes.find(({ service }) => service.path === routed.path)?.scope;
    if (scope === undefined) return [];
    return scopeOptions(registry, scope).filter((option) => option.id === summary.id);
  });
}

/** Every extra a target names for a product's services, in their order, each once. */
function serviceExtrasOf(target: NewProjectTarget): readonly string[] {
  return [
    ...new Set(Object.values(target.services ?? {}).flatMap((service) => service.extraVerticals)),
  ];
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
