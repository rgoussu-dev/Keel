/**
 * The converge run (roadmap S.3): a {@link ConvergePlan} that
 * `./converge.ts` `convergeOf` read, staged onto a Tree — and nothing
 * committed. `./converge.ts` stays the pure reading; this is the one
 * run of it, the tail `keel add`, `keel add entrypoint` and `keel add
 * module` each wrote out for themselves, and {@link commitConverged}
 * the one commit after it. `keel add entrypoint` is its first caller
 * (S.3), `keel add` — `--refresh` and `--reapply` with it — its second
 * (S.4), `keel add module` its third (S.5), and `keel new` its fourth
 * (S.6): one run per scope, from the scope's seed manifest, in the
 * `scaffold` posture (`apply`), under the preset's own rules (`rules`).
 *
 * **The run.** One `installVerticals` pass over the plan's steps, each
 * in its posture — installed whole, installed in part (`only`),
 * re-rendered (`rerender`), replayed for its patches alone onto the
 * whole files the re-renders before it rewrote (`replays`, S.7) — a
 * context `keel add module` added among them, by keel's own
 * `bounded-context` on the manifest the run starts from, seeded with
 * its inputs — or replayed for its deferred actions alone
 * (`actionsOnly`) — then each context the plan wires, by a run of
 * keel's own `bounded-context` of its own, in the order recorded
 * ({@link ConvergePlan}'s `modules`), the one `keel add module` adds
 * reading the answers supplied, in the caller's mode (S.5). Then the
 * caller's exact answer check (`check`): after the run, since only the
 * staged run knows which adapters resolved and which answers they
 * read, and before the harness pass, so its refusal wins over one the
 * pass would make.
 *
 * **The harness.** The run fills one buffer: what ran put its
 * declarations in it as it installed; where the harness itself ran,
 * every vertical that did not is replayed into it (`retrofitHarness`,
 * with the caller's command line), and the generation is restamped. The
 * buffer is realized once (`finalizeHarness`), in the order the plan's
 * placement says: the twin's, for growth, where each adapter ranks by
 * where it runs in the twin; the run's, for every other caller.
 *
 * **The record.** What the run records anew goes where the placement
 * puts it: after every recorded row, or, for growth, where the twin
 * records it (roadmap DR4) — each new `verticals` row, `answers` key
 * and harness entry before the first recorded one the twin puts after
 * it, nothing recorded moving.
 *
 * **The report.** The caller's notes around the refresh proposals the
 * run makes — the installed verticals it changed the rendering of and
 * did not re-render, proposed, never done — each worded as a later run
 * takes it up, or as this one could; the diffs of what re-rendered; and
 * where anything re-rendered, a conflict a contribution cannot settle
 * read as `keel.reapply-conflict`, naming the re-render it stopped in
 * the order the project records it — a replayed patch that is not its
 * own fixed point among them, since it cannot be put back as it was.
 */

import { DomainError, err, ok, type Result } from '../kernel/result.js';
import type { InstallReport, PresetAnswers, RefreshProposal } from '../contract/commands.js';
import type { Adapter, Conflict, DeferredAction, Tree, Vertical } from '../contract/composition.js';
import {
  effectiveTags,
  HARNESS_GENERATION,
  projectScopeRoot,
  type InstalledVertical,
  type ManifestEntry,
  type ManifestV2,
} from '../contract/manifest.js';
import type { Clock } from '../contract/ports/clock.js';
import type { Logger } from '../contract/ports/logger.js';
import type { ManifestStore } from '../contract/ports/manifest-store.js';
import type { ProcessRunner } from '../contract/ports/process-runner.js';
import type { Prompt } from '../contract/ports/prompt.js';
import type { Registry } from '../contract/ports/registry.js';
import type { TemplateSource } from '../contract/ports/template-source.js';
import type { TreeFactory } from '../contract/ports/tree.js';
import { runActions, type RunActionsInputs } from './actions.js';
import { addModuleInputs, CONTEXT_TAG, withoutAddModuleInputs } from './adapters/added-context.js';
import type { AnswerRead } from './answers.js';
import {
  ContributionConflictError,
  newOwnership,
  type ApplyMode,
  type HarnessContribution,
  type Ownership,
} from './apply.js';
import { placed, type Composition, type ConvergeModule, type ConvergePlan } from './converge.js';
import { withoutHarness } from './dials.js';
import { workingTreeDiffs } from './diff.js';
import { retrofitHarness } from './harness-retrofit.js';
import {
  finalizeHarness,
  installVertical,
  installVerticals,
  type InstallVerticalInputs,
  type InstallVerticalResult,
  type ReplayAt,
} from './install.js';
import { refreshProposals } from './planner.js';
import { rankedIndex } from './rank.js';
import { reapplyConflictSentence, refreshProposalNote } from './refusals.js';
import { installedVertical } from './registry.js';
import { resolveVertical } from './resolver.js';
import { resolvedAdapters } from './supplied-answers.js';
import { boundedContextVertical } from './verticals/bounded-context.js';

