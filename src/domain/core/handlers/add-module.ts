/**
 * Handler for `keel.add-module` — add a named bounded context to an
 * existing modulith project.
 *
 * **The front door does all the refusing, and that is the design.**
 * A context is emitted by adapters that declare `covers: []`, so the
 * resolver's uncovered-dimension hard-fail — the check that catches
 * "no adapter for this stack" everywhere else in keel — structurally
 * cannot fire for them. A project whose language has no context
 * adapter resolves cleanly and emits nothing, and the user who asked
 * for a bounded context is told nothing and gets none. That is the
 * exact bug I.6 found behind `--with-peer-context`; `add module` has
 * the identical hole and gets the identical answer, through the same
 * {@link emitsFor} probe rather than a second copy of it.
 *
 * Seven refusals, each naming what the user can do about it:
 *
 *   1. **The name** — one word, validated against the intersection of
 *      what all six identifier spellings accept
 *      ({@link parseModuleName}).
 *   2. **Not initialised** — no manifest under the project scope.
 *   3. **The flat layout** — `basic` is a single hexagon with no seam
 *      for contexts to meet at, so there is nothing to add a *second*
 *      one to. The only one of the seven that is not written here:
 *      it is a combination of capability tags (`modules.context`
 *      without `layout.modulith`), so the vertical declares it as
 *      `CONTEXT_NEEDS_MODULITH` and this handler reads the
 *      declaration. The other six are about a *name*, a manifest's
 *      state, or an adapter set — none of them a tag conflict, and
 *      inventing a tag to make one is how a declaration stops meaning
 *      anything.
 *   4. **Composite stacks** — a product root holds services, each
 *      with its own manifest and its own layout; `add module` runs
 *      inside one service, not across a product.
 *   5. **The name is taken** — checked against
 *      {@link ManifestV2.modules}, which records the skeleton's own
 *      context and the `--with-peer-context` one as well as anything
 *      added since, so `keel add module greeting` is refused instead
 *      of colliding on disk.
 *   6. **`--consumes`** — must name a context that exists, must not
 *      be the context being added, and must name one that publishes
 *      a seam. The `--with-peer-context` context is the case that
 *      makes the last check real: it is a pure consumer, so it is a
 *      legal name and an impossible target.
 *   7. **No adapter** — the coverage gate above.
 *
 * Four of them turn on the project alone — 2, 4, 3 and 7, in the order
 * the handler runs them — and are {@link moduleRefusal}, which
 * `keel.project-status` asks too, so a front end greys the control out
 * by the front door's own gates, and says why in its own words.
 *
 * What the front door cannot read is the files the context is wired
 * into. A composition root that no longer holds its list in a shape
 * keel can read, or a Kotlin mediator already taking a parameter of
 * the context's name — `clock`, where persistence injects its `Clock`
 * — is a fact about that file, which the user may have edited, not
 * about the manifest: the adapter patching it refuses it as
 * `keel.path-conflict`, naming the file, before anything is written.
 * The same clash in the other order is where a card and its add part:
 * after `keel add module clock` on Micronaut Kotlin, persistence's card
 * reads the manifest and shows it ready, and only its preview and its
 * add meet the mediator's `clock` and refuse it. Nothing declares the
 * names a stack's root takes for its own, which is what would let this
 * front door refuse `clock` there first (roadmap Q3.5).
 *
 * Pipeline after that is the `add-vertical` shape: install against a
 * Tree rooted at cwd, and under a real run commit the tree, persist
 * the manifest, then run deferred actions — manifest before actions,
 * so a failed `cargo check` leaves a coherent pair and a re-run
 * correctly refuses the now-installed name.
 */

