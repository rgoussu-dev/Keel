/**
 * Handler for `keel.new-project` — bootstrap a greenfield project
 * from a stack preset.
 *
 * Non-interactive pipeline (`--yes`, or any run with `interactive:
 * false`):
 *   1. Resolve the stack (the `--stack` flag, or the default preset
 *      when omitted).
 *   2. Refuse if a manifest already exists under the project scope —
 *      `keel new` is greenfield-only; brownfield is `keel add`.
 *   3. Build an empty v2 manifest seeded with the stack's tags and
 *      its declared peer projections.
 *   4. Install each vertical in stack order against a fresh Tree
 *      (`installVerticals`, the loop `keel add` installs through).
 *      Tags emitted by adapters via `tagsAdd` accumulate into the
 *      manifest snapshot the next vertical sees. A pre-supplied
 *      answer reaches only the adapters keyed to it (or borrowing
 *      from it), which record what they resolve — so a scope's
 *      manifest holds only the answers of adapters that ran there.
 *   5. Refuse a pre-supplied answer no adapter of the run read
 *      (`../supplied-answers.ts`) — dry run or not, so a preview
 *      never approves what the install would refuse.
 *   6. Under dry-run: report the plan, commit nothing.
 *   7. Otherwise: commit the Tree, persist the manifest, then run
 *      the deferred actions. Persisting the manifest *before*
 *      actions keeps the workspace recoverable if an action throws
 *      (e.g. `gradle wrapper` with no `gradle` on PATH) — files and
 *      manifest stay in sync.
 *
 * Composite pipeline (stacks declaring `services`): each service is
 * a full single-service install into its own subdirectory — own
 * Tree, own manifest — with its siblings' `projects` tags recorded
 * as `peers` so peer-conditional adapters resolve. Each service's
 * build system is its own choice (`--build-system path=id` pairs, or
 * one question per service interactively), recorded both as the
 * service manifest's `pkg.*` tag and on the product manifest's
 * service refs so root glue follows it. The repository
 * layout is the user's choice: under **monorepo** the services are
 * directories of one repository, so a vertical placed at a repository
 * root (`Vertical.placement` — `vcs`) is left out of them and runs
 * once at the product root, together with the composite stack's own
 * glue verticals; under **polyrepo** every service is a repository of
 * its own, keeps its own `vcs` run, and no shared root artifacts
 * exist. Each service's extras — `--with backend:persistence`, or one
 * named without a service that one service alone can take — are
 * planned onto that service's scope once the layout and its build
 * system are settled, as a single stack's are onto the preset. A
 * directory inside an existing product that it lists no service in, or
 * a service it lists that holds no project, is refused before anything
 * is asked (`keel.inside-product`), and a file
 * two scopes would both write is refused once every scope is staged,
 * before the plan is reported (`keel.cross-scope-write`). Commit
 * order matches the single flow, per scope: trees, then manifests,
 * then deferred actions (root first, then services in declaration
 * order).
 *
 * **Interactive pipeline** wraps either of the above in a wizard
 * rather than replacing them: `handle()` stages the full plan (every
 * question the chosen stack, layout, build system and adapters would
 * ask, in the same order they always resolved in) through a
 * {@link WizardPrompt}, then shows a review of the plan — proceed,
 * cancel, or jump back to any answered question and re-stage from
 * there. Nothing is committed until the plan is proceeded on; a
 * `--dry-run` interactive run reviews the same way but never commits.
 * Non-interactive runs never see the review step at all — the wizard
 * is purely additive over the two staging pipelines above, which is
 * why they stay data-in/data-out (`stage → {report, scopes}`) with
 * committing pulled out into `finish`.
 *
 * With no `--stack`, the stack itself is **discovered rather than
 * named**: a shape → language → framework → user-side adapters
 * drill-down (`../stack-wizard.ts`) narrows the catalog one question
 * at a time — widest first, and skipping any step whose answer is
 * already settled — and resolves to a registered stack id, so step 1
 * above runs on its result exactly as it runs on a flag. `--stack`
 * skips the drill-down and `--yes` skips every question, both as
 * before.
 */

import path from 'node:path';
import type { Action } from '../../kernel/action.js';
import type { Handler } from '../../kernel/handler.js';
import { DomainError, err, ok, type Result } from '../../kernel/result.js';
import type { InstallReport, NewProjectCommand, RepoLayout } from '../../contract/commands.js';
import {
  AGENT_HARNESS_TAG,
  decodeSelection,
  type Adapter,
  type DeferredAction,
  type Question,
  type QuestionChoice,
  type Tree,
  type Vertical,
} from '../../contract/composition.js';
import type { Asker, Prompt } from '../../contract/ports/prompt.js';
import {
  effectiveTags,
  emptyManifestV2,
  projectScopeRoot,
  type ManifestV2,
  type PeerLink,
  type ServiceRef,
} from '../../contract/manifest.js';
import type { TreeChange } from '../../contract/ports/tree.js';
import { runActions } from '../actions.js';
import {
  MODULITH_LAYOUT_TAG,
  PEER_CONTEXT_TAG,
  PEER_MODULE,
  SKELETON_MODULE,
  type ModuleLayoutOption,
} from '../adapters/module-layout.js';
import { assemblyRefusal } from '../compatibility.js';
import {
  emitsPeerContext,
  harnessActivatedBy,
  harnessLeftOut,
  harnessOptOutSentence,
  INVALID_AGENT_HARNESS_CODE,
  legalBuildSystems,
  legalModuleLayouts,
  offeredAsExtra,
  peerContextOffered,
  presetScope,
  productScopes,
  productIncludedNote,
  routeExtra,
  serviceIncludedNote,
  switchesHarnessOn,
  verticalOptions,
  withoutHarness,
  type ServicePlanScope,
} from '../dials.js';
import type { AnswerRead } from '../answers.js';
import { newOwnership } from '../apply.js';
import { installVerticals } from '../install.js';
import { admissionNotes, admit, type AdmittedSet } from '../plan-refusal.js';
import { nearestStack, nearestVertical, unknownIdSentence } from '../nearest-id.js';
import { stackTagsFor, type BuildSystemOption, type Stack } from '../stacks.js';
import {
  assemblableStacks,
  listStackIds,
  listStacks,
  listVerticals,
  verticalTitle,
  type StackSummary,
} from '../registry.js';
import {
  entrypointCombinations,
  entrypointStep,
  entrypointsLabel,
  frameworkChoices,
  frameworkLabel,
  languageChoices,
  languageLabel,
  normaliseEntrypoints,
  pathFor,
  pathOf,
  shapeChoices,
  shapeLabel,
  wizardPaths,
  type EntrypointStep,
  type ProjectShape,
  type WizardPath,
} from '../stack-wizard.js';
import {
  alreadyIncludedNote,
  crossScopeWriteError,
  routedExtraNote,
  unbuiltInServiceNote,
  type ScopeWriter,
} from '../refusals.js';
import { readiness } from '../planner.js';
import { PathConflictError, PathMissingError } from '../../contract/refusal.js';
import { NOTHING_INSTALLED, resolvedAdapters, strayAnswerRefusal } from '../supplied-answers.js';
import {
  enclosingProduct,
  memberScope,
  projectScope,
  provisionsFor,
  type PresetService,
} from '../scope.js';
import { WizardPrompt, type RecordedAnswer } from '../wizard-prompt.js';
import type { InstallDeps } from './deps.js';
import type { Registry } from '../../contract/ports/registry.js';
import type { Tag } from '../../contract/composition.js';
import type { VerticalOption } from '../../contract/queries.js';

/**
 * Question ids of the four **stack-level** dials — the choices the
 * install handler resolves itself rather than delegating to a
 * composition adapter.
 *
 * Exported because an answer to one of these has no home in
 * `manifest.answers`: it is a field of {@link NewProjectCommand}. A
 * front end that collects answers before dispatching (`keel ui`) has
 * to route each one back to the right field, and it reads these ids
 * to do it — see `domain/core/preview.ts`.
 */
export const LAYOUT_QUESTION_ID = 'layout';

/** @see LAYOUT_QUESTION_ID */
export const MODULE_LAYOUT_QUESTION_ID = 'moduleLayout';

/** @see LAYOUT_QUESTION_ID */
export const BUILD_SYSTEM_QUESTION_ID = 'buildSystem';

/**
 * Separates the build-system question id from the service path on a
 * composite install (`buildSystem:backend`), where the choice is per
 * service and one id would collide.
 */
export const SERVICE_QUESTION_SEPARATOR = ':';

/**
 * Question id of the wizard's stack question — the fourth
 * stack-level dial, and the same story as the three above: its answer
 * is `NewProjectCommand.stack`, not an entry in `manifest.answers`.
 */
export const STACK_QUESTION_ID = 'stack';

/** @see LAYOUT_QUESTION_ID */
export const PEER_CONTEXT_QUESTION_ID = 'withPeerContext';

/**
 * Question ids of the four drill-down steps that *produce* a stack
 * id (see `../stack-wizard.ts`).
 *
 * Unlike the dials above, none of these binds to a field of
 * {@link NewProjectCommand}: they are intermediate, and the only
 * thing they leave behind is the `stack` the last one resolves to.
 * A front end that collects answers therefore never sees them — it
 * sends a `stack` and the drill-down is skipped, exactly as `--stack`
 * skips it.
 */
export const SHAPE_QUESTION_ID = 'shape';

/** @see SHAPE_QUESTION_ID */
export const LANGUAGE_QUESTION_ID = 'language';

