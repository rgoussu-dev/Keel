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
import { logger as defaultLogger, type Logger } from '../util/log.js';
import { paths } from '../util/paths.js';
import { InMemoryTree } from '../engine/tree.js';
import { installVertical } from '../composition/install.js';
import { runActions, type RunActionsInputs } from '../composition/actions.js';
import { readManifestV2, writeManifestV2 } from '../manifest/store-v2.js';
import { cliPrompt, type Prompt } from '../composition/answers.js';
import { getVertical, listVerticalIds } from '../composition/verticals/index.js';
import type { Action, ManifestV2 } from '../composition/types.js';

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
  /** Time source — injected so tests can pin `updatedAt`. */
  readonly now?: () => string;
  /**
   * Action runner — injected so tests can stub deferred side effects.
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

  const scopeRoot = paths.project(inputs.cwd);
  const stored = await readManifestV2(scopeRoot);
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

  const tree = new InMemoryTree(inputs.cwd);
  const merged: ManifestV2 = {
    ...stored,
    answers: mergeAnswers(stored.answers, inputs.answers ?? {}),
  };
  const result = await installVertical({
    vertical,
    manifest: merged,
    tree,
    mode: inputs.interactive ? 'interactive' : 'non-interactive',
    prompt: inputs.prompt ?? cliPrompt,
    logger: log,
    cwd: inputs.cwd,
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
  await writeManifestV2(scopeRoot, result.manifest);
  const runner = inputs.runActions ?? runActions;
  await runner({
    actions: result.applyResult.actions,
    cwd: inputs.cwd,
    logger: log,
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
  changes: ReturnType<InMemoryTree['changes']>,
  actions: readonly Action[],
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
