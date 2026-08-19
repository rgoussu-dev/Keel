/**
 * The composition contract — how keel's own domain content composes.
 * Capability tags, predicates, adapters that contribute against a
 * manifest, verticals that group adapters under a coverage
 * requirement. Every adapter author writes against these types.
 *
 * Naming note: a composition **Adapter** (git-init, quarkus-cli
 * bootstrap, …) is keel domain content — a unit that contributes
 * files to a scaffolded project. It is *not* a hexagonal adapter of
 * keel-the-application; those live under `src/infrastructure/` and
 * implement the port interfaces in `./ports/`.
 */

import type { ContributionFile } from './files.js';
import type { Tag } from './tags.js';
import type { Logger } from './ports/logger.js';
import type { ProcessRunner } from './ports/process-runner.js';
import type { TemplateSource } from './ports/template-source.js';
import type { Tree } from './ports/tree.js';
import type { ManifestV2 } from './manifest.js';
import type { ToolchainNeed } from './toolchain.js';

/**
 * Predicate over the tag set. An adapter is selected for a given
 * project iff every entry in `requires` is satisfied and no entry in
 * `excludes` is satisfied.
 *
 * Both lists support glob suffixes — `runtime.jvm.*` matches any tag
 * starting with `runtime.jvm.` (the dot is part of the literal match,
 * `*` only matches the trailing segment(s)). A bare `*` is rejected;
 * predicates must always pin at least one literal segment.
 *
 * No OR. If a vertical needs disjunction, ship two adapters with
 * different predicates — the resolver picks whichever matches.
 */
export interface Predicate {
  readonly requires?: readonly Tag[];
  readonly excludes?: readonly Tag[];
}

/**
 * A user-facing question posed by an adapter that has a choice point
 * (e.g. "which observability backend?", "which native targets?").
 *
 * The resolution flow per question, in order:
 *   1. If `manifest.answers[adapterId][id]` is present and `memory`
 *      is `'sticky'`, return the stored answer silently.
 *   2. If interactive mode is enabled, prompt the user; the answer is
 *      written back to the manifest under `(adapterId, id)`.
 *   3. If non-interactive (`--yes`), return `default`.
 *
 * `default` is mandatory precisely so non-interactive mode always
 * resolves cleanly — there is no "no answer" state.
 */
export interface Question {
  readonly id: string;
  readonly prompt: string;
  readonly doc: string;
  readonly choices?: readonly QuestionChoice[];
  readonly default: string;
  readonly memory: 'sticky' | 'repeat';
}

/** A single discrete choice for a `select`-style question. */
export interface QuestionChoice {
  readonly value: string;
  readonly label: string;
  readonly doc: string;
}

/**
 * What an adapter contributes when it runs. Returned by
 * `Adapter.contribute`. The applier takes every adapter's
 * contribution, detects conflicts on overlapping targets, then writes
 * the merged result into the Tree.
 */
export interface Contribution {
  /**
   * Files this adapter writes from scratch. Two adapters writing the
   * same path is a hard conflict; they must use `patches` instead.
   */
  readonly files?: readonly ContributionFile[];
  /**
   * Patches against existing files. Multiple adapters may patch the
   * same target — the applier runs them in adapter resolution order
   * and treats the chained result as the final file. Each `apply` is
   * a pure function so the chain is reproducible.
   */
  readonly patches?: readonly ContributionPatch[];
  /** Agentic affordances shipped alongside the code change. */
  readonly agentic?: AgenticBundle;
  /** Capability tags this adapter promotes into the manifest. */
  readonly tagsAdd?: readonly Tag[];
  /**
   * Toolchain needs this adapter declares. The installer folds them
   * into the manifest's `toolchain` block (see `./toolchain.ts`),
   * upserting by tool — so a reapply after a registry bump refreshes
   * a need's version in place instead of duplicating the entry.
   */
  readonly toolchain?: readonly ToolchainNeed[];
  /**
   * Deferred side effects: shell-outs, network calls, anything that
   * mutates state outside the Tree. Deferred actions are *collected*
   * by the applier but **not executed**; the caller runs them via
   * `runActions` after `tree.commit()`. This keeps the apply phase
   * pure (and dry-runnable) and concentrates side effects in one
   * place where dry-run handling is uniform.
   */
  readonly actions?: readonly DeferredAction[];
}

