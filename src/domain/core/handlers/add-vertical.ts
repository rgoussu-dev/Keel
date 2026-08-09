/**
 * Handler for `keel.add-vertical` — layer an additional vertical
 * onto an existing keel project (the brownfield path).
 *
 * Pipeline:
 *   1. Resolve the vertical by id from the registry; reject unknown
 *      ids with a list of available ones.
 *   2. Read the existing manifest; refuse to run if no project has
 *      been initialised under the project scope.
 *   3. Refuse if the vertical is already installed (a future
 *      `--reapply` flag will lift this; for now the safe default is
 *      to surface the duplicate to the user).
 *   4. Install the vertical against a Tree rooted at cwd. The
 *      pre-existing project files on disk live in the Tree as "real"
 *      reads — patches against them work, whole-file writes conflict
 *      (which is exactly the diagnostic we want).
 *   5. Under dry-run: report the plan, commit nothing.
 *   6. Otherwise: commit the Tree, persist the updated manifest, then
 *      run the deferred actions — manifest before actions, as in the
 *      new-project handler, so a failed action leaves a coherent
 *      (files + manifest) pair and a re-run correctly refuses the
 *      duplicate-vertical install.
 */

import type { Action } from '../../kernel/action.js';
import type { Handler } from '../../kernel/handler.js';
import { DomainError, err, ok, type Result } from '../../kernel/result.js';
import type { AddVerticalCommand, InstallReport } from '../../contract/commands.js';
import type { ManifestV2 } from '../../contract/manifest.js';
import { projectScopeRoot } from '../../contract/manifest.js';
import { runActions } from '../actions.js';
import { installVertical } from '../install.js';
import { getVertical, listVerticalIds } from '../verticals/index.js';
import type { InstallDeps } from './deps.js';

/** Executes {@link AddVerticalCommand}s. */
export class AddVerticalHandler implements Handler<AddVerticalCommand> {
  constructor(private readonly deps: InstallDeps) {}

  supports(action: Action): action is AddVerticalCommand {
    return action.kind === 'keel.add-vertical';
  }

  async handle(command: AddVerticalCommand): Promise<Result<InstallReport>> {
    const vertical = getVertical(command.vertical);
    if (!vertical) {
      return err(
        new DomainError(
          `unknown vertical '${command.vertical}'; available: ${listVerticalIds().join(', ')}`,
          'keel.unknown-vertical',
        ),
      );
    }

    const scopeRoot = projectScopeRoot(command.cwd);
    const stored = await this.deps.manifests.read(scopeRoot);
    if (!stored) {
      return err(
        new DomainError(
          `no project initialised at ${scopeRoot} — run 'keel new --stack=<id>' first to create one`,
          'keel.not-initialised',
        ),
      );
    }

    if (stored.verticals.some((v) => v.id === vertical.id)) {
      return err(
        new DomainError(
          `vertical '${vertical.id}' is already installed in this project; reapply support lands in a follow-up`,
          'keel.vertical-already-installed',
        ),
      );
    }

    const now = this.deps.clock.nowIso();
    const tree = this.deps.trees(command.cwd);
    const merged: ManifestV2 = {
      ...stored,
      answers: mergeAnswers(stored.answers, command.answers),
    };
    const result = await installVertical({
      vertical,
      manifest: merged,
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
      subject: vertical.id,
      changes: tree.changes(),
      actions: result.applyResult.actions.map((a) => a.description),
      committed: !command.dryRun,
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
}

function mergeAnswers(
  base: Readonly<Record<string, Readonly<Record<string, string>>>>,
  overlay: Readonly<Record<string, Readonly<Record<string, string>>>>,
): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const [k, v] of Object.entries(base)) out[k] = { ...v };
  for (const [k, v] of Object.entries(overlay)) out[k] = { ...(out[k] ?? {}), ...v };
  return out;
}