/** The vertical whose run replays the rest of the project's harness, and restamps its generation. */
const HARNESS = 'agent-harness';

/** A plan `./converge.ts` `convergeOf` read that converges: what {@link converge} runs. */
export type ConvergingPlan = Extract<ConvergePlan, { readonly kind: 'converges' }>;

/** The ports a converge run is wired with — the install handlers' (`./handlers/deps.ts`). */
export interface ConvergeDeps {
  readonly registry: Registry;
  /** Opens the pristine working tree a re-render's diffs are read against. */
  readonly trees: TreeFactory;
  /** Read once, for every timestamp the run records. */
  readonly clock: Clock;
  readonly prompt: Prompt;
  readonly logger: Logger;
  readonly templates: TemplateSource;
  readonly processes: ProcessRunner;
}

/** What {@link converge} runs, onto what, and what the caller says around it. */
export interface ConvergeInputs extends ConvergeDeps {
  readonly plan: ConvergingPlan;
  /**
   * The project as its manifest records it before the command: the
   * rows nothing moves, the verticals a refresh proposal is read over,
   * and the tags it is read from.
   */
  readonly stored: ManifestV2;
  /**
   * The manifest the run starts from: {@link stored}, with what the
   * command folds in before anything resolves — growth's entrypoint
   * tag and its twin's `projects` (`./converge.ts` `grownManifest`).
   * Absent, {@link stored}.
   */
  readonly from?: ManifestV2;
  /** The Tree the run stages onto, rooted at {@link cwd}; nothing is committed. */
  readonly tree: Tree;
  readonly cwd: string;
  /** Answers supplied for the run (`--set`, an install body), keyed as the manifest keys them. */
  readonly answers: PresetAnswers;
  /** Whether a question the recorded answers leave open is asked, or answered by its default. */
  readonly interactive: boolean;
  /**
   * The posture the steps install in (`./apply.ts` `ApplyMode`):
   * `install`, the brownfield one, absent; or `scaffold`, `keel new`'s,
   * where no project was there before. A step that re-renders does so
   * in the `reapply` posture whatever this says.
   */
  readonly apply?: Exclude<ApplyMode, 'reapply'>;
  /**
   * Rules of pieces around the run that are none of its verticals —
   * `keel new` passes its preset's own — held with theirs and the
   * recorded verticals' after every step (`./install.ts`
   * `installVerticals`). Absent, none.
   */
  readonly rules?: readonly Conflict[];
  /**
   * The run's ownership memory, which records who wrote each file
   * (`Ownership.writers`), for a caller that reads it back — `keel new`
   * names the writers of a file two of its scopes stage. Absent, the
   * run's own.
   */
  readonly owners?: Ownership;
  /** Whether the report says nothing was committed ({@link InstallReport.committed}). */
  readonly dryRun: boolean;
  /** What the report names as installed ({@link InstallReport.subject}). */
  readonly subject: string;
  /**
   * The harness retrofit, where the harness runs: `line`, the
   * command line a refusal of a recorded vertical nothing registered
   * provides names to re-run (`./harness-retrofit.ts`; absent, `keel
   * add agent-harness`), and whether it replays the contexts `keel add
   * module` added, by keel's own `bounded-context`, as an adoption of
   * the harness does. Growth's run replays none: it wires them itself.
   * The skeleton and the peer are `walking-skeleton`'s, which the
   * retrofit never replays as contexts.
   */
  readonly retrofit: { readonly line?: string; readonly contexts: boolean };
  /**
   * The caller's exact answer check, over the staged run — the
   * adapters it resolved and the supplied answers they read — after
   * every step and context and before the harness pass: its refusal,
   * or null.
   */
  readonly check?: (staged: InstallVerticalResult) => DomainError | null;
  /**
   * Whether each refresh proposal is worded as a later run takes it up,
   * or, false, as this run could, under `--refresh` — `./refusals.ts`
   * `refreshProposalNote`'s `committed`, whatever {@link dryRun} says:
   * `keel add entrypoint`, which takes no `--refresh`, passes true, dry
   * run or not; `keel add` passes `!dryRun`, as it has always worded them.
   */
  readonly proposeForLater: boolean;
  /** The caller's notes, in its order: those before the refresh proposals', and those after. */
  readonly notes: { readonly before: readonly string[]; readonly after: readonly string[] };
}

