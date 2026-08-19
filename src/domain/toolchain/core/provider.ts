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
 * Seven records today. Two are universal — mise (`mise.ts`, the
 * default) and asdf (`asdf.ts`) — and five are ecosystem-shaped: nvm
 * (`nvm.ts`) and corepack (`corepack.ts`) for Node, sdkman
 * (`sdkman.ts`) for the JVM, rustup (`rustup.ts`) for Rust, and
 * go-native (`go-native.ts`), the "no manager needed" answer whose
 * declaration is `go.mod`'s own `toolchain` directive. Which of them
 * — alone or in a curated combination — is offered for a given
 * project is the manager dial's job (`dial.ts`), computed from
 * coverage: an ecosystem record never appears on a project whose
 * declaration reaches past its ecosystem.
 */

import type { ProcessResult } from '../../contract/ports/process-runner.js';
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

/**
 * Reads a project file the renderer needs, `undefined` when absent.
 *
 * Most managers own their config file outright and ignore this. One
 * does not: corepack declares itself in the project's *own*
 * `package.json`, so its renderer must merge into what is there
 * rather than overwrite it.
 */
export type ConfigReader = (path: string) => string | undefined;

/** One external invocation of the provider's binary. */
export interface ProviderInvocation {
  readonly command: string;
  readonly args: readonly string[];
  /**
   * When true, a non-zero exit is not a failure — the step is one
   * whose "already done" outcome the manager reports as an error
   * (`asdf plugin add java` on a plugin already added). Anything
   * genuinely broken still surfaces on the step that follows.
   */
  readonly tolerateFailure?: boolean;
}

/** One version manager the engine can delegate to. */
export interface ToolchainProvider {
  readonly id: string;
  /** One line describing the manager, shown on the dial. */
  readonly label: string;
  /**
   * The tools this provider can satisfy. A provider is only ever
   * offered for a needs set it covers **whole** — alone, or as a
   * member of a combination whose union covers it. A partial choice
   * is never offered (the coverage invariant, roadmap item N).
   */
  readonly covers: readonly ToolchainTool[];
  /** Spells one need in the provider's vocabulary. */
  spell(need: ToolchainNeed): SpelledNeed;
  /**
   * Renders the provider's native config over the needs assigned to
   * it, in order. A list because a record may own more than one file
   * — and none at all is legal for a manager that declares nothing.
   */
  render(needs: readonly ToolchainNeed[], read: ConfigReader): readonly ProviderConfig[];
  /** Cheap probe that the provider's binary is present at all. */
  readonly probe: ProviderInvocation;
  /**
   * The provider's install sequence over the needs assigned to it,
   * run in order against the rendered config; every step must be
   * idempotent. Derived from the needs because some managers install
   * per tool (asdf adds a plugin per tool) where others read the
   * rendered file (mise, nvm). Empty is legal and means it: go-native
   * has nothing to run, because the rendered directive *is* the
   * provisioning.
   */
  install(needs: readonly ToolchainNeed[]): readonly ProviderInvocation[];
  /** Reports per-tool status without installing anything. */
  readonly status: ProviderInvocation;
  /**
   * Parses the {@link status} run into installed-or-not, keyed by the
   * provider's tool names ({@link SpelledNeed.name}). Receives the
   * whole process result, because a non-zero exit is data for some
   * managers (corepack's shim refuses rather than reporting) and a
   * failure for others (mise). Gets the spelled needs too: not every
   * manager reports per tool — nvm lists node versions, and only the
   * caller's spelling says which one was asked for.
   *
   * Throws on output it cannot understand — the caller reports that
   * loudly rather than guessing.
   */
  parseStatus(result: ProcessResult, spelled: readonly SpelledNeed[]): ReadonlyMap<string, boolean>;
  /** Bootstrap guidance shown when the binary is absent. */
  readonly bootstrap: string;
}
