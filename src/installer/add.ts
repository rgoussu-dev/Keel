/**
 * `keel add` — layer an additional vertical onto an existing keel
 * project (the brownfield path).
 *
 * Pipeline:
 *   1. Resolve the vertical by id from the registry; reject unknown
 *      ids with a list of available ones.
 *   2. Read the existing manifest; refuse to run if no project has
 *      been initialised (no `.keel-manifest.json` in `<cwd>/.claude/`).
 *   3. Refuse if the vertical is already installed (a future
 *      `--reapply` flag will lift this; for now the safe default is
 *      to surface the duplicate to the user).
 *   4. Install the vertical against an in-memory Tree rooted at cwd.
 *      The pre-existing project files on disk live in the Tree as
 *      "real" reads — patches against them work, whole-file writes
 *      conflict (which is exactly the diagnostic we want).
 *   5. Print the plan; if `dryRun`, return without writing anything.
 *   6. Otherwise: commit the Tree, persist the updated manifest, then
 *      run the deferred actions. Persisting the manifest *before*
 *      actions keeps the workspace recoverable if an action throws
 *      (e.g. `gradle wrapper` with no `gradle` on PATH) — files,
 *      manifest, and the duplicate-vertical guard stay coherent on
 *      a re-run.
 *
 * The manifest's `tags` carry over verbatim from disk; the install
 * orchestrator folds in any `tagsAdd` and sticky-answer updates the
 * vertical promotes, then bumps `updatedAt`.
 */

import chalk from 'chalk';
import { consoleLogger as defaultLogger } from '../infrastructure/commons/console-logger.js';
import type { Logger } from '../domain/contract/ports/logger.js';
import type { Prompt } from '../domain/contract/ports/prompt.js';
import type { ProcessRunner } from '../domain/contract/ports/process-runner.js';
import type { TemplateSource } from '../domain/contract/ports/template-source.js';
import { FsTree } from '../infrastructure/tree/fs-tree.js';
import { fsManifestStore } from '../infrastructure/manifest/fs-manifest-store.js';
import { inquirerPrompt } from '../infrastructure/prompt/inquirer-prompt.js';
import { ejsTemplateSource } from '../infrastructure/template/ejs-template-source.js';
import { spawnProcessRunner } from '../infrastructure/process/spawn-process-runner.js';
import { installVertical } from '../composition/install.js';
import { runActions, type RunActionsInputs } from '../composition/actions.js';
import { projectScopeRoot } from '../domain/contract/manifest.js';
import { getVertical, listVerticalIds } from '../composition/verticals/index.js';
import type { DeferredAction, ManifestV2 } from '../domain/contract/composition.js';

/** Inputs to {@link addVertical}. */
export interface AddInputs {
  readonly cwd: string;
  /** Vertical id, e.g. `distribution`. */
  readonly vertical: string;
  /** Pre-supplied sticky answers: adapterId → questionId → value. */
  readonly answers?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly interactive: boolean;
  readonly dryRun: boolean;
  readonly logger?: Logger;
  readonly prompt?: Prompt;
  /** Template source — injected so tests can supply a fake. */
  readonly templates?: TemplateSource;
  /** Process runner — injected so tests can stub external tools. */
  readonly processes?: ProcessRunner;
  /** Time source — injected so tests can pin `updatedAt`. */
  readonly now?: () => string;
  /**
   * DeferredAction runner — injected so tests can stub deferred side effects.
   * Defaults to the real {@link runActions}.
   */
  readonly runActions?: (inputs: RunActionsInputs) => Promise<void>;
}

export async function addVertical(inputs: AddInputs): Promise<void> {
  const log = inputs.logger ?? defaultLogger;

  const vertical = getVertical(inputs.vertical);
  if (!vertical) {
    throw new Error(
      `unknown vertical '${inputs.vertical}'; available: ${listVerticalIds().join(', ')}`,
    );
  }

  const scopeRoot = projectScopeRoot(inputs.cwd);
  const stored = await fsManifestStore.read(scopeRoot);
  if (!stored) {
    throw new Error(
      `no project initialised at ${scopeRoot} — run 'keel new --stack=<id>' first to create one`,
    );
  }

  if (stored.verticals.some((v) => v.id === vertical.id)) {
    throw new Error(
      `vertical '${vertical.id}' is already installed in this project; reapply support lands in a follow-up`,
    );
  }

  const now = (inputs.now ?? (() => new Date().toISOString()))();

  const templates = inputs.templates ?? ejsTemplateSource;
  const processes = inputs.processes ?? spawnProcessRunner;
  const tree = new FsTree(inputs.cwd);
  const merged: ManifestV2 = {
    ...stored,
    answers: mergeAnswers(stored.answers, inputs.answers ?? {}),
  };
  const result = await installVertical({
    vertical,
    manifest: merged,
    tree,
    mode: inputs.interactive ? 'interactive' : 'non-interactive',
    prompt: inputs.prompt ?? inquirerPrompt,
    logger: log,
    cwd: inputs.cwd,
    templates,
    processes,
    now: () => now,
  });

  printPlan(vertical.id, tree.changes(), result.applyResult.actions, log);

  if (inputs.dryRun) {
    log.info('dry run — nothing committed');
    return;
  }

  await tree.commit();
  // Persist the manifest BEFORE running deferred actions — see the
  // matching note in `newProject` for why. A failed action then leaves
  // a coherent (files + manifest) pair on disk instead of stranding
  // files with no manifest entry, and the second run of `keel add`
  // would (correctly) refuse the duplicate-vertical install.
  await fsManifestStore.write(scopeRoot, result.manifest);
  const runner = inputs.runActions ?? runActions;
  await runner({
    actions: result.applyResult.actions,
    cwd: inputs.cwd,
    logger: log,
    processes,
    dryRun: false,
  });
  log.success(`keel add ${vertical.id}: ready`);
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

function printPlan(
  verticalId: string,
  changes: ReturnType<FsTree['changes']>,
  actions: readonly DeferredAction[],
  log: Logger,
): void {
  log.info(`keel add ${verticalId}: planned changes`);
  for (const c of changes) {
    const tag =
      c.kind === 'create'
        ? chalk.green('+')
        : c.kind === 'modify'
          ? chalk.yellow('~')
          : chalk.red('-');
    log.info(`  ${tag} ${c.path}`);
  }
  for (const a of actions) {
    log.info(`  ${chalk.cyan('!')} ${a.description}`);
  }
}
