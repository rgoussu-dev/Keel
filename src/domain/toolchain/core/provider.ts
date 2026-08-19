/**
 * The provider record model — the provisioning context's domain
 * content, the way the adapter tables are `domain/core`'s. One
 * record per version manager the engine can delegate to.
 *
 * The engine is an **orchestrator, never an installer** (decision on
 * record, roadmap item N): a record renders the manager's *native*
 * config file — so IDEs, CI images, and colleagues who have never
 * heard of keel see a plain ecosystem file their tools already
 * understand — and names the manager's own idempotent invocations.
 * keel never owns downloads, checksums, or platform matrices.
 *
 * One record in this slice: mise (`mise.ts`). The manager dial —
 * computing the choice list whose every option covers the whole
 * needs set — is roadmap N.3.
 */

import type { ToolchainNeed, ToolchainTool } from '../../contract/toolchain.js';

/** One need spelled in a provider's vocabulary (`java`/`temurin-25`). */
export interface SpelledNeed {
  /** The provider's name for the tool. */
  readonly name: string;
  /** The version string the provider understands. */
  readonly version: string;
}

/** The provider's native config file, rendered from the block. */
export interface ProviderConfig {
  /** Path relative to the project root (`mise.toml`). */
  readonly path: string;
  readonly content: string;
}

/** One external invocation of the provider's binary. */
export interface ProviderInvocation {
  readonly command: string;
  readonly args: readonly string[];
}

/** One version manager the engine can delegate to. */
export interface ToolchainProvider {
  readonly id: string;
  /**
   * The tools this provider can satisfy. A provider is only ever
   * offered for a needs set it covers **whole** — a partial choice
   * is never offered (the coverage invariant, roadmap item N).
   */
  readonly covers: readonly ToolchainTool[];
  /** Spells one need in the provider's vocabulary. */
  spell(need: ToolchainNeed): SpelledNeed;
  /** Renders the provider's native config over the needs, in order. */
  render(needs: readonly ToolchainNeed[]): ProviderConfig;
  /** Cheap probe that the provider's binary is present at all. */
  readonly probe: ProviderInvocation;
  /**
   * The provider's install sequence, run in order against the
   * rendered config; every step must be idempotent. For mise that is
   * `mise trust` (the rendered file is keel's own output, and an
   * untrusted config is refused in non-interactive runs) followed by
   * `mise install`.
   */
  readonly install: readonly ProviderInvocation[];
  /** Reports per-tool status without installing anything. */
  readonly status: ProviderInvocation;
  /**
   * Parses {@link status} output into installed-or-not, keyed by the
   * provider's tool names ({@link SpelledNeed.name}). Throws on
   * output it cannot understand — the caller reports that loudly
   * rather than guessing.
   */
  parseStatus(stdout: string): ReadonlyMap<string, boolean>;
  /** Bootstrap guidance shown when the binary is absent. */
  readonly bootstrap: string;
}
