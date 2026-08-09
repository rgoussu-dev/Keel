/**
 * Handler for `keel.new-project` — bootstrap a greenfield project
 * from a stack preset.
 *
 * Pipeline:
 *   1. Resolve the stack preset (`quarkus-cli`, …).
 *   2. Refuse if a manifest already exists under the project scope —
 *      `keel new` is greenfield-only; brownfield is `keel add`.
 *   3. Build an empty v2 manifest seeded with the stack's tags and
 *      any pre-supplied sticky answers.
 *   4. Install each vertical in stack order against a fresh Tree.
 *      Tags emitted by adapters via `tagsAdd` accumulate into the
 *      manifest snapshot the next vertical sees.
 *   5. Under dry-run: report the plan, commit nothing.
 *   6. Otherwise: commit the Tree, persist the manifest, then run
 *      the deferred actions. Persisting the manifest *before*
 *      actions keeps the workspace recoverable if an action throws
 *      (e.g. `gradle wrapper` with no `gradle` on PATH) — files and
 *      manifest stay in sync.
 */

import type { Action } from '../../kernel/action.js';
import type { Handler } from '../../kernel/handler.js';
import { DomainError, err, ok, type Result } from '../../kernel/result.js';
import type { InstallReport, NewProjectCommand } from '../../contract/commands.js';
import type { DeferredAction } from '../../contract/composition.js';
import { emptyManifestV2, projectScopeRoot, type ManifestV2 } from '../../contract/manifest.js';
import { runActions } from '../actions.js';
import { installVertical } from '../install.js';
import { getStack, listStackIds } from '../stacks.js';
import type { InstallDeps } from './deps.js';

/** Executes {@link NewProjectCommand}s. */
export class NewProjectHandler implements Handler<NewProjectCommand> {
  constructor(private readonly deps: InstallDeps) {}

  supports(action: Action): action is NewProjectCommand {
    return action.kind === 'keel.new-project';
  }

  async handle(command: NewProjectCommand): Promise<Result<InstallReport>> {
    const stack = getStack(command.stack);
    if (!stack) {
      return err(
        new DomainError(
          `unknown stack '${command.stack}'; available: ${listStackIds().join(', ')}`,
          'keel.unknown-stack',
        ),
      );
    }

    const scopeRoot = projectScopeRoot(command.cwd);
    if ((await this.deps.manifests.read(scopeRoot)) !== null) {
      return err(
        new DomainError(
          `project already initialised at ${scopeRoot} — 'keel new' is greenfield-only`,
          'keel.already-initialised',
        ),
      );
    }

    const now = this.deps.clock.nowIso();
    let manifest: ManifestV2 = {
      ...emptyManifestV2(now, this.deps.keelVersion),
      tags: [...stack.tags].sort(),
      answers: command.answers,
    };

    const tree = this.deps.trees(command.cwd);
    const collected: DeferredAction[] = [];

    for (const vertical of stack.verticals) {
      const result = await installVertical({
        vertical,
        manifest,
        tree,
        mode: command.interactive ? 'interactive' : 'non-interactive',
        prompt: this.deps.prompt,
        logger: this.deps.logger,
        cwd: command.cwd,
        templates: this.deps.templates,
        processes: this.deps.processes,
        now: () => now,
      });
      manifest = result.manifest;
      collected.push(...result.applyResult.actions);
    }

    const report: InstallReport = {
      subject: stack.id,
      changes: tree.changes(),
      actions: collected.map((a) => a.description),
      committed: !command.dryRun,
    };

    if (command.dryRun) return ok(report);

    await tree.commit();
    // Persist the manifest BEFORE running deferred actions: actions
    // shell out (e.g. `gradle wrapper`) and may fail on a missing
    // tool. The tree is already on disk at this point, so a coherent
    // manifest paired with those files is the recoverable state — the
    // alternative leaves a populated workspace with no manifest, and
    // a re-run hits the existing-files conflict path with no breadcrumbs.
    await this.deps.manifests.write(scopeRoot, manifest);
    const runDeferred = this.deps.runDeferred ?? runActions;
    await runDeferred({
      actions: collected,
      cwd: command.cwd,
      logger: this.deps.logger,
      processes: this.deps.processes,
      dryRun: false,
    });
    return ok(report);
  }
}