/** @see SHAPE_QUESTION_ID */
export const FRAMEWORK_QUESTION_ID = 'framework';

/** @see SHAPE_QUESTION_ID */
export const ENTRYPOINTS_QUESTION_ID = 'entrypoints';

/**
 * Question id of the wizard's extra-verticals step — a stack-level
 * dial like the four above, its answer being
 * {@link NewProjectCommand.extraVerticals} rather than an entry in
 * `manifest.answers`. A `multi-select`, so the answer is a
 * comma-joined list of vertical ids.
 */
export const EXTRA_VERTICALS_QUESTION_ID = 'extraVerticals';

/**
 * The first menu's escape hatch: pick a preset by id instead.
 *
 * The drill-down reaches every shipped preset now that composites
 * place themselves under the `fullstack` shape, so this is no longer
 * the only way to a product — it is the way past the narrowing for
 * someone who already knows the id they want, and the way to a
 * plugin's preset the tree could not place. The last shape choice
 * falls through to the flat list the wizard asked before any of this
 * existed.
 */
export const PICK_BY_ID = 'keel.by-id';

/**
 * `--stack` when omitted from a non-interactive run, and the preset
 * every interactive default composes to. Exported because
 * `keel.catalog` reports the drill-down's default language, and "the
 * language of *this* preset" is the only definition that keeps a
 * form's defaults and the terminal's the same.
 */
export const DEFAULT_STACK_ID = 'quarkus-cli';

/** The review step's own control-question choices, not staged answers. */
const PROCEED = 'proceed';
const CANCEL = 'cancel';
const EDIT_PREFIX = 'edit:';

const LAYOUT_QUESTION: Question = {
  id: LAYOUT_QUESTION_ID,
  prompt: 'Repository layout',
  doc: 'How the services of this product live in version control.',
  choices: [
    {
      value: 'monorepo',
      label: 'monorepo — one repository, services as subdirectories',
      doc: 'One PR/CI spans every service; cross-service changes land atomically; the API contract lives in one place.',
    },
    {
      value: 'polyrepo',
      label: 'polyrepo — one repository per service',
      doc: 'Independent deploy cadence and access control per service; cross-service changes become one PR per repository.',
    },
  ],
  default: 'monorepo',
  memory: 'repeat',
};

/** One scope (product root or service) staged by a composite install. */
interface StagedScope {
  /** Path prefix for report changes; '' for the product root. */
  readonly prefix: string;
  readonly skippedHarnessElements: number;
  readonly cwd: string;
  readonly tree: Tree;
  readonly manifest: ManifestV2;
  readonly actions: readonly DeferredAction[];
  /** Every adapter the scope's verticals resolved to, in install order. */
  readonly adapters: readonly Adapter[];
  /** The supplied answers the scope's adapters read. */
  readonly reads: readonly AnswerRead[];
  /** Path (relative to {@link cwd}) → the adapter that last wrote it. */
  readonly writers: ReadonlyMap<string, string>;
}

/**
 * The extras a single-service run installs, and what it was asked for
 * that the preset carries of its own.
 */
interface ResolvedExtras {
  /** The extras, closed over their prerequisites and in install order. */
  readonly admitted: AdmittedSet;
  /**
   * The preset's own verticals `--with` named, in the order named:
   * dropped from the request — the scaffold has them either way — with
   * a note each.
   */
  readonly present: readonly Vertical[];
}

/** A fully-staged plan: nothing committed yet, the caller's to `finish`. */
interface StagedPlan {
  readonly report: InstallReport;
  readonly scopes: readonly StagedScope[];
}

/** What the user chose at the review step. */
type ReviewDecision =
  | { readonly kind: 'proceed' }
  | { readonly kind: 'cancel' }
  | { readonly kind: 'edit'; readonly index: number };

/** Executes {@link NewProjectCommand}s. */
export class NewProjectHandler implements Handler<NewProjectCommand> {
  constructor(private readonly deps: InstallDeps) {}

  supports(action: Action): action is NewProjectCommand {
    return action.kind === 'keel.new-project';
  }

  async handle(command: NewProjectCommand): Promise<Result<InstallReport>> {
    const wizard = new WizardPrompt(this.deps.prompt);
    for (;;) {
      wizard.beginAttempt();
      const attempt = await this.stage(command, wizard);
      if (!attempt.ok) return attempt;
      if (!command.interactive) return this.finish(command, attempt.value);

      const decision = await this.review(wizard, attempt.value.report);
      if (decision.kind === 'proceed') return this.finish(command, attempt.value);
      if (decision.kind === 'cancel') return err(cancelledError());
      wizard.prepareEdit(decision.index);
    }
  }

  /** Resolves the stack and runs the matching staging pipeline. Commits nothing. */
  private async stage(command: NewProjectCommand, prompt: Prompt): Promise<Result<StagedPlan>> {
    // Before a question is asked: nothing about the stack changes it.
    const product = await enclosingProduct(this.deps, command.cwd);
    if (product !== null && product.service === null) {
      return err(insideProduct(path.relative(command.cwd, product.root)));
    }
    // A service the product lists, emptied: scaffolded here, it would
    // be a repository root inside the product's repository — a second
    // history's hooks and changelog — of whatever stack was named,
    // whatever the product records. One that still holds its manifest
    // is refused below as already initialised.
    if (
      product !== null &&
      product.service !== null &&
      (await this.deps.manifests.read(projectScopeRoot(command.cwd)).catch(() => null)) === null
    ) {
      return err(insideProductService(path.relative(command.cwd, product.root), product.service));
    }
    const resolved = await this.resolveStackId(command, prompt);
    if (!resolved.ok) return resolved;
    const registered = this.deps.registry.stack(resolved.value);
    if (!registered) return err(unknownStackError(this.deps.registry, resolved.value));
    // The harness before any other dial, as `keel.dials` settles it
    // (`harnessOptional`): every menu after this is read over the
    // preset as it will be installed.
    if (command.agentHarness === false && registered.services) {
      return err(
        new DomainError(
          '--no-agent-harness applies to single-service stacks: every service of a composite product carries the agent harness',
          INVALID_AGENT_HARNESS_CODE,
        ),
      );
    }
    if (command.agentHarness === false && command.extraVerticals?.includes('agent-harness')) {
      return err(
        new DomainError(harnessOptOutSentence('agent-harness'), INVALID_AGENT_HARNESS_CODE),
      );
    }
    const stack = command.agentHarness === false ? withoutHarness(registered) : registered;
    if (command.agentHarness === false && harnessActivatedBy(stack)) {
      return err(
        new DomainError(
          `--no-agent-harness cannot be used with stack '${stack.id}': its tags or remaining verticals activate ${AGENT_HARNESS_TAG}`,
          INVALID_AGENT_HARNESS_CODE,
        ),
      );
    }
    const staged = stack.services
      ? await this.stageComposite(command, stack, prompt)
      : await this.stageSingle(command, stack, prompt);
    if (!staged.ok) return staged;
    // Only now is the plan known: an adapter resolves against the tags
    // the verticals before it promoted, in whichever scope it lands —
    // and which answer each read, a sibling's or its own.
    const plan = resolvedAdapters(staged.value.scopes.flatMap((scope) => scope.adapters));
    const stray = strayAnswerRefusal(
      command.answers,
      plan,
      NOTHING_INSTALLED,
      staged.value.scopes.flatMap((scope) => scope.reads),
    );
    if (stray !== null) return err(stray);
    return ok({
      ...staged.value,
      report: { ...staged.value.report, ...(plan.length > 0 ? { resolvedAdapters: plan } : {}) },
    });
  }

  /** Commits a staged plan unless the run is a dry-run, and unwraps it to the report. */
  private async finish(
    command: NewProjectCommand,
    attempt: StagedPlan,
  ): Promise<Result<InstallReport>> {
    if (!command.dryRun) await this.commitScopes(attempt.scopes);
    return ok(attempt.report);
  }

  /**
   * Resolves the stack id: the `--stack` flag when supplied, the
   * guided drill-down otherwise, the default preset when neither
   * interactive nor supplied.
   *
   * The single most consequential choice a `keel new` run makes, and
   * a flat list of 34 ids is a poor way to make it — so interactively
   * it is asked as up to four narrowing questions rather than one
   * wide one: **shape → language → framework → user-side adapters**,
   * each menu derived from the tags of the stacks still reachable
   * from the answers already given (see `../stack-wizard.ts`). The
   * answer is always a registered stack id, so everything downstream
   * of here cannot tell the two routes apart.
   */
  private async resolveStackId(
    command: NewProjectCommand,
    prompt: Prompt,
  ): Promise<Result<string>> {
    if (command.stack !== undefined) return ok(command.stack);
    if (!command.interactive) return ok(DEFAULT_STACK_ID);
    return this.drillDown(prompt);
  }

