/**
 * Handler for `keel.project-status` — what keel knows about the
 * directory it is pointed at.
 *
 * The brownfield half of a graphical front end needs this before it
 * can offer anything. `keel add <vertical>` refuses a vertical
 * already installed; `keel add module` refuses the flat layout, a
 * product root, and a family with no context adapter. A terminal user
 * discovers each refusal by hitting it, which is fine — the error
 * names the fix. A form should not offer the action at all, and to
 * know that it has to read the manifest and run the same probe the
 * handler's front door runs.
 *
 * Reading only. An uninitialised directory is not an error here: it
 * is the answer, and it means only `keel new` applies.
 */

import type { Action } from '../../kernel/action.js';
import type { Handler } from '../../kernel/handler.js';
import { ok, type Result } from '../../kernel/result.js';
import { projectScopeRoot, type ManifestV2 } from '../../contract/manifest.js';
import type { ManifestStore } from '../../contract/ports/manifest-store.js';
import type {
  InstalledVerticalDescriptor,
  ProjectStatus,
  ProjectStatusQuery,
  VerticalDescriptor,
} from '../../contract/queries.js';
import { emitsFor } from '../adapters/context-support.js';
import { moduleLayoutOf } from '../adapters/module-layout.js';
import { CONTEXT_TAG } from '../adapters/added-context.js';
import { boundedContextVertical } from '../verticals/bounded-context.js';
import { listVerticalIds, VERTICALS } from '../verticals/index.js';

/** The one port this query needs. */
export interface ProjectStatusDeps {
  readonly manifests: ManifestStore;
}

/** Executes {@link ProjectStatusQuery}s. */
export class ProjectStatusHandler implements Handler<ProjectStatusQuery> {
  constructor(private readonly deps: ProjectStatusDeps) {}

  supports(action: Action): action is ProjectStatusQuery {
    return action.kind === 'keel.project-status';
  }

  async handle(query: ProjectStatusQuery): Promise<Result<ProjectStatus>> {
    const scopeRoot = projectScopeRoot(query.cwd);
    const manifest = await this.deps.manifests.read(scopeRoot);
    return ok(manifest ? statusOf(scopeRoot, manifest) : uninitialised(scopeRoot));
  }
}

function uninitialised(scopeRoot: string): ProjectStatus {
  return {
    scopeRoot,
    initialised: false,
    tags: [],
    installed: [],
    available: [],
    modules: [],
    services: [],
    moduleLayout: 'basic',
    canAddModule: false,
  };
}

function statusOf(scopeRoot: string, manifest: ManifestV2): ProjectStatus {
  const installedIds = new Set(manifest.verticals.map((v) => v.id));
  return {
    scopeRoot,
    initialised: true,
    tags: [...manifest.tags],
    installed: manifest.verticals.flatMap((entry) =>
      describeInstalled(entry.id, entry.installedAt),
    ),
    available: listVerticalIds()
      .filter((id) => !installedIds.has(id))
      .flatMap(describeVertical),
    modules: [...manifest.modules],
    services: [...manifest.services],
    moduleLayout: moduleLayoutOf(manifest.tags),
    canAddModule: canAddModule(manifest),
  };
}

function describeInstalled(
  id: string,
  installedAt: string,
): readonly InstalledVerticalDescriptor[] {
  return describeVertical(id).map((vertical) => ({ ...vertical, installedAt }));
}

function describeVertical(id: string): readonly VerticalDescriptor[] {
  const vertical = VERTICALS[id];
  // A manifest can name a vertical this keel no longer registers (an
  // older install, a renamed id). Reporting it without a description
  // beats dropping it: the project really does have it installed.
  if (!vertical) return [{ id, description: '', dimensions: [] }];
  return [{ id, description: vertical.description, dimensions: [...vertical.dimensions] }];
}

/**
 * The three gates `keel add module` applies before it looks at the
 * name, asked here so a front end can grey the control out instead of
 * offering an action already destined to be refused. The name checks
 * (taken, malformed, `--consumes` targets) stay at the front door,
 * where the input to check exists.
 */
function canAddModule(manifest: ManifestV2): boolean {
  if (moduleLayoutOf(manifest.tags) !== 'modulith') return false;
  if (manifest.services.length > 0) return false;
  return emitsFor([boundedContextVertical], CONTEXT_TAG, manifest.tags);
}