/** A converged run, staged and not committed: what {@link commitConverged} commits. */
export interface Converged {
  readonly report: InstallReport;
  /** The manifest the run leaves, its new rows at the plan's placement. */
  readonly manifest: ManifestV2;
  /** The deferred actions the run queued, in run order. */
  readonly actions: readonly DeferredAction[];
  readonly tree: Tree;
  readonly cwd: string;
  /**
   * Every adapter the run resolved, in the order it ran — the steps',
   * then the contexts' — for a caller holding the supplied answers
   * across several runs (`keel new`, a product's scopes).
   */
  readonly adapters: readonly Adapter[];
  /** Every supplied answer the run read, in the order it read them. */
  readonly reads: readonly AnswerRead[];
}

/** The ports the commit after a run takes. */
export interface CommitDeps {
  readonly manifests: ManifestStore;
  readonly logger: Logger;
  readonly processes: ProcessRunner;
  /** Runs the deferred actions; absent, `./actions.ts` `runActions`. */
  readonly runDeferred?: (inputs: RunActionsInputs) => Promise<void>;
}

/**
 * Runs `inputs.plan` onto `inputs.tree` and reports it, committing
 * nothing: the steps and the contexts, the caller's answer check, the
 * harness retrofit and restamp where the harness runs, the buffer
 * realized in the placement's order, the record at the placement, and
 * the refresh proposals. Refused where the caller's check refuses, and
 * as `keel.reapply-conflict` where a contribution meets a conflict it
 * cannot settle and anything re-rendered.
 *
 * @throws ContributionConflictError where nothing re-rendered and a
 *   contribution meets such a conflict, and whatever an install or the
 *   harness retrofit throws — the retrofit's `DomainError` for a
 *   recorded vertical nothing registered provides
 *   (`keel.missing-harness-contributor`), naming `retrofit.line`
 *   (`./harness-retrofit.ts`)
 */