  /**
   * The guided drill-down, one question at a time — **shape →
   * language → framework → user-side adapters**, widest first.
   *
   * Each step is skipped when it has nothing to ask: a shape reaching
   * one language, a language reaching one framework, or a framework
   * reaching one entrypoint set has already answered the question by
   * existing. That is what keeps a front end from being asked "which
   * framework?" over a menu of one, and what makes the browser shape
   * a single question end to end.
   *
   * The step numbers count what is actually asked rather than what
   * the four axes are, so the run never claims a step it then skips.
   */
  private async drillDown(prompt: Prompt): Promise<Result<string>> {
    // Every menu below narrows within these, so filtering the input is
    // what guards the whole drill-down: a preset no setting of its
    // dials can assemble legally is absent from the shape list, the
    // language list, the framework list and the adapter list at once,
    // and from the flat escape hatch too. One filter, because they are
    // all one walk over the same set.
    const paths = wizardPaths(assemblableStacks(this.deps.registry));
    this.deps.logger.info(
      'keel new: no --stack, so let us find one — what you are building, then the language, the framework, and the way in. Each answer narrows the next, and a step with one answer is skipped.',
    );
    let asked = 0;
    const ask = (question: Question): Promise<string> =>
      prompt.ask(
        { ...question, prompt: `Step ${++asked} · ${question.prompt}` },
        NEW_PROJECT_ASKER,
      );

    const shape = (await ask(shapeQuestion(paths))).trim();
    if (shape === PICK_BY_ID) {
      return ok((await ask(stackQuestion(listStacks(this.deps.registry)))).trim());
    }

    const languages = languageChoices(paths, shape as ProjectShape);
    const language =
      languages.length <= 1
        ? (languages[0]?.value ?? '')
        : (await ask(languageQuestion(paths, shape as ProjectShape, languages))).trim();

    const frameworks = frameworkChoices(paths, shape as ProjectShape, language);
    const framework =
      frameworks === null
        ? null
        : (await ask(frameworkQuestion(frameworks, defaultFramework(paths, frameworks)))).trim();

    const step = entrypointStep(
      paths,
      shape as ProjectShape,
      language,
      framework,
      DEFAULT_STACK_ID,
    );
    const entrypoints =
      step === null
        ? (entrypointCombinations(paths, shape as ProjectShape, language, framework)[0] ?? [])
        : normaliseEntrypoints(await ask(entrypointQuestion(step, language)));

    const chosen = pathFor(paths, shape as ProjectShape, language, framework, entrypoints);
    if (chosen === null) return err(noSuchCombination(shape, language, framework, entrypoints));
    // The composed stack is the surprising half of a two-entrypoint
    // pick — "both" means one hexagon with two ways in, not two
    // services — so the run says which preset it landed on rather
    // than leaving it to be inferred from the file list.
    this.deps.logger.info(
      `keel new: ${[
        shapeLabel(chosen.shape).split(' — ')[0],
        languageLabel(language),
        chosen.framework === null || chosen.framework === ''
          ? null
          : frameworkLabel(chosen.framework),
        entrypointsLabel(entrypoints),
      ]
        .filter((part) => part !== null && part !== '')
        .join(' · ')} → ${chosen.stackId}`,
    );
    return ok(chosen.stackId);
  }

  /**
   * Shows the staged plan and asks the user to proceed, cancel, or
   * jump back to a previously-answered question. Every recorded
   * answer becomes a "change this" choice, described by its own
   * question's prompt and doc so the review reads like a plan
   * summary rather than a bare list of ids.
   */
  private async review(wizard: WizardPrompt, report: InstallReport): Promise<ReviewDecision> {
    this.printPlan(report);
    const choices: QuestionChoice[] = [
      {
        value: PROCEED,
        label: 'Proceed — scaffold as shown above',
        doc: 'Commit the plan above.',
      },
      ...wizard.recorded.map((r, index) => ({
        value: `${EDIT_PREFIX}${index}`,
        label: `Change: ${r.question.prompt} = ${answerLabel(r)}`,
        doc: r.question.doc,
      })),
      {
        value: CANCEL,
        label: 'Cancel — write nothing',
        doc: 'Abort the run; nothing is written.',
      },
    ];
    const answer = await wizard.askDirect({
      id: 'keel.review',
      prompt: 'Review the plan above',
      doc: 'Pick "Change: …" to jump back to that question and re-answer it — every question asked after it is re-resolved, since a later choice may depend on it.',
      choices,
      default: PROCEED,
      memory: 'repeat',
    });
    if (answer === PROCEED) return { kind: 'proceed' };
    if (answer === CANCEL) return { kind: 'cancel' };
    return { kind: 'edit', index: Number(answer.slice(EDIT_PREFIX.length)) };
  }

  private printPlan(report: InstallReport): void {
    this.deps.logger.info(`keel new ${report.subject}: planned changes`);
    for (const note of report.notes ?? []) this.deps.logger.info(`  note: ${note}`);
    for (const c of report.changes) {
      const tag = c.kind === 'create' ? '+' : c.kind === 'modify' ? '~' : '-';
      this.deps.logger.info(`  ${tag} ${c.path}`);
    }
    for (const a of report.actions) this.deps.logger.info(`  ! ${a}`);
  }

  private async stageSingle(
    command: NewProjectCommand,
    stack: Stack,
    prompt: Prompt,
  ): Promise<Result<StagedPlan>> {
    const scopeRoot = projectScopeRoot(command.cwd);
    if ((await this.deps.manifests.read(scopeRoot)) !== null) {
      return err(alreadyInitialised(scopeRoot));
    }
    const named = Object.keys(command.services ?? {});
    if (named.length > 0) {
      return err(
        new DomainError(
          `stack '${stack.id}' has no services — name its extras in --with without a service path (got '${named[0] ?? ''}:…')`,
          INVALID_EXTRAS_CODE,
        ),
      );
    }

    const buildTag = await this.resolveBuildSystem(command, stack, prompt);
    if (!buildTag.ok) return buildTag;

    const layoutTag = await this.resolveModuleLayout(command, stack, buildTag.value, prompt);
    if (!layoutTag.ok) return layoutTag;

    const peerTag = await this.resolveWithPeerContext(
      command,
      stack,
      buildTag.value,
      layoutTag.value,
      prompt,
    );
    if (!peerTag.ok) return peerTag;

    // Last of the stack dials, because the menu is pruned against the
    // tag set the other three settle — a vertical no adapter here can
    // cover must not be on it.
    const extras = await this.resolveExtraVerticals(command, stack, prompt, [
      ...stackTagsFor(stack, buildTag.value, layoutTag.value),
      ...(peerTag.value ? [peerTag.value] : []),
    ]);
    if (!extras.ok) return extras;
    const { admitted, present } = extras.value;

    const legal = assemblyIsLegal(stack, admitted.order, [
      ...stackTagsFor(stack, buildTag.value, layoutTag.value),
      ...(peerTag.value ? [peerTag.value] : []),
    ]);
    if (!legal.ok) return legal;

    const now = this.deps.clock.nowIso();
    const staged = await this.stageStack({
      prefix: '',
      cwd: command.cwd,
      stack,
      buildTag: buildTag.value,
      layoutTag: layoutTag.value,
      peerTag: peerTag.value,
      peers: [],
      services: [],
      member: false,
      extraVerticals: admitted.order,
      command,
      now,
      prompt,
    });

    // What the run adds unasked comes first: it is the note that
    // changes what is written (D1).
    const notes = [
      ...admissionNotes(admitted),
      ...present.map((vertical) => alreadyIncludedNote(vertical, stack.id)),
    ];
    const report: InstallReport = {
      subject: stack.id,
      changes: staged.tree.changes(),
      actions: staged.actions.map((a) => a.description),
      committed: !command.dryRun,
      ...(notes.length > 0 ? { notes } : {}),
      ...(staged.skippedHarnessElements > 0
        ? { skippedHarnessElements: staged.skippedHarnessElements }
        : {}),
    };

    return ok({ report, scopes: [staged] });
  }

