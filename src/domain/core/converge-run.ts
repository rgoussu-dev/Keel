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
 * where it runs in the twin; the target's reference order, for `keel
 * add` and `keel add module` (S.8), ranked the same way; the run's, for
 * `keel new` — whose run is in that order already — and wherever no
 * preset reads back.
 *
 * **The record.** What the run records anew goes where the placement
 * puts it (roadmap DR4, DS3): where the twin records it, for growth, or
 * where one run of the target records it, for `keel add` and `keel add
 * module` — each new `verticals` row, `answers` key and harness entry
 * before the first recorded one that order puts after it, nothing
 * recorded moving — or after every recorded row. A harness entry's
 * place reads the stage the pass realizes its file in and its
 * contributor's rank, not a replay of the project, so it needs no
 * render of what the harness does not re-render.
 *
 * **The report.** The caller's notes around the run's own: what its
 * re-renders moved a vertical off and keel leaves in place (S.9, DS5) —
 * an adapter that ran, by the answers the manifest records of it or a
 * tag it promoted that nothing else recorded accounts for, the files it
 * wrote whole that the project still holds, its record, which stays —
 * then the refresh proposals it makes — the installed verticals it
 * changed the rendering of and did not re-render, proposed, never done
 * — each worded as a later run takes it up, or as this one could; the
 * diffs of what re-rendered; and
 * where anything re-rendered, a conflict a contribution cannot settle
 * read as `keel.reapply-conflict`, naming the re-render it stopped in
 * the order the project records it — a replayed patch that is not its
 * own fixed point among them, since it cannot be put back as it was.
 */

import path from 'node:path';
import { DomainError, err, ok, type Result } from '../kernel/result.js';
import type { InstallReport, PresetAnswers, RefreshProposal } from '../contract/commands.js';
import {
  ENGINE_CONTRIBUTOR_ID,
  type Adapter,
  type Conflict,
  type DeferredAction,
  type Tag,
  type Tree,
  type Vertical,
} from '../contract/composition.js';
import { DOC_POINTER_FILENAME, docTarget } from '../contract/doc.js';
import { hookTarget, SETTINGS_TARGET } from '../contract/hook.js';
import { SKILLS_ROOT } from '../contract/skill.js';
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
  canonicalTarget,
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
  recordedContribution,
  type InstallVerticalInputs,
  type InstallVerticalResult,
  type ReplayAt,
} from './install.js';
import { adapterPromotes, refreshProposals } from './planner.js';
import { matches } from './predicate.js';
import { rankedIndex } from './rank.js';
import { leftBehindNote, reapplyConflictSentence, refreshProposalNote } from './refusals.js';
import { installedVertical } from './registry.js';
import { coverageGap, resolveVertical } from './resolver.js';
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
  /**
   * The caller's notes, in its order: those before the run's own —
   * what its re-renders leave in place, then its refresh proposals —
   * and those after.
   */
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
 * realized in the placement's order, the record at the placement, what
 * its re-renders moved a vertical off and leave in place, and the
 * refresh proposals. Refused where the caller's check refuses, and
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
    const ranking = rankingOf(registry, plan);
    const ranked = ranking === null ? null : twinOrder(registry, stored, staged.manifest, ranking);
    if (ranked !== null && plan.placement.harness !== 'run') {
      // Realized in the order one run of the twin, or of the target,
      // realizes it, so a file recorded anew can be recorded where that
      // run records it.
      harness.sort(
        (a, b) => rankOf(ranked.ranks, a.adapter.id) - rankOf(ranked.ranks, b.adapter.id),
      );
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
      ranked === null || plan.placement.rows === 'append'
        ? restamped
        : atRank(
            stored,
            restamped,
            ranked,
            plan.placement.rows === 'twin'
              ? realizedRank(finalized.realized)
              : referenceRank(registry, ranked, restamped.entries, finalized.realized),
          );
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
    ...(await leftBehind(inputs, staged.adapters, owners)),
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

/**
 * What the run's re-renders moved their verticals off and keel leaves in
 * place (roadmap S.9, DS5), a {@link leftBehindNote} each, the verticals
 * in the order the project records them: every adapter of a re-rendered
 * vertical that the re-render did not resolve (`resolved`, what the run
 * resolved) and that ran, by the record — the manifest holds answers
 * under its id, or a tag it may promote that none of the adapters the
 * re-render resolved may promote and nothing else the project records
 * accounts for ({@link unaccounted}), read only where the tags the
 * project records, its peers' among them, hold every tag the adapter
 * requires: a project's own tags only accrue, so an adapter they never
 * matched never ran, whatever tag its share holds — and one that ran on
 * a peer's tag relinking since withdrew is read by its answers alone.
 * Each names the files the adapter writes whole, contributed on the
 * answers it recorded whatever its predicate now says, that the Tree
 * still holds and the run did not write whole ({@link leftFiles}): one
 * the user deleted is gone, and one the run wrote whole — the adapter it
 * moved onto writing the same path — is not left behind. An adapter that
 * recorded no answer and promoted no tag left nothing in the manifest to
 * read, and goes unnamed.
 */
async function leftBehind(
  inputs: ConvergeInputs,
  resolved: readonly Adapter[],
  owners: Ownership,
): Promise<readonly string[]> {
  const { plan, stored } = inputs;
  const rerendered = plan.run.flatMap((step) =>
    step.posture === 'rerender' ? [step.vertical] : [],
  );
  const ran = new Set(resolved.map(({ id }) => id));
  const recorded = new Set(effectiveTags(stored));
  const notes: string[] = [];
  for (const id of recordedFirst(
    stored,
    rerendered.map((vertical) => vertical.id),
  )) {
    const vertical = rerendered.find((each) => each.id === id);
    if (vertical === undefined) continue;
    const promoted = new Set(
      vertical.adapters
        .filter(({ id }) => ran.has(id))
        .flatMap((adapter) => adapterPromotes(vertical, adapter)),
    );
    for (const adapter of vertical.adapters) {
      if (ran.has(adapter.id)) continue;
      const answers = Object.keys(stored.answers[adapter.id] ?? {}).length > 0;
      const could = matches({ requires: adapter.predicate.requires ?? [] }, recorded);
      const held = could
        ? adapterPromotes(vertical, adapter).filter(
            (tag) => stored.tags.includes(tag) && !promoted.has(tag),
          )
        : [];
      const tags = held.length === 0 ? held : await unaccounted(held, vertical, inputs);
      if (!answers && tags.length === 0) continue;
      const files = await leftFiles(adapter, inputs, owners);
      notes.push(leftBehindNote(vertical, adapter.id, files, { answers, tags: tags.length }));
    }
  }
  return notes;
}

/**
 * The tags of `held` — tags the manifest holds that an adapter of
 * `vertical` a re-render moved off may have promoted — that no other
 * vertical the project records accounts for: no adapter of one whose
 * every required tag the recorded tags hold promotes it, contributed on
 * what the project records — as containerization's image, on `flavor:
 * native`, promotes the tag distribution's native release does. Each is
 * asked by its requirements alone, as {@link leftBehind} reads the
 * adapter moved off: tags only accrue, so one that promoted the tag
 * before a tag it excludes arrived ran all the same. One whose
 * contribution throws there is taken to promote every tag it may: the
 * run cannot tell, and naming an adapter that never ran would hand the
 * user a file of their own to delete.
 */
async function unaccounted(
  held: readonly Tag[],
  vertical: Vertical,
  inputs: ConvergeInputs,
): Promise<readonly Tag[]> {
  const { registry, stored } = inputs;
  const tags = new Set(effectiveTags(stored));
  let left = held;
  for (const { id } of stored.verticals) {
    const other = id === vertical.id ? null : installedVertical(registry, id);
    if (other === null) continue;
    for (const adapter of other.adapters) {
      const may = adapterPromotes(other, adapter).filter((tag) => left.includes(tag));
      if (may.length === 0 || !matches({ requires: adapter.predicate.requires ?? [] }, tags)) {
        continue;
      }
      const promotes = await recordedContribution(adapter, stored, inputs).then(
        (contribution) => contribution.tagsAdd ?? [],
        () => may,
      );
      left = left.filter((tag) => !promotes.includes(tag));
    }
  }
  return left;
}

/**
 * The files `adapter` writes whole, contributed on the answers the
 * project records, that the Tree still holds and the run did not write
 * whole — a patch of the run leaves the file the adapter's. Not its
 * skills' files or its hooks' scripts: those are the harness's, each
 * recorded in the manifest's entries and a skill listed in the index, a
 * hook wired into the settings, which all stay, so deleting the file
 * alone would leave them naming nothing. None where that contribution
 * throws: an adapter a re-render moved off may not render on a manifest
 * its predicate no longer matches, and what a run says of it changes no
 * verdict.
 */
async function leftFiles(
  adapter: Adapter,
  inputs: ConvergeInputs,
  owners: Ownership,
): Promise<readonly string[]> {
  let paths: readonly string[];
  try {
    const contribution = await recordedContribution(adapter, inputs.stored, inputs);
    paths = (contribution.files ?? []).map((file) => canonicalTarget(file.path));
  } catch {
    return [];
  }
  return [...new Set(paths)].filter(
    (file) => inputs.tree.exists(file) && !owners.wroteWhole.has(file),
  );
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
 * The order the plan's placement ranks by, by vertical id: the twin's,
 * for a placement at the twin's rank; the target's reference order
 * ({@link Composition.order}), for one at the reference's (S.8); none
 * for a run appended and realized as it ran.
 */
function rankingOf(registry: Registry, plan: ConvergingPlan): readonly string[] | null {
  const { rows, harness } = plan.placement;
  if (rows === 'twin' || harness === 'twin') return twinOf(registry, plan.target);
  if (rows === 'reference' || harness === 'reference') return plan.target.order;
  return null;
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
 * The project's order after the run, as one run of the twin's, or of
 * the target's reference order, has it (roadmap DR4): `verticals`, the
 * rows of the manifest — as the run left it — with each new one before
 * the first recorded one that order lists later, and `ranks`, each
 * adapter of those verticals by where it runs in that order, as it
 * resolves on the tags the run leaves — none of a recorded vertical
 * those tags no longer cover: a run of it refuses it, not this one.
 */
interface TwinOrder {
  readonly verticals: readonly InstalledVertical[];
  readonly ranks: ReadonlyMap<string, number>;
}

/**
 * The {@link TwinOrder} of `manifest`, a run over `stored` placed by
 * `ranking` — the twin's order or the reference's ({@link rankingOf}).
 */
function twinOrder(
  registry: Registry,
  stored: ManifestV2,
  manifest: ManifestV2,
  ranking: readonly string[],
): TwinOrder {
  const had = new Set(stored.verticals.map((v) => v.id));
  const order = placed(
    stored.verticals.map((v) => v.id),
    manifest.verticals.map((v) => v.id).filter((id) => !had.has(id)),
    ranking,
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
    // One the tags the run leaves no longer cover ranks nothing: ranking
    // refuses nothing, so its refusal waits for a run that runs it.
    if (vertical === null || coverageGap(vertical, tags) !== null) return;
    resolveVertical(vertical, tags, registry).forEach((adapter, position) => {
      if (!ranks.has(adapter.id)) ranks.set(adapter.id, index * 1_000 + position);
    });
  });
  return { verticals, ranks };
}

/**
 * Where `adapter` runs in the order `ranks` was read by, the twin's or
 * the reference's; after every adapter it ranks where none does.
 */
function rankOf(ranks: ReadonlyMap<string, number>, adapter: string): number {
  return ranks.get(adapter) ?? Number.MAX_SAFE_INTEGER;
}

/** A harness entry by what identifies it: its contributor and its file. */
type EntryKey = Pick<ManifestEntry, 'source' | 'target'>;

/** Where an entry ranks among the others, or undefined where it ranks nowhere. */
type EntryRank = (entry: EntryKey) => number | undefined;

function entryKey(entry: EntryKey): string {
  return `${entry.source} ${entry.target}`;
}

/**
 * `manifest`, as the run left it, with what it recorded anew placed
 * where one run in `order`'s order records it (roadmap DR4): its
 * `verticals` in `order`; each new `answers` key before the first key
 * of an adapter that runs later in it; each new harness entry before
 * the first recorded one `rank` puts after it. Nothing recorded before
 * moves, and a key or an entry with no rank goes last.
 */
function atRank(
  stored: ManifestV2,
  manifest: ManifestV2,
  order: TwinOrder,
  rank: EntryRank,
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
  const had = new Set(stored.entries.map(entryKey));
  const entries = inPlace(
    manifest.entries.filter((entry) => had.has(entryKey(entry))),
    manifest.entries.filter((entry) => !had.has(entryKey(entry))),
    rank,
  );
  return { ...manifest, verticals: [...order.verticals], answers, entries };
}

/** Each entry by where the run, realizing the harness in the twin's order, realized it (`realized`). */
function realizedRank(realized: readonly EntryKey[]): EntryRank {
  const at = realizedAt(realized);
  return (entry) => at.get(entryKey(entry));
}

function realizedAt(realized: readonly EntryKey[]): ReadonlyMap<string, number> {
  const at = new Map<string, number>();
  realized.forEach((entry, index) => {
    if (!at.has(entryKey(entry))) at.set(entryKey(entry), index);
  });
  return at;
}

/**
 * The stages a pass realizing the harness records its files in
 * (`./apply.ts` `realizeHarness`): each contributor's skills and hooks,
 * whole; the hook settings they are wired into; each contributor's
 * harness patches and doc sections, by the file each lands in; the
 * pointer beside each doc; the index.
 */
const WHOLE = 0;
const WIRING = 1;
const LANDED = 2;
const POINTER = 3;
const INDEX = 4;

/** Wider than any adapter's rank in {@link TwinOrder}, times {@link SPAN}. */
const STAGE = 1e12;

/** Wider than any position in a pass's realized order. */
const SPAN = 1e4;

/**
 * Where one run of the target, realizing the harness in its reference
 * order, records each harness entry — found without replaying the
 * project (roadmap S.8), so a recorded vertical no loaded plugin
 * provides refuses nothing new: the stage the pass writes the entry's
 * file in, then its contributor's rank in `order` (an adapter's, or,
 * for a doc's pointer, the first contributor of that doc's), then
 * where this run realized it (`realized`), for the files of one
 * contributor. Every entry of `entries`, the manifest's, recorded or
 * new, ranks so; one whose contributor ranks nowhere — an adapter the
 * tags no longer resolve, or a vertical no loaded plugin provides —
 * ranks nowhere, and a new one goes last.
 */
function referenceRank(
  registry: Registry,
  order: TwinOrder,
  entries: readonly ManifestEntry[],
  realized: readonly EntryKey[],
): EntryRank {
  const at = realizedAt(realized);
  const within = (entry: EntryKey): number => at.get(entryKey(entry)) ?? 0;
  const owners = new Map<string, Vertical>();
  for (const { id } of order.verticals) {
    const vertical = installedVertical(registry, id);
    if (vertical === null) continue;
    for (const adapter of vertical.adapters) owners.set(adapter.id, vertical);
  }
  const contributed = (entry: EntryKey): number | undefined => {
    const rank = order.ranks.get(entry.source);
    return rank === undefined ? undefined : rank * SPAN + within(entry);
  };
  return (entry) => {
    if (entry.source === ENGINE_CONTRIBUTOR_ID) {
      if (entry.target === SETTINGS_TARGET) return WIRING * STAGE;
      if (path.posix.basename(entry.target) === DOC_POINTER_FILENAME) {
        const doc = docTarget(path.posix.dirname(entry.target));
        const first = Math.min(
          ...entries.flatMap((each) => {
            const rank = each.target === doc ? contributed(each) : undefined;
            return rank === undefined ? [] : [rank];
          }),
        );
        return POINTER * STAGE + (Number.isFinite(first) ? first : within(entry));
      }
      return INDEX * STAGE + within(entry);
    }
    const vertical = owners.get(entry.source);
    const own = contributed(entry);
    if (vertical === undefined || own === undefined) return undefined;
    return (wholeOf(vertical, entry.target) ? WHOLE : LANDED) * STAGE + own;
  };
}

/**
 * Whether `target` is a file `vertical` stages whole in the harness: a
 * file of a skill it declares, or the script of a hook it declares —
 * rather than one a harness patch or a doc section lands in, a hook of
 * another contributor's among them.
 */
function wholeOf(vertical: Vertical, target: string): boolean {
  return (
    (vertical.skills ?? []).some((name) => target.startsWith(`${SKILLS_ROOT}/${name}/`)) ||
    (vertical.hooks ?? []).some((name) => target === hookTarget(name))
  );
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
