/**
 * How far keel vouches for one dial cell: its support tier (roadmap
 * epic T, DT1).
 *
 * A dial cell is a preset on one setting of every dial `keel.dials`
 * offers it — the unit the e2e grid has always counted in (DT2). It is
 * _first-class_ where an e2e suite builds it, or each part of it is
 * proven byte-identical to a part a suite builds; _best-effort_ where
 * no CI job builds it as `keel new` leaves it (the composition grid
 * holds each preset's default setting, the weekly sweep every
 * setting). What the presets do not generate has no tier, and neither
 * does a plugin's stack: keel's CI vouches for keel's presets only.
 *
 * The vocabulary is the contract's, because the replies that carry a
 * tier to a front end are. The facts and the rules that read them are
 * the engine's (`domain/core/support-tier.ts`).
 */

import type { RepoLayout } from './commands.js';

/** How far keel vouches for a dial cell. */
export type SupportTier = 'first-class' | 'best-effort';

/** A single-service preset on one setting of its dials, every dial named. */
export interface SingleCell {
  readonly kind: 'single';
  /** The preset's id. */
  readonly stack: string;
  /** The build system's id, or null where the preset offers none (Go, Rust). */
  readonly buildSystem: string | null;
  /** The module layout's id, or null where the preset offers none. */
  readonly moduleLayout: string | null;
  /** Whether the modulith carries the peer context. */
  readonly peerContext: boolean;
  /** Whether the agent harness is scaffolded with it. */
  readonly agentHarness: boolean;
}

/** A product on one setting of its dials, every dial named. */
export interface ProductCell {
  readonly kind: 'product';
  /** The product's id. */
  readonly stack: string;
  /** Its repository layout. */
  readonly layout: RepoLayout;
  /**
   * Each service's build system as `path=id` pairs, spelled as
   * `--build-system` spells them; a service that offers none is not
   * named.
   */
  readonly buildSystem: string;
}

/** One setting of every dial of one preset. */
export type DialCell = SingleCell | ProductCell;

/**
 * What proves a cell. A suite is named for the docs alone: nothing at
 * run time resolves one.
 *
 * - `suite`: an e2e suite builds the cell.
 * - `harness-twin`: the cell is its twin with the agent harness, less
 *   the agent files (P1), and the suite builds the twin.
 * - `services`: each service named is built by its suite, on this
 *   product or on one whose service has the same bytes (P2).
 */
export type SupportProof =
  | { readonly by: 'suite'; readonly suite: string }
  | { readonly by: 'harness-twin'; readonly suite: string }
  | { readonly by: 'services'; readonly suites: Readonly<Record<string, string>> };

/** A cell's tier, and what it rests on. */
export interface CellSupport {
  readonly tier: SupportTier;
  /**
   * What proves the cell, or as much of a product as is proven; null
   * where nothing is.
   */
  readonly proof: SupportProof | null;
  /** The paths of a product's services no suite compiles; empty on a single-service cell. */
  readonly unbuilt: readonly string[];
}
