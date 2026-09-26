/**
 * Handler for `keel.add-entrypoint` — add an entrypoint, a CLI or an
 * HTTP server, to a project that has the other one.
 *
 * A project with one entrypoint more is the preset carrying both: its
 * **twin** (`../growth.ts`), which `keel new` of that preset on the
 * same dials writes byte for byte. So what this adds is exactly the
 * difference, read before anything runs by {@link growthOf}: the other
 * entrypoint's bootstrap, which newly matches; the twin's verticals
 * the project lacks, a dev environment and observability when HTTP
 * arrives; and the agent harness re-rendered, whose runbook and skills
 * speak of the entrypoints. The command and its preview read that one
 * function, and so do the project status ({@link entrypointReading})
 * and the refusal of a vertical only the entrypoint stops, which
 * carries this command as its action (`../add-readiness.ts`
 * `addScopeOf`). Growth adds files and never removes one, and keel
 * writes nothing of the existing entrypoint — on the JVM the queued
 * format task still reformats it. The composition grid holds every
 * single-entrypoint backend cell to its twin (I10).
 *
 * A sibling of `keel add module` rather than a case of `keel add`: it
 * changes an identity tag, which no vertical may promote, so the
 * command folds it in itself, the way `keel add module` folds in the
 * context marker. Pipeline:
 *
 *   1. **Gates**, before a file moves: no project here; a product's
 *      root or a service of a monorepo product (`keel.wrong-scope` — a
 *      product records each service by its preset; a polyrepo
 *      service is a repository of its own, and grows); another harness
 *      generation, naming no keel to pin where the one that scaffolded
 *      the project predates this command; then growth's own answers —
 *      a word naming no entrypoint, one the project has already (Ok,
 *      with a note, and nothing touched, an answer supplied for it
 *      refused as `keel add` refuses one for a plan with nothing to
 *      run), and its refusals: no twin, a front end, adapters that
 *      would stop applying, a rule of a vertical the project has that
 *      the entrypoint breaks, and bounded contexts wired into the
 *      existing entrypoints alone.
 *   2. **The grown manifest**: the entrypoint's tag and the twin's
 *      `projects` folded in before anything resolves.
 *   3. **One run**, in the twin's order: the verticals with adapters
 *      that newly match install those alone (`only`), in the `install`
 *      posture, so a file already there is refused as
 *      `keel.path-conflict`; the harness re-renders; the verticals the
 *      project lacks install, closed over their prerequisites by the
 *      planner (`admit`) as any `keel add` is. No dev container is
 *      re-rendered: the dev environment's in-place upgrade writes the
 *      twin's definition on the grown tags. The run's harness buffer
 *      is this handler's to finalize: the verticals that did not run
 *      are replayed into it, and the generation restamped.
 *   4. **Settling**: every other vertical of the twin — but one placed
 *      at a repository root, whose actions set up a repository the
 *      project has — replays its adapters that matched before for
 *      their deferred actions alone (`actionsOnly`), in their place in
 *      the run, so the grown project queues what its twin queues: the
 *      JVM's build wrapper and formatter (`gradle wrapper` and
 *      `spotlessApply`, or Maven's), `go mod tidy`, `pnpm install`,
 *      `cargo check`.
 *   5. **Recording at rank**: the new `verticals` rows, `answers` keys
 *      and harness entries go where the twin records them, before the
 *      first one it records later — the harness realized in the twin's
 *      order for that; nothing recorded moves.
 *   6. **Answers, notes, report**: a supplied answer is held as `keel
 *      add` holds it — the new bootstrap reads its sibling's identity
 *      answers, so one supplied for it is frozen; the notes say what
 *      the planner added, the refreshes proposed, and which linked
 *      projects to link again — a linked project's record of what this
 *      one offers is its own manifest, which `keel link` writes and
 *      this command does not; the diffs show what re-rendered.
 *
 * Under a real run: commit the tree, persist the manifest, then run
 * the deferred actions — manifest before actions, as `keel add` does.
 */

