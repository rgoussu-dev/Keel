/**
 * The system's public surface: the concrete commands naming each
 * operation keel supports, and the report DTO their handlers return.
 * Primary adapters construct these via the factory functions and
 * dispatch them through the Mediator; they never call handlers
 * directly.
 */

import type { Command } from '../kernel/action.js';
import type { TreeChange } from './ports/tree.js';

/** Result DTO of an install-shaped command (`new` / `add`). */
export interface InstallReport {
  /** Declared harness elements suppressed because this project has no harness; absent when zero. */
  readonly skippedHarnessElements?: number;
  /**
   * What was installed: the stack id for `new`; for `add`, the vertical
   * ids named, space-separated in the order they were named.
   */
  readonly subject: string;
  /** Every file the install staged, in deterministic path order. */
  readonly changes: readonly TreeChange[];
  /** Human-readable descriptions of the deferred actions, in run order. */
  readonly actions: readonly string[];
  /** False under dry-run: nothing was written and no action ran. */
  readonly committed: boolean;
  /**
   * What the run decided that the caller did not spell out, one
   * sentence each: first the verticals it installed because a named
   * one needs them — `added Container image, Distribution — needed by
   * Infrastructure as code`; then `installed in dependency order:
   * containerization, persistence, distribution` when the order named
   * put one ahead of a vertical it needs or reads; then, under `add`,
   * each {@link refreshProposals} entry in words. Absent when there is
   * nothing to say.
   */
  readonly notes?: readonly string[];
  /**
   * The installed verticals this run proposes re-rendering and did not
   * — `keel add`'s `--refresh`, or a later `--reapply`, takes one up.
   * Absent when there are none. Proposed, never done: a re-render
   * overwrites what the vertical owns, so it is the user's to ask for.
   */
  readonly refreshProposals?: readonly RefreshProposal[];
  /**
   * Every adapter the run resolved, once each, in the order they first
   * ran — across every scope a product writes — as far as an answer
   * supplied for the run is concerned: the ids an answer may be keyed
   * to, and the questions each asks. What `keel.preview` holds the
   * answers it was sent against, so it reports the ones this run would
   * refuse (`InstallPreview.unusedAnswers`). Absent when the run
   * resolved none.
   */
  readonly resolvedAdapters?: readonly ResolvedAdapter[];
  /**
   * Unified diffs against the working tree, one per `modify` change,
   * in the same path order. Populated by reapply only — a plain
   * install never modifies a pre-existing file, so there is nothing
   * to diff.
   */
  readonly diffs?: readonly FileDiff[];
}

/**
 * An installed vertical a `keel add` run left as it was rendered,
 * although what the run installed changes what it would render now —
 * and why, in either or both of two ways.
 */
export interface RefreshProposal {
  /** The installed vertical's id. */
  readonly vertical: string;
  /**
   * The verticals this run installed whose presence its
   * `contribute()` reads (`Vertical.reads`) — distribution's deploy
   * descriptor, rendered before persistence was there, has no
   * `DB_URL`. In install order; empty when it reads none of them.
   */
  readonly reads: readonly string[];
  /**
   * The adapters it resolves to on the tags the project had, and on
   * the tags the run leaves, by id — present only when they differ:
   * a native-only distribution on a project that has just gained a
   * JVM container image resolves to the image's release pipeline now.
   */
  readonly adapters?: { readonly before: readonly string[]; readonly after: readonly string[] };
}

/**
 * An adapter an install run resolved, told by what an answer supplied
 * for the run can reach: its id, the questions it asks, and the ids it
 * reads answers under besides its own (`Adapter.sharesAnswersWith`).
 */
export interface ResolvedAdapter {
  readonly id: string;
  /** The ids of the questions it declares, in declaration order. */
  readonly questions: readonly string[];
  /** Its `Adapter.sharesAnswersWith`, in declared order; absent when none. */
  readonly sharesAnswersWith?: readonly string[];
}

/** A unified diff of one working-tree file a command would rewrite. */
export interface FileDiff {
  readonly path: string;
  /** Unified-diff hunks (no ---/+++ header); empty never occurs. */
  readonly diff: string;
}

