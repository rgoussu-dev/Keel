/**
 * The **plugin contract** — what a project ships so keel can compose
 * from a stack or a vertical keel did not write.
 *
 * A plugin is a module that exports one {@link KeelPlugin}. It brings
 * pieces written against the ordinary composition vocabulary: a
 * {@link Stack} is a manifest of tags, dials and vertical ids, a
 * {@link Vertical} is dimensions and adapters, and either may declare
 * {@link Conflict}s and `promotes`. There is no plugin-only dialect —
 * a piece that moved from here into keel, or the other way, would not
 * change a line.
 *
 * **Templates.** An adapter emits files by rendering ejs trees
 * through the {@link TemplateSource} port, whose ids are paths under
 * keel's own asset root. A plugin's trees are not there, so its ids
 * are namespaced: {@link pluginTemplateId} builds the one string the
 * routing template source knows how to send back to the plugin's own
 * `assets` directory. An adapter still sees one `ctx.templates`.
 *
 * **Trust.** Loading a plugin *is* running its code — an `import`
 * evaluates its top level, and `contribute()` then writes to the
 * user's filesystem through the {@link Tree} port. keel does not
 * sandbox any of that and cannot: a composition adapter's whole job
 * is to produce files. What keel does instead is make the code
 * **local and visible** — discovery never leaves the project
 * directory, never resolves a package by name, and never fetches —
 * so a plugin arrives through the same review a project's own code
 * gets. See `docs/plugins.md` → Trust.
 */

import type { Vertical } from './composition.js';
import type { Stack } from './stack.js';

/** What a plugin module exports. */
export interface KeelPlugin {
  /**
   * The plugin's name, and the namespace its templates resolve
   * under. Quoted verbatim by every message about this plugin, so
   * make it the name a user would recognise; a directory-shaped id
   * (`acme-stacks`) reads best.
   */
  readonly name: string;
  /** Stacks this plugin registers. */
  readonly stacks?: readonly Stack[];
  /** Verticals this plugin registers. */
  readonly verticals?: readonly Vertical[];
  /**
   * Directory holding this plugin's template trees, relative to the
   * plugin's entry file. Template ids built with
   * {@link pluginTemplateId} resolve under it, exactly as keel's own
   * ids resolve under the packaged `assets/`.
   *
   * Omit when the plugin's adapters render no trees — one that only
   * patches files, or one whose stack merely recombines verticals
   * keel already ships, needs no assets at all.
   */
  readonly assets?: string;
}

/**
 * What separates a plugin's namespace from the path inside it.
 *
 * A colon, because it cannot appear in the packaged asset ids a
 * template source already serves: an id either starts with
 * `{@link PLUGIN_TEMPLATE_SCHEME}` and belongs to a plugin, or it
 * does not and belongs to keel. No lookup, no ambiguity, and an
 * unrouted id fails naming the plugin it asked for rather than
 * reading a file out of keel's own assets.
 */
export const PLUGIN_TEMPLATE_SCHEME = 'plugin:';

/**
 * The template id for `assetPath` inside plugin `pluginName` —
 * `plugin:acme-stacks/hello/templates`.
 *
 * Build ids with this rather than by hand: the scheme is an
 * implementation detail of the routing template source, and an
 * adapter that hard-codes it is an adapter that breaks when the
 * routing changes.
 */
export function pluginTemplateId(pluginName: string, assetPath: string): string {
  return `${PLUGIN_TEMPLATE_SCHEME}${pluginName}/${assetPath}`;
}

/**
 * Splits a plugin template id back into its plugin name and the path
 * inside that plugin's assets, or null when the id is not a plugin's
 * at all (which is how a router recognises keel's own ids).
 */
export function parsePluginTemplateId(
  templateId: string,
): { readonly plugin: string; readonly assetPath: string } | null {
  if (!templateId.startsWith(PLUGIN_TEMPLATE_SCHEME)) return null;
  const rest = templateId.slice(PLUGIN_TEMPLATE_SCHEME.length);
  const slash = rest.indexOf('/');
  if (slash <= 0) return { plugin: rest, assetPath: '' };
  return { plugin: rest.slice(0, slash), assetPath: rest.slice(slash + 1) };
}

/** Re-exports so a plugin author writes against one module. */
export type {
  Adapter,
  Conflict,
  Contribution,
  ContributionFile,
  ContributionPatch,
  Ctx,
  Predicate,
  Question,
  QuestionChoice,
  SkillSpec,
  SkillSupportingFile,
  Tag,
  Tree,
  Vertical,
} from './composition.js';
export type {
  BuildSystemOption,
  ModuleLayout,
  ModuleLayoutOption,
  Stack,
  StackService,
} from './stack.js';
