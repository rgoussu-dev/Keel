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
 *      one to.
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
import type { Tag } from '../../contract/composition.js';
import { runActions } from '../actions.js';
import {
  addModuleInputs,
  CONSUMES_TAG,
  CONTEXT_TAG,
  withoutAddModuleInputs,
} from '../adapters/added-context.js';
import { emitsFor } from '../adapters/context-support.js';
import { moduleLayoutOf } from '../adapters/module-layout.js';
import { parseModuleName, type ModuleName } from '../adapters/module-name.js';
import { installVertical } from '../install.js';
import { boundedContextVertical } from '../verticals/bounded-context.js';
import type { InstallDeps } from './deps.js';

/** Error code every front-door refusal carries. */
const INVALID = 'keel.invalid-module';

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
      return err(
        new DomainError(
          `no project initialised at ${scopeRoot} — run 'keel new --stack=<id> --module-layout=modulith' first`,
          'keel.not-initialised',
        ),
      );
    }

    const gate = admissible(stored, name.value, command.consumes ?? null);
    if (!gate.ok) return gate;

    const now = this.deps.clock.nowIso();
    const tree = this.deps.trees(command.cwd);
    const seeded: ManifestV2 = {
      ...stored,
      tags: [...stored.tags, CONTEXT_TAG, ...(gate.value ? [CONSUMES_TAG] : [])].sort(),
      answers: {
        ...stored.answers,
        ...addModuleInputs({ name: name.value, consumes: gate.value?.name ?? null }),
      },
    };

    const result = await installVertical({
      vertical: boundedContextVertical,
      manifest: seeded,
      tree,
      mode: command.interactive ? 'interactive' : 'non-interactive',
      prompt: this.deps.prompt,
      logger: this.deps.logger,
      cwd: command.cwd,
      templates: this.deps.templates,
      processes: this.deps.processes,
      now: () => now,
    });

    const report: InstallReport = {
      subject: name.value,
      changes: tree.changes(),
      actions: result.applyResult.actions.map((a) => a.description),
      committed: !command.dryRun,
    };

    if (command.dryRun) return ok(report);

    await tree.commit();
    await this.deps.manifests.write(scopeRoot, {
      ...withoutAddModuleInputs(result.manifest),
      modules: [...stored.modules, { name: name.value, installedAt: now, seam: true }],
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
}

/**
 * Every refusal that can be made from the manifest alone, in the order
 * the user would hit them. Returns the context `--consumes` resolved
 * to, or `null` when none was asked for.
 */
function admissible(
  manifest: ManifestV2,
  name: ModuleName,
  consumes: string | null,
): Result<InstalledModule | null> {
  if (manifest.services.length > 0) {
    return err(
      new DomainError(
        `this is a composite project root holding ${String(manifest.services.length)} services — a bounded context belongs to one service, so run 'keel add module ${name}' inside the service directory instead`,
        INVALID,
      ),
    );
  }

  if (moduleLayoutOf(manifest.tags) !== 'modulith') {
    return err(
      new DomainError(
        `this project uses the flat module layout: one hexagon for the whole service, with no peer-facing seam for a second bounded context to meet the first at. 'keel add module' needs a project scaffolded with --module-layout=modulith`,
        INVALID,
      ),
    );
  }

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

  if (!emitsFor([boundedContextVertical], CONTEXT_TAG, manifest.tags)) {
    return err(
      new DomainError(
        `no bounded-context adapter matches this project (tags: ${languageTags(manifest.tags).join(', ') || 'none'}) — 'keel add module' would scaffold nothing at all. Supported: ${supportedLanguages().join(', ')}`,
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