export async function converge(inputs: ConvergeInputs): Promise<Result<Converged>> {
  const { plan, stored, tree, cwd, registry } = inputs;
  const now = inputs.clock.nowIso();
  const owners = inputs.owners ?? newOwnership();
  const harness: HarnessContribution[] = [];
  const rerendered = plan.run.filter((s) => s.posture === 'rerender').map((s) => s.vertical.id);
  const ran = new Set(
    plan.run
      .filter((s) => s.posture !== 'settle' && s.posture !== 'replay')
      .map((s) => s.vertical.id),
  );
  const harnessRuns = ran.has(HARNESS);
  const ports = {
    prompt: inputs.prompt,
    logger: inputs.logger,
    templates: inputs.templates,
    processes: inputs.processes,
    registry,
  };
  let staged: InstallVerticalResult;
  let manifest: ManifestV2;
  let skipped: number;
  try {
    const run = await installVerticals({
      ...ports,
      verticals: plan.run.map((step) => step.vertical),
      rerender: rerendered,
      only: Object.fromEntries(
        plan.run.flatMap((step) =>
          step.posture === 'only' ? [[step.vertical.id, new Set(step.adapters ?? [])]] : [],
        ),
      ),
      actionsOnly: plan.run
        .filter((step) => step.posture === 'settle' || step.settles === true)
        .map((step) => step.vertical.id),
      replays: plan.run.flatMap((step, at): ReplayAt[] => {
        if (step.posture !== 'replay') return [];
        if (step.context === undefined) return [{ at }];
        return [
          {
            at,
            manifest: contextReplayed(inputs.from ?? stored, step.context),
            only: new Set(step.adapters ?? []),
          },
        ];
      }),
      manifest: inputs.from ?? stored,
      supplied: inputs.answers,
      tree,
      owners,
      harness,
      mode: inputs.interactive ? 'interactive' : 'non-interactive',
      cwd,
      now: () => now,
      apply: inputs.apply ?? 'install',
      rules: inputs.rules ?? [],
    });
    staged = await wireModules(
      run,
      plan.modules,
      {
        ...ports,
        vertical: boundedContextVertical,
        tree,
        owners,
        harness,
        mode: 'non-interactive',
        cwd,
        now: () => now,
        apply: 'install',
      },
      { supplied: inputs.answers, mode: inputs.interactive ? 'interactive' : 'non-interactive' },
    );
    const refusal = inputs.check?.(staged) ?? null;
    if (refusal !== null) return err(refusal);
    if (harnessRuns) {
      // What ran put its declarations in the buffer as it installed or
      // re-rendered — a vertical installed in part too, whose install
      // replayed the adapters it left out — so the retrofit replays
      // what did not run.
      await retrofitHarness({
        ...ports,
        manifest: {
          ...staged.manifest,
          verticals: staged.manifest.verticals.filter((v) => !ran.has(v.id)),
          ...(inputs.retrofit.contexts ? {} : { modules: [] }),
        },
        tree,
        owners,
        harness,
        cwd,
        mode: 'non-interactive',
        now: () => now,
        ...(inputs.retrofit.line === undefined ? {} : { line: inputs.retrofit.line }),
      });
    }
    const twin =
      plan.placement.rows === 'twin' || plan.placement.harness === 'twin'
        ? twinOrder(registry, stored, staged.manifest, twinOf(registry, plan.target))
        : null;
    if (twin !== null && plan.placement.harness === 'twin') {
      // Realized in the order the twin's one run realizes it, so a file
      // recorded anew can be recorded where the twin records it.
      harness.sort((a, b) => rankOf(twin.ranks, a.adapter.id) - rankOf(twin.ranks, b.adapter.id));
    }
    const finalized = finalizeHarness({
      manifest: staged.manifest,
      harness,
      tree,
      owners,
      logger: inputs.logger,
      now: () => now,
    });
    // Adopting or re-rendering the harness writes this keel's layout,
    // so it is what restamps the generation.
    const restamped = harnessRuns
      ? { ...finalized.manifest, harnessGeneration: HARNESS_GENERATION }
      : finalized.manifest;
    manifest =
      twin !== null && plan.placement.rows === 'twin'
        ? atRank(stored, restamped, twin, finalized.realized)
        : restamped;
    skipped = finalized.skipped;
  } catch (e) {
    if (rerendered.length > 0 && e instanceof ContributionConflictError) {
      return err(
        new DomainError(
          reapplyConflictSentence(recordedFirst(stored, rerendered), e.message),
          'keel.reapply-conflict',
        ),
      );
    }
    throw e;
  }

  const proposals = refreshProposals(
    registry,
    stored.verticals.map((v) => v.id).filter((id) => !ran.has(id)),
    plan.run.filter((step) => step.posture === 'install').map((step) => step.vertical.id),
    effectiveTags(stored),
    effectiveTags(manifest),
  );
  const notes = [
    ...inputs.notes.before,
    ...proposals.map((proposal) => proposalNote(registry, proposal, inputs.proposeForLater)),
    ...inputs.notes.after,
  ];
  const actions = staged.applyResult.actions;
  const report: InstallReport = {
    subject: inputs.subject,
    changes: tree.changes(),
    actions: actions.map((a) => a.description),
    committed: !inputs.dryRun,
    ...(notes.length > 0 ? { notes } : {}),
    ...(proposals.length > 0 ? { refreshProposals: proposals } : {}),
    ...(staged.adapters.length > 0 ? { resolvedAdapters: resolvedAdapters(staged.adapters) } : {}),
    ...(skipped > 0 ? { skippedHarnessElements: skipped } : {}),
    ...(rerendered.length > 0 ? { diffs: workingTreeDiffs(inputs.trees, cwd, tree) } : {}),
  };
  return ok({
    report,
    manifest,
    actions,
    tree,
    cwd,
    adapters: staged.adapters,
    reads: staged.reads,
  });
}

/**
 * Commits a converged run: the Tree, then the manifest at the project
 * scope under `run.cwd`, then the deferred actions — manifest before
 * actions, so a failed action leaves files and manifest that agree,
 * and a re-run finds what installed installed.
 */
export async function commitConverged(deps: CommitDeps, run: Converged): Promise<void> {
  await run.tree.commit();
  await deps.manifests.write(projectScopeRoot(run.cwd), run.manifest);
  const runDeferred = deps.runDeferred ?? runActions;
  await runDeferred({
    actions: run.actions,
    cwd: run.cwd,
    logger: deps.logger,
    processes: deps.processes,
    dryRun: false,
  });
}

