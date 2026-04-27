/**
 * `keel new` — bootstrap a greenfield project from a stack preset.
 *
 * Pipeline:
 *   1. Resolve the stack preset (`quarkus-cli`, …).
 *   2. Refuse if a manifest already exists in `<cwd>/.claude/` —
 *      `keel new` is greenfield-only; brownfield is a separate flow.
 *   3. Build an empty v2 manifest seeded with the stack's tags and
 *      any pre-supplied sticky answers.
 *   4. Install each vertical in stack order against an in-memory
 *      Tree. Tags emitted by adapters via `tagsAdd` accumulate into
 *      the manifest snapshot the next vertical sees.
 *   5. Print the plan (file changes + pending actions).
 *   6. Unless dryRun: commit the Tree, persist the manifest, then
 *      run the deferred actions. Persisting the manifest *before*
 *      actions keeps the workspace recoverable if an action throws
 *      (e.g. `gradle wrapper` with no `gradle` on PATH) — files and
 *      manifest stay in sync.
 */

import path from 'node:path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { logger as defaultLogger, type Logger } from '../util/log.js';
import { paths } from '../util/paths.js';
import { InMemoryTree } from '../engine/tree.js';
import { installVertical } from '../composition/install.js';
import { runActions, type RunActionsInputs } from '../composition/actions.js';
import { writeManifestV2 } from '../manifest/store-v2.js';
import { emptyManifestV2, MANIFEST_FILENAME } from '../manifest/schema-v2.js';
import { cliPrompt, type Prompt } from '../composition/answers.js';
import { getStack, listStackIds } from '../composition/stacks.js';
import type { Action, ManifestV2 } from '../composition/types.js';

/** Inputs to {@link newProject}. */
export interface NewInputs {
  readonly cwd: string;
  /** Stack preset id, e.g. `quarkus-cli`. */
  readonly stack: string;
  /** Pre-supplied sticky answers: adapterId → questionId → value. */
  readonly answers?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly interactive: boolean;
  readonly dryRun: boolean;
  readonly logger?: Logger;
  readonly prompt?: Prompt;
  /** Time source — injected so tests can pin the timestamps. */
  readonly now?: () => string;
  /** keel version recorded into the manifest; defaults to `package.json` value. */
  readonly keelVersion?: string;
  /**
   * Action runner — injected so tests can stub deferred side effects
   * that would otherwise spawn external processes (e.g. `gradle
   * wrapper`). Defaults to the real {@link runActions}.
   */
  readonly runActions?: (inputs: RunActionsInputs) => Promise<void>;
}

export async function newProject(inputs: NewInputs): Promise<void> {
  const log = inputs.logger ?? defaultLogger;
  const stack = getStack(inputs.stack);
  if (!stack) {
    throw new Error(`unknown stack '${inputs.stack}'; available: ${listStackIds().join(', ')}`);
  }

  const scopeRoot = paths.project(inputs.cwd);
  if (await fs.pathExists(path.join(scopeRoot, MANIFEST_FILENAME))) {
    throw new Error(`project already initialised at ${scopeRoot} — 'keel new' is greenfield-only`);
  }

  const now = (inputs.now ?? (() => new Date().toISOString()))();
  const keelVersion = inputs.keelVersion ?? (await readPackageVersion());

  let manifest: ManifestV2 = {
    ...emptyManifestV2(now, keelVersion),
    tags: [...stack.tags].sort(),
    answers: inputs.answers ?? {},
  };

  const tree = new InMemoryTree(inputs.cwd);
  const collectedActions: Action[] = [];

  for (const vertical of stack.verticals) {
    const result = await installVertical({
      vertical,
      manifest,
      tree,
      mode: inputs.interactive ? 'interactive' : 'non-interactive',
      prompt: inputs.prompt ?? cliPrompt,
      logger: log,
      cwd: inputs.cwd,
      now: () => now,
    });
    manifest = result.manifest;
    for (const a of result.applyResult.actions) collectedActions.push(a);
  }

  printPlan(stack.id, tree.changes(), collectedActions, log);

  if (inputs.dryRun) {
    log.info('dry run — nothing committed');
    return;
  }

  await tree.commit();
  // Persist the manifest BEFORE running deferred actions: actions
  // shell out (e.g. `gradle wrapper`) and may fail on a missing
  // tool. The tree is already on disk at this point, so a coherent
  // manifest paired with those files is the recoverable state — the
  // alternative leaves a populated workspace with no manifest, and
  // a re-run hits the existing-files conflict path with no breadcrumbs.
  await writeManifestV2(scopeRoot, manifest);
  const runner = inputs.runActions ?? runActions;
  await runner({
    actions: collectedActions,
    cwd: inputs.cwd,
    logger: log,
    dryRun: false,
  });
  log.success(`keel new ${stack.id}: ready in ${inputs.cwd}`);
}

function printPlan(
  stackId: string,
  changes: ReturnType<InMemoryTree['changes']>,
  actions: readonly Action[],
  log: Logger,
): void {
  log.info(`keel new ${stackId}: planned changes`);
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

async function readPackageVersion(): Promise<string> {
  const { readFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const pkgPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'package.json',
  );
  const raw = await readFile(pkgPath, 'utf8');
  return (JSON.parse(raw) as { version: string }).version;
}