import type { Action } from '../../kernel/action.js';
import type { Handler } from '../../kernel/handler.js';
import { DomainError, err, ok, type Result } from '../../kernel/result.js';
import type { AddModuleCommand, InstallReport } from '../../contract/commands.js';
import type { InstalledModule, ManifestV2 } from '../../contract/manifest.js';
import { projectScopeRoot } from '../../contract/manifest.js';
import {
  NO_PROJECT_NEARBY,
  NOT_INITIALISED_CODE,
  notInitialisedSentence,
} from '../../contract/nearby.js';
import type { Tag, Tree } from '../../contract/composition.js';
import { runActions } from '../actions.js';
import { addModuleInputs, CONTEXT_TAG, withoutAddModuleInputs } from '../adapters/added-context.js';
import { emitsFor } from '../adapters/context-support.js';
import { parseModuleName, type ModuleName } from '../adapters/module-name.js';
import { conflictsOf, violatedBy } from '../compatibility.js';
import { moduleRulesRefusal } from '../refusals.js';
import { harnessGenerationRefusal } from '../harness-generation.js';
import { installVertical, rehashEntries } from '../install.js';
import { historyOf, resolvedAdapters, strayAnswerRefusal } from '../supplied-answers.js';
import { newOwnership, projectDocsIndex } from '../apply.js';
import { projectDocs } from '../docs-projection.js';
import { nearbyProjects, type NearbyReading } from '../scope.js';
import { boundedContextVertical } from '../verticals/bounded-context.js';
import type { InstallDeps } from './deps.js';

/**
 * Error code the front door's own refusals carry. The declared
 * incompatibility is the exception: it answers with `keel.incompatible`,
 * the code every violated `Conflict` refuses under, wherever the
 * assembly was put together.
 */
const INVALID = 'keel.invalid-module';

/** No project near, and nothing read: where {@link moduleRefusal} is asked of a manifest. */
const NOTHING_NEARBY: NearbyReading = { ...NO_PROJECT_NEARBY, manifests: new Map() };

/** Executes {@link AddModuleCommand}s. */
export class AddModuleHandler implements Handler<AddModuleCommand> {
  constructor(private readonly deps: InstallDeps) {}

  supports(action: Action): action is AddModuleCommand {
    return action.kind === 'keel.add-module';
  }