/**
 * Sticky answers supplied up front: adapterId → questionId → value.
 *
 * Each reaches only the adapter it is keyed to, or one that shares the
 * question with it (`Adapter.sharesAnswersWith`), and is recorded only
 * by the adapter that read it. An adapter reads a question's answer
 * from what the project records first, then from what is supplied —
 * in both, under its own id before its siblings', in the order it
 * lists them — so one answer settles a question its siblings share.
 * An install refuses an answer nothing reads: a key no adapter of its
 * plan reads, or a question none of them asks (`keel.unknown-answer`),
 * one for an installed vertical's adapter or a question one has
 * settled (`keel.frozen-answer`), and one a question shared with
 * another key it was also given reads under that key instead
 * (`keel.unknown-answer`); and a value outside the choices its
 * question offers the project (`keel.invalid-answer`). `keel.preview`
 * reports each of those (`InstallPreview.unusedAnswers`) rather than
 * refusing.
 */
export type PresetAnswers = Readonly<Record<string, Readonly<Record<string, string>>>>;

/**
 * Repository layout of a composite (multi-service) install: one
 * repository with the services as subdirectories, or one repository
 * per service. Ignored by single-service stacks.
 */
export type RepoLayout = 'monorepo' | 'polyrepo';

/** Bootstrap a greenfield project from a stack preset. */
export interface NewProjectCommand extends Command<InstallReport> {
  readonly kind: 'keel.new-project';
  /** False omits agent-harness membership and suppresses declared harness elements. Defaults to true. */
  readonly agentHarness?: boolean;
  readonly cwd: string;
  /**
   * Stack preset id, e.g. `quarkus-cli`. When absent, interactive
   * installs prompt for it (the wizard's first and most consequential
   * question) and non-interactive installs default to `quarkus-cli`.
   */
  readonly stack?: string;
  readonly answers: PresetAnswers;
  readonly interactive: boolean;
  readonly dryRun: boolean;
  /**
   * Layout for composite stacks. When absent, interactive installs
   * prompt for it and non-interactive installs default to `monorepo`.
   */
  readonly layout?: RepoLayout;
  /**
   * Build-system choice for stacks that declare one. When absent,
   * interactive installs prompt for it and non-interactive installs
   * use the stack's default; rejected for stacks with a fixed build
   * system.
   *
   * Single-service stacks take a bare id (`gradle`, `maven`, `npm`,
   * `pnpm`). Composite stacks take per-service `path=id` pairs,
   * comma-separated (`backend=maven,frontend=pnpm`); services left
   * unnamed are prompted for interactively and take their stack's
   * default otherwise.
   */
  readonly buildSystem?: string;
  /**
   * Module-layout id (`basic`, `modulith`) for stacks that declare a
   * choice. When absent, interactive installs prompt for it and
   * non-interactive installs use the stack's default. Rejected for
   * stacks with a single layout and for composite stacks (their
   * services scaffold on each service's default).
   *
   * Distinct from {@link NewProjectCommand.layout}, which is the
   * *repository* layout of a composite install.
   */
  readonly moduleLayout?: string;
  /**
   * Also scaffold a second bounded context alongside the skeleton's
   * own, reaching it only through its `user-side/service` seam — the
   * inter-context edge made demonstrable rather than merely
   * described.
   *
   * Only meaningful under the modulith layout, which is what creates
   * the seam; rejected otherwise, since there would be nothing for
   * the second context to meet the first at.
   */
  readonly withPeerContext?: boolean;
  /**
   * Verticals to install **on top of** the stack's own list, as part
   * of the same run — `persistence`, `distribution`, `iac`, … Ids from
   * the brownfield registry (`domain/core/verticals/index.ts`), the
   * same ones `keel add` takes. A set, not a sequence: they install in
   * the order they depend on one another (`domain/core/planner.ts`),
   * the rest by id, whatever order they are named in — so every
   * permutation writes the same bytes — and naming one twice is
   * refused. A prerequisite of what it names that the set leaves out
   * is installed with it, in its place in that order, and the report's
   * first note names it; only a tie between two sets of prerequisites
   * is refused, naming both.
   *
   * The greenfield counterpart of running `keel add <vertical>` once
   * per vertical straight after `keel new`, and it is genuinely not
   * the same thing: layered in the same run they resolve against one
   * another's tags, and the review step shows one plan instead of
   * four.
   *
   * When absent, interactive single-service installs prompt for it
   * and non-interactive ones install none. Rejected on composite
   * stacks, whose services declare their own extras — "which service
   * gets it?" has no defensible default.
   */
  readonly extraVerticals?: readonly string[];
}

