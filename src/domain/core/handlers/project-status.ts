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
 *   - `profile` — what the project is, in the words `keel new` asked
 *     it in (`../profile.ts`): the preset its tags read as, and the
 *     choices that made it — for a page that shows them without a tag.
 *   - `installed` — what the manifest records, each saying whether
 *     `keel add --reapply` can re-render it: not the product glue or a
 *     bounded context, which no `keel add <id>` names.
 *   - `available` — every registered vertical not installed, each with
 *     its readiness and, where `keel add` would refuse it, the refusal
 *     word for word (`../add-readiness.ts`, which the add front door
 *     composes from the same pieces): ready, needs others first, or
 *     not for this project and why. Nothing is hidden: a card this
 *     project cannot carry says so before it is picked.
 *   - `provided` — in a monorepo service, what the product gives it
 *     without an install of its own (`../scope.ts`); at a product root,
 *     what the services that could have it have (`../add-readiness.ts`
 *     `productRootReading`) — each with the note `keel add` answers it
 *     with: there already, nothing to add.
 *   - `services` — at a product root, each service with the directory
 *     a front end opens it at.
 *   - `canAddModule` / `moduleRefusal` — `keel add module`'s gates that
 *     turn on the project alone (`./add-module.ts` `moduleRefusal`).
 *   - `entrypoints` — each back entrypoint, there or not, and where
 *     it is not, what `keel add entrypoint` would install, or why it
 *     would refuse (`./add-entrypoint.ts` `entrypointReading`); a card
 *     only that entrypoint stops carries it as its action (`grow`).
 *   - `harnessGeneration` — the gate every brownfield command but the
 *     harness's own passes first, reported once rather than as the
 *     same refusal on every card.
 *
 * Reading only. An uninitialised directory is not an error here: it
 * is the answer — no brownfield command applies, and `keel new` does
 * unless the directory sits inside a keel project, where its preview
 * carries the refusal.
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
  EntrypointStatus,
  ProjectStatus,
  ProjectStatusQuery,
  ProvidedVerticalDescriptor,
  RefusalDescriptor,
  VerticalDescriptor,
} from '../../contract/queries.js';
import { RefusalError } from '../../contract/refusal.js';
import { moduleLayoutOf } from '../adapters/module-layout.js';
import { addReadiness, addScopeOf, productRootReading } from '../add-readiness.js';
import { projectProfile, serviceLabel } from '../profile.js';
import { inServicesNote, providedNote } from '../refusals.js';
import { installedVertical, verticalTitle } from '../registry.js';
import {
  nearbyProjects,
  provisionsHere,
  scopeOf,
  type DirectoryScope,
  type NearbyReading,
} from '../scope.js';
import { ENTRYPOINTS } from '../stack-wizard.js';
import { boundedContextVertical } from '../verticals/bounded-context.js';
import { entrypointReading } from './add-entrypoint.js';
import { moduleRefusal } from './add-module.js';

/** The ports this query needs. */
export interface ProjectStatusDeps {
  readonly manifests: ManifestStore;
  /** Resolves the descriptions of the verticals a manifest names. */
  readonly registry: Registry;
  /**
   * The user's home directory, where a walk up for the project a
   * directory sits in ends, unread (`../scope.ts`' `projectAbove`).
   */
  readonly home?: string;
}

/** Executes {@link ProjectStatusQuery}s. */
export class ProjectStatusHandler implements Handler<ProjectStatusQuery> {
  constructor(private readonly deps: ProjectStatusDeps) {}

  supports(action: Action): action is ProjectStatusQuery {
    return action.kind === 'keel.project-status';
  }

  async handle(query: ProjectStatusQuery): Promise<Result<ProjectStatus>> {
    const scopeRoot = projectScopeRoot(query.cwd);
    // Read once: at a product root it holds every service's manifest,
    // which each card's refusal names the services from.
    const where = await scopeOf(this.deps, query.cwd);
    const manifest = where.manifest;
    return ok(
      manifest
        ? this.statusOf(where, scopeRoot, manifest)
        : uninitialised(scopeRoot, await nearbyProjects(this.deps, query.cwd)),
    );
  }

