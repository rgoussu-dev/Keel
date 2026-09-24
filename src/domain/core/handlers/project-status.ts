/**
 * Handler for `keel.project-status` — what keel knows about the
 * directory it is pointed at, and what each brownfield command would
 * answer there before it is run.
 *
 * The brownfield half of a graphical front end needs this before it
 * can offer anything, and `keel add --list` prints it. A terminal user
 * used to discover each refusal by hitting it; a form would show every
 * vertical and refuse about half of them after the click, in a banner
 * away from the card. So every field here is the answer of the
 * function the command's own front door refuses by:
 *
 *   - `available` — every registered vertical not installed, each with
 *     its readiness and, where `keel add` would refuse it, the refusal
 *     word for word (`../add-readiness.ts`, which the add front door
 *     composes from the same pieces): ready, needs others first, or
 *     not for this project and why. Nothing is hidden: a card this
 *     project cannot carry says so before it is picked.
 *   - `canAddModule` / `moduleRefusal` — `keel add module`'s gates that
 *     turn on the project alone (`./add-module.ts` `moduleRefusal`).
 *   - `harnessGeneration` — the gate every brownfield command but the
 *     harness's own passes first, reported once rather than as the
 *     same refusal on every card.
 *
 * Reading only. An uninitialised directory is not an error here: it
 * is the answer, and it means only `keel new` applies.
 */

import type { Action } from '../../kernel/action.js';
import type { Handler } from '../../kernel/handler.js';
import type { DomainError } from '../../kernel/result.js';
import { ok, type Result } from '../../kernel/result.js';
import { HARNESS_GENERATION, projectScopeRoot, type ManifestV2 } from '../../contract/manifest.js';
import type { ManifestStore } from '../../contract/ports/manifest-store.js';
import type { Registry } from '../../contract/ports/registry.js';
import type {
  AvailableVerticalDescriptor,
  ProjectStatus,
  ProjectStatusQuery,
  RefusalDescriptor,
  VerticalDescriptor,
} from '../../contract/queries.js';
import { RefusalError } from '../../contract/refusal.js';
import { moduleLayoutOf } from '../adapters/module-layout.js';
import { addReadiness } from '../add-readiness.js';
import { verticalTitle } from '../registry.js';
import { moduleRefusal } from './add-module.js';

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
      manifest ? await this.statusOf(query.cwd, scopeRoot, manifest) : uninitialised(scopeRoot),
    );
  }

  private async statusOf(
    cwd: string,
    scopeRoot: string,
    manifest: ManifestV2,
  ): Promise<ProjectStatus> {
    const registry = this.deps.registry;
    const installedIds = new Set(manifest.verticals.map((v) => v.id));
    const available: AvailableVerticalDescriptor[] = [];
    for (const vertical of [...registry.verticals()].sort(byId)) {
      if (installedIds.has(vertical.id)) continue;
      const ready = await addReadiness(this.deps, manifest, cwd, vertical);
      available.push({
        ...describe(registry, vertical.id),
        readiness: ready.readiness,
        requires: [...ready.requires],
        ...(ready.refusal === null ? {} : { refusal: describeRefusal(ready.refusal) }),
      });
    }
    const module = moduleRefusal(manifest, scopeRoot);
    return {
      scopeRoot,
      initialised: true,
      tags: [...manifest.tags],
      installed: manifest.verticals.map((entry) => ({
        ...describe(registry, entry.id),
        installedAt: entry.installedAt,
      })),
      available,
      modules: [...manifest.modules],
      services: [...manifest.services],
      moduleLayout: moduleLayoutOf(manifest.tags),
      canAddModule: module === null,
      ...(module === null ? {} : { moduleRefusal: describeRefusal(module) }),
      harnessGeneration: {
        found: manifest.harnessGeneration ?? null,
        expected: HARNESS_GENERATION,
      },
    };
  }
}

function uninitialised(scopeRoot: string): ProjectStatus {
  const module = moduleRefusal(null, scopeRoot);
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
    ...(module === null ? {} : { moduleRefusal: describeRefusal(module) }),
  };
}

/**
 * A vertical as a card names it. A manifest can name a vertical this
 * keel no longer registers (an older install, a renamed id); reporting
 * it without a description beats dropping it: the project really does
 * have it installed.
 */
function describe(registry: Registry, id: string): VerticalDescriptor {
  const vertical = registry.vertical(id);
  if (!vertical) return { id, title: id, description: '', dimensions: [] };
  return {
    id,
    title: verticalTitle(vertical),
    description: vertical.description,
    dimensions: [...vertical.dimensions],
  };
}

/** A refusal as the status reports it: what the command's `Err` would carry. */
function describeRefusal(error: DomainError): RefusalDescriptor {
  return {
    code: error.code,
    message: error.message,
    ...(error instanceof RefusalError ? { refusal: error.refusal } : {}),
  };
}

function byId(a: { readonly id: string }, b: { readonly id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