  private async stageComposite(
    command: NewProjectCommand,
    stack: Stack,
    prompt: Prompt,
  ): Promise<Result<StagedPlan>> {
    const resolved: PresetService[] = [];
    for (const service of stack.services ?? []) {
      const serviceStack = this.deps.registry.stack(service.stack);
      if (!serviceStack) {
        return err(
          new DomainError(
            `stack '${stack.id}': service '${service.path}' references unknown stack '${service.stack}'`,
            'keel.unknown-stack',
          ),
        );
      }
      if (serviceStack.services) {
        return err(
          new DomainError(
            `stack '${stack.id}': service '${service.path}' references composite stack '${service.stack}' — composite stacks cannot nest`,
            'keel.invalid-stack',
          ),
        );
      }
      resolved.push({
        path: service.path,
        stack: serviceStack,
        extraVerticals: service.extraVerticals ?? [],
      });
    }

    if (command.moduleLayout !== undefined) {
      return err(
        new DomainError(
          `stack '${stack.id}' is composite — its services scaffold on each service stack's default module layout, so --module-layout does not apply`,
          'keel.invalid-module-layout',
        ),
      );
    }

    if (command.withPeerContext === true) {
      return err(
        new DomainError(
          `stack '${stack.id}' is composite — its services scaffold on each service stack's default module layout, so --with-peer-context does not apply`,
          'keel.invalid-peer-context',
        ),
      );
    }

    // What `--with` names, read before a question is asked: the form
    // of each entry and the ids it names say nothing about the dials.
    const named = this.namedExtras(command, stack, resolved);
    if (!named.ok) return named;
    const { present, bare } = named.value;

    const layout = await this.resolveLayout(command, stack, prompt);
    if (!layout.ok) return layout;

    const builds = await this.resolveServiceBuildSystems(command, stack, resolved, prompt);
    if (!builds.ok) return builds;

    const rootScope = projectScopeRoot(command.cwd);
    if ((await this.deps.manifests.read(rootScope)) !== null) {
      return err(alreadyInitialised(rootScope));
    }
    for (const service of resolved) {
      const scope = projectScopeRoot(path.join(command.cwd, service.path));
      if ((await this.deps.manifests.read(scope)) !== null) {
        return err(alreadyInitialised(scope));
      }
    }

    const now = this.deps.clock.nowIso();
    const monorepo = layout.value === 'monorepo';

    // Last of the dials, as on a single stack: each service's extras
    // are planned onto the scope its build system and the layout
    // settle, before a single adapter question.
    const extras = this.resolveServiceExtras(
      command,
      stack,
      productScopes(
        this.deps.registry,
        stack,
        resolved,
        (servicePath) => builds.value.get(servicePath)?.tag ?? null,
        monorepo,
      ),
      bare,
      monorepo,
    );
    if (!extras.ok) return extras;

    const scopes: StagedScope[] = [];

    if (monorepo) {
      scopes.push(
        await this.stageStack({
          prefix: '',
          cwd: command.cwd,
          stack,
          buildTag: null,
          layoutTag: null,
          peers: [],
          services: resolved.map((s) => {
            const chosen = builds.value.get(s.path);
            return {
              path: s.path,
              stack: s.stack.id,
              ...(chosen ? { buildSystem: chosen.id } : {}),
            };
          }),
          member: false,
          command,
          now,
          prompt,
        }),
      );
    }

    for (const service of resolved) {
      scopes.push(
        await this.stageStack({
          prefix: service.path,
          cwd: path.join(command.cwd, service.path),
          stack: service.stack,
          buildTag: builds.value.get(service.path)?.tag ?? null,
          layoutTag: defaultLayoutTag(service.stack),
          peers: peersFor(service, resolved),
          services: [],
          member: monorepo,
          extraVerticals: [
            ...service.extraVerticals,
            ...(extras.value.admitted.get(service.path)?.order ?? []),
          ],
          command,
          now,
          prompt,
        }),
      );
    }

    // Each scope staged into a Tree of its own, so a file two of them
    // write is nobody's conflict until this: without it, the one
    // committed last would win. Here, and not at commit, so a preview
    // and a dry run refuse it as the install does.
    const clash = crossScopeWrite(scopes);
    if (clash !== null) return err(clash);

    const changes: TreeChange[] = scopes.flatMap((scope) =>
      scope.tree
        .changes()
        .map((c) => (scope.prefix === '' ? c : { ...c, path: `${scope.prefix}/${c.path}` })),
    );
    const actions = scopes.flatMap((scope) =>
      scope.actions.map((a) =>
        scope.prefix === '' ? a.description : `${scope.prefix}: ${a.description}`,
      ),
    );
    const skipped = scopes.reduce((total, scope) => total + scope.skippedHarnessElements, 0);
    const notes = [
      ...present.map((vertical) => alreadyIncludedNote(vertical, stack.id)),
      ...extras.value.notes,
      ...(monorepo ? this.unbuiltNotes(scopes) : []),
    ];
    const report: InstallReport = {
      subject: stack.id,
      changes,
      actions,
      committed: !command.dryRun,
      ...(notes.length > 0 ? { notes } : {}),
      ...(skipped > 0 ? { skippedHarnessElements: skipped } : {}),
    };

    return ok({ report, scopes });
  }

  /**
   * What `--with` names on a composite product, checked for its form
   * before any question is asked: each service path the product lists
   * one at (`services`), every id registered, none named twice for one
   * service or twice bare, and the two forms not mixed — one command
   * names its extras with a service each or with none. Of the bare
   * ids, the product's own are set aside (`present`, a note each, as
   * on a single stack) and the rest are sent to a service once the
   * dials are settled (`bare`).
   */
  private namedExtras(
    command: NewProjectCommand,
    stack: Stack,
    services: readonly PresetService[],
  ): Result<{ readonly present: readonly Vertical[]; readonly bare: readonly Vertical[] }> {
    const registry = this.deps.registry;
    const paths = services.map((service) => service.path);
    const perService = Object.entries(command.services ?? {});
    for (const [servicePath, extras] of perService) {
      if (!paths.includes(servicePath)) {
        return err(
          new DomainError(
            `stack '${stack.id}' has no service '${servicePath}' — services: ${paths.join(', ')}`,
            INVALID_EXTRAS_CODE,
          ),
        );
      }
      const twice = extras.extraVerticals.find(
        (id, index) => extras.extraVerticals.indexOf(id) !== index,
      );
      if (twice !== undefined) {
        return err(
          new DomainError(
            `--with names vertical '${twice}' twice for ${servicePath}`,
            INVALID_EXTRAS_CODE,
          ),
        );
      }
    }
    const requested = command.extraVerticals ?? [];
    if (requested.length > 0 && perService.some(([, extras]) => extras.extraVerticals.length > 0)) {
      return err(
        new DomainError(
          `--with names some verticals with a service and some without — on stack '${stack.id}' name each with its service, as 'path:id' pairs (e.g. --with ${paths[0] ?? 'backend'}:persistence), or none with one`,
          INVALID_EXTRAS_CODE,
        ),
      );
    }
    const twice = requested.find((id, index) => requested.indexOf(id) !== index);
    if (twice !== undefined) {
      return err(new DomainError(`--with names vertical '${twice}' twice`, INVALID_EXTRAS_CODE));
    }
    const present: Vertical[] = [];
    const bare: Vertical[] = [];
    for (const id of [...requested, ...perService.flatMap(([, extras]) => extras.extraVerticals)]) {
      const vertical = registry.vertical(id);
      if (vertical === null) {
        return err(
          new DomainError(
            unknownIdSentence(
              'vertical',
              id,
              nearestVertical(registry.verticals(), id),
              `available: ${listVerticals(registry)
                .map((v) => v.id)
                .join(', ')}`,
            ),
            'keel.unknown-vertical',
          ),
        );
      }
      if (!requested.includes(id)) continue;
      if (stack.verticals.some((own) => own.id === id)) present.push(vertical);
      else bare.push(vertical);
    }
    return ok({ present, bare });
  }

  /**
   * Each service's extras, planned onto the scope its dials settled
   * (`scopes`): the ones `--with` named for it, and each named without
   * a service that it alone can take (`routeExtra` — set aside with a
   * note where the services that could have it have it already, and
   * refused, naming the services, where none or several can). Planned as a single
   * stack's are: one already there set aside with a note, the rest
   * closed over their prerequisites in plan order, or refused in the
   * sentence `keel add` there would give (`keel.wrong-scope` for a
   * pipeline in a monorepo service). The notes are prefixed with the
   * service, as its deferred actions are in the report.
   */
  private resolveServiceExtras(
    command: NewProjectCommand,
    stack: Stack,
    scopes: readonly ServicePlanScope[],
    bare: readonly Vertical[],
    monorepo: boolean,
  ): Result<{
    readonly admitted: ReadonlyMap<string, AdmittedSet>;
    readonly notes: readonly string[];
  }> {
    const registry = this.deps.registry;
    const requested = new Map<string, Vertical[]>();
    const notes: string[] = [];
    for (const vertical of [...bare].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
      const routed = routeExtra(registry, scopes, vertical, monorepo);
      if (routed.kind === 'refused') return err(routed.refusal);
      if (routed.kind === 'included') {
        notes.push(productIncludedNote(stack, scopes, vertical, routed.paths, monorepo));
        continue;
      }
      requested.set(routed.path, [...(requested.get(routed.path) ?? []), vertical]);
      notes.push(routedExtraNote(vertical, routed.path, stack.id));
    }
    const admitted = new Map<string, AdmittedSet>();
    for (const { service, scope } of scopes) {
      const chosen = [
        ...(requested.get(service.path) ?? []),
        ...(command.services?.[service.path]?.extraVerticals ?? []).flatMap(
          (id) => registry.vertical(id) ?? [],
        ),
      ];
      if (chosen.length === 0) continue;
      const already = serviceIncludedNote(stack, service, monorepo);
      const present = chosen.filter((vertical) => scope.installed.includes(vertical.id));
      const incoming = chosen.filter((vertical) => !scope.installed.includes(vertical.id));
      if (incoming.length > 0) {
        const set = admit(registry, scope, incoming);
        if (!set.ok) return set;
        admitted.set(service.path, set.value);
        notes.push(...admissionNotes(set.value).map((note) => `${service.path}: ${note}`));
      }
      notes.push(...present.map((vertical) => `${service.path}: ${already(vertical)}`));
    }
    return ok({ admitted, notes });
  }

  /**
   * What a monorepo product's root leaves out of a service: a vertical
   * the root's glue builds for the services it knows
   * (`Adapter.providesInServices`) but not for this one's stack, where
   * the service could take it on its own — a plugin's backend the
   * product's `compose.yaml` has no image for. One note each, so the
   * report says what `keel add` there would fill in; the product root
   * is the first scope, the services follow in the product's order.
   */
  private unbuiltNotes(scopes: readonly StagedScope[]): readonly string[] {
    const registry = this.deps.registry;
    const [root, ...services] = scopes;
    if (root === undefined) return [];
    const built = [
      ...new Set(root.adapters.flatMap((adapter) => adapter.providesInServices?.vertical ?? [])),
    ];
    const product = {
      installed: root.manifest.verticals.map((v) => v.id),
      tags: effectiveTags(root.manifest),
    };
    const notes: string[] = [];
    for (const service of services) {
      const ref = root.manifest.services.find((candidate) => candidate.path === service.prefix);
      if (ref === undefined) continue;
      const provisions = provisionsFor(registry, product, ref.stack);
      const scope = memberScope(projectScope(registry, service.manifest), provisions);
      for (const id of built) {
        const vertical = registry.vertical(id);
        if (vertical === null || provisions.some((given) => given.vertical.id === id)) continue;
        const ready = readiness(registry, scope, id).kind;
        if (ready === 'ready' || ready === 'needs') {
          notes.push(unbuiltInServiceNote(service.prefix, vertical));
        }
      }
    }
    return notes;
  }