/**
 * `result`, the run so far, with each context of `modules` wired in, in
 * their order — those `keel add module` added in the order the manifest
 * records them, since a context's wiring calls the wiring of the one it
 * consumes — as that command runs it, now on the manifest the run left:
 * its vertical, `inputs.vertical`, with the context's marker and inputs
 * seeded, installing only the adapters the plan names, and the inputs
 * stripped after. A recorded context replays as its add ran it, what it
 * consumes read off the record; the one the run adds
 * ({@link ConvergeModule.adds}), which the manifest records only after
 * the run, consumes what the plan says and reads `adding`'s supplied
 * answers in its mode. Onto the run's tree, ownership and harness
 * buffer, after every step, where one run's own history adds them.
 */
async function wireModules(
  result: InstallVerticalResult,
  modules: readonly ConvergeModule[],
  inputs: Omit<InstallVerticalInputs, 'manifest' | 'only' | 'supplied'>,
  adding: Required<Pick<InstallVerticalInputs, 'supplied' | 'mode'>>,
): Promise<InstallVerticalResult> {
  let manifest = result.manifest;
  const actions = [...result.applyResult.actions];
  const adapters = [...result.adapters];
  const reads = [...result.reads];
  for (const module of modules) {
    const recorded = manifest.modules.find((each) => each.name === module.name);
    const consumes =
      module.adds === undefined ? (recorded?.consumes ?? null) : module.adds.consumes;
    const wired = await installVertical({
      ...inputs,
      ...(module.adds === undefined ? {} : adding),
      manifest: {
        ...manifest,
        tags: [...manifest.tags, CONTEXT_TAG].sort(),
        answers: { ...manifest.answers, ...addModuleInputs({ name: module.name, consumes }) },
      },
      only: new Set(module.adapters),
    });
    manifest = withoutAddModuleInputs(wired.manifest);
    actions.push(...wired.applyResult.actions);
    adapters.push(...wired.adapters);
    reads.push(...wired.reads);
  }
  return {
    ...result,
    manifest,
    applyResult: { ...result.applyResult, actions },
    adapters,
    reads,
  };
}

/**
 * `recorded`, the manifest a run starts from, as a replay of the
 * context `name` reads it (S.7): with the context's marker and inputs
 * seeded, what it consumes read off its record, as `keel add module`
 * seeded them ({@link wireModules}).
 */
function contextReplayed(recorded: ManifestV2, name: string): ManifestV2 {
  const consumes = recorded.modules.find((each) => each.name === name)?.consumes ?? null;
  return {
    ...recorded,
    tags: [...recorded.tags, CONTEXT_TAG].sort(),
    answers: { ...recorded.answers, ...addModuleInputs({ name, consumes }) },
  };
}

/**
 * `ids`, vertical ids, in the order `stored` records them — a refused
 * re-render names what it re-rendered so, whatever order it ran in —
 * and any it does not record after them, as they come.
 */
function recordedFirst(stored: ManifestV2, ids: readonly string[]): readonly string[] {
  const recorded = stored.verticals.map(({ id }) => id).filter((id) => ids.includes(id));
  return [...recorded, ...ids.filter((id) => !recorded.includes(id))];
}

/** {@link refreshProposalNote} for one proposal, its ids resolved in `registry`. */
function proposalNote(registry: Registry, proposal: RefreshProposal, committed: boolean): string {
  const byId = (id: string): Vertical[] => {
    const vertical = registry.vertical(id);
    return vertical === null ? [] : [vertical];
  };
  const [vertical] = byId(proposal.vertical);
  if (vertical === undefined) {
    throw new Error(`proposalNote: '${proposal.vertical}' is not registered`);
  }
  return refreshProposalNote(
    vertical,
    proposal.reads.flatMap(byId),
    proposal.adapters !== undefined,
    committed,
  );
}

/**
 * The twin a target placed at its twin's rank is recorded as, by its
 * verticals' ids: the preset the target reads back as — growth's twin,
 * which `growthOf` finds by the same reading of its dials — with the
 * harness dial the target has.
 */
function twinOf(registry: Registry, target: Composition): readonly string[] {
  const stack = target.preset === null ? null : registry.stack(target.preset);
  if (stack === null) {
    throw new Error('converge: a plan placed at its twin’s rank reads back no registered preset');
  }
  return (target.harness ? stack : withoutHarness(stack)).verticals.map(({ id }) => id);
}