  async handle(command: AddModuleCommand): Promise<Result<InstallReport>> {
    const name = parseModuleName(command.module);
    if (!name.ok) return name;

    const scopeRoot = projectScopeRoot(command.cwd);
    const stored = await this.deps.manifests.read(scopeRoot);
    if (!stored) {
      return err(notInitialised(scopeRoot, await nearbyProjects(this.deps, command.cwd)));
    }

    // A product root takes no bounded context in any generation: it is
    // refused as one below, as the status greys the control out there,
    // rather than told to pin a keel that refuses it too.
    const stale =
      stored.services.length > 0
        ? null
        : harnessGenerationRefusal(stored, `keel add module ${name.value}`);
    if (stale !== null) return err(stale);

    const gate = admissible(stored, name.value, command.consumes ?? null);
    if (!gate.ok) return gate;

    const now = this.deps.clock.nowIso();
    const tree = this.deps.trees(command.cwd);
    const recorded: readonly InstalledModule[] = [
      ...stored.modules,
      {
        name: name.value,
        installedAt: now,
        seam: true,
        ...(gate.value === null ? {} : { consumes: gate.value.name }),
      },
    ];
    const seeded: ManifestV2 = {
      ...stored,
      tags: [...stored.tags, CONTEXT_TAG].sort(),
      answers: {
        ...stored.answers,
        ...addModuleInputs({ name: name.value, consumes: gate.value?.name ?? null }),
      },
    };

    const result = await installVertical({
      vertical: boundedContextVertical,
      manifest: seeded,
      supplied: command.answers,
      tree,
      mode: command.interactive ? 'interactive' : 'non-interactive',
      prompt: this.deps.prompt,
      logger: this.deps.logger,
      cwd: command.cwd,
      templates: this.deps.templates,
      processes: this.deps.processes,
      now: () => now,
      registry: this.deps.registry,
    });
    // An answer none of the context's adapters read is refused, as the
    // other front doors refuse one, before anything is committed.
    const plan = resolvedAdapters(result.adapters);
    const stray = strayAnswerRefusal(
      command.answers,
      plan,
      historyOf(this.deps.registry, stored),
      result.reads,
    );
    if (stray !== null) return err(stray);

    // The context is a structural fact, so the index moves with it in
    // the same apply — nothing is left for a later `keel docs sync`
    // to notice. It is the full projection rather than this run's
    // declarations because the directory the contexts live in is the
    // family kit's declaration, and the kit does not run here.
    const next: ManifestV2 = { ...result.manifest, modules: recorded };
    const indexed = await this.reindex(command.cwd, next, tree);
    const manifest = rehashEntries(result.manifest, tree, indexed);

    const report: InstallReport = {
      subject: name.value,
      changes: tree.changes(),
      actions: result.applyResult.actions.map((a) => a.description),
      committed: !command.dryRun,
      ...(plan.length > 0 ? { resolvedAdapters: plan } : {}),
      ...(result.applyResult.skippedHarnessElements
        ? { skippedHarnessElements: result.applyResult.skippedHarnessElements }
        : {}),
    };

    if (command.dryRun) return ok(report);

    await tree.commit();
    await this.deps.manifests.write(scopeRoot, {
      ...withoutAddModuleInputs(manifest),
      modules: [...recorded],
    });
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
   * Re-projects the navigation index over the manifest this run is
   * about to write, so the new context has its row before anything is
   * committed. Merged rather than replaced: the replay is complete,
   * but a row a person put in the slot by hand is still theirs until
   * `keel docs sync` says otherwise. Returns the documents it wrote:
   * the harness pass recorded them before the new row was in.
   */
  private async reindex(cwd: string, manifest: ManifestV2, tree: Tree): Promise<readonly string[]> {
    const { regions } = await projectDocs({
      ...this.deps,
      manifest,
      tree,
      cwd,
      now: () => manifest.updatedAt,
    });
    return projectDocsIndex(regions, tree, newOwnership(), { merge: true }).map(
      (file) => file.path,
    );
  }
}

/**
 * Why `keel add module` is refused where `scopeRoot` is, before it
 * reads a name — the gates that turn on the project alone, in the
 * order the front door runs them: no project, a composite product
 * root, the flat layout, a stack with no context adapter. Null when a
 * context can be added here, given a name.
 *
 * Exported for `keel.project-status`, whose `canAddModule` is this
 * being null and whose `moduleRefusal` is what it returns: a control
 * greyed out by the front door's own gates, with the front door's own
 * sentence, cannot say something different from the click. `name`
 * spells the command the product-root sentence tells the user to run
 * in a service; a status, with no name to hand, says `<name>`. Where
 * there is no project, `nearby` is where the nearest ones are, with
 * their manifests (`../scope.ts` `nearbyProjects`, which both read
 * once), so a directory inside a project points at it rather than at
 * `keel new`, refused there — or says why it takes no context either.
 */
export function moduleRefusal(
  manifest: ManifestV2 | null,
  scopeRoot: string,
  name = '<name>',
  nearby: NearbyReading = NOTHING_NEARBY,
): DomainError | null {
  if (manifest === null) return notInitialised(scopeRoot, nearby);

  if (manifest.services.length > 0) {
    return new DomainError(
      `this is a composite project root holding ${String(manifest.services.length)} services — a bounded context belongs to one service, so run 'keel add module ${name}' inside the service directory instead`,
      INVALID,
    );
  }

  // The layout rule, as the vertical declares it rather than as a
  // branch here — `CONTEXT_NEEDS_MODULITH`, evaluated against the tag
  // set this run would carry — worded as its reason, never the tags
  // that tripped it, with its id in the refusal's data. The project
  // status shows this sentence beside the tab it disables.
  const broken = violatedBy(conflictsOf([boundedContextVertical]), [...manifest.tags, CONTEXT_TAG]);
  if (broken.length > 0) return moduleRulesRefusal(boundedContextVertical, broken);

  if (!emitsFor([boundedContextVertical], CONTEXT_TAG, manifest.tags)) {
    return new DomainError(
      `no bounded-context adapter matches this project (tags: ${languageTags(manifest.tags).join(', ') || 'none'}) — 'keel add module' would scaffold nothing at all. Supported: ${supportedLanguages().join(', ')}`,
      INVALID,
    );
  }
  return null;
}

/**
 * The refusal of `keel add module` where no keel project is: pointing
 * at the project the directory is inside — at its services, where it
 * is a product root, which takes no bounded context — or the services
 * below it, where there are, and at scaffolding a modulith where there
 * are not. Where each project it would point at takes no context
 * either — the flat layout, which scaffolds default to — it says why
 * ({@link moduleRefusal} of each, off the manifest the walk read).
 */
function notInitialised(scopeRoot: string, nearby: NearbyReading): DomainError {
  const refusedAt = (named: string): string | null => {
    const manifest = nearby.manifests.get(named) ?? null;
    const refused = manifest === null ? null : moduleRefusal(manifest, '');
    if (refused === null) return null;
    // A rule's reason opens its own sentence capitalised; here it goes on from one.
    return `${refused.message.charAt(0).toLowerCase()}${refused.message.slice(1)}`;
  };
  return new DomainError(
    notInitialisedSentence(
      scopeRoot,
      nearby,
      'keel add module',
      'keel new --stack=<id> --module-layout=modulith',
      true,
      refusedAt,
    ),
    NOT_INITIALISED_CODE,
  );
}

/**
 * Every refusal that can be made from the manifest alone, in the order
 * the user would hit them: the project's own ({@link moduleRefusal}),
 * then the name's. Returns the context `--consumes` resolved to, or
 * `null` when none was asked for.
 */
function admissible(
  manifest: ManifestV2,
  name: ModuleName,
  consumes: string | null,
): Result<InstalledModule | null> {
  const refused = moduleRefusal(manifest, '', name);
  if (refused !== null) return err(refused);

  const taken = manifest.modules.find((m) => m.name === name);
  if (taken) {
    return err(
      new DomainError(
        `this project already has a bounded context named '${name}'${
          taken.seam ? '' : ' (the one --with-peer-context scaffolded)'
        }. Contexts are ${manifest.modules.map((m) => m.name).join(', ')}`,
        INVALID,
      ),
    );
  }

  return consumes === null ? ok(null) : resolveConsumes(manifest, name, consumes);
}

/** The `--consumes` half, kept separate because it has three ways to fail. */
function resolveConsumes(
  manifest: ManifestV2,
  name: ModuleName,
  consumes: string,
): Result<InstalledModule | null> {
  if (consumes === name) {
    return err(
      new DomainError(
        `--consumes ${consumes} names the context being added; a context reaches a *peer* through its seam, not itself`,
        INVALID,
      ),
    );
  }

  const target = manifest.modules.find((m) => m.name === consumes);
  if (!target) {
    return err(
      new DomainError(
        `--consumes ${consumes}: no such bounded context in this project. Contexts are ${manifest.modules.map((m) => m.name).join(', ')}`,
        INVALID,
      ),
    );
  }

  if (!target.seam) {
    return err(
      new DomainError(
        `--consumes ${consumes}: that context publishes no user-side/service seam, so there is nothing for a gateway to bind to. It is itself a pure consumer — contexts that can be consumed here are ${consumable(manifest).join(', ')}`,
        INVALID,
      ),
    );
  }

  return ok(target);
}

/** Contexts of this project that publish a seam, for the rejection message. */
function consumable(manifest: ManifestV2): readonly string[] {
  const named = manifest.modules.filter((m) => m.seam).map((m) => m.name);
  return named.length > 0 ? named : ['none'];
}

/**
 * The project's language and layout tags, for the coverage rejection.
 *
 * `keel new` names the offending *stack* in the same message; here
 * there is no stack to name — the manifest records tags, not the
 * preset they came from — and naming the tags is not a downgrade. The
 * adapters key on language and layout, so the tags are what actually
 * decided the outcome.
 */
function languageTags(tags: readonly Tag[]): readonly Tag[] {
  return tags.filter((tag) => tag.startsWith('lang.') || tag.startsWith('layout.'));
}

/** Every language whose modulith can take an added context, derived from the adapters. */
function supportedLanguages(): readonly string[] {
  const langs = new Set<string>();
  for (const adapter of boundedContextVertical.adapters) {
    for (const tag of adapter.predicate.requires ?? []) {
      if (tag.startsWith('lang.')) langs.add(tag.slice('lang.'.length));
    }
  }
  return langs.size > 0 ? [...langs].sort() : ['none yet'];
}
