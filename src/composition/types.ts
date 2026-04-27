/**
 * The composition layer. Where `engine/tree` gives keel an in-memory
 * tree adapters can write into, this module gives it the contract for
 * **how adapters compose**: capability tags, predicates, adapters that
 * contribute against a manifest, verticals that group adapters under
 * a coverage requirement.
 *
 * The substrate this builds on:
 *   - `Tree` from `engine/tree` — adapters write into a Tree.
 *   - `renderTemplateFiles` from `composition/render` — adapters can
 *     call it from inside `contribute` to render an EJS template
 *     directory into a list of `ContributionFile`s.
 *
 * Nothing in this file imports from anywhere else in keel; the types
 * are the contract every adapter author writes against.
 */

import type { Tree } from '../engine/tree.js';
import type { Logger } from '../util/log.js';

/**
 * A capability tag — a flat string with hierarchical-dot naming
 * (`lang.java`, `framework.quarkus`, `runtime.jvm.graalvm-native`).
 *
 * Tags are facts about the project, captured in the manifest at
 * install time and grown by adapters that promote new capabilities
 * via `Contribution.tagsAdd`.
 *
 * No structured schema is enforced; readability comes from naming
 * discipline. See the keel design doc for the canonical namespaces
 * (`lang.*`, `runtime.*`, `pkg.*`, `framework.*`, `arch.*`,
 * `deploy.*`, `orchestrator.*`, `cloud.*`, `iac.*`, `ci.*`,
 * `vertical.*`).
 */
export type Tag = string;

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
   * Deferred side effects: shell-outs, network calls, anything that
   * mutates state outside the Tree. Actions are *collected* by the
   * applier but **not executed**; the caller runs them via
   * `runActions` after `tree.commit()`. This keeps the apply phase
   * pure (and dry-runnable) and concentrates side effects in one
   * place where dry-run handling is uniform.
   */
  readonly actions?: readonly Action[];
}

/** A whole-file write contribution. */
export interface ContributionFile {
  readonly path: string;
  readonly content: Buffer | string;
  readonly mode?: number;
}

/** A patch against an existing file. */
export interface ContributionPatch {
  readonly target: string;
  readonly apply: (existing: string) => string;
}

/**
 * A deferred side effect emitted by an adapter — typically a shell
 * command (e.g. `git init`, `pnpm install`) but anything async that
 * touches state outside the Tree fits.
 *
 * Actions run AFTER `tree.commit()`, so they may rely on files the
 * Tree wrote being present on disk. They run in the order their
 * adapters resolved, and within an adapter in declaration order.
 *
 * `description` should read well as a single dry-run line — the
 * runner prints it verbatim when dryRun is enabled.
 */
export interface Action {
  readonly id: string;
  readonly description: string;
  run(env: ActionEnv): Promise<void>;
}

/** Environment passed to `Action.run`. */
export interface ActionEnv {
  readonly cwd: string;
  readonly logger: Logger;
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
 * The execution context passed to `Adapter.contribute`. Mirrors the
 * legacy `engine.Context` but carries the manifest snapshot and an
 * `answer` resolver — the adapter does not see prompt logic, only
 * resolved values.
 */
export interface Ctx {
  readonly logger: Logger;
  readonly cwd: string;
  /** Read the manifest as it stood when resolution began. */
  readonly manifest: ManifestV2;
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
 * Manifest v2 — the keel state file. Adds capability-tag composition
 * to the file-tracking entries from v1 (which remain for drift
 * detection on `keel doctor`).
 *
 * Stored at `<project>/.claude/.keel-manifest.json`. The reader is
 * version-aware and migrates v1 manifests on first v2 read.
 */
export interface ManifestV2 {
  readonly version: 2;
  readonly keelVersion: string;
  readonly installedAt: string;
  readonly updatedAt: string;
  readonly tags: readonly Tag[];
  readonly verticals: readonly InstalledVertical[];
  /** Installed package versions, keyed by package id, for migrations. */
  readonly versions: Readonly<Record<string, string>>;
  /** Sticky question answers: adapterId → questionId → value. */
  readonly answers: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** File-tracking entries carried over from v1, used for drift detection. */
  readonly entries: readonly ManifestEntry[];
}

/** Record of a vertical the user installed. */
export interface InstalledVertical {
  readonly id: string;
  readonly installedAt: string;
}

/**
 * File-tracking entry — unchanged from v1. `sha256Shipped` is the
 * hash at install time; `sha256Current` is the hash at last manifest
 * write. Divergence indicates a user edit.
 */
export interface ManifestEntry {
  readonly source: string;
  readonly target: string;
  readonly sha256Shipped: string;
  readonly sha256Current: string;
  readonly installedAt: string;
}

/**
 * The Tree contract from the engine port, re-exported so adapter
 * authors only need to import from `composition`.
 */
export type { Tree };