  /**
   * Installs one stack's verticals, then its extras, against a fresh
   * manifest and Tree rooted at `cwd` — one `installVerticals` run,
   * the loop `keel add` installs through as well. Nothing is
   * committed — the caller owns commit order across scopes.
   */
  private async stageStack(inputs: {
    prefix: string;
    cwd: string;
    stack: Stack;
    /** The chosen build system's `pkg.*` tag; null when the stack's `tags` pin it. */
    buildTag: Tag | null;
    /** The chosen module layout's `layout.*` tag; null when the stack offers no choice. */
    layoutTag: Tag | null;
    /** `modules.peer-context` when the second context was opted into; null otherwise. */
    peerTag?: Tag | null;
    peers: readonly PeerLink[];
    services: ManifestV2['services'];
    /**
     * Whether the scope is a service of a monorepo product — a
     * directory of the product's repository — so a vertical placed at
     * a repository root is left out of it: the product root carries
     * the repository.
     */
    member: boolean;
    extraVerticals?: readonly Vertical[];
    command: NewProjectCommand;
    now: string;
    prompt: Prompt;
  }): Promise<StagedScope> {
    const manifest: ManifestV2 = {
      ...emptyManifestV2(inputs.now, this.deps.keelVersion),
      tags: [
        ...inputs.stack.tags,
        ...(inputs.buildTag ? [inputs.buildTag] : []),
        ...(inputs.layoutTag ? [inputs.layoutTag] : []),
        ...(inputs.peerTag ? [inputs.peerTag] : []),
      ].sort(),
      projects: [...(inputs.stack.projects ?? [])],
      peers: inputs.peers,
      services: inputs.services,
      modules: scaffoldedModules(inputs.layoutTag, inputs.peerTag ?? null, inputs.now),
    };

    const tree = this.deps.trees(inputs.cwd);
    // The declaration the add front door refuses by (`Vertical.placement`),
    // read here too, so what a monorepo service is scaffolded without
    // and what `keel add` there refuses cannot drift apart.
    const placed = (v: Vertical) => inputs.member && v.placement?.scope === 'repository';
    // One per scope, read back for who wrote what (`crossScopeWrite`).
    const owners = newOwnership();
    const result = await installVerticals({
      verticals: [...inputs.stack.verticals, ...(inputs.extraVerticals ?? [])].filter(
        (v) => !placed(v),
      ),
      owners,
      // The preset's own rules, held with its verticals' over every
      // tag the run folds in, as `assemblyIsLegal` held them over the
      // tags the dials settled.
      rules: inputs.stack.conflicts ?? [],
      manifest,
      supplied: inputs.command.answers,
      tree,
      // Nothing on disk here is keel's: a file in the way is the
      // user's to move, and a patch target nothing created is a bug.
      apply: 'scaffold',
      mode: inputs.command.interactive ? 'interactive' : 'non-interactive',
      prompt: inputs.prompt,
      logger: this.deps.logger,
      cwd: inputs.cwd,
      templates: this.deps.templates,
      processes: this.deps.processes,
      now: () => inputs.now,
      registry: this.deps.registry,
    }).catch((thrown: unknown) => {
      // A service's Tree is rooted at its own directory, so the file
      // an adapter names is relative to it; the user ran `keel new`
      // one level up, where `go.mod` in the way is `backend/go.mod`.
      throw inputs.prefix === '' ? thrown : underService(thrown, inputs.prefix);
    });
    return {
      prefix: inputs.prefix,
      cwd: inputs.cwd,
      tree,
      manifest: result.manifest,
      actions: result.applyResult.actions,
      adapters: result.adapters,
      reads: result.reads,
      skippedHarnessElements: result.applyResult.skippedHarnessElements ?? 0,
      writers: owners.writers,
    };
  }

  /**
   * Commits staged scopes in the recoverable order the single flow
   * established: every tree, then every manifest, then deferred
   * actions per scope — so a failed action (missing `gradle`, no
   * network for `npm install`) leaves coherent files + manifests.
   */
  private async commitScopes(scopes: readonly StagedScope[]): Promise<void> {
    for (const scope of scopes) await scope.tree.commit();
    for (const scope of scopes) {
      await this.deps.manifests.write(projectScopeRoot(scope.cwd), scope.manifest);
    }
    const runDeferred = this.deps.runDeferred ?? runActions;
    for (const scope of scopes) {
      await runDeferred({
        actions: scope.actions,
        cwd: scope.cwd,
        logger: this.deps.logger,
        processes: this.deps.processes,
        dryRun: false,
      });
    }
  }

  /**
   * Resolves the build system for a single-service stack: the
   * `--build-system` id when supplied, the interactive choice when
   * the stack declares more than one, the stack default otherwise.
   * Returns `null` for stacks whose `tags` pin their build system.
   */
  private async resolveBuildSystem(
    command: NewProjectCommand,
    stack: Stack,
    prompt: Prompt,
  ): Promise<Result<Tag | null>> {
    const options = stack.buildSystems ?? [];
    const fallback = options[0];
    if (!fallback) {
      if (command.buildSystem !== undefined) {
        return err(
          new DomainError(
            `stack '${stack.id}' has a fixed build system — remove --build-system`,
            'keel.invalid-build-system',
          ),
        );
      }
      return ok(null);
    }
    if (command.buildSystem !== undefined) {
      const chosen = options.find((o) => o.id === command.buildSystem);
      if (!chosen) {
        return err(invalidBuildSystem(stack, command.buildSystem, options));
      }
      return ok(chosen.tag);
    }
    const offered = legalBuildSystems(stack, options);
    if (!command.interactive || offered.length <= 1) return ok((offered[0] ?? fallback).tag);
    const answer = (
      await prompt.ask(buildSystemQuestion(offered, offered[0] ?? fallback), stackAsker(stack))
    ).trim();
    const chosen = offered.find((o) => o.id === answer);
    if (!chosen) return err(invalidBuildSystem(stack, answer, offered));
    return ok(chosen.tag);
  }

  /**
   * Resolves the build system of every service of a composite stack:
   * `--build-system` names services as `path=id` pairs
   * (`backend=maven,frontend=pnpm`); services left unnamed are asked
   * interactively when their stack declares a real choice and take
   * their stack's default otherwise. Maps service path → chosen
   * option, with `null` for services whose stack pins its build
   * system.
   */
  private async resolveServiceBuildSystems(
    command: NewProjectCommand,
    stack: Stack,
    services: readonly PresetService[],
    prompt: Prompt,
  ): Promise<Result<ReadonlyMap<string, BuildSystemOption | null>>> {
    const explicit = parseServiceBuildSystems(command.buildSystem, stack, services);
    if (!explicit.ok) return explicit;

    const chosen = new Map<string, BuildSystemOption | null>();
    for (const service of services) {
      const options = service.stack.buildSystems ?? [];
      const fallback = options[0];
      const requested = explicit.value.get(service.path);
      if (requested !== undefined) {
        const match = options.find((o) => o.id === requested);
        if (!match) {
          return err(
            fallback
              ? invalidBuildSystem(service.stack, requested, options)
              : new DomainError(
                  `stack '${stack.id}': service '${service.path}' (${service.stack.id}) has a fixed build system — remove it from --build-system`,
                  'keel.invalid-build-system',
                ),
          );
        }
        chosen.set(service.path, match);
        continue;
      }
      if (!fallback) {
        chosen.set(service.path, null);
        continue;
      }
      if (!command.interactive || options.length === 1) {
        chosen.set(service.path, fallback);
        continue;
      }
      const answer = (
        await prompt.ask(serviceBuildSystemQuestion(service, options, fallback), stackAsker(stack))
      ).trim();
      const match = options.find((o) => o.id === answer);
      if (!match) return err(invalidBuildSystem(service.stack, answer, options));
      chosen.set(service.path, match);
    }
    return ok(chosen);
  }

  /**
   * Resolves the module layout for a single-service stack: the
   * `--module-layout` id when supplied, the interactive choice when
   * the stack declares more than one, the stack default otherwise.
   * Returns `null` for stacks that offer no choice — their adapters
   * resolve to `basic`.
   */
  private async resolveModuleLayout(
    command: NewProjectCommand,
    stack: Stack,
    buildTag: Tag | null,
    prompt: Prompt,
  ): Promise<Result<Tag | null>> {
    const options = stack.moduleLayouts ?? [];
    const fallback = options[0];
    if (!fallback) {
      if (command.moduleLayout !== undefined) {
        return err(
          new DomainError(
            `stack '${stack.id}' ships a single module layout — remove --module-layout`,
            'keel.invalid-module-layout',
          ),
        );
      }
      return ok(null);
    }
    if (command.moduleLayout !== undefined) {
      const chosen = options.find((o) => o.id === command.moduleLayout);
      if (!chosen) return err(invalidModuleLayout(stack, command.moduleLayout, options));
      return ok(chosen.tag);
    }
    const offered = legalModuleLayouts(stack, buildTag, options);
    if (!command.interactive || offered.length <= 1) return ok((offered[0] ?? fallback).tag);
    const answer = (
      await prompt.ask(moduleLayoutQuestion(offered, offered[0] ?? fallback), stackAsker(stack))
    ).trim();
    const chosen = offered.find((o) => o.id === answer);
    if (!chosen) return err(invalidModuleLayout(stack, answer, offered));
    return ok(chosen.tag);
  }