import path from 'node:path';
import type { Action } from '../../kernel/action.js';
import type { Handler } from '../../kernel/handler.js';
import { DomainError, err, ok, type Result } from '../../kernel/result.js';
import type {
  AddEntrypointCommand,
  InstallReport,
  PresetAnswers,
  RefreshProposal,
} from '../../contract/commands.js';
import type { Adapter, Vertical } from '../../contract/composition.js';
import type { Registry } from '../../contract/ports/registry.js';
import {
  effectiveTags,
  HARNESS_GENERATION,
  projectScopeRoot,
  type InstalledVertical,
  type ManifestEntry,
  type ManifestV2,
} from '../../contract/manifest.js';
import { NOT_INITIALISED_CODE, notInitialisedSentence } from '../../contract/nearby.js';
import { runActions } from '../actions.js';
import { ContributionConflictError, newOwnership, type HarnessContribution } from '../apply.js';
import { withoutHarness } from '../dials.js';
import { workingTreeDiffs } from '../diff.js';
import { growthOf, type GrowthPlan, type GrowthRefusal } from '../growth.js';
import { harnessGenerationRefusal } from '../harness-generation.js';
import { retrofitHarness } from '../harness-retrofit.js';
import { finalizeHarness, installVerticals } from '../install.js';
import { admissionNotes, admit, type AdmittedSet } from '../plan-refusal.js';
import { reachableAdapters, refreshProposals } from '../planner.js';
import { rankedIndex } from '../rank.js';
import {
  contextsNeedRewiringSentence,
  ENTRYPOINT_IN_PRODUCT_REASON,
  entrypointPresentNote,
  incompatibleEntrypointSentence,
  reapplyConflictSentence,
  entrypointScopeSentence,
  refreshProposalNote,
  relinkNote,
  uncoverableEntrypointSentence,
  unknownEntrypointSentence,
  WRONG_SCOPE_CODE,
} from '../refusals.js';
import { installedVertical } from '../registry.js';
import { resolveVertical } from '../resolver.js';
import {
  enclosingProduct,
  nearbyProjects,
  productPlaceOf,
  projectScope,
  scopeOf,
  type DirectoryScope,
} from '../scope.js';
import { entrypointNamed } from '../stack-wizard.js';
import {
  historyOf,
  REAPPLY_FROZEN_ANSWERS_CODE,
  resolvedAdapters,
  strayAnswerRefusal,
  unusedAnswers,
} from '../supplied-answers.js';
import type { InstallDeps } from './deps.js';

/** Executes {@link AddEntrypointCommand}s. */
export class AddEntrypointHandler implements Handler<AddEntrypointCommand> {
  constructor(private readonly deps: InstallDeps) {}

  supports(action: Action): action is AddEntrypointCommand {
    return action.kind === 'keel.add-entrypoint';
  }