/** Layer additional verticals onto an initialised project. */
export interface AddVerticalCommand extends Command<InstallReport> {
  readonly kind: 'keel.add-vertical';
  readonly cwd: string;
  /**
   * Vertical ids, e.g. `['containerization', 'distribution']` — at
   * least one. A set, exactly as `keel new --with` names one: planned
   * by id, closed over its prerequisites (a vertical it needs that the
   * project lacks is installed with it, and the report's first note
   * says so), installed in the order they depend on one another in one
   * run, whatever order they are named in. Naming one twice is refused.
   */
  readonly verticals: readonly string[];
  /**
   * Installed verticals to re-render in the same run, after what they
   * read or what decides their adapters — the proposals a run reports
   * (`InstallReport.refreshProposals`), taken up. Each re-renders under
   * {@link reapply}'s posture: its recorded answers frozen, and an
   * adapter it newly resolves to asked its questions like any first
   * install. Absent, none.
   */
  readonly refresh?: readonly string[];
  readonly answers: PresetAnswers;
  readonly interactive: boolean;
  readonly dryRun: boolean;
  /**
   * Re-render **already installed** verticals from the answers the
   * manifest recorded — the conservative day-2 path (roadmap L).
   *
   * Semantics: template-owned files (whole-file contributions) are
   * rewritten to the pristine re-render, each rewrite reported with a
   * unified diff against the working tree; a patch that would change
   * an already-patched file refuses the whole run
   * (`keel.reapply-conflict`) — with no recorded base there is no way
   * to tell a template fix from a double application, so nothing is
   * written. Recorded answers are frozen: an adapter the manifest holds
   * answers for resolves from them without asking, and an answer in
   * {@link answers} for one is refused (`keel.reapply-frozen-answers`)
   * — changing an answer on reapply is deliberately out of scope for
   * v1. An adapter the vertical newly resolves to has nothing recorded,
   * so it is asked, and takes {@link answers}, as a first install would.
   */
  readonly reapply?: boolean;
}

/**
 * Add a **bounded context** to an initialised modulith project.
 *
 * A sibling of {@link AddVerticalCommand} rather than a case of it,
 * and the difference is not cosmetic. A vertical is a capability
 * dimension installed at most once — `AddVerticalHandler` refuses a
 * second install by id, which is the right rule for `persistence` and
 * exactly the wrong one for a context, since adding the *second*
 * context is the entire point. A module is also identified by user
 * input rather than by a registry id, and that input is not a sticky
 * answer: sticky answers persist into the next install, and a
 * persisted module name would silently become the default for the
 * context after it.
 */
export interface AddModuleCommand extends Command<InstallReport> {
  readonly kind: 'keel.add-module';
  readonly cwd: string;
  /** The context's name, as typed. Validated by the handler, not here. */
  readonly module: string;
  /**
   * An existing context this one reaches through a gateway, if any.
   *
   * Absent by default: a gateway the user did not ask for is the same
   * class of presumption as a use case they did not ask for. Present,
   * it names a context that must already exist *and* publish a seam —
   * the `--with-peer-context` context publishes none, so it is a legal
   * name and an illegal target.
   */
  readonly consumes?: string;
  readonly answers: PresetAnswers;
  readonly interactive: boolean;
  readonly dryRun: boolean;
}

/** Constructs an {@link AddModuleCommand}. */
export function addModuleCommand(
  input: Omit<AddModuleCommand, 'kind' | 'intent'>,
): AddModuleCommand {
  return { kind: 'keel.add-module', intent: 'command', ...input };
}