  /**
   * Resolves whether to also scaffold the peer context: the
   * `--with-peer-context` flag when supplied (validated against both
   * gates below regardless of source), the interactive choice when
   * the flag was omitted and the layout already resolved to modulith
   * on a stack whose modulith actually carries a peer context, `no`
   * otherwise. Asking is conditioned on both gates already passing
   * so the question is only ever offered where accepting `yes` would
   * actually scaffold something.
   */
  private async resolveWithPeerContext(
    command: NewProjectCommand,
    stack: Stack,
    buildTag: Tag | null,
    layoutTag: Tag | null,
    prompt: Prompt,
  ): Promise<Result<Tag | null>> {
    let want = command.withPeerContext === true;
    if (
      command.withPeerContext === undefined &&
      command.interactive &&
      // The layout rule, read as a filter this time — the same
      // sentence the gate refuses by. It used to be spelled out here
      // as `layoutTag === MODULITH_LAYOUT_TAG`, a second copy of a
      // rule declared elsewhere, which is exactly how a menu and a
      // refusal come to disagree. `keel ui` reads the identical
      // function through `keel.dials`, for the identical reason.
      peerContextOffered(stack, buildTag, layoutTag)
    ) {
      const answer = (await prompt.ask(peerContextQuestion(), stackAsker(stack))).trim();
      want = answer === 'yes';
    }
    return peerContextTag(this.deps.registry, want, stack, buildTag);
  }

  /**
   * Resolves the verticals to layer on top of the stack's own: the
   * `--with` list when supplied, the interactive multi-select
   * otherwise, none when neither — and the order they install in.
   *
   * **The menu is the planner's** (`../planner.ts`, through
   * {@link verticalOptions}), the same list `keel.dials` reports: the
   * stack's own verticals are off it — the stack installs them either
   * way — and so is any vertical nothing keel can add makes install
   * here, such as `persistence` on a CLI-only preset. What stays is
   * ready, or ready once others are: `iac` is on it, labelled with the
   * image and the release it needs. Under `--no-agent-harness` it is
   * read as {@link harnessLeftOut} reads it, as `keel.dials` reads it
   * for a target leaving the harness out: nothing that would switch the
   * harness back on — itself, or through a prerequisite the plan would
   * add ({@link switchesHarnessOn}) — is offered, and naming one is
   * refused rather than installed with the harness it brings.
   *
   * `--with` is checked rather than filtered: a name that is not a
   * registered vertical, or one named twice, is refused at the front
   * door with the list spelled out, exactly as `keel add` refuses an
   * unknown id. One the stack already carries is asking for what the
   * plan has, which has one sensible reading: it is set aside, and the
   * report says the preset comes with it — as `keel add` notes a
   * vertical the project has installed. Then the rest of the set is
   * planned (`../plan-refusal.ts`) — the same reading `keel add` asks
   * of the verticals it names — closed over its prerequisites, and
   * installs in the order the planner puts it in, the rest by id,
   * whatever order it was named in. A prerequisite the set leaves out
   * is installed with it, and the report's first note names it; a
   * vertical the stack cannot carry is refused in the resolver's own
   * sentence, plus the remedy only `--with` has — before a single
   * adapter question.
   */
  private async resolveExtraVerticals(
    command: NewProjectCommand,
    stack: Stack,
    prompt: Prompt,
    tags: readonly Tag[],
  ): Promise<Result<ResolvedExtras>> {
    const registry = this.deps.registry;
    const scope = presetScope(stack, tags);
    const options = verticalOptions(registry, stack, tags);
    const candidates = (
      command.agentHarness === false ? harnessLeftOut(registry, options) : options
    ).filter(offeredAsExtra);
    const requested =
      command.extraVerticals !== undefined
        ? command.extraVerticals
        : !command.interactive || candidates.length === 0
          ? []
          : decodeSelection(
              await prompt.ask(
                extraVerticalsQuestion(candidates, stack, registry),
                stackAsker(stack),
              ),
            );

    const chosen: Vertical[] = [];
    const present: Vertical[] = [];
    for (const id of requested) {
      if ([...present, ...chosen].some((v) => v.id === id)) {
        return err(new DomainError(`--with names vertical '${id}' twice`, INVALID_EXTRAS_CODE));
      }
      const own = stack.verticals.find((v) => v.id === id);
      if (own !== undefined) {
        present.push(own);
        continue;
      }
      const vertical = registry.vertical(id);
      if (!vertical) {
        return err(
          new DomainError(
            unknownIdSentence(
              'vertical',
              id,
              nearestVertical(candidates, id),
              `available on top of stack '${stack.id}': ${candidates.map((v) => v.id).join(', ')}`,
            ),
            'keel.unknown-vertical',
          ),
        );
      }
      if (command.agentHarness === false && switchesHarnessOn(registry, scope, vertical)) {
        return err(new DomainError(harnessOptOutSentence(id), INVALID_AGENT_HARNESS_CODE));
      }
      chosen.push(vertical);
    }

    const admitted = admit(registry, scope, chosen);
    if (!admitted.ok) return admitted;
    return ok({ admitted: admitted.value, present });
  }

  private async resolveLayout(
    command: NewProjectCommand,
    stack: Stack,
    prompt: Prompt,
  ): Promise<Result<RepoLayout>> {
    if (command.layout !== undefined) {
      if (command.layout !== 'monorepo' && command.layout !== 'polyrepo') {
        return err(
          new DomainError(
            `invalid layout '${String(command.layout)}' — expected 'monorepo' or 'polyrepo'`,
            'keel.invalid-layout',
          ),
        );
      }
      return ok(command.layout);
    }
    if (!command.interactive) return ok('monorepo');
    const answer = (await prompt.ask(LAYOUT_QUESTION, stackAsker(stack))).trim();
    if (answer !== 'monorepo' && answer !== 'polyrepo') {
      return err(
        new DomainError(
          `invalid layout '${answer}' — expected 'monorepo' or 'polyrepo'`,
          'keel.invalid-layout',
        ),
      );
    }
    return ok(answer);
  }
}

/**
 * Refuses an assembly a piece has declared illegal.
 *
 * The **loud** half of the compatibility declaration (`../compatibility.ts`).
 * Every piece coming together in this run — the stack and every
 * vertical it installs, the `--with` extras included — contributes its
 * rules, and the tag set the dials settled is checked against all of
 * them at once.
 *
 * Placed after the last dial and before the first file, so it sees the
 * whole assembly and nothing has been written when it refuses. Earlier
 * would check a set still missing a tag; later would mean a project on
 * disk in a shape its own pieces call impossible.
 *
 * The message is the rule's own sentence plus the tags that matched,
 * which is what a hand-written check keeps losing — an uncovered
 * dimension names the symptom, a rule names the two capabilities that
 * cannot sit together.
 */
function assemblyIsLegal(
  stack: Stack,
  extras: readonly Vertical[],
  tags: readonly Tag[],
): Result<null> {
  const refusal = assemblyRefusal([stack, ...stack.verticals, ...extras], tags);
  if (refusal === null) return ok(null);
  return err(new DomainError(`stack '${stack.id}': ${refusal}`, 'keel.incompatible'));
}

/** The asker every stack-level dial carries. @see LAYOUT_QUESTION_ID */
function stackAsker(stack: Stack): Asker {
  return { kind: 'stack', id: stack.id };
}

/**
 * The asker of the stack question itself, which is asked before any
 * stack has been picked — so it names the command rather than a
 * preset.
 */
const NEW_PROJECT_ASKER: Asker = { kind: 'stack', id: 'keel.new-project' };

/**
 * The drill-down's first question: what kind of thing is being
 * built. Its last choice is the escape hatch onto
 * {@link stackQuestion}; the rest are derived from the catalog, so a
 * stack that reaches a new shape appears here by itself.
 */
function shapeQuestion(paths: readonly WizardPath[]): Question {
  return {
    id: SHAPE_QUESTION_ID,
    prompt: 'What are you building?',
    doc: 'The widest question there is: which ends of a system this project covers. Everything after it narrows within the answer.',
    choices: [
      ...shapeChoices(paths),
      {
        value: PICK_BY_ID,
        label: 'Other — pick a preset by id',
        doc: 'Skip the narrowing and choose from the flat list of every preset.',
      },
    ],
    default: pathOf(paths, DEFAULT_STACK_ID)?.shape ?? shapeChoices(paths)[0]?.value ?? '',
    memory: 'repeat',
  };
}

/**
 * The drill-down's second question: which language, within the shape
 * already chosen. Asked only where that shape reaches more than one.
 */
function languageQuestion(
  paths: readonly WizardPath[],
  shape: ProjectShape,
  choices: readonly QuestionChoice[],
): Question {
  const preferred = pathOf(paths, DEFAULT_STACK_ID);
  return {
    id: LANGUAGE_QUESTION_ID,
    prompt: 'Language',
    doc: `The language the project is written in${
      shape === 'fullstack' ? ' — the backend’s, the front end being the browser either way' : ''
    }. Everything after this narrows within it.`,
    choices,
    default: preferred?.shape === shape ? preferred.language : (choices[0]?.value ?? ''),
    memory: 'repeat',
  };
}