  async handle(command: AddEntrypointCommand): Promise<Result<InstallReport>> {
    const registry = this.deps.registry;
    const line = `keel add entrypoint ${command.entrypoint}`;
    const scopeRoot = projectScopeRoot(command.cwd);
    const where = await scopeOf(this.deps, command.cwd);
    const stored = where.manifest;
    if (stored === null) {
      return err(await this.notInitialised(scopeRoot, command.cwd, line, command.entrypoint));
    }
    const outOfScope = scopeRefusal(where);
    if (outOfScope !== null) return err(outOfScope);
    // The marker and this command arrived in one release, after
    // 0.5.0-alpha: the keel that scaffolded an unmarked project has no
    // command to pin it for.
    const stale = harnessGenerationRefusal(
      stored,
      line,
      undefined,
      stored.harnessGeneration !== undefined,
    );
    if (stale !== null) return err(stale);

    const growth = growthOf(registry, stored, command.entrypoint);
    if (growth.kind === 'refused') return err(growthRefusalError(registry, growth.refusal));
    const subject = `entrypoint ${entrypointNamed(growth.entrypoint)?.word ?? growth.entrypoint}`;
    const history = historyOf(registry, stored);
    if (growth.kind === 'present') {
      // Nothing will run, so the reachable plan is the plan: every
      // answer is refused, whatever the mode, as `keel add` refuses one
      // where everything it names is there already.
      if (hasAnswers(command.answers)) {
        const [unused] = unusedAnswers(command.answers, [], history);
        if (unused !== undefined) return err(new DomainError(unused.message, unused.code));
      }
      return ok({
        subject,
        changes: [],
        actions: [],
        committed: !command.dryRun,
        notes: [entrypointPresentNote(growth.entrypoint)],
      });
    }

    const grown = grownManifest(stored, growth);
    const plan = this.planOf(stored, grown, growth);
    if (!plan.ok) return plan;
    const { run, admitted, twin } = plan.value;

    // Answers are held before anything runs, as `keel add` holds them:
    // one for the re-rendered harness's recorded answers whatever the
    // mode, and at a terminal every stray key, before a question is
    // asked; the rest once the run is staged, exactly.
    if (hasAnswers(command.answers)) {
      const [early] = unusedAnswers(
        command.answers,
        resolvedAdapters(reachable(run, grown)),
        history,
      );
      if (
        early !== undefined &&
        (command.interactive || early.code === REAPPLY_FROZEN_ANSWERS_CODE)
      ) {
        return err(new DomainError(early.message, early.code));
      }
    }

    const now = this.deps.clock.nowIso();
    const tree = this.deps.trees(command.cwd);
    const owners = newOwnership();
    const harness: HarnessContribution[] = [];
    const harnessRuns = growth.rerender.length > 0;
    let result;
    try {
      result = await installVerticals({
        verticals: run.map((step) => step.vertical),
        rerender: growth.rerender,
        only: Object.fromEntries(
          run.flatMap((step) => (step.only === undefined ? [] : [[step.vertical.id, step.only]])),
        ),
        actionsOnly: run.filter((step) => step.settles).map((step) => step.vertical.id),
        manifest: grown,
        supplied: command.answers,
        tree,
        owners,
        harness,
        mode: command.interactive ? 'interactive' : 'non-interactive',
        prompt: this.deps.prompt,
        logger: this.deps.logger,
        cwd: command.cwd,
        templates: this.deps.templates,
        processes: this.deps.processes,
        now: () => now,
        apply: 'install',
        registry,
      });
      if (hasAnswers(command.answers)) {
        const stray = strayAnswerRefusal(
          command.answers,
          resolvedAdapters(result.adapters),
          history,
          result.reads,
        );
        if (stray !== null) return err(stray);
      }
      const ran = new Set(
        run.filter((step) => step.only !== undefined || !step.settles).map((s) => s.vertical.id),
      );
      if (harnessRuns) {
        // What ran put its declarations in the buffer as it installed
        // or re-rendered; the rest of the project is replayed into it.
        // A vertical that installed some of its adapters counts as run:
        // the install replayed the ones it left out itself.
        await retrofitHarness({
          ...this.deps,
          manifest: {
            ...result.manifest,
            verticals: result.manifest.verticals.filter((v) => !ran.has(v.id)),
          },
          tree,
          owners,
          harness,
          cwd: command.cwd,
          mode: 'non-interactive',
          now: () => now,
          line,
        });
      }
      const order = twinOrder(registry, stored, result.manifest, twin);
      // Realized in the order the twin's one run realizes it, so a file
      // recorded anew can be recorded where the twin records it.
      harness.sort((a, b) => rankOf(order.ranks, a.adapter.id) - rankOf(order.ranks, b.adapter.id));
      const finalized = finalizeHarness({
        manifest: result.manifest,
        harness,
        tree,
        owners,
        logger: this.deps.logger,
        now: () => now,
      });
      const restamped = harnessRuns
        ? { ...finalized.manifest, harnessGeneration: HARNESS_GENERATION }
        : finalized.manifest;
      result = {
        ...result,
        manifest: atRank(stored, restamped, order, finalized.realized),
        applyResult: {
          ...result.applyResult,
          skills: finalized.skills,
          ...(finalized.skipped > 0 ? { skippedHarnessElements: finalized.skipped } : {}),
        },
        ran,
      };
    } catch (e) {
      if (harnessRuns && e instanceof ContributionConflictError) {
        return err(
          new DomainError(
            reapplyConflictSentence(growth.rerender, e.message),
            'keel.reapply-conflict',
          ),
        );
      }
      throw e;
    }

    const proposals = refreshProposals(
      registry,
      stored.verticals.map((v) => v.id).filter((id) => !result.ran.has(id)),
      admitted.order.map((v) => v.id),
      effectiveTags(stored),
      effectiveTags(result.manifest),
    );
    const relinked = stored.peers.map((peer) => peer.ref);
    const notes = [
      ...admissionNotes(admitted),
      // This command re-renders nothing it is not asked to: a proposal
      // is taken up afterwards, dry run or not.
      ...proposals.map((proposal) => this.proposalNote(proposal)),
      ...(relinked.length > 0 && !sameTags(stored.projects, growth.projects)
        ? [relinkNote(growth.entrypoint, relinked)]
        : []),
    ];
    const report: InstallReport = {
      subject,
      changes: tree.changes(),
      actions: result.applyResult.actions.map((a) => a.description),
      committed: !command.dryRun,
      ...(notes.length > 0 ? { notes } : {}),
      ...(proposals.length > 0 ? { refreshProposals: proposals } : {}),
      ...(result.adapters.length > 0
        ? { resolvedAdapters: resolvedAdapters(result.adapters) }
        : {}),
      ...(result.applyResult.skippedHarnessElements
        ? { skippedHarnessElements: result.applyResult.skippedHarnessElements }
        : {}),
      ...(harnessRuns ? { diffs: workingTreeDiffs(this.deps.trees, command.cwd, tree) } : {}),
    };

    if (command.dryRun) return ok(report);

    await tree.commit();
    await this.deps.manifests.write(scopeRoot, result.manifest);
    const runDeferred = this.deps.runDeferred ?? runActions;
    await runDeferred({
      actions: result.applyResult.actions,
      cwd: command.cwd,
      logger: this.deps.logger,
      processes: this.deps.processes,
      dryRun: false,
    });
    return ok(report);
  }