  private statusOf(where: DirectoryScope, scopeRoot: string, manifest: ManifestV2): ProjectStatus {
    const registry = this.deps.registry;
    const installedIds = new Set(manifest.verticals.map((v) => v.id));
    const provisions = provisionsHere(registry, where);
    const scope = addScopeOf(registry, where);
    const available: AvailableVerticalDescriptor[] = [];
    const provided: ProvidedVerticalDescriptor[] = [];
    for (const vertical of [...registry.verticals()].sort(byId)) {
      if (installedIds.has(vertical.id)) continue;
      const given = provisions.find((provision) => provision.vertical.id === vertical.id);
      if (given !== undefined) {
        provided.push({
          ...describe(registry, vertical.id),
          note: providedNote(vertical, given.by),
        });
        continue;
      }
      const atRoot = productRootReading(registry, where, vertical);
      if (atRoot?.kind === 'included') {
        provided.push({
          ...describe(registry, vertical.id),
          note: inServicesNote(vertical, atRoot.paths),
        });
        continue;
      }
      const ready = addReadiness(registry, where, vertical, scope);
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
      profile: projectProfile(registry, manifest.tags, manifest.services),
      installed: manifest.verticals.map((entry) => ({
        ...describeInstalled(registry, entry.id),
        installedAt: entry.installedAt,
        // What `keel add --reapply` resolves an id against: the add
        // registry, which leaves out the greenfield-only glue.
        reapplicable: registry.vertical(entry.id) !== null,
      })),
      available,
      provided,
      modules: [...manifest.modules],
      services: where.services.map((service) => ({
        ...service.ref,
        directory: service.directory,
        label: serviceLabel(service.ref),
      })),
      moduleLayout: moduleLayoutOf(manifest.tags),
      canAddModule: module === null,
      ...(module === null ? {} : { moduleRefusal: describeRefusal(module) }),
      entrypoints: entrypointsOf(registry, where, manifest),
      harnessGeneration: {
        found: manifest.harnessGeneration ?? null,
        expected: HARNESS_GENERATION,
      },
    };
  }
}

/**
 * The status of a directory holding no project: nothing applies, and
 * `keel add module` is refused as its front door refuses it there —
 * pointing at `nearby`, the projects nearest it.
 */
function uninitialised(scopeRoot: string, nearby: NearbyReading): ProjectStatus {
  const module = moduleRefusal(null, scopeRoot, '<name>', nearby);
  return {
    scopeRoot,
    initialised: false,
    tags: [],
    profile: { preset: null, facts: [] },
    installed: [],
    available: [],
    provided: [],
    modules: [],
    services: [],
    moduleLayout: 'basic',
    canAddModule: false,
    ...(module === null ? {} : { moduleRefusal: describeRefusal(module) }),
  };
}

/**
 * Each back entrypoint, in the finder's order, as `keel add entrypoint`
 * would answer it in `where`: there already, or what it would install,
 * or its refusal where it would refuse (`./add-entrypoint.ts`
 * `entrypointReading`).
 */
function entrypointsOf(
  registry: Registry,
  where: DirectoryScope,
  manifest: ManifestV2,
): readonly EntrypointStatus[] {
  return ENTRYPOINTS.filter((entry) => entry.side === 'back').map((entry) => {
    const described = { word: entry.word, label: entry.label };
    if (manifest.tags.includes(entry.tag)) return { ...described, present: true };
    const reading = entrypointReading(registry, where, entry.word);
    return reading.ok
      ? { ...described, present: false, installs: reading.value }
      : { ...described, present: false, refusal: describeRefusal(reading.error) };
  });
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

/**
 * An installed vertical as the project names it — by title, where this
 * keel knows the piece at all: registered, a stack's own glue
 * (`fullstack`, which no registry lists on its own), or the context
 * `keel add module` installs.
 */
function describeInstalled(registry: Registry, id: string): VerticalDescriptor {
  const vertical =
    installedVertical(registry, id) ??
    (id === boundedContextVertical.id ? boundedContextVertical : null);
  if (vertical === null) return describe(registry, id);
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