/** The drill-down's third question, asked only where a choice remains. */
function frameworkQuestion(choices: readonly QuestionChoice[], fallback: string): Question {
  return {
    id: FRAMEWORK_QUESTION_ID,
    prompt: 'Framework',
    doc: 'Which framework the adapters are built on. Only asked where the shape and language chosen leave more than one open.',
    choices,
    default: fallback,
    memory: 'repeat',
  };
}

/**
 * The drill-down's last question: which user-side adapters the
 * project is driven through.
 *
 * A set, not a choice — and the `doc` says what picking two means,
 * because that is the one answer here with a counter-intuitive
 * result: it resolves to the **composed** preset, one hexagon with
 * two entrypoints, and never to a two-service product. Two services
 * is the fullstack shape, which was the first question.
 */
function entrypointQuestion(step: EntrypointStep, language: string): Question {
  return {
    id: ENTRYPOINTS_QUESTION_ID,
    prompt: `User-side adapters (${languageLabel(language)})`,
    doc: 'How the outside world drives the hexagon. Picking more than one gives the composed preset — one project, one domain, both entrypoints — not two services; two services is the fullstack shape.',
    kind: step.kind,
    choices: step.choices,
    default: step.default,
    memory: 'repeat',
  };
}

/**
 * The framework the drill-down offers first: the default preset's own
 * where that is on the menu, the first choice otherwise. Together
 * with the other defaults it means pressing enter through the whole
 * wizard lands on the same preset an omitted `--stack` has always
 * defaulted to.
 */
function defaultFramework(
  paths: readonly WizardPath[],
  choices: readonly QuestionChoice[],
): string {
  const preferred = pathOf(paths, DEFAULT_STACK_ID)?.framework ?? '';
  if (choices.some((choice) => choice.value === preferred)) return preferred;
  return choices[0]?.value ?? '';
}

/**
 * A combination the menus should never have offered. Reachable only
 * from an answer the menus did not produce — a scripted prompt, or a
 * front end posting its own — so it names what it was given, in the
 * words the menus give it, rather than guessing at a near miss.
 */
function noSuchCombination(
  shape: string,
  language: string,
  framework: string | null,
  entrypoints: readonly string[],
): DomainError {
  const named = framework === null || framework === '' ? '' : ` on ${frameworkLabel(framework)}`;
  const kind = (shapeLabel(shape as ProjectShape).split(' — ')[0] ?? shape).toLowerCase();
  return new DomainError(
    `no ${kind} preset scaffolds ${languageLabel(language)} with ${
      entrypoints.length === 0 ? 'no user-side adapter' : entrypointsLabel(entrypoints)
    }${named} — pick a preset by id with --stack, or 'keel new --list' to see them all`,
    'keel.unknown-stack',
  );
}

/** The wizard's flat fallback: which stack preset to scaffold from. */
function stackQuestion(options: readonly StackSummary[]): Question {
  return {
    id: STACK_QUESTION_ID,
    prompt: 'Stack',
    doc: 'The preset combination of capabilities and verticals to scaffold from.',
    choices: options.map((o) => ({ value: o.id, label: o.id, doc: o.description })),
    default: DEFAULT_STACK_ID,
    memory: 'repeat',
  };
}

/**
 * The wizard's fourth step: which verticals to layer on top of the
 * stack's own, in the same run.
 *
 * A `multi-select` defaulting to none — the stack's list is a
 * coherent starting point by construction, so "nothing extra" is the
 * answer that needs no justification. A choice that installs only
 * once others have says so in its label, naming them: the menu is
 * flat, and ticking it alone installs them with it, which the review
 * says first.
 */
function extraVerticalsQuestion(
  candidates: readonly VerticalOption[],
  stack: Stack,
  registry: Registry,
): Question {
  const titleOf = (id: string): string => {
    const vertical = registry.vertical(id);
    return vertical === null ? id : verticalTitle(vertical);
  };
  return {
    id: EXTRA_VERTICALS_QUESTION_ID,
    prompt: 'Additional verticals',
    doc: `Installed on top of what '${stack.id}' already brings, in the same run and in the order they build on one another, so the review below shows one plan. A choice marked "needs …" brings what it names with it. Everything here is also available later with 'keel add'.`,
    kind: 'multi-select',
    choices: candidates.map((option) => ({
      value: option.id,
      label:
        option.readiness === 'needs'
          ? `${option.title} — needs ${
              option.requires.length === 0
                ? 'one of several verticals first'
                : option.requires.map(titleOf).join(', ')
            }`
          : option.title,
      doc: option.description,
    })),
    default: '',
    memory: 'repeat',
  };
}

function peerContextQuestion(): Question {
  return {
    id: PEER_CONTEXT_QUESTION_ID,
    prompt: 'Also scaffold a second bounded context (peer context)?',
    doc: 'Adds a peer module reaching the skeleton only through its user-side/service seam — a second context demonstrating the modulith boundary.',
    choices: [
      { value: 'yes', label: 'yes', doc: 'Scaffold the peer context alongside the skeleton.' },
      { value: 'no', label: 'no', doc: 'Just the skeleton context.' },
    ],
    default: 'no',
    memory: 'repeat',
  };
}

/**
 * The review step's label for one recorded answer: its choice's
 * label, or the raw value.
 *
 * A `multi-select` answer is a *set*, and neither branch above reads
 * one: `'cli,server-http'` matches no single choice, and `''` — the
 * legitimate "none" — renders as nothing at all, leaving the review
 * line "Change: Additional verticals = " trailing into space. So a
 * set is spelled out by its values, and an empty one says so.
 */
function answerLabel(r: RecordedAnswer): string {
  if (r.question.kind === 'multi-select') {
    const chosen = decodeSelection(r.value);
    return chosen.length === 0 ? '(none)' : chosen.join(', ');
  }
  return r.question.choices?.find((c) => c.value === r.value)?.label ?? r.value;
}

function cancelledError(): DomainError {
  return new DomainError('cancelled by user — nothing written', 'keel.cancelled');
}

/**
 * The refusal of a `--stack` no preset is registered under: the id it
 * most likely meant, where one is near enough to name, and every id
 * there is.
 */
function unknownStackError(registry: Registry, id: string): DomainError {
  return new DomainError(
    unknownIdSentence(
      'stack',
      id,
      nearestStack(registry, id),
      `available: ${listStackIds(registry).join(', ')}`,
    ),
    'keel.unknown-stack',
  );
}

function buildSystemQuestion(
  options: readonly BuildSystemOption[],
  fallback: BuildSystemOption,
): Question {
  return {
    id: BUILD_SYSTEM_QUESTION_ID,
    prompt: 'Build system',
    doc: 'How the scaffolded project is built; every other choice is unaffected.',
    choices: options.map((o) => ({ value: o.id, label: o.label, doc: o.doc })),
    default: fallback.id,
    memory: 'repeat',
  };
}

/**
 * The build-system question for one service of a composite install —
 * the single-service question with the service named in the id and
 * the prompt, so sibling services (asked back to back) stay
 * distinguishable to the user and to scripted prompts alike.
 */
function serviceBuildSystemQuestion(
  service: PresetService,
  options: readonly BuildSystemOption[],
  fallback: BuildSystemOption,
): Question {
  return {
    ...buildSystemQuestion(options, fallback),
    id: `${BUILD_SYSTEM_QUESTION_ID}${SERVICE_QUESTION_SEPARATOR}${service.path}`,
    prompt: `Build system for ${service.path} (${service.stack.id})`,
  };
}

/**
 * Parses a composite `--build-system` value into service-path →
 * build-system-id pairs. The composite syntax is `path=id`
 * comma-separated; a bare id is rejected with the syntax spelled
 * out, because "which service?" has no defensible default once the
 * choice is per service.
 */
function parseServiceBuildSystems(
  raw: string | undefined,
  stack: Stack,
  services: readonly PresetService[],
): Result<ReadonlyMap<string, string>> {
  const parsed = new Map<string, string>();
  if (raw === undefined) return ok(parsed);
  const paths = services.map((s) => s.path);
  for (const entry of raw.split(',').map((e) => e.trim())) {
    const separator = entry.indexOf('=');
    if (separator <= 0 || separator === entry.length - 1) {
      return err(
        new DomainError(
          `stack '${stack.id}' is composite — name the service in --build-system, as 'path=id' pairs (e.g. --build-system ${paths[0] ?? 'backend'}=maven); got '${entry}'`,
          'keel.invalid-build-system',
        ),
      );
    }
    const servicePath = entry.slice(0, separator).trim();
    const id = entry.slice(separator + 1).trim();
    if (!paths.includes(servicePath)) {
      return err(
        new DomainError(
          `stack '${stack.id}' has no service '${servicePath}' — services: ${paths.join(', ')}`,
          'keel.invalid-build-system',
        ),
      );
    }
    if (parsed.has(servicePath)) {
      return err(
        new DomainError(
          `--build-system names service '${servicePath}' twice`,
          'keel.invalid-build-system',
        ),
      );
    }
    parsed.set(servicePath, id);
  }
  return ok(parsed);
}

function moduleLayoutQuestion(
  options: readonly ModuleLayoutOption[],
  fallback: ModuleLayoutOption,
): Question {
  return {
    id: MODULE_LAYOUT_QUESTION_ID,
    prompt: 'Module layout',
    doc: 'How the project is carved into modules. Not the repository layout — this is about bounded contexts, not repositories.',
    choices: options.map((o) => ({ value: o.id, label: o.label, doc: o.doc })),
    default: fallback.id,
    memory: 'repeat',
  };
}

