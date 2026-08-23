/**
 * TemplateSource adapter that routes by id namespace: keel's own
 * asset ids to the packaged `assets/` tree, and a plugin's
 * `plugin:<name>/<path>` ids to that plugin's own assets directory.
 *
 * An adapter — keel's or a plugin's — sees one `ctx.templates` and
 * renders through it the same way. Nothing in the composition
 * vocabulary knows a plugin exists; the namespace on the id is the
 * whole of the mechanism, and `parsePluginTemplateId` in
 * `domain/contract/plugin.ts` is the only place that reads it.
 *
 * An id naming a plugin that registered no assets root fails saying
 * so, naming the plugin — never by falling through to keel's assets,
 * which would render a file the author did not write, or a
 * not-found from a path they never named.
 */

import type { ContributionFile } from '../../domain/contract/files.js';
import { parsePluginTemplateId } from '../../domain/contract/plugin.js';
import type { TemplateSource } from '../../domain/contract/ports/template-source.js';
import { EjsTemplateSource } from './ejs-template-source.js';

/** TemplateSource that dispatches plugin-namespaced ids to plugin assets. */
export class RoutingTemplateSource implements TemplateSource {
  /**
   * @param packaged the source serving keel's own ids.
   * @param pluginRoots absolute assets directory per plugin name;
   *   a plugin declaring no `assets` is simply absent.
   */
  constructor(
    private readonly packaged: TemplateSource,
    private readonly pluginRoots: ReadonlyMap<string, string>,
  ) {}

  // Both members are `async` so an unroutable id comes back as a
  // rejection rather than a synchronous throw: the port returns a
  // promise, and a caller that only `await`s — every adapter does —
  // would otherwise see the failure escape its own try/catch.
  async render(
    templateId: string,
    targetRoot: string,
    vars: Readonly<Record<string, unknown>>,
  ): Promise<ContributionFile[]> {
    const routed = this.route(templateId);
    return routed.source.render(routed.id, targetRoot, vars);
  }

  async readText(assetId: string): Promise<string> {
    const routed = this.route(assetId);
    return routed.source.readText(routed.id);
  }

  private route(id: string): { readonly source: TemplateSource; readonly id: string } {
    const parsed = parsePluginTemplateId(id);
    if (parsed === null) return { source: this.packaged, id };
    const root = this.pluginRoots.get(parsed.plugin);
    if (root === undefined) {
      throw new Error(
        `template id '${id}' names plugin '${parsed.plugin}', which registered no assets directory — add an 'assets' field to the plugin`,
      );
    }
    return { source: new EjsTemplateSource(root), id: parsed.assetPath };
  }
}

/**
 * The template source a run uses: the packaged one when no plugin
 * brought assets, the router otherwise.
 *
 * Returning the packaged source unchanged in the common case is not
 * an optimisation — it is what keeps "no plugin present" mean
 * *exactly* what it meant before this file existed.
 */
export function templateSourceFor(
  packaged: TemplateSource,
  pluginRoots: ReadonlyMap<string, string>,
): TemplateSource {
  return pluginRoots.size === 0 ? packaged : new RoutingTemplateSource(packaged, pluginRoots);
}
