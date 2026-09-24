/**
 * Handler for `keel.add-vertical` — layer additional verticals onto an
 * existing keel project (the brownfield path), or re-render installed
 * ones from their recorded answers (`--reapply`, `--refresh`).
 *
 * Install pipeline:
 *   1. Resolve each named vertical by id from the registry; reject
 *      unknown ids with a list of available ones, and one named twice.
 *   2. Read where the directory sits (`../scope.ts`): its manifest —
 *      refuse to run if no project has been initialised under the
 *      project scope — the product above it, and at a product root its
 *      services'. At a product root, refuse what the root cannot
 *      carry, naming the services that can (`keel.wrong-scope`).
 *   3. Set a vertical already installed aside, with a note naming
 *      what re-renders it (`--reapply`): asking for what is there has
 *      one sensible reading, so it is Ok, not a refusal, and the rest
 *      of the set installs. So is one a monorepo service has from its
 *      product — the repository's version control, the image the
 *      product root builds — with a note saying where it comes from.
 *      Refuse a `--reapply` or a `--refresh` of one that is not
 *      installed.
 *   4. Plan the named set with the planner (`../planner.ts`), the
 *      reading the extras menu, `keel new --with` and this project's
 *      cards share (`../plan-refusal.ts`, `../add-readiness.ts`):
 *      closed over its prerequisites — a vertical it needs that the
 *      project lacks is installed with it, and the report's first note
 *      names it — and ordered. A vertical it re-renders (`--refresh`)
 *      is planned as if it were not there yet, so it goes after what
 *      it reads and what decides its adapters. The assembly rules hold
 *      over the installed pieces and the incoming ones together, against
 *      every tag the run would add. A vertical the planner reads as
 *      unavailable here is refused — in a monorepo service, one whose
 *      place is the repository root, or that needs one, under
 *      `keel.wrong-scope` — one breaking a rule among them, and a tie
 *      between two sets of prerequisites.
 *   5. Refuse a supplied answer for a re-rendered adapter that has
 *      answers recorded — they are frozen — and one no adapter of the
 *      planned verticals could read, before a question is asked.
 *   6. Install the plan against a Tree rooted at cwd, through the
 *      loop `keel new` installs each scope through
 *      (`installVerticals`), the re-rendered verticals in the
 *      `reapply` posture. The pre-existing project files on disk live
 *      in the Tree as "real" reads — patches against them work, and a
 *      whole-file write over one is refused as `keel.path-conflict`
 *      naming the file (which is exactly the diagnostic we want); a
 *      patch target the user deleted is refused as `keel.path-missing`.
 *      The run's harness buffer stays this handler's to finalize:
 *      adopting a harness replays the project's earlier contributors
 *      into it before the finalize, and restamps the harness
 *      generation after.
 *   7. Refuse a supplied answer the run did not read — one for an
 *      installed vertical's adapter is frozen, any other is unknown
 *      (`../supplied-answers.ts`) — against the adapters it resolved,
 *      which only the staged run knows exactly. Only the adapters an
 *      answer is keyed to take it, so nothing else it names is ever
 *      recorded.
 *   8. Ask the planner which installed verticals the run changed the
 *      rendering of without re-rendering them, and report each as a
 *      proposal — never a re-render of its own accord.
 *   9. Under dry-run: report the plan, commit nothing. A plan left
 *      empty — every vertical named was there already, and nothing
 *      is re-rendered — is reported as it stands, its notes saying
 *      why, before anything is staged: the project is not touched.
 *  10. Otherwise: commit the Tree, persist the updated manifest, then
 *      run the deferred actions — manifest before actions, as in the
 *      new-project handler, so a failed action leaves a coherent
 *      (files + manifest) pair and a re-run finds the vertical
 *      installed rather than installing it twice.
 *
 * A re-render differs in the guards and the apply posture, not in the
 * pipeline: the vertical must already be installed; an adapter the
 * manifest records answers for resolves from them without asking, and
 * a `--set` for it is refused — moving a sticky answer is deliberately
 * out of scope for this conservative v1 — while an adapter it newly
 * resolves to (a JVM image's release pipeline beside a native one)
 * is asked, and takes `--set`, as on a first install; and it runs in
 * the `reapply` apply mode: template-owned files are overwritten to
 * the pristine re-render (each reported with a unified diff against
 * the working tree), while a patch that would change an
 * already-patched file aborts the whole run with
 * `keel.reapply-conflict` before anything is committed. Tags the
 * previous apply promoted re-fold through set semantics, so they never
 * double; the vertical keeps its original `installedAt`.
 */