  /**
   * The run, in the twin's order: each installed vertical with adapters
   * the grown tags newly match installs those alone; the harness
   * re-renders; the verticals the project lacks install, closed over
   * their prerequisites; every other vertical of the twin not placed
   * at a repository root replays what matched before for its actions.
   * Refused where the planner refuses what the project lacks.
   */
  private planOf(
    stored: ManifestV2,
    grown: ManifestV2,
    growth: GrowthPlan,
  ): Result<{
    readonly run: readonly RunStep[];
    readonly admitted: AdmittedSet;
    readonly twin: readonly string[];
  }> {
    const registry = this.deps.registry;
    const stack = registry.stack(growth.twin);
    if (stack === null) throw new Error(`growth named '${growth.twin}', which is not registered`);
    const harness = stored.verticals.some((v) => v.id === 'agent-harness');
    const twin = (harness ? stack : withoutHarness(stack)).verticals.map((v) => v.id);
    const planned = admitGrowth(registry, grown, growth);
    if (!planned.ok) return planned;
    const incoming = incomingOf(registry, growth, planned.value);
    const newly = new Map(growth.adapters.map((each) => [each.vertical, new Set(each.adapters)]));
    const order = placed(
      stored.verticals.map((v) => v.id),
      incoming.map((v) => v.id),
      twin,
    );
    const run = order.flatMap((id): RunStep[] => {
      const vertical = incoming.find((v) => v.id === id) ?? installedVertical(registry, id) ?? null;
      if (vertical === null) return [];
      const settles = twin.includes(id) && vertical.placement?.scope !== 'repository';
      if (growth.rerender.includes(id) || incoming.includes(vertical)) {
        return [{ vertical, settles: false }];
      }
      const only = newly.get(id);
      if (only !== undefined) return [{ vertical, only, settles }];
      return settles ? [{ vertical, settles }] : [];
    });
    return ok({ run, admitted: planned.value, twin });
  }

