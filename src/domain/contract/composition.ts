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
 * A declared **incompatibility** between capabilities: a combination
 * of tags that must never be assembled, and why.
 *
 * The mirror image of {@link Predicate}, and deliberately the same
 * evaluation. A predicate says *when a piece applies*; a conflict says
 * *when an assembly is illegal*. Both are "all of these present, none
 * of those" over the tag set, which is why `violatedBy` is `matches`
 * with the fields renamed — one grammar, two polarities, no second
 * matcher to drift.
 *
 * Two shapes cover what pieces need to say:
 *
 * - **Mutual exclusion** — `{ when: ['a', 'b'] }`: illegal together,
 *   legal apart.
 * - **A requirement, spelled as its violation** —
 *   `{ when: ['a'], unless: ['b'] }`: `a` is illegal unless `b` is
 *   there. More than one `unless` reads as "unless any of these".
 *
 * Declared by the piece that owns the rule — a {@link Vertical} whose
 * capability is the one being constrained, or a stack whose
 * combination of dials is — never centrally, so a piece arriving from
 * outside this repository brings its own rules with it.
 *
 * The engine reads every declaration **twice**: once to refuse an
 * assembly that violates it, naming the rule and the tags that
 * matched, and once to keep the violating choice off the menu in the
 * first place. A rule stated once cannot have those two answers
 * disagree.
 */
export interface Conflict {
  /**
   * Stable id, namespaced by its declarer
   * (`walking-skeleton/peer-context-needs-modulith`). It appears in
   * the refusal, so it is what a user searches for.
   */
  readonly id: string;
  /**
   * The combination that bites: **every** pattern here must match the
   * tag set. Same grammar as a predicate's — trailing `*` globs, no
   * bare `*`. Never empty; an empty `when` would forbid everything.
   */
  readonly when: readonly Tag[];
  /** …and **none** of these present, which is what makes it legal after all. */
  readonly unless?: readonly Tag[];
  /**
   * One line the user reads: what cannot go together, and what to do
   * instead. This is the whole of the error message, so write it as
   * one — the engine adds the rule id and the offending tags, not the
   * explanation.
   */
  readonly reason: string;
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
  /**
   * How `choices` are picked from. Absent means `select` — one
   * choice, the shape every question had before multi-select
   * existed, and the shape an adapter should keep unless it really
   * needs a set.
   *
   * Under `multi-select` the answer is **still a string**: the chosen
   * values joined by {@link SELECTION_SEPARATOR}, in choice order,
   * and the empty string for "none". Encoding the set rather than
   * widening `Prompt.ask` to `string | string[]` is what keeps the
   * port's return type — and therefore every adapter, the manifest's
   * answer map, `--set adapterId:questionId=value`, and the sticky
   * memory that replays it — untouched. Use
   * {@link encodeSelection} / {@link decodeSelection} at both ends
   * rather than splitting by hand.
   *
   * Ignored without `choices`: a free-form input has no set to pick.
   */
  readonly kind?: 'select' | 'multi-select';
  readonly choices?: readonly QuestionChoice[];
  /**
   * The answer a non-interactive run resolves to. Under
   * `multi-select` it is an encoded selection like any other answer,
   * so `''` is the legitimate "none by default" — and a prompt
   * adapter may read a non-empty default as "at least one is
   * required".
   */
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
 * What joins the values of a `multi-select` answer. A comma, which
 * is why a choice `value` may not contain one — the same constraint
 * `--build-system backend=maven,frontend=pnpm` already lives under.
 */
export const SELECTION_SEPARATOR = ',';

/** Encodes a chosen set as the single string a `multi-select` answer is. */
export function encodeSelection(values: readonly string[]): string {
  return values.join(SELECTION_SEPARATOR);
}

/**
 * Decodes a `multi-select` answer back into the values it names.
 * Blank entries are dropped, so `''` decodes to no values at all and
 * a stray separator is not a value of its own.
 */
export function decodeSelection(answer: string): readonly string[] {
  return answer
    .split(SELECTION_SEPARATOR)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
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
  /**
   * Capability tags this adapter promotes into the manifest. Every
   * one of them must appear in the parent {@link Vertical.promotes}
   * set — the installer checks it, so a tag no vertical declares
   * fails loudly instead of silently breaking the front-door
   * coverage check that reads that declaration.
   */
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
  /**
   * Other adapters whose recorded answers count as this one's sticky
   * memory, tried in order before its own.
   *
   * Sticky memory is keyed per adapter, which is right while one
   * question belongs to one adapter. It stops being right when two
   * adapters cover the *same dimension of the same project* and
   * declare the same question — the composable entrypoint bootstraps,
   * where a tag set carrying both `arch.cli` and `arch.server-http`
   * resolves two of them. There the engine would ask the user for the
   * project's package and name twice, and nothing would reconcile two
   * different answers: on the JVM every module's `<parent>` would name
   * an artifactId the reactor root does not have, and in a TypeScript
   * workspace the assembly would depend on a scope the context does
   * not publish.
   *
   * Naming the sibling here makes the second adapter to resolve read
   * the first's answer as memory — so it is neither asked again nor
   * free to disagree — and `foldAnswers` records it under this
   * adapter's id too, which is what downstream adapters read.
   */
  readonly sharesAnswersWith?: readonly string[];
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
  /**
   * The concept this vertical bears, as a person would name it —
   * "Continuous integration" for `ci`, "Container image" for
   * `containerization`.
   *
   * Optional, and resolved rather than read: `verticalTitle` in
   * `domain/core/registry.ts` falls back to the id spelled out, so a
   * plugin that declares none still renders as something a menu can
   * show. Declare one wherever the id is an abbreviation or a piece
   * of keel's own jargon — which is most of them, and is the whole
   * reason this is separate from {@link Vertical.description}: an id
   * is what you type, a title is what you recognise.
   */
  readonly title?: string;
  /**
   * One line saying what installing this buys, in the user's terms
   * rather than the engine's — what appears, what it does for them.
   * Shown under the title wherever a front end offers the vertical,
   * and printed by `keel add --list`.
   */
  readonly description: string;
  readonly dimensions: readonly string[];
  readonly adapters: readonly Adapter[];
  /**
   * Incompatibilities this vertical's own capabilities create. Read
   * by every assembly this vertical is part of — see {@link Conflict}.
   */
  readonly conflicts?: readonly Conflict[];
  /**
   * Every tag installing this vertical may promote — the union over
   * its adapters' {@link Contribution.tagsAdd}, including the ones
   * only some answers produce (both container-image flavors, every
   * SQL engine, either CI provider).
   *
   * Declared because a tag promoted at install time is invisible to
   * anything reasoning *before* the install: `coversFor` sees the
   * tags it is given, so a front door checking `--with
   * distribution,iac` ahead of time would refuse `iac` for want of
   * the `dist.container-image` tag `distribution` is there to
   * promote. This is the static half of that answer — what *may*
   * appear, never what will.
   *
   * Over-declaring is safe (it only defers a refusal to the
   * resolver); under-declaring risks refusing a legal composition,
   * which is why {@link Contribution.tagsAdd} is checked against
   * this set at install time and a tag outside it is a hard error.
   * Omit only when no adapter of the vertical promotes anything.
   */
  readonly promotes?: readonly Tag[];
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