/* ------------------------------------------------------------------ *
 * Navigation index                                                    *
 * ------------------------------------------------------------------ */

/** One index region the projection owns, and what a run did to it. */
export interface DocsRegionRecord {
  /** The document carrying the region, relative to the project root. */
  readonly target: string;
  /** The region's opening marker — `<!-- keel:map:begin -->`. */
  readonly region: string;
  /** How many rows the projection computed for it. */
  readonly rows: number;
  /** Whether this run's write changed the document. Always false for `check`. */
  readonly changed: boolean;
}

/** One way a project and its index disagree, as `keel docs check` reports it. */
export interface DocsDriftRecord {
  readonly target: string;
  /** The region's opening marker, or absent for drift about the document itself. */
  readonly region?: string;
  /** What is wrong, in one line. */
  readonly detail: string;
}

/**
 * Result DTO of `keel docs sync` and `keel docs check` — the same
 * report either way, because the two run the same computation and
 * differ only in whether they write it.
 */
export interface DocsReport {
  /** Every region the projection owns for this project, in write order. */
  readonly regions: readonly DocsRegionRecord[];
  /**
   * How the project and its index disagreed *before* this run.
   * `keel docs check` exits non-zero when it is non-empty; `sync`
   * reports it as what it just fixed.
   */
  readonly drift: readonly DocsDriftRecord[];
  /**
   * Documents the project carries that the declarations do not name —
   * a hand-written `AGENTS.md`, or one from a plugin that is gone.
   * Reported, never indexed and never deleted: keel says what it does
   * not know rather than guessing at it.
   */
  readonly unindexed: readonly string[];
  /** Files the sync staged; empty for `check` and for a sync with nothing to do. */
  readonly changes: readonly TreeChange[];
  /** False under `--dry-run`, and always for `check`. */
  readonly committed: boolean;
}

/**
 * Recompute the navigation index from the manifest and the resolved
 * registry, and rewrite the engine-owned regions that carry it.
 * Writes nothing outside those regions.
 */
export interface DocsSyncCommand extends Command<DocsReport> {
  readonly kind: 'keel.docs-sync';
  readonly cwd: string;
  readonly dryRun: boolean;
}

/** Constructs a {@link DocsSyncCommand}. */
export function docsSyncCommand(input: Omit<DocsSyncCommand, 'kind' | 'intent'>): DocsSyncCommand {
  return { kind: 'keel.docs-sync', intent: 'command', ...input };
}

/** Result DTO of `keel link`. */
export interface LinkReport {
  /** The peer's directory as recorded in this project's manifest. */
  readonly ref: string;
  /** Peer tags the sibling now projects into this project. */
  readonly projectedHere: readonly string[];
  /** Peer tags this project now projects into the sibling. */
  readonly projectedThere: readonly string[];
}

/**
 * Record a sibling keel project as a peer — both ways — so
 * peer-conditional adapters resolve on later `keel add` runs. The
 * polyrepo counterpart of what a composite `keel new` records
 * automatically, and the brownfield path for attaching a new service
 * to an existing one.
 */
export interface LinkPeerCommand extends Command<LinkReport> {
  readonly kind: 'keel.link-peer';
  readonly cwd: string;
  /** Path of the peer project, relative to cwd (or absolute). */
  readonly ref: string;
}

/** Constructs a {@link LinkPeerCommand}. */
export function linkPeerCommand(input: Omit<LinkPeerCommand, 'kind' | 'intent'>): LinkPeerCommand {
  return { kind: 'keel.link-peer', intent: 'command', ...input };
}

/** Constructs a {@link NewProjectCommand}. */
export function newProjectCommand(
  input: Omit<NewProjectCommand, 'kind' | 'intent'>,
): NewProjectCommand {
  return { kind: 'keel.new-project', intent: 'command', ...input };
}

/** Constructs an {@link AddVerticalCommand}. */
export function addVerticalCommand(
  input: Omit<AddVerticalCommand, 'kind' | 'intent'>,
): AddVerticalCommand {
  return { kind: 'keel.add-vertical', intent: 'command', ...input };
}