import type { Action } from '../../kernel/action.js';
import type { Handler } from '../../kernel/handler.js';
import { DomainError, err, ok, type Result } from '../../kernel/result.js';
import type {
  AddVerticalCommand,
  FileDiff,
  InstallReport,
  PresetAnswers,
  RefreshProposal,
} from '../../contract/commands.js';
import { effectiveTags, HARNESS_GENERATION, projectScopeRoot } from '../../contract/manifest.js';
import { productRootRefusal } from '../add-readiness.js';
import { harnessGenerationRefusal } from '../harness-generation.js';
import type { Tree } from '../../contract/ports/tree.js';
import { runActions } from '../actions.js';
import { ContributionConflictError, newOwnership, type HarnessContribution } from '../apply.js';
import { unifiedDiff } from '../diff.js';
import { finalizeHarness, installVerticals } from '../install.js';
import { retrofitHarness } from '../harness-retrofit.js';
import { admissionNotes, admit, type AdmittedSet } from '../plan-refusal.js';
import { reachableAdapters, refreshProposals } from '../planner.js';
import {
  alreadyInstalledNote,
  providedNote,
  refreshProposalNote,
  ruleRefusal,
} from '../refusals.js';
import { listVerticalIds } from '../registry.js';
import { nearestVertical, unknownIdSentence } from '../nearest-id.js';
import { planScopeOf, provisionsHere, scopeOf } from '../scope.js';
import {
  historyOf,
  REAPPLY_FROZEN_ANSWERS_CODE,
  resolvedAdapters,
  strayAnswerRefusal,
  unusedAnswers,
} from '../supplied-answers.js';
import type { Vertical } from '../../contract/composition.js';
import type { InstallDeps } from './deps.js';

/** The code `keel add` naming no vertical, or one twice, is refused with. */
export const INVALID_VERTICALS_CODE = 'keel.invalid-verticals';

/** Executes {@link AddVerticalCommand}s. */
export class AddVerticalHandler implements Handler<AddVerticalCommand> {
  constructor(private readonly deps: InstallDeps) {}

  supports(action: Action): action is AddVerticalCommand {
    return action.kind === 'keel.add-vertical';
  }

