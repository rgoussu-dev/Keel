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
 *   3. Build an empty v2 manifest seeded with the stack's tags, its
 *      declared peer projections, and any pre-supplied sticky answers.
 *   4. Install each vertical in stack order against a fresh Tree.
 *      Tags emitted by adapters via `tagsAdd` accumulate into the
 *      manifest snapshot the next vertical sees.
 *   5. Under dry-run: report the plan, commit nothing.
 *   6. Otherwise: commit the Tree, persist the manifest, then run
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
 * layout is the user's choice: under **monorepo** the `vcs` vertical
 * is hoisted out of the services and runs once at the product root
 * together with the composite stack's own glue verticals; under
 * **polyrepo** every service keeps its own `vcs` run and no shared
 * root artifacts exist. Commit order matches the single flow, per
 * scope: trees, then manifests, then deferred actions (root first,
 * then services in declaration order).
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
 * named**: a language → user-side adapters → framework drill-down
 * (`../stack-wizard.ts`) narrows the catalog three questions at a
 * time and resolves to a registered stack id, so step 1 above runs
 * on its result exactly as it runs on a flag. `--stack` skips the
 * drill-down and `--yes` skips every question, both as before.
 */

import path from 'node:path';
import type { Action } from '../../kernel/action.js';
import type { Handler } from '../../kernel/handler.js';
import { DomainError, err, ok, type Result } from '../../kernel/result.js';
import type { InstallReport, NewProjectCommand, RepoLayout } from '../../contract/commands.js';
import {
  decodeSelection,
  type DeferredAction,
  type Question,
  type QuestionChoice,
  type Tree,
  type Vertical,
} from '../../contract/composition.js';
import type { Asker, Prompt } from '../../contract/ports/prompt.js';
import {
  emptyManifestV2,
  projectScopeRoot,
  type ManifestV2,
  type PeerLink,
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
  legalBuildSystems,
  legalExtraVerticals,
  legalModuleLayouts,
  peerContextOffered,
  promotedBy,
} from '../dials.js';
import { installVertical } from '../install.js';
import {
  assemblableStacks,
  getStack,
  listStackIds,
  listStacks,
  stackTagsFor,
  STACKS,
  type BuildSystemOption,
  type Stack,
  type StackSummary,
} from '../stacks.js';
import {
  entrypointStep,
  entrypointsLabel,
  frameworkChoices,
  languageChoices,
  languageLabel,
  normaliseEntrypoints,
  pathFor,
  wizardPaths,
  type EntrypointStep,
  type WizardPath,
} from '../stack-wizard.js';
import { coverageGap, coversFor, type CoverageGap } from '../resolver.js';
import { getVertical, type VerticalSummary } from '../verticals/index.js';
import { vcsVertical } from '../verticals/vcs.js';
import { WizardPrompt, type RecordedAnswer } from '../wizard-prompt.js';
import type { InstallDeps } from './deps.js';
import type { Tag } from '../../contract/composition.js';

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
 * Question ids of the three drill-down steps that *produce* a stack
 * id (see `../stack-wizard.ts`).
 *
 * Unlike the dials above, none of these binds to a field of
 * {@link NewProjectCommand}: they are intermediate, and the only
 * thing they leave behind is the `stack` the third one resolves to.
 * A front end that collects answers therefore never sees them — it
 * sends a `stack` and the drill-down is skipped, exactly as `--stack`
 * skips it.
 */
export const LANGUAGE_QUESTION_ID = 'language';

/** @see LANGUAGE_QUESTION_ID */
export const ENTRYPOINTS_QUESTION_ID = 'entrypoints';

/** @see LANGUAGE_QUESTION_ID */
export const FRAMEWORK_QUESTION_ID = 'framework';

/**
 * Question id of the wizard's extra-verticals step — a stack-level
 * dial like the four above, its answer being
 * {@link NewProjectCommand.extraVerticals} rather than an entry in
 * `manifest.answers`. A `multi-select`, so the answer is a
 * comma-joined list of vertical ids.
 */
