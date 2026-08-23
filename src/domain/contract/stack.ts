/**
 * The **stack** vocabulary — a curated greenfield preset and the
 * dials it offers.
 *
 * A `Stack` is a combination of capability tags, dial options and
 * verticals that produces a coherent project: pick one with
 * `keel new --stack=<id>` and the engine resolves everything from
 * there. Stacks are sugar over {@link Vertical} composition — they
 * add no expressive power the composition layer does not already
 * have, they spare the user from naming every tag and vertical by
 * hand.
 *
 * These are **types only**; the presets keel ships live in
 * `domain/core/stacks.ts`. They sit in the contract because the
 * {@link Registry} port (`./ports/registry.ts`) names them, and a
 * port may not reach into `domain/core` — which is the same reason
 * {@link Vertical} lives beside them in `./composition.ts`. A stack
 * arriving from a plugin is written against this file and nothing
 * else.
 */

import type { Tag } from './tags.js';
import type { Conflict, Vertical } from './composition.js';

/**
 * One selectable build system of a stack. The choice folds a `pkg.*`
 * capability tag into the manifest at install time; everything else
 * (which build-tool adapter fires, which build-file trees render) is
 * ordinary predicate machinery reading that tag.
 */
export interface BuildSystemOption {
  /** User-facing id, e.g. `gradle`, `maven`, `npm`, `pnpm`. */
  readonly id: string;
  /** The `pkg.*` tag the choice contributes. */
  readonly tag: Tag;
  /** One-line label shown as the interactive choice. */
  readonly label: string;
  /** Longer help text for the interactive prompt. */
  readonly doc: string;
}

/** Module layouts the template trees ship for. */
export type ModuleLayout = 'basic' | 'modulith';

/**
 * One selectable module layout of a stack. Like a build system, the
 * choice folds a capability tag into the manifest at install time;
 * every path decision downstream is ordinary machinery reading that
 * tag through the family's layout resolver.
 */
export interface ModuleLayoutOption {
  /** User-facing id, `basic` or `modulith`. */
  readonly id: ModuleLayout;
  /** The `layout.*` tag the choice contributes. */
  readonly tag: Tag;
  /** One-line label shown as the interactive choice. */
  readonly label: string;
  /** Longer help text for the interactive prompt. */
  readonly doc: string;
}

/** One service of a composite stack. */
export interface StackService {
  /** Directory the service is scaffolded into, relative to cwd. */
  readonly path: string;
  /** Id of the (non-composite) stack the service is built from. */
  readonly stack: string;
  /**
   * Verticals installed on top of the service stack's own list —
   * typically `gateway`, whose adapters only fire when peer tags are
   * in scope.
   */
  readonly extraVerticals?: readonly Vertical[];
}

/** A curated greenfield preset. */
export interface Stack {
  readonly id: string;
  readonly description: string;
  /** Capability tags this stack contributes to the manifest at install time. */
  readonly tags: readonly Tag[];
  /**
   * Build systems this stack can be scaffolded on; the first entry is
   * the default. Stacks declaring this omit the `pkg.*` tag from
   * `tags` — the install handler folds the chosen option's tag in.
   * Absent when the stack's `tags` already pin its only build system.
   */
  readonly buildSystems?: readonly BuildSystemOption[];
  /**
   * Module layouts this stack can be scaffolded on; the first entry
   * is the default. Stacks declaring this omit the `layout.*` tag
   * from `tags` — the install handler folds the chosen option's tag
   * in. Absent for stacks that ship a single layout, whose adapters
   * then resolve to `basic`.
   */
  readonly moduleLayouts?: readonly ModuleLayoutOption[];
  /** Verticals to install, in order. */
  readonly verticals: readonly Vertical[];
  /**
   * Peer tags this stack projects onto sibling services when composed
   * into a product (e.g. `peer.api.rest` for a REST backend). Declared
   * explicitly — never derived — so the tag vocabulary stays greppable.
   */
  readonly projects?: readonly Tag[];
  /** Present on composite stacks: the services to scaffold. */
  readonly services?: readonly StackService[];
  /**
   * Incompatibilities this preset's own combination of dials creates
   * — a build system its module layout cannot take, a capability its
   * framework will not carry.
   *
   * A stack's rules and a vertical's are read together, because an
   * assembly is the pieces coming together and neither piece alone
   * knows the whole of it. Declared here rather than centrally so a
   * preset arriving from outside this repository brings its own.
   * @see Conflict
   */
  readonly conflicts?: readonly Conflict[];
}