  async handle(command: AddVerticalCommand): Promise<Result<InstallReport>> {
    const registry = this.deps.registry;
    if (command.verticals.length === 0) {
      return err(
        new DomainError(
          `name a vertical to add; available: ${listVerticalIds(registry).join(', ')}`,
          INVALID_VERTICALS_CODE,
        ),
      );
    }
    const named = this.namedVerticals(command.verticals);
    if (!named.ok) return named;
    const refresh = this.namedVerticals([...new Set(command.refresh ?? [])]);
    if (!refresh.ok) return refresh;

    const scopeRoot = projectScopeRoot(command.cwd);
    const where = await scopeOf(this.deps, command.cwd);
    const stored = where.manifest;
    if (!stored) {
      return err(
        new DomainError(
          `no project initialised at ${scopeRoot} — run 'keel new --stack=<id>' first to create one`,
          'keel.not-initialised',
        ),
      );
    }

    for (const vertical of named.value) {
      const misplaced = productRootRefusal(registry, where, vertical);
      if (misplaced !== null) return err(misplaced);
    }

    // Only the command that brings a harness forward may run on a
    // project from another generation; everything else refuses
    // before a file moves.
    const bringsHarness =
      named.value.length === 1 &&
      named.value[0]?.id === 'agent-harness' &&
      refresh.value.length === 0;
    const stale = bringsHarness ? null : harnessGenerationRefusal(stored, commandLine(command));
    if (stale !== null) return err(stale);

    const reapply = command.reapply === true;
    const installed = new Set(stored.verticals.map((v) => v.id));
    for (const vertical of reapply ? named.value : []) {
      if (!installed.has(vertical.id)) {
        return err(
          new DomainError(
            `vertical '${vertical.id}' is not installed in this project — nothing to reapply; install it with 'keel add ${vertical.id}'`,
            'keel.vertical-not-installed',
          ),
        );
      }
    }
    // What the run installs: the verticals named, less those the
    // project has already. Each of those is set aside with a note
    // naming what does re-render it — unless `--refresh` re-renders it
    // in this very run. In a monorepo service, so is what the product
    // gives it (the repository's version control, the image the root
    // builds): it is there, and nothing here installs it again.
    const provisions = provisionsHere(registry, where);
    const given = (v: Vertical) => provisions.find((provision) => provision.vertical.id === v.id);
    const adding = reapply
      ? []
      : named.value.filter((v) => !installed.has(v.id) && given(v) === undefined);
    const present = reapply
      ? []
      : named.value.filter(
          (v) => installed.has(v.id) && !refresh.value.some((other) => other.id === v.id),
        );
    const provided = reapply
      ? []
      : named.value.flatMap((v) => {
          const provision = installed.has(v.id) ? undefined : given(v);
          return provision === undefined ? [] : [provision];
        });
    for (const vertical of refresh.value) {
      if (!installed.has(vertical.id)) {
        return err(
          new DomainError(
            `vertical '${vertical.id}' is not installed in this project — nothing to refresh; install it with 'keel add ${vertical.id}'`,
            'keel.vertical-not-installed',
          ),
        );
      }
    }

    // A re-render plans nothing, so its rules are read here: each
    // vertical's own, against the tags the manifest records. What the
    // run installs is held to the rules by the planner below — its own
    // and the installed pieces', over the tags it would add.
    for (const vertical of reapply ? named.value : []) {
      const refusal = ruleRefusal(registry, vertical, stored.tags);
      if (refusal !== null) return err(refusal);
    }

    // What re-renders: under --reapply, everything named; otherwise
    // what --refresh names — in the order the project installed them.
    const rerender = stored.verticals.flatMap(
      ({ id }) =>
        [...(reapply ? named.value : []), ...refresh.value].find((v) => v.id === id) ?? [],
    );

    // The planner's reading, the one `keel new --with`, the extras
    // menu and this project's cards (`keel.project-status`) share: the
    // named set closed over what it needs, in the order it installs —
    // a vertical re-rendered beside it planned as if it were not there
    // yet, so it goes after whatever it reads or whatever decides its
    // adapters. The assembly rules hold over what is installed and
    // what comes in together: an incoming vertical's own, and an
    // installed one's, against every tag the run would add. A vertical
    // this project cannot carry is refused here, in the words its card
    // already showed — never discovered inside an adapter. A reapply
    // re-renders what is there, so it has nothing to plan.
    let admitted: AdmittedSet | null = null;
    // What the report says of the plan: `--refresh` is a list beside
    // the set, named in no order, so its notes speak of the verticals
    // the run installs, and of a move only among the ones named.
    let told: AdmittedSet | null = null;
    if (!reapply) {
      const scope = planScopeOf(
        registry,
        where,
        rerender.map((v) => v.id),
      );
      const planned = admit(registry, scope, [...adding, ...refresh.value]);
      if (!planned.ok) return planned;
      admitted = planned.value;
      told = admitted;
      if (refresh.value.length > 0) {
        const alone = admit(registry, scope, adding);
        told = {
          ...admitted,
          order: admitted.order.filter((v) => !refresh.value.some((r) => r.id === v.id)),
          reordered: admitted.reordered && (!alone.ok || alone.value.reordered),
        };
      }
    }
    const order = admitted?.order ?? rerender;

    // Answers are held before anything runs against every adapter the
    // run could reach. One for a re-rendered vertical's recorded
    // answers is refused here whatever the mode; so is every stray key
    // — a typo, another family's adapter — at a terminal, before a
    // question is asked, and when nothing will run, since then the
    // reachable plan is the plan. A run that asks nothing loses nothing
    // by waiting for the exact plan instead, which is what it and the
    // preview word a refusal from: which adapters a closure runs
    // depends on the tags its first verticals add, so it is only known
    // once staged — as under `keel new --with`.
    const history = historyOf(registry, stored);
    if (hasAnswers(command.answers)) {
      const [early] = unusedAnswers(
        command.answers,
        resolvedAdapters(reachableAdapters(order, effectiveTags(stored))),
        history,
      );
      if (
        early !== undefined &&
        (command.interactive || order.length === 0 || early.code === REAPPLY_FROZEN_ANSWERS_CODE)
      ) {
        return err(new DomainError(early.message, early.code));
      }
    }

    const already = [
      ...present.map(alreadyInstalledNote),
      ...provided.map((provision) => providedNote(provision.vertical, provision.by)),
    ];
    // Everything named is here already, and nothing is re-rendered:
    // the plan is empty, and the project is not touched — nothing is
    // staged, and the manifest is not written again.
    if (order.length === 0) {
      return ok({
        subject: named.value.map((v) => v.id).join(' '),
        changes: [],
        actions: [],
        committed: !command.dryRun,
        notes: already,
      });
    }

    const now = this.deps.clock.nowIso();
    const tree = this.deps.trees(command.cwd);
    const ran = new Set(order.map((v) => v.id));
    const harnessRuns = ran.has('agent-harness');
    let result;
    const owners = newOwnership();
    const harness: HarnessContribution[] = [];
    try {
      result = await installVerticals({
        verticals: order,
        rerender: rerender.map((v) => v.id),
        manifest: stored,
        supplied: command.answers,
        tree,
        owners,
        harness,
        // A re-rendered adapter with recorded answers resolves from
        // them without asking whatever the mode; one it newly resolves
        // to is asked like any first install.
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
      // Held against what the run resolved and what it read — exact,
      // and what the preview reports. Nothing is committed yet.
      if (hasAnswers(command.answers)) {
        const stray = strayAnswerRefusal(
          command.answers,
          resolvedAdapters(result.adapters),
          history,
          result.reads,
        );
        if (stray !== null) return err(stray);
      }
      if (harnessRuns) {
        // The verticals of this run put their declarations in the
        // buffer as they installed; the ones installed before it are
        // replayed into it.
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
        });
      }
      const finalized = finalizeHarness({
        manifest: result.manifest,
        harness,
        tree,
        owners,
        logger: this.deps.logger,
        now: () => now,
      });
      result = {
        ...result,
        // Adopting or re-rendering the harness writes this keel's
        // layout, so it is what restamps the generation.
        manifest: harnessRuns
          ? { ...finalized.manifest, harnessGeneration: HARNESS_GENERATION }
          : finalized.manifest,
        applyResult: {
          ...result.applyResult,
          skills: finalized.skills,
          ...(finalized.skipped > 0 ? { skippedHarnessElements: finalized.skipped } : {}),
        },
      };
    } catch (e) {
      if (rerender.length > 0 && e instanceof ContributionConflictError) {
        return err(
          new DomainError(
            `reapply of '${rerender.map((v) => v.id).join("', '")}' refused: ${e.message}`,
            'keel.reapply-conflict',
          ),
        );
      }
      throw e;
    }

    const incoming = order.map((v) => v.id).filter((id) => !rerender.some((v) => v.id === id));
    const proposals = refreshProposals(
      registry,
      stored.verticals.map((v) => v.id).filter((id) => !ran.has(id)),
      incoming,
      effectiveTags(stored),
      effectiveTags(result.manifest),
    );
    const notes = [
      ...already,
      ...(told === null ? [] : admissionNotes(told)),
      ...proposals.map((proposal) => this.proposalNote(proposal, !command.dryRun)),
    ];
    const report: InstallReport = {
      subject: named.value.map((v) => v.id).join(' '),
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
      ...(rerender.length > 0 ? { diffs: this.workingTreeDiffs(command.cwd, tree) } : {}),
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
   * The verticals `ids` names, in the order named — or the refusal of
   * an id no vertical is registered under, or of one named twice.
   */
  private namedVerticals(ids: readonly string[]): Result<readonly Vertical[]> {
    const available = (): string => listVerticalIds(this.deps.registry).join(', ');
    const named: Vertical[] = [];
    for (const id of ids) {
      const vertical = this.deps.registry.vertical(id);
      if (!vertical) {
        return err(
          new DomainError(
            unknownIdSentence(
              'vertical',
              id,
              nearestVertical(this.deps.registry.verticals(), id),
              `available: ${available()}`,
            ),
            'keel.unknown-vertical',
          ),
        );
      }
      if (named.some((other) => other.id === id)) {
        return err(new DomainError(`vertical '${id}' is named twice`, INVALID_VERTICALS_CODE));
      }
      named.push(vertical);
    }
    return ok(named);
  }

  /** {@link refreshProposalNote} for one proposal, its ids resolved. */
  private proposalNote(proposal: RefreshProposal, committed: boolean): string {
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
      committed,
    );
  }

  /**
   * Unified diffs for every `modify` the staged tree carries, old side
   * read from the still-uncommitted working tree through a pristine
   * Tree over the same root.
   */
  private workingTreeDiffs(cwd: string, staged: Tree): readonly FileDiff[] {
    const pristine = this.deps.trees(cwd);
    const diffs: FileDiff[] = [];
    for (const change of staged.changes()) {
      if (change.kind !== 'modify') continue;
      const before = pristine.read(change.path);
      const after = staged.read(change.path);
      if (before === null || after === null) continue;
      const diff =
        looksBinary(before) || looksBinary(after)
          ? '(binary content differs)'
          : unifiedDiff(before.toString('utf8'), after.toString('utf8'));
      diffs.push({ path: change.path, diff });
    }
    return diffs;
  }
}

function looksBinary(content: Buffer): boolean {
  return content.includes(0);
}

function hasAnswers(answers: PresetAnswers): boolean {
  return Object.values(answers).some((byQuestion) => Object.keys(byQuestion).length > 0);
}

/** The command line a generation refusal names as the one to re-run. */
function commandLine(command: AddVerticalCommand): string {
  const refresh = command.refresh ?? [];
  return [
    'keel add',
    ...command.verticals,
    ...(command.reapply === true ? ['--reapply'] : []),
    ...(refresh.length > 0 ? [`--refresh ${refresh.join(',')}`] : []),
  ].join(' ');
}
