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
 *      existing entrypoints alone — then, off the files, a context the
 *      manifest records consuming none that holds the gateway keel
 *      writes for a consumer: one added before keel recorded what a
 *      context consumes, which the replay would wire in standalone.
 *   2. **The plan**, `convergeOf`'s reading of the entrypoint
 *      (`../converge.ts`), growth's on the manifest with the
 *      entrypoint's tag and the twin's `projects` folded in before
 *      anything resolves. One run, in the twin's order: the verticals
 *      with adapters that newly match install those alone (`only`), in
 *      the `install` posture, so a file already there is refused as
 *      `keel.path-conflict` — the peer context's wiring for the new
 *      assembly among them; the harness re-renders; the verticals the
 *      project lacks install, closed over their prerequisites by the
 *      planner (`admit`) as any `keel add` is; and every other vertical
 *      of the twin — but one placed at a repository root, whose actions
 *      set up a repository the project has — settles: it replays its
 *      adapters that matched before for their deferred actions alone
 *      (`actionsOnly`), in its place in the run, so the grown project
 *      queues what its twin queues: the JVM's build wrapper and
 *      formatter (`gradle wrapper` and `spotlessApply`, or Maven's),
 *      `go mod tidy`, `pnpm install`, `cargo check`. No dev container
 *      is re-rendered: the dev environment's in-place upgrade writes
 *      the twin's definition on the grown tags. Then each context `keel
 *      add module` added is wired into the new assembly, in the order
 *      it was added — a context's wiring calls the wiring of the one it
 *      consumes — by a run of `bounded-context` as that command ran it,
 *      installing what newly matches (`GrowthPlan.modules`). Refused
 *      where the planner refuses what the project lacks.
 *   3. **Answers held early**, as `keel add` holds them: one for the
 *      re-rendered harness's recorded answers whatever the mode, and at
 *      a terminal every key no adapter the run could reach reads.
 *   4. **The run**, `../converge-run.ts`' `converge`: the plan staged;
 *      each supplied answer held once it is, exactly — the new
 *      bootstrap reads its sibling's identity answers, so one supplied
 *      for it is frozen; the verticals that did not run replayed into
 *      the harness buffer, but no context, since the run wires the ones
 *      `keel add module` added and the skeleton and the peer are
 *      `walking-skeleton`'s; the generation restamped; and what is new
 *      recorded at rank — the new `verticals` rows, `answers` keys and
 *      harness entries where the twin records them, before the first
 *      one it records later, the harness realized in the twin's order
 *      for that; nothing recorded moves.
 *   5. **Notes and report**: what the planner added, the refreshes
 *      proposed — each a later run's, since this command takes no
 *      `--refresh` — and which linked projects to link again: a linked
 *      project's record of what this one offers is its own manifest,
 *      which `keel link` writes and this command does not; the diffs
 *      show what re-rendered.
 *
 * Under a real run, the run's one commit (`commitConverged`): the
 * tree, then the manifest, then the deferred actions, as `keel add`
 * commits.
 */

import path from 'node:path';
import type { Action } from '../../kernel/action.js';
import type { Handler } from '../../kernel/handler.js';
import { DomainError, err, ok, type Result } from '../../kernel/result.js';
import type {
  AddEntrypointCommand,
  InstallReport,
  PresetAnswers,
} from '../../contract/commands.js';
import type { Adapter, Tree } from '../../contract/composition.js';
import type { Registry } from '../../contract/ports/registry.js';
import { effectiveTags, projectScopeRoot, type ManifestV2 } from '../../contract/manifest.js';
import { NOT_INITIALISED_CODE, notInitialisedSentence } from '../../contract/nearby.js';
import { addModuleInputs, CONTEXT_TAG } from '../adapters/added-context.js';
import {
  admitGrowth,
  convergeOf,
  grownManifest,
  incomingOf,
  type ConvergeRefusal,
  type ConvergeStep,
} from '../converge.js';
import { commitConverged, converge } from '../converge-run.js';
import { growthOf, type GrowthPlan, type GrowthRefusal } from '../growth.js';
import { harnessGenerationRefusal } from '../harness-generation.js';
import { contributedPaths } from '../install.js';
import { admissionNotes } from '../plan-refusal.js';
import { reachableAdapters } from '../planner.js';
import {
  contextsNeedRewiringSentence,
  ENTRYPOINT_IN_PRODUCT_REASON,
  entrypointPresentNote,
  incompatibleEntrypointSentence,
  entrypointScopeSentence,
  relinkNote,
  uncoverableEntrypointSentence,
  unknownEntrypointSentence,
  unrecordedConsumesSentence,
  WRONG_SCOPE_CODE,
} from '../refusals.js';
import { installedVertical } from '../registry.js';
import {
  enclosingProduct,
  nearbyProjects,
  productPlaceOf,
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
import { boundedContextVertical } from '../verticals/bounded-context.js';
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

    const tree = this.deps.trees(command.cwd);
    const unrecorded = await this.unrecordedConsumer(stored, growth, tree, command.cwd);
    if (unrecorded !== null) return err(unrecorded);

    const grown = grownManifest(stored, growth);
    const plan = convergeOf(registry, stored, { kind: 'entrypoint', word: command.entrypoint });
    if (plan.kind === 'refused') return err(convergeRefusalError(registry, plan.refusal));
    // The same reading `convergeOf` planned on: what the planner added
    // is the report's first note.
    const admitted = admitGrowth(registry, grown, growth);
    if (!admitted.ok) return admitted;

    // Answers are held before anything runs, as `keel add` holds them:
    // one for the re-rendered harness's recorded answers whatever the
    // mode, and at a terminal every stray key, before a question is
    // asked; the rest once the run is staged, exactly.
    if (hasAnswers(command.answers)) {
      const [early] = unusedAnswers(
        command.answers,
        resolvedAdapters(reachable(plan.run, grown)),
        history,
      );
      if (
        early !== undefined &&
        (command.interactive || early.code === REAPPLY_FROZEN_ANSWERS_CODE)
      ) {
        return err(new DomainError(early.message, early.code));
      }
    }

    const relinked = stored.peers.map((peer) => peer.ref);
    const converged = await converge({
      ...this.deps,
      plan,
      stored,
      from: grown,
      tree,
      cwd: command.cwd,
      answers: command.answers,
      interactive: command.interactive,
      dryRun: command.dryRun,
      subject,
      // Each context `keel add module` added is wired by the run; the
      // skeleton and the peer are `walking-skeleton`'s, which installs
      // in part — so the retrofit replays no context.
      retrofit: { line, contexts: false },
      check: (staged) =>
        hasAnswers(command.answers)
          ? strayAnswerRefusal(
              command.answers,
              resolvedAdapters(staged.adapters),
              history,
              staged.reads,
            )
          : null,
      // This command re-renders nothing it is not asked to: a proposal
      // is taken up afterwards, dry run or not.
      proposeForLater: true,
      notes: {
        before: admissionNotes(admitted.value),
        after:
          relinked.length > 0 && !sameTags(stored.projects, growth.projects)
            ? [relinkNote(growth.entrypoint, relinked)]
            : [],
      },
    });
    if (!converged.ok) return converged;
    if (!command.dryRun) await commitConverged(this.deps, converged.value);
    return ok(converged.value.report);
  }

  /**
   * The refusal of a context growing would wire in as the manifest
   * records it, consuming none, though `tree` holds the gateway keel
   * writes for a context consuming an earlier one (roadmap R.3a,
   * blocker 17): `consumes` has been recorded only since #164, and a
   * context `keel add module --consumes` added before it reads as
   * standalone. Its wiring into the new entrypoint would then call no
   * gateway its constructor takes, and not build. The gateway is found
   * by the paths `bounded-context` writes for the context consuming
   * each context recorded before it with a seam, less those it writes
   * for the context alone — the family's own reading of where a
   * gateway goes, so no family's layout is known here. Null where
   * every context growing wires in is as recorded.
   */
  private async unrecordedConsumer(
    stored: ManifestV2,
    growth: GrowthPlan,
    tree: Tree,
    cwd: string,
  ): Promise<DomainError | null> {
    const registry = this.deps.registry;
    const pathsOf = (name: string, consumes: string | null) =>
      contributedPaths({
        vertical: boundedContextVertical,
        manifest: {
          ...stored,
          tags: [...stored.tags, CONTEXT_TAG].sort(),
          answers: { ...stored.answers, ...addModuleInputs({ name, consumes }) },
        },
        prompt: this.deps.prompt,
        logger: this.deps.logger,
        cwd,
        templates: this.deps.templates,
        processes: this.deps.processes,
        registry,
      });
    const wired = new Set(growth.modules.map((module) => module.name));
    const seams: string[] = [];
    for (const module of stored.modules) {
      if (wired.has(module.name) && module.consumes === undefined) {
        const alone = new Set(await pathsOf(module.name, null));
        for (const consumed of seams) {
          const gateway = (await pathsOf(module.name, consumed)).filter((at) => !alone.has(at));
          if (gateway.some((at) => tree.exists(at))) {
            return new DomainError(
              unrecordedConsumesSentence(growth.entrypoint, module.name, consumed),
              'keel.contexts-need-rewiring',
            );
          }
        }
      }
      if (module.seam) seams.push(module.name);
    }
    return null;
  }

  /**
   * The refusal where no keel project is, worded as `keel add` words
   * it — but inside a monorepo product, whose root and services both
   * refuse this command, it points at the services, and at a project
   * growth refuses `word` on, or its files do ({@link unrecordedConsumer}),
   * and says why each refuses it too, rather than sending the user there
   * to be refused.
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
    const inProduct = (named: string): boolean =>
      (nearby.services ?? []).includes(named) ||
      (nearby.manifests.get(named)?.services.length ?? 0) > 0 ||
      (named === nearby.above && aboveInProduct);
    // Read ahead, files included, since the sentence asks for each
    // reason as it goes. Growth's sentences open with an entrypoint's
    // label or the word, which go on from this one as they are.
    const refusals = new Map<string, string>();
    for (const [named, manifest] of nearby.manifests) {
      if (manifest === null || inProduct(named)) continue;
      const growth = growthOf(this.deps.registry, manifest, word);
      if (growth.kind === 'refused') {
        refusals.set(named, growthRefusalError(this.deps.registry, growth.refusal).message);
      }
      if (growth.kind !== 'grows') continue;
      const at = path.join(cwd, named);
      const unrecorded = await this.unrecordedConsumer(manifest, growth, this.deps.trees(at), at);
      if (unrecorded !== null) refusals.set(named, unrecorded.message);
    }
    const refusedAt = (named: string): string | null =>
      inProduct(named) ? ENTRYPOINT_IN_PRODUCT_REASON : (refusals.get(named) ?? null);
    return new DomainError(
      notInitialisedSentence(scopeRoot, nearby, line, 'keel new --stack=<id>', true, refusedAt),
      NOT_INITIALISED_CODE,
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
 * alike, and a status reports it once. So are the files: a context
 * holding a gateway its record does not name is refused by the command
 * and its preview alone. What `keel.project-status` reports of each
 * back entrypoint, as `./add-module.ts`' `moduleRefusal` is of `keel
 * add module`.
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
 * The refusal of the plan `convergeOf` reads for growth: growth's own,
 * in {@link growthRefusalError}'s words, or the planner's of what it
 * installs, as both front doors word it.
 */
function convergeRefusalError(registry: Registry, refusal: ConvergeRefusal): DomainError {
  return refusal.kind === 'growth' ? growthRefusalError(registry, refusal.refusal) : refusal.error;
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

/**
 * Every adapter the run could install or re-render — what an early
 * answer check reads: the newly matching ones of a vertical installed
 * in part, and those of the verticals installed or re-rendered whole,
 * read together, since one of them may need what another promotes. A
 * vertical that only settles reads no answer.
 */
function reachable(run: readonly ConvergeStep[], grown: ManifestV2): readonly Adapter[] {
  const whole = reachableAdapters(
    run
      .filter((step) => step.posture === 'install' || step.posture === 'rerender')
      .map((step) => step.vertical),
    effectiveTags(grown),
  );
  return run.flatMap((step) =>
    step.posture === 'only'
      ? step.vertical.adapters.filter((adapter) => step.adapters?.includes(adapter.id))
      : whole.filter((adapter) => step.vertical.adapters.includes(adapter)),
  );
}

function hasAnswers(answers: PresetAnswers): boolean {
  return Object.values(answers).some((byQuestion) => Object.keys(byQuestion).length > 0);
}

function sameTags(a: readonly string[], b: readonly string[]): boolean {
  return [...a].sort().join(' ') === [...b].sort().join(' ');
}
