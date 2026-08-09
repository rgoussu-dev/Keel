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
import { emptyManifestV2, projectScopeRoot } from '../domain/contract/manifest.js';
import { getStack, listStackIds } from '../composition/stacks.js';
import type { DeferredAction, ManifestV2 } from '../domain/contract/composition.js';

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
  /** Template source — injected so tests can supply a fake. */
  readonly templates?: TemplateSource;
  /** Process runner — injected so tests can stub external tools. */
  readonly processes?: ProcessRunner;
  /** Time source — injected so tests can pin the timestamps. */
  readonly now?: () => string;
  /** keel version recorded into the manifest; defaults to `package.json` value. */
  readonly keelVersion?: string;
  /**
   * DeferredAction runner — injected so tests can stub deferred side effects
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

  const scopeRoot = projectScopeRoot(inputs.cwd);
  if ((await fsManifestStore.read(scopeRoot)) !== null) {
    throw new Error(`project already initialised at ${scopeRoot} — 'keel new' is greenfield-only`);
  }

  const now = (inputs.now ?? (() => new Date().toISOString()))();
  const keelVersion = inputs.keelVersion ?? (await readPackageVersion());

  let manifest: ManifestV2 = {
    ...emptyManifestV2(now, keelVersion),
    tags: [...stack.tags].sort(),
    answers: inputs.answers ?? {},
  };

  const templates = inputs.templates ?? ejsTemplateSource;
  const processes = inputs.processes ?? spawnProcessRunner;
  const tree = new FsTree(inputs.cwd);
  const collectedActions: DeferredAction[] = [];

  for (const vertical of stack.verticals) {
    const result = await installVertical({
      vertical,
      manifest,
      tree,
      mode: inputs.interactive ? 'interactive' : 'non-interactive',
      prompt: inputs.prompt ?? inquirerPrompt,
      logger: log,
      cwd: inputs.cwd,
      templates,
      processes,
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
  await fsManifestStore.write(scopeRoot, manifest);
  const runner = inputs.runActions ?? runActions;
  await runner({
    actions: collectedActions,
    cwd: inputs.cwd,
    logger: log,
    processes,
    dryRun: false,
  });
  log.success(`keel new ${stack.id}: ready in ${inputs.cwd}`);
}

function printPlan(
  stackId: string,
  changes: ReturnType<FsTree['changes']>,
  actions: readonly DeferredAction[],
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