/**
 * A patch against an existing file — or, when `seed` is supplied, an
 * upsert against a shared one.
 */
export interface ContributionPatch {
  readonly target: string;
  /**
   * Content the patch runs against when `target` does not exist yet;
   * the result is written as a new file. This turns the patch into
   * an upsert, letting independent adapters contribute to a shared
   * file without install-order or cross-vertical dependencies: each
   * contributor supplies the same seed, whichever runs first creates
   * the file, and the others compose onto it. Absent, a missing
   * target stays a hard error.
   */
  readonly seed?: string;
  readonly apply: (existing: string) => string;
}

/**
 * A deferred side effect emitted by an adapter — typically a shell
 * command (e.g. `git init`, `pnpm install`) but anything async that
 * touches state outside the Tree fits. Named "deferred" to keep it
 * distinct from the kernel's dispatchable `Action` base.
 *
 * Deferred actions run AFTER `tree.commit()`, so they may rely on
 * files the Tree wrote being present on disk. They run in the order
 * their adapters resolved, and within an adapter in declaration
 * order.
 *
 * `description` should read well as a single dry-run line — the
 * runner prints it verbatim when dryRun is enabled.
 */
export interface DeferredAction {
  readonly id: string;
  readonly description: string;
  run(env: DeferredActionEnv): Promise<void>;
}

/** Environment passed to `DeferredAction.run`. */
export interface DeferredActionEnv {
  readonly cwd: string;
  readonly logger: Logger;
  /** External tools are reached only through this port. */
  readonly processes: ProcessRunner;
}

/**
 * Agentic affordances bundled with an adapter — skills, hooks, slash
 * commands, sub-agents. These are paths *relative to the adapter's
 * own asset directory*; the applier resolves them and stages them
 * into `<project>/.claude/`.
 */
export interface AgenticBundle {
  readonly skills?: readonly string[];
  readonly hooks?: readonly string[];
  readonly slashCommands?: readonly string[];
  readonly agents?: readonly string[];
}

/**
 * The execution context passed to `Adapter.contribute`. Carries the
 * manifest snapshot and an `answer` resolver — the adapter does not
 * see prompt logic, only resolved values.
 */
export interface Ctx {
  readonly logger: Logger;
  readonly cwd: string;
  /** Read the manifest as it stood when resolution began. */
  readonly manifest: ManifestV2;
  /** Rendered template trees and canonical assets. */
  readonly templates: TemplateSource;
  /** External tool probes (e.g. git detection at plan time). */
  readonly processes: ProcessRunner;
  /**
   * Returns the resolved answer for a question declared on this
   * adapter. Throws if the question id is not declared — typo'd ids
   * fail loudly rather than silently returning a default.
   */
  answer(questionId: string): string;
}

/**
 * A single composable unit. Each adapter:
 *   - declares the tags it requires (and excludes),
 *   - declares the dimensions of its parent vertical that it covers,
 *   - declares any user choice points (`questions`),
 *   - declares ordering hints (`after`),
 *   - and, given a resolved Ctx, returns a Contribution.
 *
 * Adapters are pure-ish: they may read the manifest (via Ctx) but do
 * not mutate it directly — the applier owns mutation.
 */
export interface Adapter {
  readonly id: string;
  readonly vertical: string;
  readonly covers: readonly string[];
  readonly predicate: Predicate;
  readonly questions?: readonly Question[];
  readonly after?: readonly string[];
  contribute(ctx: Ctx): Promise<Contribution> | Contribution;
}

/**
 * A vertical — a bundle of adapters under one umbrella (observability,
 * distribution, persistence). The resolver verifies that every entry
 * in `dimensions` is covered by at least one matching adapter; if any
 * is uncovered after predicate filtering, installation hard-fails
 * with a clear message naming the missing dimension.
 */
export interface Vertical {
  readonly id: string;
  readonly description: string;
  readonly dimensions: readonly string[];
  readonly adapters: readonly Adapter[];
}

/**
 * Re-exports so adapter authors import the whole composition
 * vocabulary from one module.
 */
export type { Tree };
export type { Tag } from './tags.js';
export type { ContributionFile } from './files.js';
export type { ManifestV2, InstalledVertical, ManifestEntry } from './manifest.js';
export type { ToolchainNeed, ToolchainTool, ToolchainBlock } from './toolchain.js';
