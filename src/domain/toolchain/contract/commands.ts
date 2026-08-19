/**
 * The provisioning context's public surface: the actions naming the
 * two operations `keel toolchain` exposes, and the report DTOs their
 * handlers return. Primary adapters construct these via the factory
 * functions and dispatch them through the Mediator, exactly as with
 * keel's own commands.
 *
 * This bounded context meets the rest of keel only at
 * `domain/contract` — the `toolchain` block schema it consumes and
 * the shared ports it runs on. Nothing here knows about verticals,
 * adapters, tags, or stacks.
 */

import type { Command, Query } from '../../kernel/action.js';
import type { ToolchainTool } from '../../contract/toolchain.js';

/** One declared need, as the selected provider will satisfy it. */
export interface ProvisionedTool {
  /** The need's tool, from the block's closed vocabulary. */
  readonly tool: ToolchainTool;
  /** The version the block records (`25`, `9.4.1`). */
  readonly version: string;
  /** The provider's name for the tool — mise spells `jdk` as `java`. */
  readonly spelledName: string;
  /** The version in the provider's vocabulary (`temurin-25`). */
  readonly spelledVersion: string;
}

/** Result DTO of `keel toolchain install`. */
export interface ToolchainInstallReport {
  /** Id of the provider that satisfied (or would satisfy) the needs. */
  readonly provider: string;
  /** The provider's native config file, relative to the project root. */
  readonly configPath: string;
  /** False when the rendered config matched what was already on disk. */
  readonly configChanged: boolean;
  /** Whether the provider's binary answered the presence probe. */
  readonly managerPresent: boolean;
  /** True when the provider's idempotent install ran to success. */
  readonly installed: boolean;
  /** The needs the config declares, in block order. */
  readonly tools: readonly ProvisionedTool[];
  /** How to bootstrap the provider; present only when it is absent. */
  readonly bootstrap?: string;
}

/** Satisfaction of one declared need as `keel toolchain check` saw it. */
export type ToolStatus = 'satisfied' | 'missing' | 'unknown';

/** One checked need: the provisioning shape plus its status. */
export interface CheckedTool extends ProvisionedTool {
  /** `unknown` only when the provider is absent and cannot be asked. */
  readonly status: ToolStatus;
}

/** Result DTO of `keel toolchain check`. */
export interface ToolchainCheckReport {
  readonly provider: string;
  readonly configPath: string;
  /** True when the on-disk config matches a fresh render of the block. */
  readonly configUpToDate: boolean;
  readonly managerPresent: boolean;
  readonly tools: readonly CheckedTool[];
  /** Provider present, config current, and every need satisfied. */
  readonly satisfied: boolean;
  /** How to bootstrap the provider; present only when it is absent. */
  readonly bootstrap?: string;
}

/**
 * Provision the project's declared toolchain: render the provider's
 * native config from the manifest's `toolchain` block, then run the
 * provider's own idempotent install. Re-runnable at any point in the
 * project's life — new laptop, teammate clone, CI runner, pin bump —
 * and a no-op when everything is already satisfied.
 */
export interface ToolchainInstallCommand extends Command<ToolchainInstallReport> {
  readonly kind: 'keel.toolchain-install';
  readonly cwd: string;
}

/** Constructs a {@link ToolchainInstallCommand}. */
export function toolchainInstallCommand(
  input: Omit<ToolchainInstallCommand, 'kind' | 'intent'>,
): ToolchainInstallCommand {
  return { kind: 'keel.toolchain-install', intent: 'command', ...input };
}

/**
 * Report which declared needs are satisfied and which are missing,
 * without touching anything — no file is written, no install runs.
 */
export interface ToolchainCheckQuery extends Query<ToolchainCheckReport> {
  readonly kind: 'keel.toolchain-check';
  readonly cwd: string;
}

/** Constructs a {@link ToolchainCheckQuery}. */
export function toolchainCheckQuery(
  input: Omit<ToolchainCheckQuery, 'kind' | 'intent'>,
): ToolchainCheckQuery {
  return { kind: 'keel.toolchain-check', intent: 'query', ...input };
}