  /**
   * The refusal where no keel project is, worded as `keel add` words
   * it — but inside a monorepo product, whose root and services both
   * refuse this command, it points at the services, and at a project
   * growth refuses `word` on, and says why each refuses it too, rather
   * than sending the user there to be refused.
   */
  private async notInitialised(
    scopeRoot: string,
    cwd: string,
    line: string,
    word: string,
  ): Promise<DomainError> {
    const nearby = await nearbyProjects(this.deps, cwd);
    const aboveInProduct =
      nearby.above !== null &&
      (await enclosingProduct(this.deps, path.join(cwd, nearby.above))) !== null;
    const refusedAt = (named: string): string | null => {
      const manifest = nearby.manifests.get(named) ?? null;
      const service = (nearby.services ?? []).includes(named);
      const root = (manifest?.services.length ?? 0) > 0;
      const inProduct = named === nearby.above && aboveInProduct;
      if (service || root || inProduct) return ENTRYPOINT_IN_PRODUCT_REASON;
      const growth = manifest === null ? null : growthOf(this.deps.registry, manifest, word);
      // Growth's sentences open with an entrypoint's label or the word,
      // which go on from this one as they are.
      return growth?.kind === 'refused'
        ? growthRefusalError(this.deps.registry, growth.refusal).message
        : null;
    };
    return new DomainError(
      notInitialisedSentence(scopeRoot, nearby, line, 'keel new --stack=<id>', true, refusedAt),
      NOT_INITIALISED_CODE,
    );
  }

  /** {@link refreshProposalNote} for one proposal, its ids resolved, taken up by a later run. */
  private proposalNote(proposal: RefreshProposal): string {
    const byId = (id: string): Vertical[] => {
      const vertical = this.deps.registry.vertical(id);
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
      true,
    );
  }
}

/**
 * What `keel add entrypoint <word>` would do in `where`, a directory
 * holding a manifest, before it reads an answer: the verticals it
 * would install, by id, in the order it installs them — none where the
 * entrypoint is there already — or its refusal: inside a monorepo
 * product; growth's own; the planner's, of what growth installs. The
 * harness generation is left out: it stops every brownfield command
 * alike, and a status reports it once. What `keel.project-status`
 * reports of each back entrypoint, as `./add-module.ts`'
 * `moduleRefusal` is of `keel add module`.
 */
export function entrypointReading(
  registry: Registry,
  where: DirectoryScope,
  word: string,
): Result<readonly string[]> {
  const outOfScope = scopeRefusal(where);
  if (outOfScope !== null) return err(outOfScope);
  const stored = where.manifest;
  if (stored === null) throw new Error(`entrypointReading: no project at ${where.cwd}`);
  const growth = growthOf(registry, stored, word);
  if (growth.kind === 'refused') return err(growthRefusalError(registry, growth.refusal));
  if (growth.kind === 'present') return ok([]);
  const planned = admitGrowth(registry, grownManifest(stored, growth), growth);
  if (!planned.ok) return planned;
  return ok(incomingOf(registry, growth, planned.value).map((vertical) => vertical.id));
}

/**
 * The refusal of `keel add entrypoint` growth answers with, in the
 * words `../refusals.ts` puts it in, under its code — a vertical named
 * by its title, found in `registry`. Exported for a surface that shows
 * why an entrypoint cannot be added before the command is run.
 */
export function growthRefusalError(registry: Registry, refusal: GrowthRefusal): DomainError {
  switch (refusal.code) {
    case 'keel.unknown-entrypoint':
      return new DomainError(unknownEntrypointSentence(refusal.word), refusal.code);
    case 'keel.uncoverable-entrypoint':
      return new DomainError(
        uncoverableEntrypointSentence(
          refusal.entrypoint,
          refusal.reason,
          (refusal.drops ?? []).flatMap(
            ({ vertical }) => installedVertical(registry, vertical) ?? [],
          ),
        ),
        refusal.code,
      );
    case 'keel.incompatible':
      return new DomainError(
        incompatibleEntrypointSentence(refusal.entrypoint, refusal.rules),
        refusal.code,
      );
    case 'keel.contexts-need-rewiring':
      return new DomainError(
        contextsNeedRewiringSentence(
          refusal.entrypoint,
          refusal.contexts.map((context) => context.name),
        ),
        refusal.code,
      );
  }
}

/**
 * The command's refusal of where it runs: inside a monorepo product — at
 * its root, or below it — which records each service by its stack, and
 * refuses every entrypoint alike (`keel.wrong-scope`); null anywhere
 * else, a polyrepo service included.
 */
