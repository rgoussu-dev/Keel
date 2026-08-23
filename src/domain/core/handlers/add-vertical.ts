/**
 * Handler for `keel.add-vertical` — layer an additional vertical
 * onto an existing keel project (the brownfield path), or re-render
 * an installed one from its recorded answers (`--reapply`).
 *
 * Install pipeline:
 *   1. Resolve the vertical by id from the registry; reject unknown
 *      ids with a list of available ones.
 *   2. Read the existing manifest; refuse to run if no project has
 *      been initialised under the project scope.
 *   3. Refuse if the vertical is already installed (that is what
 *      `--reapply` is for; the safe default is to surface the
 *      duplicate to the user).
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
 *
 * Reapply differs in the guards and the apply posture, not in the
 * pipeline: the vertical must already be installed, answers are the
 * manifest's recorded ones (non-interactive; `--set` overrides are
 * refused — moving a sticky answer is deliberately out of scope for
 * this conservative v1), and the install runs in `reapply` apply mode:
 * template-owned files are overwritten to the pristine re-render (each
 * reported with a unified diff against the working tree), while a
 * patch that would change an already-patched file aborts the whole run
 * with `keel.reapply-conflict` before anything is committed. Tags the
 * previous apply promoted re-fold through set semantics, so they never
 * double; the vertical keeps its original `installedAt`.
 */

import type { Action } from '../../kernel/action.js';
import type { Handler } from '../../kernel/handler.js';
import { DomainError, err, ok, type Result } from '../../kernel/result.js';
import { assemblyRefusal } from '../compatibility.js';
import type {
  AddVerticalCommand,
  FileDiff,
  InstallReport,
  PresetAnswers,
} from '../../contract/commands.js';
import type { ManifestV2 } from '../../contract/manifest.js';
import { projectScopeRoot } from '../../contract/manifest.js';
import type { Tree } from '../../contract/ports/tree.js';
import { runActions } from '../actions.js';
import { ContributionConflictError } from '../apply.js';
import { unifiedDiff } from '../diff.js';
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

    const installed = stored.verticals.some((v) => v.id === vertical.id);
    const reapply = command.reapply === true;
    if (!reapply && installed) {
      return err(
        new DomainError(
          `vertical '${vertical.id}' is already installed in this project; re-render it from its recorded answers with 'keel add ${vertical.id} --reapply'`,
          'keel.vertical-already-installed',
        ),
      );
    }
    if (reapply && !installed) {
      return err(
        new DomainError(
          `vertical '${vertical.id}' is not installed in this project — nothing to reapply; install it with 'keel add ${vertical.id}'`,
          'keel.vertical-not-installed',
        ),
      );
    }
    if (reapply && hasAnswers(command.answers)) {
      return err(
        new DomainError(
          `--set cannot be combined with --reapply: reapply re-renders '${vertical.id}' from the answers recorded in the manifest, and changing one is not supported yet`,
          'keel.reapply-frozen-answers',
        ),
      );
    }

    // The same declaration `keel new` refuses an illegal assembly by,
    // asked of a project already on disk: the vertical's own rules,
    // read against the tags the manifest records. A capability that
    // cannot sit with what is already here is refused before a file
    // moves, naming the rule rather than failing somewhere downstream.
    const refusal = assemblyRefusal([vertical], stored.tags);
    if (refusal !== null) {
      return err(
        new DomainError(
          `vertical '${vertical.id}' cannot be installed here: ${refusal}`,
          'keel.incompatible',
        ),
      );
    }

    const now = this.deps.clock.nowIso();
    const tree = this.deps.trees(command.cwd);
    const merged: ManifestV2 = reapply
      ? stored
      : { ...stored, answers: mergeAnswers(stored.answers, command.answers) };
    let result;
    try {
      result = await installVertical({
        vertical,
        manifest: merged,
        tree,
        // Reapply is "from the recorded answers" by definition; a
        // question added to a template since the original install
        // resolves to its default and is recorded like any first ask.
        mode: !reapply && command.interactive ? 'interactive' : 'non-interactive',
        prompt: this.deps.prompt,
        logger: this.deps.logger,
        cwd: command.cwd,
        templates: this.deps.templates,
        processes: this.deps.processes,
        now: () => now,
        apply: reapply ? 'reapply' : 'install',
      });
    } catch (e) {
      if (reapply && e instanceof ContributionConflictError) {
        return err(
          new DomainError(
            `reapply of '${vertical.id}' refused: ${e.message}`,
            'keel.reapply-conflict',
          ),
        );
      }
      throw e;
    }

    const report: InstallReport = {
      subject: vertical.id,
      changes: tree.changes(),
      actions: result.applyResult.actions.map((a) => a.description),
      committed: !command.dryRun,
      ...(reapply ? { diffs: this.workingTreeDiffs(command.cwd, tree) } : {}),
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

function mergeAnswers(
  base: Readonly<Record<string, Readonly<Record<string, string>>>>,
  overlay: Readonly<Record<string, Readonly<Record<string, string>>>>,
): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const [k, v] of Object.entries(base)) out[k] = { ...v };
  for (const [k, v] of Object.entries(overlay)) out[k] = { ...(out[k] ?? {}), ...v };
  return out;
}
