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

/**
 * How a record turns a **prefix** spelling into the concrete version
 * its native file demands.
 *
 * Optional, and most records have none: mise's resolver takes a
 * prefix natively, rustup's `stable` is a channel rather than a
 * version, and nvm, corepack and go-native are handed something
 * concrete (or a floor) by the block. Two records do need one, and
 * for the same reason — their native file is documented as naming an
 * exact version, while the block pins a *major* for the JDK and for
 * Node. asdf's `.tool-versions` is a lockfile that forbids `latest`;
 * sdkman's `.sdkmanrc` names candidate identifiers that always carry
 * a patch. Without this hook both render a line their own installer
 * rejects.
 *
 * Resolution runs **before** the render, in lockfile order: whatever
 * the config already names wins while it still answers the prefix
 * ({@link VersionResolution.fromConfig}), and only when nothing
 * answers is the *manager* asked ({@link VersionResolution.query}).
 * keel never invents a patch version. Failing both, the prefix
 * renders as it did before — a loud note in the report, never a
 * guess. See `resolveSpellings` for why that order and not the
 * obvious one.
 */
export interface VersionResolution {
  /**
   * True when this spelling is a prefix the manager will not take.
   * The record's own judgement: what counts as concrete is a fact
   * about that manager's version vocabulary, not a shared rule.
   */
  isPrefix(spelled: SpelledNeed): boolean;
  /** The manager's own read-only query for the concrete version. */
  query(spelled: SpelledNeed): ProviderInvocation;
  /**
   * The concrete spelling in the query's output, or `undefined` when
   * the manager named none. Never throws: an unresolvable prefix is
   * an outcome the engine reports and carries on from, where an
   * unreadable *status* is a defect worth stopping for.
   */
  parse(result: ProcessResult, spelled: SpelledNeed): string | undefined;
  /**
   * The concrete version this tool already carries in the rendered
   * config, when it answers the prefix — consulted *first*, so a
   * resolved lockfile stays resolved and an absent manager can never
   * overwrite a good file with the prefix it came from. The record's
   * own business: only asdf knows that `temurin-25.0.4+7` answers
   * `temurin-25`, and only sdkman knows that `25.0.4-tem` answers
   * `25-tem`.
   */
  fromConfig(spelled: SpelledNeed, read: ConfigReader): string | undefined;
}

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
   *
   * `resolved` carries the concrete spellings the engine obtained
   * through {@link ToolchainProvider.resolve}, keyed by tool. Only a
   * record that declares a resolution reads it; every other one
   * spells from the block and ignores the argument.
   */
  render(
    needs: readonly ToolchainNeed[],
    read: ConfigReader,
    resolved?: ResolvedSpellings,
  ): readonly ProviderConfig[];
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
  /**
   * How this record makes a prefix concrete, when its native file
   * demands one. Absent on every manager whose format takes a prefix
   * as it stands — see {@link VersionResolution}.
   */
  readonly resolve?: VersionResolution;
}

/**
 * The concrete spellings the engine resolved through the managers,
 * keyed by tool. A tool is absent from the map whenever its spelling
 * needed no resolving, or none could be obtained — so a renderer
 * falls back to its own {@link ToolchainProvider.spell} for anything
 * missing here.
 */
export type ResolvedSpellings = ReadonlyMap<ToolchainTool, string>;
