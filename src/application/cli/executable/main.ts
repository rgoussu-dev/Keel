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
import { CatalogHandler } from '../../../domain/core/handlers/catalog.js';
import { DialsHandler } from '../../../domain/core/handlers/dials.js';
import { PreviewHandler } from '../../../domain/core/handlers/preview.js';
import { ProjectStatusHandler } from '../../../domain/core/handlers/project-status.js';
import { AddModuleHandler } from '../../../domain/core/handlers/add-module.js';
import { AddVerticalHandler } from '../../../domain/core/handlers/add-vertical.js';
import { LinkPeerHandler } from '../../../domain/core/handlers/link-peer.js';
import { ToolchainCheckHandler } from '../../../domain/toolchain/core/check.js';
import { ToolchainInstallHandler } from '../../../domain/toolchain/core/install.js';
import {
  listStacks,
  listVerticals,
  pluginOrigin,
  registryOf,
  shippedSource,
  type RegistrySource,
} from '../../../domain/core/registry.js';
import { consoleLogger } from '../../../infrastructure/commons/console-logger.js';
import { systemClock } from '../../../infrastructure/commons/system-clock.js';
import { fsManifestStore } from '../../../infrastructure/manifest/fs-manifest-store.js';
import { spawnProcessRunner } from '../../../infrastructure/process/spawn-process-runner.js';
import { inquirerPrompt } from '../../../infrastructure/prompt/inquirer-prompt.js';
import { loadPlugins, type LoadedPlugin } from '../../../infrastructure/registry/plugin-loader.js';
import { ejsTemplateSource } from '../../../infrastructure/template/ejs-template-source.js';
import { templateSourceFor } from '../../../infrastructure/template/routing-template-source.js';
import { fsTreeFactory } from '../../../infrastructure/tree/fs-tree.js';
import { uiServer } from '../../web/executable/server.js';
import { buildProgram } from '../contract/program.js';

/**
 * Environment switch that turns plugin discovery off entirely.
 *
 * Loading a plugin runs its code (see `domain/contract/plugin.ts` →
 * Trust), so there has to be a way to run keel over a project
 * without doing that — inspecting an unfamiliar repository, or
 * ruling a plugin out while debugging.
 */
const NO_PLUGINS_ENV = 'KEEL_NO_PLUGINS';

/**
 * Extra plugin paths, `path.delimiter`-separated — the escape hatch
 * for a plugin that lives outside the project being scaffolded.
 */
const EXTRA_PLUGINS_ENV = 'KEEL_PLUGINS';

/** Entry point invoked by `bin/keel.js`. */
export async function main(argv: string[]): Promise<void> {
  const keelVersion = await readPackageVersion();
  const cwd = process.cwd();

  // Plugins are loaded before anything is wired, because what they
  // register is what the rest of the graph is built over: the
  // registry the handlers read, the template source their adapters
  // render through, and the stack list the `--help` line prints.
  const plugins = await discoverPlugins(cwd);
  const registry = registryOf([shippedSource, ...plugins.map(sourceOf)]);
  announce(plugins);

  const deps = {
    trees: fsTreeFactory,
    manifests: fsManifestStore,
    prompt: inquirerPrompt,
    clock: systemClock,
    logger: consoleLogger,
    templates: templateSourceFor(ejsTemplateSource, assetRootsOf(plugins)),
    processes: spawnProcessRunner,
    registry,
    keelVersion,
  };
  const mediator = new RegistryMediator([
    new NewProjectHandler(deps),
    new AddVerticalHandler(deps),
    new AddModuleHandler(deps),
    new LinkPeerHandler(deps),
    new ToolchainInstallHandler(deps),
    new ToolchainCheckHandler(deps),
    new CatalogHandler(deps),
    new DialsHandler(deps),
    new PreviewHandler(deps),
    new ProjectStatusHandler(deps),
  ]);

  const program = buildProgram({
    mediator,
    logger: consoleLogger,
    version: keelVersion,
    availableStacks: listStacks(registry),
    availableVerticals: listVerticals(registry),
    serveUi: uiServer(mediator),
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

/**
 * The plugins this run composes with: whatever `<cwd>/.keel/plugins`
 * holds plus whatever {@link EXTRA_PLUGINS_ENV} names, or none at
 * all when {@link NO_PLUGINS_ENV} is set.
 */
function discoverPlugins(cwd: string): Promise<readonly LoadedPlugin[]> {
  if (process.env[NO_PLUGINS_ENV]) return Promise.resolve([]);
  const extra = (process.env[EXTRA_PLUGINS_ENV] ?? '')
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return loadPlugins({ projectDir: cwd, extraPaths: extra });
}

/** A loaded plugin as a registry source, attributed to the plugin. */
function sourceOf(loaded: LoadedPlugin): RegistrySource {
  return {
    origin: pluginOrigin(loaded.plugin.name),
    ...(loaded.plugin.stacks ? { stacks: loaded.plugin.stacks } : {}),
    ...(loaded.plugin.verticals ? { verticals: loaded.plugin.verticals } : {}),
  };
}

/** Assets root per plugin name, for the routing template source. */
function assetRootsOf(plugins: readonly LoadedPlugin[]): ReadonlyMap<string, string> {
  const roots = new Map<string, string>();
  for (const loaded of plugins) {
    if (loaded.assetsRoot !== null) roots.set(loaded.plugin.name, loaded.assetsRoot);
  }
  return roots;
}

/**
 * Says which plugins are in play, once, before anything runs.
 *
 * Silent loading is the failure mode to avoid: a stack behaving
 * unexpectedly and no indication that the code producing it is not
 * keel's. One line naming the plugin and where it was loaded from is
 * what makes that question answerable without reading the source.
 */
function announce(plugins: readonly LoadedPlugin[]): void {
  for (const loaded of plugins) {
    consoleLogger.info(`loaded keel plugin '${loaded.plugin.name}' from ${loaded.source}`);
  }
}