function invalidModuleLayout(
  stack: Stack,
  requested: string,
  options: readonly ModuleLayoutOption[],
): DomainError {
  return new DomainError(
    `stack '${stack.id}' does not support module layout '${requested}' — available: ${options
      .map((o) => o.id)
      .join(', ')}`,
    'keel.invalid-module-layout',
  );
}

function invalidBuildSystem(
  stack: Stack,
  requested: string,
  options: readonly BuildSystemOption[],
): DomainError {
  return new DomainError(
    `stack '${stack.id}' does not support build system '${requested}' — available: ${options
      .map((o) => o.id)
      .join(', ')}`,
    'keel.invalid-build-system',
  );
}

/** The default build-system tag of a service stack, if it declares a choice. */
function defaultBuildTag(stack: Stack): Tag | null {
  return stack.buildSystems?.[0]?.tag ?? null;
}

/**
 * Resolves `want` (a peer context was requested, whether by flag or
 * by the interactive wizard) into the tag that seeds the second
 * bounded context, rejecting it wherever the request cannot be
 * honoured. Two gates, and the second exists because the resolver
 * cannot keep it.
 *
 * **The layout gate.** The flag is only meaningful under the
 * modulith: the flat trisection is a single hexagon, so there is no
 * boundary for a second context to reach across.
 *
 * **The coverage gate.** Every other "no adapter for this stack" is
 * caught by the resolver's uncovered-dimension hard-fail. That
 * structurally cannot fire here: a peer-context adapter declares
 * `covers: []`, because it contributes a *context* and not a
 * dimension, so a family with no such adapter resolves cleanly and
 * emits nothing. Without this check the flag is a silent no-op — the
 * user asks for two bounded contexts, is told nothing, and gets one.
 *
 * Both fail at the front door with the stack named, which beats
 * scaffolding half of what was asked for and leaving the user to
 * wonder where the other context went. The interactive wizard never
 * exercises either failure branch — it only offers the question once
 * both gates already pass — but the flag path still needs them.
 */
function peerContextTag(
  registry: Registry,
  want: boolean,
  stack: Stack,
  buildTag: Tag | null,
): Result<Tag | null> {
  if (!want) return ok(null);
  // The layout rule that used to live here is a declaration now —
  // `PEER_CONTEXT_NEEDS_MODULITH`, owned by the vertical whose
  // capability it constrains, enforced by {@link assemblyIsLegal} and
  // read a second time by the dial menus. That is the half a
  // hand-written branch never had: the choice is no longer offered
  // and then refused.
  //
  // What stays is the **capability** probe, which is not a conflict.
  // It asks whether this stack's adapters emit a peer context at all,
  // and it asks hypothetically — against the layout that creates the
  // seam rather than the one the user set — so the answer is about
  // the stack. Otherwise a stack that could never carry one would be
  // told to switch layout first, and still get nothing.
  if (!emitsPeerContext(stack, stackTagsFor(stack, buildTag, MODULITH_LAYOUT_TAG))) {
    return err(
      new DomainError(
        `stack '${stack.id}' has no peer-context adapter — --with-peer-context would scaffold nothing at all. Stacks that support it: ${peerContextStackIds(registry).join(', ')}`,
        'keel.invalid-peer-context',
      ),
    );
  }
  return ok(PEER_CONTEXT_TAG);
}

/**
 * The bounded contexts a fresh install starts life with.
 *
 * Empty under the flat layout — `basic` is one hexagon and has no
 * contexts to name. Under the modulith it is the skeleton's own
 * context, plus the `--with-peer-context` one when that was opted
 * into.
 *
 * **Only the skeleton's context carries a seam.** The peer is a pure
 * consumer: it declares a driven port in its own vocabulary and
 * reaches the skeleton through a gateway, but publishes no
 * `user-side/service` of its own, so nothing can consume *it*. That
 * asymmetry is a fact about every family's emitted tree, and recording
 * it here is what lets `keel add module x --consumes guestbook` fail at
 * the front door instead of emitting a gateway over a package that is
 * not there.
 */
function scaffoldedModules(
  layoutTag: Tag | null,
  peerTag: Tag | null,
  now: string,
): ManifestV2['modules'] {
  if (layoutTag !== MODULITH_LAYOUT_TAG) return [];
  const skeleton = { name: SKELETON_MODULE, installedAt: now, seam: true };
  if (peerTag !== PEER_CONTEXT_TAG) return [skeleton];
  return [
    skeleton,
    {
      name: PEER_MODULE,
      installedAt: now,
      seam: false,
      consumes: SKELETON_MODULE,
    },
  ];
}

/** The tag set a single-service install of `stack` would carry. */

/**
 * Every single-service stack whose modulith carries a peer context,
 * for the rejection message. Derived the same way, on the same
 * defaults `keel new` itself would pick.
 */
function peerContextStackIds(registry: Registry): readonly string[] {
  return [...registry.stacks()]
    .filter((stack) => stack.services === undefined)
    .filter((stack) =>
      emitsPeerContext(stack, stackTagsFor(stack, defaultBuildTag(stack), MODULITH_LAYOUT_TAG)),
    )
    .map((stack) => stack.id)
    .sort();
}

/**
 * `thrown`, with a file refusal's path moved under the service
 * directory `prefix` — what the user sees from the product root they
 * ran `keel new` in. Anything else is passed through as it is.
 */
function underService(thrown: unknown, prefix: string): unknown {
  if (thrown instanceof PathConflictError) {
    return new PathConflictError(
      path.posix.join(prefix, thrown.path),
      thrown.adapterId,
      thrown.refusal.anchor,
    );
  }
  if (thrown instanceof PathMissingError) {
    return new PathMissingError(path.posix.join(prefix, thrown.path), thrown.adapterId);
  }
  return thrown;
}

/**
 * The refusal of a composite plan two of whose scopes stage one file —
 * the same absolute path, from the product root and a service, or from
 * two services — naming the adapter that wrote it in each, and where
 * it ran (`../refusals.ts`); null when every file has one scope.
 */
function crossScopeWrite(scopes: readonly StagedScope[]): DomainError | null {
  const staged = new Map<string, { readonly scope: StagedScope; readonly path: string }>();
  for (const scope of scopes) {
    for (const change of scope.tree.changes()) {
      const absolute = path.join(scope.cwd, change.path);
      const first = staged.get(absolute);
      if (first === undefined) {
        staged.set(absolute, { scope, path: change.path });
        continue;
      }
      return crossScopeWriteError(
        scope.prefix === '' ? change.path : path.posix.join(scope.prefix, change.path),
        writerIn(first.scope, first.path),
        writerIn(scope, change.path),
      );
    }
  }
  return null;
}

/** Who wrote `file` in `scope`: the adapter, by its `<vertical>/<adapter>` id. */
function writerIn(scope: StagedScope, file: string): ScopeWriter {
  return { by: scope.writers.get(file) ?? null, scope: scope.prefix };
}

/** The default module-layout tag of a service stack, if it declares a choice. */
function defaultLayoutTag(stack: Stack): Tag | null {
  return stack.moduleLayouts?.[0]?.tag ?? null;
}

/**
 * The code `--with` is refused with for its form rather than for what
 * it names: an id twice, a service path the product does not list, a
 * path on a single-service stack, or the two forms mixed.
 */
const INVALID_EXTRAS_CODE = 'keel.invalid-extra-verticals';

/**
 * The code `keel new` inside a monorepo product is refused with: in a
 * directory it does not list, or in a service it lists that holds no
 * project.
 */
export const INSIDE_PRODUCT_CODE = 'keel.inside-product';

/**
 * The refusal of `keel new` in a directory inside a product root that
 * lists no service there: a project scaffolded there would be neither
 * a service of the product nor a project of its own, and the product
 * has no command that adds one. `root` is the product root, relative
 * to where `keel new` ran.
 */
function insideProduct(root: string): DomainError {
  return new DomainError(
    `this directory is inside the product at ${toPosix(root)}/, which lists no service here; adding a service to a product is not supported yet`,
    INSIDE_PRODUCT_CODE,
  );
}

/**
 * The refusal of `keel new` in a directory a product lists as a
 * service, that holds no project: the product records what it is, and
 * scaffolding a service again — its own preset, or another — is not a
 * command keel has. `root` is the product root, relative to where
 * `keel new` ran.
 */
function insideProductService(root: string, service: ServiceRef): DomainError {
  return new DomainError(
    `this directory is ${service.path}/ of the product at ${toPosix(root)}/, recorded as ${service.stack}; re-scaffolding a service is not supported yet`,
    INSIDE_PRODUCT_CODE,
  );
}

function alreadyInitialised(scopeRoot: string): DomainError {
  return new DomainError(
    `project already initialised at ${scopeRoot} — 'keel new' is greenfield-only`,
    'keel.already-initialised',
  );
}

/**
 * Relative ref from one service directory to a sibling's, with posix
 * separators — correct at any nesting depth (`apps/backend` →
 * `apps/frontend` is `../frontend`, not `../apps/frontend`).
 */
export function peerRef(fromServicePath: string, toServicePath: string): string {
  return toPosix(path.relative(fromServicePath, toServicePath));
}

/**
 * The peers a service sees: every sibling's declared projections,
 * ref'd relative to the service's own directory.
 */
function peersFor(service: PresetService, all: readonly PresetService[]): PeerLink[] {
  return all
    .filter((other) => other.path !== service.path)
    .map((other) => ({
      ref: peerRef(service.path, other.path),
      tags: [...(other.stack.projects ?? [])].sort(),
    }));
}

function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}
