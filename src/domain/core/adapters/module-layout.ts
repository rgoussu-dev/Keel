/**
 * The **module layout** dial — the structural choice every stack
 * family offers, beside its build system.
 *
 * Two layouts are supported, selected by a `layout.*` capability tag
 * the stack seeds at `keel new` time:
 *
 * - **`basic`** (`layout.basic`) — the flat trisection: one hexagon
 *   for the whole service, spelled the way its language spells one.
 *   The right shape while the project holds a single bounded context.
 * - **`modulith`** (`layout.modulith`) — one hexagon per bounded
 *   context under `modules/<context>/`, shared plumbing under
 *   `platform/`, and one runnable assembly per delivery typology.
 *   Modules meet only at `user-side/service`, which is what makes
 *   carving a context out into its own service a wiring change.
 *
 * This module owns only the vocabulary shared across languages: the
 * two layout names, the tags that seed them, the context names the
 * walking skeleton emits, and the selectable options a stack lists in
 * `moduleLayouts`. *Where* a layout puts things is per-language and
 * lives in a resolver beside this file — `jvmLayout` in
 * `jvm-module-layout.ts`, one sibling per stack family. Adapters
 * never hard-code a directory: they call their family's resolver with
 * the manifest's tags and read paths and names off the result.
 *
 * A manifest with neither tag — every project scaffolded before the
 * dial existed — resolves to `basic`, so brownfield `keel add` keeps
 * working.
 *
 * Not to be confused with the composite-stack **repository** layout
 * (`monorepo`/`polyrepo`), which decides how sibling *services* live
 * in version control and is deliberately not a tag.
 */

import type { Conflict, Tag } from '../../contract/composition.js';
import type { ModuleLayout, ModuleLayoutOption } from '../../contract/stack.js';

/**
 * The layout vocabulary itself lives in `domain/contract/stack.ts`,
 * where `Stack.moduleLayouts` names it. Re-exported here so an
 * adapter keeps reading the dial and its options from one module.
 */
export type { ModuleLayout, ModuleLayoutOption } from '../../contract/stack.js';

/** Capability tag seeding the flat trisection. */
export const BASIC_LAYOUT_TAG: Tag = 'layout.basic';

/** Capability tag seeding the modulith. */
export const MODULITH_LAYOUT_TAG: Tag = 'layout.modulith';

/**
 * Capability tag seeding a **second bounded context** beside the
 * skeleton's own, opted into with `keel new --with-peer-context`.
 *
 * The modulith's whole claim is that contexts meet only at
 * `user-side/service`, and with one context that claim is asserted
 * rather than exercised — nothing in the emitted project consumes the
 * seam, so nothing proves it holds. This tag adds the consumer that
 * does: a context declaring a driven port in its own vocabulary and
 * reaching the first only through a gateway.
 *
 * Only meaningful together with {@link MODULITH_LAYOUT_TAG}, which is
 * what creates the seam in the first place. The tag is
 * language-neutral: what a peer context *costs* differs per family,
 * but "there is a second context" is the same fact everywhere.
 */
export const PEER_CONTEXT_TAG: Tag = 'modules.peer-context';

/**
 * The rule that a second bounded context needs the layout that gives
 * it a seam to cross.
 *
 * Declared rather than checked, and that is the whole point of it
 * being here. It used to be a hand-written branch in the `keel new`
 * handler, which meant the refusal existed and the *menu* did not:
 * `--with-peer-context` was offered against the flat layout and then
 * rejected. One declaration is read both ways — the assembly gate
 * refuses it, the dial menus filter by it — so the two cannot say
 * different things.
 *
 * Attached to the `walking-skeleton` vertical, which is the piece
 * whose capability is constrained. A rule belongs to its declarer,
 * never to a central table: that is what lets a stack family arriving
 * from a plugin bring its own.
 */
export const PEER_CONTEXT_NEEDS_MODULITH: Conflict = {
  id: 'walking-skeleton/peer-context-needs-modulith',
  when: [PEER_CONTEXT_TAG],
  unless: [MODULITH_LAYOUT_TAG],
  reason:
    'a second bounded context needs the modulith layout: it reaches the first only through the peer-facing seam the modulith puts between them, and the flat layout is a single hexagon with no seam to cross. Add --module-layout=modulith',
};

/**
 * The bounded context the walking skeleton scaffolds under the
 * modulith. One module is enough to establish the shape; the second
 * one is the user's first real design decision.
 */
export const SKELETON_MODULE = 'greeting';

/**
 * The consumer context scaffolded by `--with-peer-context`. It reads
 * as a peer of {@link SKELETON_MODULE}: it needs a welcome to record,
 * and greeting is the module that produces one.
 */
export const PEER_MODULE = 'guestbook';

/** Resolves the module layout from a manifest tag set. */
export function moduleLayoutOf(tags: readonly Tag[]): ModuleLayout {
  return tags.includes(MODULITH_LAYOUT_TAG) ? 'modulith' : 'basic';
}

/** The flat trisection — one hexagon for the whole service. */
export const BASIC_LAYOUT: ModuleLayoutOption = {
  id: 'basic',
  tag: BASIC_LAYOUT_TAG,
  label: 'basic — flat trisection (one hexagon for the service)',
  doc: 'One hexagon for the whole service. The right shape while there is a single bounded context.',
};

/** The modulith — one hexagon per bounded context, composed by assemblies. */
export const MODULITH_LAYOUT: ModuleLayoutOption = {
  id: 'modulith',
  tag: MODULITH_LAYOUT_TAG,
  label: 'modulith — one hexagon per bounded context (modules/ + platform/)',
  doc: 'Contexts under modules/, shared plumbing under platform/, one runnable assembly per delivery typology. Modules meet only at user-side/service, so carving one out into its own service is a wiring change.',
};

/**
 * Both module layouts, `basic` first as the default. A stack family
 * that ships modulith template trees lists this as its
 * `moduleLayouts`; a family that does not omits the field, and its
 * adapters resolve to `basic`.
 */
export const MODULE_LAYOUTS: readonly ModuleLayoutOption[] = [BASIC_LAYOUT, MODULITH_LAYOUT];

/**
 * Returns the module-layout option registered under `id`, or null if
 * absent.
 *
 * The lookup a stack preset resolves `moduleLayouts: ["basic",
 * "modulith"]` through. {@link MODULE_LAYOUTS} stays the ordered
 * list — the order is the offer order, and the first entry is the
 * default — while this is the name → option map over it.
 */
export function getModuleLayoutOption(id: string): ModuleLayoutOption | null {
  return MODULE_LAYOUTS.find((option) => option.id === id) ?? null;
}
