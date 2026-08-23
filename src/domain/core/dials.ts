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
import type { ChoiceDescriptor, DialOptions, ServiceDescriptor } from '../contract/queries.js';
import { emitsFor } from './adapters/context-support.js';
import {
  MODULITH_LAYOUT_TAG,
  PEER_CONTEXT_TAG,
  type ModuleLayoutOption,
} from './adapters/module-layout.js';
import { assemblyRefusal, conflictsOf, legalWith, type ConflictSource } from './compatibility.js';
import { coversFor } from './resolver.js';
import { stackTagsFor, type BuildSystemOption, type Stack } from './stacks.js';
import { listVerticals, type VerticalSummary } from './registry.js';
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
 * The verticals that may still be layered on top of this stack, given
 * the tags its dials have settled.
 *
 * Two ways a vertical is a dead end here, and both are asked ahead of
 * the install rather than discovered inside it: no adapter covers one
 * of its dimensions, or one of its own rules is broken by what the
 * dials have settled.
 *
 * Coverage reads the tags *plus* what the stack's own verticals
 * promote, and the rules read the tags alone, because a promotable
 * tag cuts opposite ways: it can only *help* an adapter match, and it
 * can only *create* a conflict. Hiding a vertical over a tag that may
 * never appear would take away a legal choice; the assembly gate
 * still refuses it if the tag does appear.
 */
export function legalExtraVerticals(
  registry: Registry,
  stack: Stack,
  tags: readonly Tag[],
): readonly VerticalSummary[] {
  const own = new Set(stack.verticals.map((v) => v.id));
  const seed = [...tags, ...promotedBy(stack.verticals)];
  return listVerticals(registry).filter((summary) => {
    if (own.has(summary.id)) return false;
    const vertical = registry.vertical(summary.id);
    if (vertical === null) return false;
    return coversFor(vertical, seed) && assemblyRefusal([vertical], tags) === null;
  });
}

/** Every tag installing `verticals` may promote, in one flat list. */
export function promotedBy(verticals: readonly Vertical[]): readonly Tag[] {
  return verticals.flatMap((vertical) => vertical.promotes ?? []);
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
  };
}

function singleDials(registry: Registry, stack: Stack, target: NewProjectTarget): DialOptions {
  const buildSystems = legalBuildSystems(stack, stack.buildSystems ?? []);
  const build = prefer(buildSystems, target.buildSystem);
  const moduleLayouts = legalModuleLayouts(stack, build?.tag ?? null, stack.moduleLayouts ?? []);
  const layout = prefer(moduleLayouts, target.moduleLayout);

  const tags = stackTagsFor(stack, build?.tag ?? null, layout?.tag ?? null);
  const peerContext = peerContextOffered(stack, build?.tag ?? null, layout?.tag ?? null);
  const extraVerticals = legalExtraVerticals(registry, stack, tags);
  const legalExtraIds = new Set(extraVerticals.map((vertical) => vertical.id));

  return {
    target: {
      kind: 'new-project',
      stack: stack.id,
      ...(build === null ? {} : { buildSystem: build.id }),
      ...(layout === null ? {} : { moduleLayout: layout.id }),
      // Always set, never omitted. An absent `withPeerContext` is
      // what makes the install *ask*, and a front end reading this
      // has already been handed the choice as a menu of its own.
      withPeerContext: target.withPeerContext === true && peerContext,
      // Pruned when the caller set it, never pinned when they did
      // not: absent is what keeps the extras question coming back
      // from `keel.preview`, which is the only place a caller is
      // offered the list.
      ...(target.extraVerticals === undefined
        ? {}
        : { extraVerticals: target.extraVerticals.filter((id) => legalExtraIds.has(id)) }),
    },
    buildSystems: buildSystems.map(asChoice),
    moduleLayouts: moduleLayouts.map(asChoice),
    services: [],
    peerContext,
    extraVerticals: extraVerticals.map(verticalChoice),
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

const verticalChoice = (vertical: VerticalSummary): ChoiceDescriptor => ({
  id: vertical.id,
  label: vertical.id,
  doc: vertical.description,
});
