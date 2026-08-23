/**
 * Finding a project's keel plugins on disk and importing them.
 *
 * **Where.** `<project>/.keel/plugins` — a directory the project
 * owns, sitting beside the project rather than inside `.claude/`,
 * which is what keel *writes*: a `keel add --reapply` rewrites files
 * there, and a plugin is input, not output. Each entry is either a
 * `.js`/`.mjs` module or a directory holding
 * {@link PLUGIN_ENTRY_FILENAMES}.
 *
 * **Why not an npm dependency convention.** `keel-plugin-*` in the
 * project's `package.json` is the obvious alternative and it cannot
 * serve the case that matters most. `keel new` runs in an *empty*
 * directory: there is no `package.json`, no lockfile and no
 * `node_modules` to resolve a name against, so the greenfield flow —
 * the whole reason a stack plugin exists — would be the one flow
 * plugins could not reach. It is also a Node-only convention, and
 * keel scaffolds JVM, Go and Rust projects whose repositories have
 * no reason to carry a `package.json` at all. A directory is
 * available to every project on day zero, in every language.
 *
 * So what a keel-scaffolded project can rely on: **a plugin in
 * `.keel/plugins/` of the directory keel is invoked in is loaded, in
 * every language family, greenfield and brownfield alike.** Nothing
 * else is searched — not `~`, not an ancestor directory, not a
 * registry, not the network.
 *
 * Every failure here names the plugin, by its own `name` once the
 * module has loaded and by its path before that, because before the
 * import there is no name to quote and a bare
 * "SyntaxError: Unexpected token" would send the reader into keel.
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import fs from 'fs-extra';
import type { KeelPlugin } from '../../domain/contract/plugin.js';

/** The project-owned directory plugins are discovered in. */
export const PLUGINS_DIR = path.join('.keel', 'plugins');

/** Entry filenames tried inside a plugin directory, in order. */
export const PLUGIN_ENTRY_FILENAMES: readonly string[] = ['keel-plugin.js', 'keel-plugin.mjs'];

/** Module extensions a single-file plugin may use. */
const MODULE_EXTENSIONS: readonly string[] = ['.js', '.mjs'];

/** A plugin that loaded, with everything the composition root needs. */
export interface LoadedPlugin {
  /** The validated export. */
  readonly plugin: KeelPlugin;
  /** Absolute path of the module that was imported, for messages. */
  readonly source: string;
  /** Absolute assets root, or null when the plugin declares none. */
  readonly assetsRoot: string | null;
}

/** Where {@link loadPlugins} looks. */
export interface LoadPluginsOptions {
  /** The directory whose `.keel/plugins` is scanned. */
  readonly projectDir: string;
  /**
   * Extra plugin paths (file or directory) loaded after the
   * discovered ones — the escape hatch for a plugin that lives
   * outside the project tree, e.g. one under development.
   */
  readonly extraPaths?: readonly string[];
}

/**
 * Loads every plugin discovered under `projectDir`, plus any named
 * explicitly, in a deterministic order.
 *
 * Resolves to an empty array when the directory does not exist,
 * which is the overwhelmingly common case and must cost a project
 * that has no plugins exactly one `stat`.
 *
 * @throws Error naming the offending plugin path or name.
 */
export async function loadPlugins(options: LoadPluginsOptions): Promise<readonly LoadedPlugin[]> {
  const discovered = await discover(path.resolve(options.projectDir, PLUGINS_DIR));
  const explicit = (options.extraPaths ?? []).map((p) => path.resolve(p));
  const loaded: LoadedPlugin[] = [];
  for (const candidate of [...discovered, ...explicit]) {
    loaded.push(await loadOne(candidate));
  }
  return loaded;
}

/** Plugin candidate paths under `pluginsDir`, name-sorted. */
async function discover(pluginsDir: string): Promise<readonly string[]> {
  if (!(await fs.pathExists(pluginsDir))) return [];
  const entries = await fs.readdir(pluginsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() || isModuleFile(entry.name))
    .map((entry) => path.join(pluginsDir, entry.name))
    .sort();
}

function isModuleFile(name: string): boolean {
  return MODULE_EXTENSIONS.some((ext) => name.endsWith(ext));
}

async function loadOne(candidate: string): Promise<LoadedPlugin> {
  const entry = await resolveEntry(candidate);
  const module: unknown = await importOrFail(entry);
  const plugin = validate(entry, exportOf(module));
  return {
    plugin,
    source: entry,
    assetsRoot:
      plugin.assets === undefined ? null : path.resolve(path.dirname(entry), plugin.assets),
  };
}

async function resolveEntry(candidate: string): Promise<string> {
  const stat = await fs.stat(candidate).catch(() => null);
  if (stat === null) throw new Error(`keel plugin '${candidate}' does not exist`);
  if (!stat.isDirectory()) return candidate;
  for (const filename of PLUGIN_ENTRY_FILENAMES) {
    const entry = path.join(candidate, filename);
    if (await fs.pathExists(entry)) return entry;
  }
  throw new Error(
    `keel plugin '${candidate}' has no entry module — expected one of ${PLUGIN_ENTRY_FILENAMES.join(
      ', ',
    )} in that directory`,
  );
}

/**
 * Imports the entry, turning anything it throws on the way up into a
 * message that leads with the plugin.
 *
 * A plugin's top level runs here, so this catches a syntax error, a
 * missing transitive import and a deliberate `throw` alike. The
 * original message is kept whole — it is the only thing that says
 * *what* went wrong — behind a sentence that says whose it is.
 */
async function importOrFail(entry: string): Promise<unknown> {
  try {
    return (await import(pathToFileURL(entry).href)) as unknown;
  } catch (error) {
    throw new Error(
      `keel plugin '${entry}' failed to load: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

/** The plugin object a module offers: its default export, or `plugin`. */
function exportOf(module: unknown): unknown {
  if (typeof module !== 'object' || module === null) return undefined;
  const record = module as Record<string, unknown>;
  return record['default'] ?? record['plugin'];
}

function validate(entry: string, candidate: unknown): KeelPlugin {
  if (typeof candidate !== 'object' || candidate === null) {
    throw new Error(
      `keel plugin '${entry}' exports no plugin — export the plugin object as 'default' or as a named 'plugin' export`,
    );
  }
  const record = candidate as Record<string, unknown>;
  const name = record['name'];
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error(`keel plugin '${entry}' exports a plugin with no 'name'`);
  }
  requireArray(name, 'stacks', record['stacks']);
  requireArray(name, 'verticals', record['verticals']);
  const assets = record['assets'];
  if (assets !== undefined && typeof assets !== 'string') {
    throw new Error(`keel plugin '${name}': 'assets' must be a path relative to the plugin`);
  }
  return candidate as KeelPlugin;
}

function requireArray(name: string, field: string, value: unknown): void {
  if (value !== undefined && !Array.isArray(value)) {
    throw new Error(`keel plugin '${name}': '${field}' must be an array`);
  }
}
