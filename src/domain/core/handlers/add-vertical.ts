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
 *      carry, naming the services that can (`keel.wrong-scope`) —
 *      unless no service could take it and those that could have it:
 *      then it is there already.
 *   3. Set a vertical already installed aside, with a note naming
 *      what re-renders it (`--reapply`): asking for what is there has
 *      one sensible reading, so it is Ok, not a refusal, and the rest
 *      of the set installs. So is one a monorepo service has from its
 *      product — the repository's version control, the image the
 *      product root builds — and one a product root's services have,
 *      each with a note saying where it is. Refuse a `--reapply` or a
 *      `--refresh` of one that is not installed.
 *   4. Read the plan with `convergeOf` (`../converge.ts`), the one
 *      reading every path that installs or re-renders verticals is to
 *      make. Under `--reapply`, its `reapply` request: what is named,
 *      and what `--refresh` names beside it, re-rendered in the order
 *      the project installed them. Otherwise its `add` request: the
 *      named set planned with the planner (`../planner.ts`), the
 *      reading the extras menu, `keel new --with` and this project's
 *      cards share (`../plan-refusal.ts`, `../add-readiness.ts`), on
 *      the scope and beside the siblings this handler reads: closed
 *      over its prerequisites — a vertical it needs that the project
 *      lacks is installed with it, and the report's first note names
 *      it — and ordered. A vertical it re-renders (`--refresh`) is
 *      planned as if it were not there yet, so it goes after what it
 *      reads and what decides its adapters. The assembly rules hold
 *      over the installed pieces and the incoming ones together,
 *      against every tag the run would add. A vertical the planner
 *      reads as unavailable here is refused — in a monorepo service,
 *      one whose place is the repository root, or that needs one,
 *      under `keel.wrong-scope` — one breaking a rule among them, and
 *      a tie between two sets of prerequisites. Either way the run
 *      appends what it records, and realizes the harness in run order.
 *   5. Refuse a supplied answer for a re-rendered adapter that has
 *      answers recorded — they are frozen — and one no adapter of the
 *      planned verticals could read, before a question is asked.
 *   6. Hand the plan to the converge run (`../converge-run.ts`'
 *      `converge`), against a Tree rooted at cwd: one
 *      `installVerticals` pass, the re-rendered verticals in the
 *      `reapply` posture. The pre-existing project files on disk live
 *      in the Tree as "real" reads — patches against them work, and a
 *      whole-file write over one is refused as `keel.path-conflict`
 *      naming the file (which is exactly the diagnostic we want); a
 *      patch target the user deleted is refused as `keel.path-missing`.
 *      Adopting or re-rendering the harness replays the project's
 *      earlier contributors, and each context it records, into the
 *      run's harness buffer before the finalize, and restamps the
 *      harness generation after.
 *   7. Refuse a supplied answer the run did not read — one for an
 *      installed vertical's adapter is frozen, any other is unknown
 *      (`../supplied-answers.ts`) — against the adapters it resolved,
 *      which only the staged run knows exactly: the run's check, before
 *      its harness pass. Only the adapters an answer is keyed to take
 *      it, so nothing else it names is ever recorded.
 *   8. The run asks the planner which installed verticals it changed
 *      the rendering of without re-rendering them, and reports each as
 *      a proposal — never a re-render of its own accord — worded, under
 *      dry-run, as this very run could take it up (`--refresh`), and
 *      otherwise as a later one does, after this handler's notes.
 *   9. Under dry-run: report the plan, commit nothing. A plan left
 *      empty — every vertical named was there already, and nothing
 *      is re-rendered — is reported as it stands, its notes saying
 *      why, before anything is staged: the project is not touched.
 *  10. Otherwise the run's one commit (`commitConverged`): the Tree,
 *      then the updated manifest, then the deferred actions — manifest
 *      before actions, as in the new-project handler, so a failed
 *      action leaves a coherent (files + manifest) pair and a re-run
 *      finds the vertical installed rather than installing it twice.
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
 * `keel.reapply-conflict`, naming what re-rendered in the order the
 * project installed it, before anything is committed. Tags the
 * previous apply promoted re-fold through set semantics, so they never
 * double; the vertical keeps its original `installedAt`.
 */