export const EXTRA_VERTICALS_QUESTION_ID = 'extraVerticals';

/**
 * The language menu's escape hatch: pick a preset by id instead.
 *
 * The drill-down covers every stack that names a language, which is
 * every single-service preset — but a composite product
 * (`fullstack`, `fullstack-go`, …) is two services and names none,
 * so it has no place on a language menu. Rather than leave those
 * unreachable interactively, the last language choice falls through
 * to the flat list the wizard asked before this one existed.
 */
export const BY_ID_LANGUAGE = 'keel.by-id';

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

interface ResolvedService {
  readonly path: string;
  readonly stack: Stack;
  readonly extraVerticals: readonly Vertical[];
}

/** One scope (product root or service) staged by a composite install. */
interface StagedScope {
  /** Path prefix for report changes; '' for the product root. */
  readonly prefix: string;
  readonly cwd: string;
  readonly tree: Tree;
  readonly manifest: ManifestV2;
  readonly actions: readonly DeferredAction[];
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
    const resolved = await this.resolveStackId(command, prompt);
    if (!resolved.ok) return resolved;
    const stack = getStack(resolved.value);
    if (!stack) return err(unknownStackError(resolved.value));
    return stack.services
      ? this.stageComposite(command, stack, prompt)
      : this.stageSingle(command, stack, prompt);
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
   * a flat list of 33 ids is a poor way to make it — so interactively
   * it is asked as three narrowing questions rather than one wide
   * one: **language → user-side adapters → framework**, each menu
   * derived from the tags of the stacks still reachable from the
   * answers already given (see `../stack-wizard.ts`). The answer is
   * always a registered stack id, so everything downstream of here
   * cannot tell the two routes apart.
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
   * The guided drill-down, one question at a time.
   *
   * Each step is skipped when it has nothing to ask — a language
   * reaching one entrypoint combination, or an entrypoint
   * combination reaching one framework, has already answered the
   * question by existing. That is what keeps Go, Rust and TypeScript
   * from being asked "which framework?" over a menu of one.
   */
  private async drillDown(prompt: Prompt): Promise<Result<string>> {
    // Every menu below narrows within these, so filtering the input is
    // what guards the whole drill-down: a preset no setting of its
    // dials can assemble legally is absent from the language list, the
    // adapter list and the framework list at once, and from the flat
    // escape hatch too. One filter, because they are all one walk over
    // the same set.
    const paths = wizardPaths(assemblableStacks());
    const language = (await prompt.ask(languageQuestion(paths), NEW_PROJECT_ASKER)).trim();
    if (language === BY_ID_LANGUAGE) {
      return ok((await prompt.ask(stackQuestion(listStacks()), NEW_PROJECT_ASKER)).trim());
    }

    const step = entrypointStep(paths, language, DEFAULT_STACK_ID);
    const entrypoints =
      step === null
        ? (paths.find((path) => path.language === language)?.entrypoints ?? [])
        : normaliseEntrypoints(
            await prompt.ask(entrypointQuestion(step, language), NEW_PROJECT_ASKER),
          );

    const frameworks = frameworkChoices(paths, language, entrypoints);
    const framework =
      frameworks === null
        ? null
        : (
            await prompt.ask(
              frameworkQuestion(frameworks, defaultFramework(paths, frameworks)),
              NEW_PROJECT_ASKER,
            )
          ).trim();

    const chosen = pathFor(paths, language, entrypoints, framework);
    if (chosen === null) return err(noSuchCombination(language, entrypoints, framework));
    // The composed stack is the surprising half of a two-entrypoint
    // pick — "both" means one hexagon with two ways in, not two
    // services — so the run says which preset it landed on rather
    // than leaving it to be inferred from the file list.
    this.deps.logger.info(
      `keel new: ${languageLabel(language)} + ${entrypointsLabel(entrypoints)}${
        framework === null || framework === '' ? '' : ` + ${framework}`
      } → ${chosen.stackId}`,
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

    const legal = assemblyIsLegal(stack, extras.value, [
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
      skipVcs: false,
      extraVerticals: extras.value,
      command,
      now,
      prompt,
    });

    const report: InstallReport = {
      subject: stack.id,
      changes: staged.tree.changes(),
      actions: staged.actions.map((a) => a.description),
      committed: !command.dryRun,
    };

    return ok({ report, scopes: [staged] });
  }

  private async stageComposite(
    command: NewProjectCommand,
    stack: Stack,
    prompt: Prompt,
  ): Promise<Result<StagedPlan>> {
    const resolved: ResolvedService[] = [];
    for (const service of stack.services ?? []) {
      const serviceStack = getStack(service.stack);
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

    if (command.extraVerticals !== undefined && command.extraVerticals.length > 0) {
      return err(
        new DomainError(
          `stack '${stack.id}' is composite — each service declares its own extra verticals, and '--with' names no service. Scaffold the product, then 'keel add ${command.extraVerticals[0] ?? ''}' inside the service that needs it`,
          'keel.invalid-extra-verticals',
        ),
      );
    }

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
          skipVcs: false,
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
          skipVcs: monorepo,
          extraVerticals: service.extraVerticals,
          command,
          now,
          prompt,
        }),
      );
    }

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
    const report: InstallReport = {
      subject: stack.id,
      changes,
      actions,
      committed: !command.dryRun,
    };

    return ok({ report, scopes });
  }

  /**
   * Installs one stack's verticals against a fresh manifest and Tree
   * rooted at `cwd`. Nothing is committed — the caller owns commit
   * order across scopes.
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
    skipVcs: boolean;
    extraVerticals?: readonly Vertical[];
    command: NewProjectCommand;
    now: string;
    prompt: Prompt;
  }): Promise<StagedScope> {
    let manifest: ManifestV2 = {
      ...emptyManifestV2(inputs.now, this.deps.keelVersion),
      tags: [
        ...inputs.stack.tags,
        ...(inputs.buildTag ? [inputs.buildTag] : []),
        ...(inputs.layoutTag ? [inputs.layoutTag] : []),
        ...(inputs.peerTag ? [inputs.peerTag] : []),
      ].sort(),
      answers: inputs.command.answers,
      projects: [...(inputs.stack.projects ?? [])],
      peers: inputs.peers,
      services: inputs.services,
      modules: scaffoldedModules(inputs.layoutTag, inputs.peerTag ?? null, inputs.now),
    };

    const tree = this.deps.trees(inputs.cwd);
    const collected: DeferredAction[] = [];
    const own = inputs.skipVcs
      ? inputs.stack.verticals.filter((v) => v.id !== vcsVertical.id)
      : inputs.stack.verticals;
    const verticals = [...own, ...(inputs.extraVerticals ?? [])];

    for (const vertical of verticals) {
      const result = await installVertical({
        vertical,
        manifest,
        tree,
        mode: inputs.command.interactive ? 'interactive' : 'non-interactive',
        prompt: inputs.prompt,
        logger: this.deps.logger,
        cwd: inputs.cwd,
        templates: this.deps.templates,
        processes: this.deps.processes,
        now: () => inputs.now,
      });
      manifest = result.manifest;
      collected.push(...result.applyResult.actions);
    }

    return { prefix: inputs.prefix, cwd: inputs.cwd, tree, manifest, actions: collected };
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
    services: readonly ResolvedService[],
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
    return peerContextTag(want, stack, buildTag);
  }

  /**
   * Resolves the verticals to layer on top of the stack's own: the
   * `--with` list when supplied, the interactive multi-select
   * otherwise, none when neither.
   *
   * **The menu is pruned twice.** The stack's own verticals are off
   * it — the stack installs them either way, and naming one would be
   * asking for a second install of something already in the plan.
   * And so is any vertical whose dimensions no adapter covers for
   * this stack: `persistence` on a CLI-only preset resolves to
   * nothing and would hard-fail at install, which is the dead end an
   * interactive flow must not offer. That probe is
   * {@link coversFor}, run against the tag set the other three dials
   * settled — which is why this question comes last among them —
   * plus what the stack's own verticals promote on their way past.
   *
   * `--with` is not pruned the same way — it is checked, not
   * filtered: a name that is not a registered vertical, or is one the
   * stack already carries, is refused at the front door with the list
   * spelled out, exactly as `keel add` refuses an unknown id. Coverage
   * is checked there too, but not with the menu's flat probe — see
   * {@link preflightCoverage}.
   */
  private async resolveExtraVerticals(
    command: NewProjectCommand,
    stack: Stack,
    prompt: Prompt,
    tags: readonly Tag[],
  ): Promise<Result<readonly Vertical[]>> {
    const own = new Set(stack.verticals.map((v) => v.id));
    // What is on the table before any extra runs: the dials' tags
    // plus whatever the stack's own verticals promote while
    // installing. A stack that ships `distribution` itself makes
    // `iac` legal here, and neither the menu nor the front door
    // should pretend otherwise.
    const seed = [...tags, ...promotedBy(stack.verticals)];
    // The same menu `keel.dials` reports, so a form's list and this
    // question's choices cannot come apart — see `../dials.ts` for
    // what makes an extra a dead end here.
    const candidates = legalExtraVerticals(stack, tags);
    const requested =
      command.extraVerticals !== undefined
        ? command.extraVerticals
        : !command.interactive || candidates.length === 0
          ? []
          : decodeSelection(
              await prompt.ask(extraVerticalsQuestion(candidates, stack), stackAsker(stack)),
            );

    const chosen: Vertical[] = [];
    for (const id of requested) {
      if (own.has(id)) {
        return err(
          new DomainError(
            `stack '${stack.id}' already installs vertical '${id}' — remove it from --with`,
            'keel.invalid-extra-verticals',
          ),
        );
      }
      const vertical = getVertical(id);
      if (!vertical) {
        return err(
          new DomainError(
            `unknown vertical '${id}'; available on top of stack '${stack.id}': ${candidates
              .map((v) => v.id)
              .join(', ')}`,
            'keel.unknown-vertical',
          ),
        );
      }
      if (chosen.some((v) => v.id === id)) {
        return err(
          new DomainError(`--with names vertical '${id}' twice`, 'keel.invalid-extra-verticals'),
        );
      }
      chosen.push(vertical);
    }

    const refusal = preflightCoverage(stack, chosen, seed);
    if (refusal) return err(refusal);
    return ok(chosen);
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

/**
 * The front door's coverage check for `--with`: refuses an extra no
 * adapter here can cover, *before* any adapter question is asked.
 *
 * It cannot be the menu's flat `coversFor` probe. That probe is
 * conservative — it sees the tags it is given, never the ones an
 * adapter promotes at install time — and conservatism that only hides
 * a menu entry becomes a wrong answer the moment it refuses a
 * command: `--with distribution,iac` is exactly the composition
 * `--with` exists for (`iac` is keyed on the `dist.container-image`
 * tag `distribution` promotes), and a flat probe rejects it.
 *
 * So the check walks the extras the way the install will run them —
 * in the order named, each against the tags its predecessors leave
 * behind, seeded with what the stack's own verticals promote. What
 * "leave behind" means statically is `Vertical.promotes`, the union
 * of tags a vertical's adapters may add; over-declaring there only
 * defers a refusal to the resolver, and under-declaring is what the
 * installer's own assertion exists to prevent.
 *
 * That leaves three outcomes per extra, and the middle one is the
 * reason the walk is ordered rather than a set operation:
 *
 *   - covered at its turn → nothing to say;
 *   - uncovered now, covered once a *later* extra has run → the
 *     order is the bug, so the refusal names the extra to list it
 *     after rather than pretending the composition is illegal;
 *   - uncovered whatever the rest of the list does → the stack
 *     cannot carry it, named with the dimension and the tags that
 *     would have covered it.
 *
 * The resolver's `ResolutionError` stays a throw: it escapes
 * `installVertical` from every caller (`keel add` on a project whose
 * shape cannot take the vertical does the same), and turning it into
 * an `Err` is a decision about every escape from the install engine,
 * not about `--with`. This path simply no longer reaches it — and
 * refuses with more than it could have said.
 */
function preflightCoverage(
  stack: Stack,
  chosen: readonly Vertical[],
  seed: readonly Tag[],
): DomainError | null {
  const running = new Set<Tag>(seed);
  for (const [index, vertical] of chosen.entries()) {
    const gap = coverageGap(vertical, running);
    if (gap === null) {
      for (const tag of vertical.promotes ?? []) running.add(tag);
      continue;
    }
    const later = chosen.slice(index + 1);
    const singleHanded = later.filter((other) =>
      coversFor(vertical, [...running, ...(other.promotes ?? [])]),
    );
    if (singleHanded.length > 0) return outOfOrder(vertical, gap, singleHanded);
    if (coversFor(vertical, [...running, ...promotedBy(later)])) {
      return outOfOrder(
        vertical,
        gap,
        later.filter((other) => (other.promotes ?? []).length > 0),
      );
    }
    return uncoverable(stack, vertical, gap);
  }
  return null;
}

/** The refusal for an extra listed before whatever would enable it. */
function outOfOrder(
  vertical: Vertical,
  gap: CoverageGap,
  enablers: readonly Vertical[],
): DomainError {
  const names = enablers.map((v) => `'${v.id}'`).join(' and ');
  const promote = enablers.length > 1 ? 'promote' : 'promotes';
  return new DomainError(
    `vertical '${vertical.id}' cannot be installed before ${names}: dimension(s) ${gap.dimensions.join(
      ', ',
    )} need tag(s) ${gap.enablers.join(', ')}, which ${names} ${promote} — --with installs extras in the order named, so list '${vertical.id}' after ${names}`,
    'keel.extra-verticals-order',
  );
}

/** The refusal for an extra this stack has no adapter for, in any order. */
function uncoverable(stack: Stack, vertical: Vertical, gap: CoverageGap): DomainError {
  const missing = `no adapter covers dimension(s) ${gap.dimensions.join(', ')}`;
  const fix =
    gap.enablers.length > 0
      ? `an adapter would need tag(s) ${gap.enablers.join(', ')}, which this stack does not have — drop '${vertical.id}' from --with, or scaffold a stack that does`
      : `no adapter of '${vertical.id}' can cover them here — drop it from --with`;
  return new DomainError(
    `stack '${stack.id}' cannot carry vertical '${vertical.id}': ${missing}; ${fix}`,
    'keel.uncoverable-vertical',
  );
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
 * The drill-down's first question. Its last choice is the escape
 * hatch onto {@link stackQuestion}; the rest are derived from the
 * catalog, so a stack in a new language appears here by itself.
 */
function languageQuestion(paths: readonly WizardPath[]): Question {
  return {
    id: LANGUAGE_QUESTION_ID,
    prompt: 'Language',
    doc: 'The language the project is written in. Everything after this narrows within it.',
    choices: [
      ...languageChoices(paths),
      {
        value: BY_ID_LANGUAGE,
        label: 'Other — pick a preset by id',
        doc: 'The flat list of every preset, including the fullstack products (two services), which name no single language.',
      },
    ],
    default: languageOf(paths, DEFAULT_STACK_ID) ?? languageChoices(paths)[0]?.value ?? '',
    memory: 'repeat',
  };
}

/**
 * The drill-down's second question: which user-side adapters the
 * project is driven through.
 *
 * A set, not a choice — and the `doc` says what picking two means,
 * because that is the one answer here with a counter-intuitive
 * result: it resolves to the **composed** preset, one hexagon with
 * two entrypoints, and never to a two-service product.
 */
function entrypointQuestion(step: EntrypointStep, language: string): Question {
  return {
    id: ENTRYPOINTS_QUESTION_ID,
    prompt: `User-side adapters (${languageLabel(language)})`,
    doc: 'How the outside world drives the hexagon. Picking more than one gives the composed preset — one project, one domain, both entrypoints — not two services. Two services is a fullstack product, which lives under "Other" on the previous question.',
    kind: step.kind,
    choices: step.choices,
    default: step.default,
    memory: 'repeat',
  };
}

/** The drill-down's third question, asked only where a choice remains. */
function frameworkQuestion(choices: readonly QuestionChoice[], fallback: string): Question {
  return {
    id: FRAMEWORK_QUESTION_ID,
    prompt: 'Framework',
    doc: 'Which framework the adapters are built on. Only asked where the language and adapters chosen leave more than one open.',
    choices,
    default: fallback,
    memory: 'repeat',
  };
}

/** The language node a given preset sits under, or null if it has none. */
function languageOf(paths: readonly WizardPath[], stackId: string): string | null {
  return paths.find((path) => path.stackId === stackId)?.language ?? null;
}

/**
 * The framework the drill-down offers first: the default preset's own
 * where that is on the menu, the first choice otherwise. Together
 * with the other two defaults it means pressing enter through the
 * whole wizard lands on the same preset an omitted `--stack` has
 * always defaulted to.
 */
function defaultFramework(
  paths: readonly WizardPath[],
  choices: readonly QuestionChoice[],
): string {
  const preferred = paths.find((path) => path.stackId === DEFAULT_STACK_ID)?.framework ?? '';
  if (choices.some((choice) => choice.value === preferred)) return preferred;
  return choices[0]?.value ?? '';
}

/**
 * A combination the menus should never have offered. Reachable only
 * from an answer the menus did not produce — a scripted prompt, or a
 * front end posting its own — so it names what it was given rather
 * than guessing at a near miss.
 */
function noSuchCombination(
  language: string,
  entrypoints: readonly string[],
  framework: string | null,
): DomainError {
  const named = framework === null || framework === '' ? '' : ` on ${framework}`;
  return new DomainError(
    `no preset scaffolds ${languageLabel(language)} with ${
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
 * answer that needs no justification.
 */
function extraVerticalsQuestion(candidates: readonly VerticalSummary[], stack: Stack): Question {
  return {
    id: EXTRA_VERTICALS_QUESTION_ID,
    prompt: 'Additional verticals',
    doc: `Installed on top of what '${stack.id}' already brings, in the same run — so they resolve against one another's tags and the review below shows one plan. Everything here is also available later with 'keel add'.`,
    kind: 'multi-select',
    choices: candidates.map((v) => ({ value: v.id, label: v.id, doc: v.description })),
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

function unknownStackError(id: string): DomainError {
  return new DomainError(
    `unknown stack '${id}'; available: ${listStackIds().join(', ')}`,
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
  service: ResolvedService,
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
  services: readonly ResolvedService[],
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
function peerContextTag(want: boolean, stack: Stack, buildTag: Tag | null): Result<Tag | null> {
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
        `stack '${stack.id}' has no peer-context adapter — --with-peer-context would scaffold nothing at all. Stacks that support it: ${peerContextStackIds().join(', ')}`,
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
  return [skeleton, { name: PEER_MODULE, installedAt: now, seam: false }];
}

/** The tag set a single-service install of `stack` would carry. */

/**
 * Every single-service stack whose modulith carries a peer context,
 * for the rejection message. Derived the same way, on the same
 * defaults `keel new` itself would pick.
 */
function peerContextStackIds(): readonly string[] {
  return Object.values(STACKS)
    .filter((stack) => stack.services === undefined)
    .filter((stack) =>
      emitsPeerContext(stack, stackTagsFor(stack, defaultBuildTag(stack), MODULITH_LAYOUT_TAG)),
    )
    .map((stack) => stack.id)
    .sort();
}

/** The default module-layout tag of a service stack, if it declares a choice. */
function defaultLayoutTag(stack: Stack): Tag | null {
  return stack.moduleLayouts?.[0]?.tag ?? null;
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
function peersFor(service: ResolvedService, all: readonly ResolvedService[]): PeerLink[] {
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
