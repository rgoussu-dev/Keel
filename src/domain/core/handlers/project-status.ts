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
import type { Registry } from '../../contract/ports/registry.js';
import type {
  InstalledVerticalDescriptor,
  ProjectStatus,
  ProjectStatusQuery,
  VerticalDescriptor,
} from '../../contract/queries.js';
import { emitsFor } from '../adapters/context-support.js';
import { moduleLayoutOf } from '../adapters/module-layout.js';
import { CONTEXT_TAG } from '../adapters/added-context.js';
import { conflictsOf, legalWith } from '../compatibility.js';
import { boundedContextVertical } from '../verticals/bounded-context.js';
import { listVerticalIds } from '../registry.js';

/** The two ports this query needs. */
export interface ProjectStatusDeps {
  readonly manifests: ManifestStore;
  /** Resolves the descriptions of the verticals a manifest names. */
  readonly registry: Registry;
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
    return ok(
      manifest ? statusOf(this.deps.registry, scopeRoot, manifest) : uninitialised(scopeRoot),
    );
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

function statusOf(registry: Registry, scopeRoot: string, manifest: ManifestV2): ProjectStatus {
  const installedIds = new Set(manifest.verticals.map((v) => v.id));
  return {
    scopeRoot,
    initialised: true,
    tags: [...manifest.tags],
    installed: manifest.verticals.flatMap((entry) =>
      describeInstalled(registry, entry.id, entry.installedAt),
    ),
    available: listVerticalIds(registry)
      .filter((id) => !installedIds.has(id))
      .flatMap((id) => describeVertical(registry, id)),
    modules: [...manifest.modules],
    services: [...manifest.services],
    moduleLayout: moduleLayoutOf(manifest.tags),
    canAddModule: canAddModule(manifest),
  };
}

function describeInstalled(
  registry: Registry,
  id: string,
  installedAt: string,
): readonly InstalledVerticalDescriptor[] {
  return describeVertical(registry, id).map((vertical) => ({ ...vertical, installedAt }));
}

function describeVertical(registry: Registry, id: string): readonly VerticalDescriptor[] {
  const vertical = registry.vertical(id);
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
 *
 * Only one of the three is a rule the vertical *declares*, and it is
 * the one asked here as a filter rather than re-derived: adding
 * `modules.context` to this project's tags must stay legal, which is
 * `CONTEXT_NEEDS_MODULITH` read from the menu end. It used to be
 * `moduleLayoutOf(tags) !== 'modulith'` — a second hand-written copy
 * of the handler's own branch, and the arrangement in which a control
 * and a refusal come to disagree.
 *
 * The other two stay checks, because neither is about tags: a
 * composite product root is `manifest.services` being non-empty, and
 * "does this family have a context adapter at all?" is a capability
 * probe. See `docs/composition.md` → Conflicts.
 */
function canAddModule(manifest: ManifestV2): boolean {
  if (!legalWith(conflictsOf([boundedContextVertical]), manifest.tags, [CONTEXT_TAG])) return false;
  if (manifest.services.length > 0) return false;
  return emitsFor([boundedContextVertical], CONTEXT_TAG, manifest.tags);
}
