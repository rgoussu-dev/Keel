/**
 * The Registry port — **which** stacks and verticals this run may
 * install.
 *
 * Until this port existed the answer was a pair of module-level
 * constants (`STACKS`, `VERTICALS`) that handlers imported directly,
 * which made the catalog a property of the *build* rather than of
 * the run. A piece keel did not ship had nowhere to arrive from: an
 * import is resolved before any code runs, so nothing could add to
 * the set, and nothing could take a different set for a different
 * invocation.
 *
 * **A port, not a mutable registry with a load step.** Both would
 * let a plugin in; only one keeps the property that makes the rest
 * of the engine testable. A mutable registry is process-wide state
 * with an ordering requirement — every read is a bet that the load
 * already happened, two runs in one process cannot see different
 * catalogs, and a test that registers a fixture piece leaks it into
 * whatever runs next. An injected port has none of that: the
 * catalog is a value the composition root computes and hands over,
 * `InstallDeps` already carries every other collaborator the same
 * way, and a test builds the registry it wants.
 *
 * It also puts the plugin loading where it belongs. Reading a
 * directory and importing a module is I/O, so it is an
 * infrastructure adapter (`infrastructure/registry/`) implementing
 * this interface — `.dependency-cruiser.cjs` forbids `domain/core`
 * from importing `infrastructure/`, so the engine cannot acquire a
 * filesystem habit by accident, and `domain/contract` may not import
 * `domain/core`, which is why the {@link Stack} vocabulary lives in
 * `../stack.ts` beside {@link Vertical}'s.
 *
 * Reads only. Nothing in the engine registers a piece; a registry is
 * built once, at the composition root, and is immutable thereafter.
 */

import type { Vertical } from '../composition.js';
import type { Stack } from '../stack.js';

/** The pieces one keel run may compose from. */
export interface Registry {
  /**
   * Every registered stack, shipped pieces first and each source's
   * own declaration order preserved — so a menu's order is stable
   * and does not depend on how a directory listed.
   */
  stacks(): readonly Stack[];
  /** Every registered vertical, same ordering guarantee. */
  verticals(): readonly Vertical[];
  /** The stack registered under `id`, or null when none is. */
  stack(id: string): Stack | null;
  /** The vertical registered under `id`, or null when none is. */
  vertical(id: string): Vertical | null;
}