/**
 * **What to install**, named independently of which command carries
 * it — a greenfield stack, a vertical layered onto a project, or a
 * bounded context added to a modulith.
 *
 * The three install-shaped commands above are the operations; this is
 * the *subject* of one, lifted out so a caller can hold "what the
 * user picked" before deciding what to do with it. Two callers need
 * exactly that. `keel.preview` (see `./queries.ts`) runs any of the
 * three as a dry run and reports what would happen, and a front end
 * that previews before it commits sends one target to both endpoints.
 * Without this type each of them would rebuild the same command from
 * the same fields, and the two copies would drift the first time a
 * flag was added.
 *
 * The CLI does not use it: commander already gives each subcommand
 * its own typed option bag, and mapping that to a target only to map
 * the target back to a command would be a round trip for nothing.
 */
export type InstallTarget = NewProjectTarget | AddVerticalTarget | AddModuleTarget;

/** Bootstrap a greenfield project — the subject of {@link NewProjectCommand}. */
export interface NewProjectTarget {
  readonly kind: 'new-project';
  /** Absent asks for it, exactly as an omitted `--stack` does. */
  readonly stack?: string;
  readonly layout?: RepoLayout;
  readonly buildSystem?: string;
  readonly moduleLayout?: string;
  readonly withPeerContext?: boolean;
  readonly extraVerticals?: readonly string[];
}

/** Layer verticals — the subject of {@link AddVerticalCommand}. */
export interface AddVerticalTarget {
  readonly kind: 'add-vertical';
  /** See {@link AddVerticalCommand.verticals}. */
  readonly verticals: readonly string[];
  /** See {@link AddVerticalCommand.refresh}. */
  readonly refresh?: readonly string[];
  readonly reapply?: boolean;
}

/** Add a bounded context — the subject of {@link AddModuleCommand}. */
export interface AddModuleTarget {
  readonly kind: 'add-module';
  readonly module: string;
  readonly consumes?: string;
}

/** How an {@link InstallTarget} is to be run. */
export interface InstallRun {
  readonly cwd: string;
  readonly answers: PresetAnswers;
  readonly interactive: boolean;
  readonly dryRun: boolean;
}

/** Every command an {@link InstallTarget} can become. */
export type InstallCommand = NewProjectCommand | AddVerticalCommand | AddModuleCommand;

/**
 * Builds the command that installs `target` under `run`. The one
 * place the mapping lives, so preview and commit cannot disagree
 * about what a target means.
 */
export function installCommandFor(target: InstallTarget, run: InstallRun): InstallCommand {
  switch (target.kind) {
    case 'new-project':
      return newProjectCommand({
        cwd: run.cwd,
        answers: run.answers,
        interactive: run.interactive,
        dryRun: run.dryRun,
        ...(target.stack === undefined ? {} : { stack: target.stack }),
        ...(target.layout === undefined ? {} : { layout: target.layout }),
        ...(target.buildSystem === undefined ? {} : { buildSystem: target.buildSystem }),
        ...(target.moduleLayout === undefined ? {} : { moduleLayout: target.moduleLayout }),
        // Passed through even when false: absent means "ask", and a
        // front end that has already offered the choice must be able
        // to say no as well as yes.
        ...(target.withPeerContext === undefined
          ? {}
          : { withPeerContext: target.withPeerContext }),
        // Passed through even when empty, for the same reason: absent
        // means "ask", and a front end that has already offered the
        // list must be able to say "none".
        ...(target.extraVerticals === undefined ? {} : { extraVerticals: target.extraVerticals }),
      });
    case 'add-vertical':
      return addVerticalCommand({
        cwd: run.cwd,
        verticals: target.verticals,
        answers: run.answers,
        interactive: run.interactive,
        dryRun: run.dryRun,
        ...(target.refresh === undefined ? {} : { refresh: target.refresh }),
        ...(target.reapply === true ? { reapply: true } : {}),
      });
    case 'add-module':
      return addModuleCommand({
        cwd: run.cwd,
        module: target.module,
        answers: run.answers,
        interactive: run.interactive,
        dryRun: run.dryRun,
        ...(target.consumes === undefined ? {} : { consumes: target.consumes }),
      });
  }
}