function scopeRefusal(where: DirectoryScope): DomainError | null {
  const place = productPlaceOf(where);
  return place === null ? null : new DomainError(entrypointScopeSentence(place), WRONG_SCOPE_CODE);
}

/** The project `stored` records, with the tags and `projects` `growth` folds in. */
function grownManifest(stored: ManifestV2, growth: GrowthPlan): ManifestV2 {
  return { ...stored, tags: growth.tags, projects: growth.projects };
}

/** The verticals growth installs, registered, in the twin's order. */
function lackingOf(registry: Registry, growth: GrowthPlan): readonly Vertical[] {
  return growth.verticals.flatMap((id) => registry.vertical(id) ?? []);
}

/**
 * What a run growth plans installs: what the planner adds for what the
 * twin names, then that, in the twin's order.
 */
function incomingOf(
  registry: Registry,
  growth: GrowthPlan,
  admitted: AdmittedSet,
): readonly Vertical[] {
  return [
    ...admitted.order.filter((v) => !growth.verticals.includes(v.id)),
    ...lackingOf(registry, growth),
  ];
}

/**
 * The verticals growth installs, admitted on `grown` — the harness it
 * re-renders planned as if it were not there yet, as `keel add --refresh`
 * plans one — closed over their prerequisites, or refused.
 */
function admitGrowth(
  registry: Registry,
  grown: ManifestV2,
  growth: GrowthPlan,
): Result<AdmittedSet> {
  return admit(
    registry,
    projectScope(registry, grown, growth.rerender),
    lackingOf(registry, growth),
  );
}

/**
 * One vertical of the run: installed or re-rendered whole; installing
 * `only` the adapters that newly match; and, where it `settles`,
 * replaying the adapters that do not install for their actions alone.
 */
interface RunStep {
  readonly vertical: Vertical;
  readonly only?: ReadonlySet<string>;
  readonly settles: boolean;
}

/**
 * `recorded`, the verticals a project records in its order, with
 * `incoming` placed among them where `twin` lists them: each before
 * the first recorded one the twin lists after it — one the twin does
 * not list takes the place of the next incoming one it does — and
 * after any other. Nothing recorded moves.
 */
function placed(
  recorded: readonly string[],
  incoming: readonly string[],
  twin: readonly string[],
): readonly string[] {
  const rankFrom = (from: number): number | undefined => {
    for (const next of incoming.slice(from)) {
      const rank = twin.indexOf(next);
      if (rank !== -1) return rank;
    }
    return undefined;
  };
  const rows = [...recorded];
  incoming.forEach((id, index) => {
    const own = rankFrom(index);
    const at =
      own === undefined
        ? -1
        : rankedIndex(
            rows.map((row) => (twin.includes(row) ? twin.indexOf(row) : undefined)),
            own,
          );
    rows.splice(at === -1 ? rows.length : at, 0, id);
  });
  return rows;
}

/**
 * The grown project's order, as the twin's (roadmap DR4): `verticals`,
 * the rows of `manifest` — as the run left it — with each new one
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
    const vertical = installedVertical(registry, id);
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

/**
 * Every adapter the run could install or re-render — what an early
 * answer check reads: the newly matching ones of a vertical installed
 * in part, and those of the verticals installed or re-rendered whole,
 * read together, since one of them may need what another promotes. A
 * vertical that only settles reads no answer.
 */
function reachable(run: readonly RunStep[], grown: ManifestV2): readonly Adapter[] {
  const whole = reachableAdapters(
    run.filter((step) => step.only === undefined && !step.settles).map((step) => step.vertical),
    effectiveTags(grown),
  );
  return run.flatMap((step) =>
    step.only === undefined
      ? whole.filter((adapter) => step.vertical.adapters.includes(adapter))
      : step.vertical.adapters.filter((adapter) => step.only?.has(adapter.id)),
  );
}

function hasAnswers(answers: PresetAnswers): boolean {
  return Object.values(answers).some((byQuestion) => Object.keys(byQuestion).length > 0);
}

function sameTags(a: readonly string[], b: readonly string[]): boolean {
  return [...a].sort().join(' ') === [...b].sort().join(' ');
}