import type { Action } from '../../kernel/action.js';
import type { Handler } from '../../kernel/handler.js';
import { DomainError, err, ok, type Result } from '../../kernel/result.js';
import type { AddVerticalCommand, InstallReport } from '../../contract/commands.js';
import { effectiveTags, projectScopeRoot } from '../../contract/manifest.js';
import { NOT_INITIALISED_CODE, notInitialisedSentence } from '../../contract/nearby.js';
import { addScopeOf, productRootReading, type ProductRootReading } from '../add-readiness.js';
import { convergeOf } from '../converge.js';
import { commitConverged, converge } from '../converge-run.js';
import { harnessGenerationRefusal } from '../harness-generation.js';
import { admissionNotes, admit, type AdmittedSet } from '../plan-refusal.js';
import { reachableAdapters } from '../planner.js';
import {
  alreadyInstalledNote,
  elsewhereRefusal,
  inServicesNote,
  notInstalledSentence,
  placementRefusal,
  providedNote,
  providedNotInstalledSentence,
  ruleRefusal,
  VERTICAL_NOT_INSTALLED_CODE,
} from '../refusals.js';
import { listVerticalIds } from '../registry.js';
import { nearestVertical, unknownIdSentence } from '../nearest-id.js';
import { nearbyProjects, provisionsHere, scopeOf, siblingsOf, type Provision } from '../scope.js';
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
          notInitialisedSentence(
            scopeRoot,
            await nearbyProjects(this.deps, command.cwd),
            'keel add',
            'keel new --stack=<id>',
          ),
          NOT_INITIALISED_CODE,
        ),
      );
    }

    // At a product root, what the root cannot carry belongs to its
    // services: refused, naming them — or, where no service could take
    // it and those that could have it, there already, and set aside
    // below with a note naming them; a re-render of it is refused
    // below, as not installed here.
    const atRoot = (v: Vertical) => productRootReading(registry, where, v);
    const inServices: { readonly vertical: Vertical; readonly paths: readonly string[] }[] = [];
    for (const vertical of named.value) {
      const reading = atRoot(vertical);
      if (reading === null) continue;
      if (reading.kind === 'refused') return err(reading.refusal);
      inServices.push({ vertical, paths: reading.paths });
    }

    const reapply = command.reapply === true;
    const installed = new Set(stored.verticals.map((v) => v.id));

    // Only the command that brings a harness forward may run on a
    // project from another generation; everything else refuses
    // before a file moves. At a product root, whose services have the
    // harness, `keel add agent-harness` brings nothing forward — and a
    // run naming only what its services or the root itself have
    // already, re-rendering none of it, runs nothing there in any keel,
    // so its refusal names no keel to pin.
    const bringsHarness =
      named.value.length === 1 &&
      named.value[0]?.id === 'agent-harness' &&
      refresh.value.length === 0 &&
      inServices.length === 0;
    const theirs = named.value.filter((v) =>
      inServices.some((there) => there.vertical.id === v.id),
    );
    const ours = reapply
      ? []
      : named.value.filter((v) => installed.has(v.id) && !theirs.includes(v));
    const alreadyThere =
      refresh.value.length > 0 || theirs.length + ours.length < named.value.length
        ? undefined
        : ours.length === 0
          ? 'services'
          : theirs.length === 0
            ? 'root'
            : 'both';
    const stale = bringsHarness
      ? null
      : harnessGenerationRefusal(stored, commandLine(command), alreadyThere);
    if (stale !== null) return err(stale);

    // What a monorepo service has from its product (the repository's
    // version control, the image the root builds) is there, and
    // nothing here installs — or re-renders — it again.
    const provisions = provisionsHere(registry, where);
    const given = (v: Vertical) => provisions.find((provision) => provision.vertical.id === v.id);
    const member = where.product !== null && where.product.service !== null;
    for (const vertical of reapply ? named.value : []) {
      if (!installed.has(vertical.id))
        return err(this.notInstalled(vertical, 'reapply', given, member, atRoot));
    }
    // What the run installs: the verticals named, less those the
    // project has already. Each of those is set aside with a note
    // naming what does re-render it — unless `--refresh` re-renders it
    // in this very run. In a monorepo service, so is what the product
    // gives it, and at a product root what its services have: it is
    // there, and nothing here installs it again.
    const adding = reapply
      ? []
      : named.value.filter(
          (v) =>
            !installed.has(v.id) &&
            given(v) === undefined &&
            !inServices.some((there) => there.vertical.id === v.id),
        );
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
      if (!installed.has(vertical.id))
        return err(this.notInstalled(vertical, 'refresh', given, member, atRoot));
    }

    // A re-render admits nothing, so its rules are read here: each
    // vertical's own, against the tags the manifest records. What the
    // run installs is held to the rules by the planner below — its own
    // and the installed pieces', over the tags it would add.
    for (const vertical of reapply ? named.value : []) {
      const refusal = ruleRefusal(registry, vertical, stored.tags);
      if (refusal !== null) return err(refusal);
    }

    // The plan, `convergeOf`'s reading. A reapply re-renders what is
    // there — everything named, and what --refresh names beside it —
    // in the order the project installed it, so it has nothing to
    // admit. Otherwise the planner's reading, the one `keel new
    // --with`, the extras menu and this project's cards
    // (`keel.project-status`) share: the named set closed over what it
    // needs, in the order it installs — a vertical re-rendered beside
    // it planned as if it were not there yet, so it goes after whatever
    // it reads or whatever decides its adapters. The assembly rules
    // hold over what is installed and what comes in together: an
    // incoming vertical's own, and an installed one's, against every
    // tag the run would add. A vertical this project cannot carry is
    // refused here, in the words its card already showed — never
    // discovered inside an adapter — carrying the entrypoint to add
    // where that is what it lacks.
    const ids = (verticals: readonly Vertical[]) => verticals.map((v) => v.id);
    const scope = reapply ? null : addScopeOf(registry, where, ids(refresh.value));
    const siblings = reapply ? [] : siblingsOf(registry, where);
    const plan = convergeOf(
      registry,
      stored,
      scope === null
        ? { kind: 'reapply', verticals: ids([...named.value, ...refresh.value]) }
        : {
            kind: 'add',
            verticals: ids(adding),
            refresh: ids(refresh.value),
            scope,
            siblings,
          },
    );
    if (plan.kind === 'refused') {
      if (plan.refusal.kind !== 'plan') {
        throw new Error('keel add: a plan that grows no entrypoint was refused as growth');
      }
      return err(plan.refusal.error);
    }
    const order = plan.run.map((step) => step.vertical);

    // What the report says of the plan, which the plan does not carry:
    // what the planner added, and a move among the verticals named.
    // Read of the set `convergeOf` admitted, on the same scope, so it
    // cannot refuse, and needs no siblings, which only word a refusal.
    // Under `--refresh`, a list beside the set named in no order, its
    // notes speak of the verticals the run installs, and of a move only
    // among the ones named.
    let told: AdmittedSet | null = null;
    if (scope !== null) {
      const planned = admit(registry, scope, [...adding, ...refresh.value]);
      if (!planned.ok) {
        throw new Error('keel add: the set convergeOf admitted was refused on the same scope');
      }
      told = planned.value;
      if (refresh.value.length > 0) {
        const alone = admit(registry, scope, adding);
        told = {
          ...planned.value,
          order: planned.value.order.filter((v) => !refresh.value.some((r) => r.id === v.id)),
          reordered: planned.value.reordered && (!alone.ok || alone.value.reordered),
        };
      }
    }

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

    const subject = ids(named.value).join(' ');
    const already = [
      ...present.map(alreadyInstalledNote),
      ...provided.map((provision) => providedNote(provision.vertical, provision.by)),
      ...inServices.map((there) => inServicesNote(there.vertical, there.paths)),
    ];
    // Everything named is here already, and nothing is re-rendered:
    // the plan is empty, and the project is not touched — nothing is
    // staged, and the manifest is not written again.
    if (order.length === 0) {
      return ok({
        subject,
        changes: [],
        actions: [],
        committed: !command.dryRun,
        notes: already,
      });
    }

    const converged = await converge({
      ...this.deps,
      plan,
      stored,
      tree: this.deps.trees(command.cwd),
      cwd: command.cwd,
      answers: command.answers,
      // A re-rendered adapter with recorded answers resolves from them
      // without asking whatever the mode; one it newly resolves to is
      // asked like any first install.
      interactive: command.interactive,
      dryRun: command.dryRun,
      subject,
      // Where the harness runs — adopted, or re-rendered — every
      // vertical the run does not is replayed into its buffer, and so
      // is each context the project records.
      retrofit: { contexts: true },
      // Held against what the run resolved and what it read — exact,
      // and what the preview reports. Nothing is committed yet.
      check: (staged) =>
        strayAnswerRefusal(
          command.answers,
          resolvedAdapters(staged.adapters),
          history,
          staged.reads,
        ),
      // Staged and not written, a proposal is one this very run can
      // take up with --refresh; once written, a later run's.
      proposeForLater: !command.dryRun,
      // What the run adds unasked comes first: it is the note that
      // changes what is written (D1).
      notes: { before: [...(told === null ? [] : admissionNotes(told)), ...already], after: [] },
    });
    if (!converged.ok) return converged;
    if (!command.dryRun) await commitConverged(this.deps, converged.value);
    return ok(converged.value.report);
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

  /**
   * The refusal of a re-render (`verb`) of `vertical`, which this
   * project has not installed: in a monorepo service, one the product
   * gives it is the product root's to re-render, and one whose place is
   * the repository root is refused as `keel add` of it is
   * (`keel.wrong-scope`); at a product root, one the root cannot carry
   * is refused as `keel add` of it is, and one its services have with
   * the root's `elsewhere` refusal (`keel.wrong-scope`), naming them and
   * where each has it from — each where installing it here, the remedy
   * anywhere else, would be a no-op or a refusal of its own.
   */
  private notInstalled(
    vertical: Vertical,
    verb: 'reapply' | 'refresh',
    given: (v: Vertical) => Provision | undefined,
    member: boolean,
    atRoot: (v: Vertical) => ProductRootReading | null,
  ): DomainError {
    const reading = atRoot(vertical);
    if (reading !== null) {
      return reading.kind === 'refused'
        ? reading.refusal
        : elsewhereRefusal(this.deps.registry, vertical, reading.services);
    }
    const provision = given(vertical);
    if (provision !== undefined) {
      return new DomainError(
        providedNotInstalledSentence(vertical, provision.by, verb),
        VERTICAL_NOT_INSTALLED_CODE,
      );
    }
    if (member && vertical.placement?.scope === 'repository') {
      return placementRefusal(this.deps.registry, vertical);
    }
    return new DomainError(notInstalledSentence(vertical, verb), VERTICAL_NOT_INSTALLED_CODE);
  }
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