/**
 * The grown project's order, as the twin's (roadmap DR4): `verticals`,
 * the rows of the manifest — as the run left it — with each new one
 * before the first recorded one the twin lists later, and `ranks`,
 * each adapter of those verticals by where it runs in that order, as
 * it resolves on the grown tags.
 */
interface TwinOrder {
  readonly verticals: readonly InstalledVertical[];
  readonly ranks: ReadonlyMap<string, number>;
}

/** The {@link TwinOrder} of `manifest`, a run over `stored` growing into `twin`. */
function twinOrder(
  registry: Registry,
  stored: ManifestV2,
  manifest: ManifestV2,
  twin: readonly string[],
): TwinOrder {
  const had = new Set(stored.verticals.map((v) => v.id));
  const order = placed(
    stored.verticals.map((v) => v.id),
    manifest.verticals.map((v) => v.id).filter((id) => !had.has(id)),
    twin,
  );
  const rows = new Map(manifest.verticals.map((v) => [v.id, v]));
  const verticals = order.flatMap((id): InstalledVertical[] => {
    const row = rows.get(id);
    return row === undefined ? [] : [row];
  });
  const tags = effectiveTags(manifest);
  const ranks = new Map<string, number>();
  verticals.forEach(({ id }, index) => {
    // The context vertical `keel add module` records runs after every
    // other, as keel's own (`wireModules`); one a registry lists ranks nothing.
    const vertical = id === boundedContextVertical.id ? null : installedVertical(registry, id);
    if (vertical === null) return;
    resolveVertical(vertical, tags, registry).forEach((adapter, position) => {
      if (!ranks.has(adapter.id)) ranks.set(adapter.id, index * 1_000 + position);
    });
  });
  return { verticals, ranks };
}

/** Where `adapter` runs in the twin's order; after every adapter it ranks where none does. */
function rankOf(ranks: ReadonlyMap<string, number>, adapter: string): number {
  return ranks.get(adapter) ?? Number.MAX_SAFE_INTEGER;
}

/**
 * `manifest`, as the run left it, with what it recorded anew placed
 * where the twin records it (roadmap DR4): its `verticals` in
 * `order`; each new `answers` key before the first key of an adapter
 * that runs later in it; each new harness entry before the first
 * recorded one the run — realizing the harness in that order —
 * realized later (`realized`). Nothing recorded before moves, and a
 * key or an entry with no rank goes last.
 */
function atRank(
  stored: ManifestV2,
  manifest: ManifestV2,
  order: TwinOrder,
  realized: readonly Pick<ManifestEntry, 'source' | 'target'>[],
): ManifestV2 {
  const keys = Object.keys(manifest.answers);
  const answers = Object.fromEntries(
    inPlace(
      keys.filter((key) => key in stored.answers),
      keys.filter((key) => !(key in stored.answers)),
      (key) => order.ranks.get(key),
    ).flatMap((key) => {
      const value = manifest.answers[key];
      return value === undefined ? [] : [[key, value] as const];
    }),
  );
  const entryKey = (entry: Pick<ManifestEntry, 'source' | 'target'>) =>
    `${entry.source} ${entry.target}`;
  const realizedAt = new Map<string, number>();
  realized.forEach((entry, index) => {
    if (!realizedAt.has(entryKey(entry))) realizedAt.set(entryKey(entry), index);
  });
  const had = new Set(stored.entries.map(entryKey));
  const entries = inPlace(
    manifest.entries.filter((entry) => had.has(entryKey(entry))),
    manifest.entries.filter((entry) => !had.has(entryKey(entry))),
    (entry) => realizedAt.get(entryKey(entry)),
  );
  return { ...manifest, verticals: [...order.verticals], answers, entries };
}

/**
 * `recorded`, in its order, with each of `incoming` in turn before the
 * first row `rank` puts after it — after every row, where it has no
 * rank. Nothing recorded moves.
 */
function inPlace<T>(
  recorded: readonly T[],
  incoming: readonly T[],
  rank: (row: T) => number | undefined,
): T[] {
  const rows = [...recorded];
  for (const row of incoming) {
    const own = rank(row);
    const at = own === undefined ? -1 : rankedIndex(rows.map(rank), own);
    rows.splice(at === -1 ? rows.length : at, 0, row);
  }
  return rows;
}
