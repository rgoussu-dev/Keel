/**
 * The CLI's composition root. Instantiates the concrete
 * infrastructure adapters, the handlers, and the RegistryMediator,
 * hands the wired graph to the interface adapter, and owns the
 * process-level failure transport (stderr + exit code 1). No logic.
 */

import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { RegistryMediator } from '../../../domain/core/mediator.js';
import { NewProjectHandler } from '../../../domain/core/handlers/new-project.js';
import { AddModuleHandler } from '../../../domain/core/handlers/add-module.js';
import { AddVerticalHandler } from '../../../domain/core/handlers/add-vertical.js';
import { LinkPeerHandler } from '../../../domain/core/handlers/link-peer.js';
import { ToolchainCheckHandler } from '../../../domain/toolchain/core/check.js';
import { ToolchainInstallHandler } from '../../../domain/toolchain/core/install.js';
import { listStackIds } from '../../../domain/core/stacks.js';
import { listVerticalIds } from '../../../domain/core/verticals/index.js';
import { consoleLogger } from '../../../infrastructure/commons/console-logger.js';
import { systemClock } from '../../../infrastructure/commons/system-clock.js';
import { fsManifestStore } from '../../../infrastructure/manifest/fs-manifest-store.js';
import { spawnProcessRunner } from '../../../infrastructure/process/spawn-process-runner.js';
import { inquirerPrompt } from '../../../infrastructure/prompt/inquirer-prompt.js';
import { ejsTemplateSource } from '../../../infrastructure/template/ejs-template-source.js';
import { fsTreeFactory } from '../../../infrastructure/tree/fs-tree.js';
import { buildProgram } from '../contract/program.js';

/** Entry point invoked by `bin/keel.js`. */
export async function main(argv: string[]): Promise<void> {
  const keelVersion = await readPackageVersion();

  const deps = {
    trees: fsTreeFactory,
    manifests: fsManifestStore,
    prompt: inquirerPrompt,
    clock: systemClock,
    logger: consoleLogger,
    templates: ejsTemplateSource,
    processes: spawnProcessRunner,
    keelVersion,
  };
  const mediator = new RegistryMediator([
    new NewProjectHandler(deps),
    new AddVerticalHandler(deps),
    new AddModuleHandler(deps),
    new LinkPeerHandler(deps),
    new ToolchainInstallHandler(deps),
    new ToolchainCheckHandler(deps),
  ]);

  const program = buildProgram({
    mediator,
    logger: consoleLogger,
    version: keelVersion,
    availableStacks: listStackIds(),
    availableVerticals: listVerticalIds(),
  });

  try {
    await program.parseAsync(argv);
  } catch (err) {
    consoleLogger.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function readPackageVersion(): Promise<string> {
  const pkgPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    '..',
    '..',
    'package.json',
  );
  const raw = await readFile(pkgPath, 'utf8');
  return (JSON.parse(raw) as { version: string }).version;
}
