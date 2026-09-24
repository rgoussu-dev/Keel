/**
 * How `keel add <vertical>` would answer on a project already on disk,
 * asked before it runs — the one reading behind the brownfield cards
 * (`keel.project-status`), `keel add --list` and the add front door
 * itself.
 *
 * The page used to list every vertical not installed and learn which
 * of them the project could carry by clicking: the refusal arrived
 * after the pick, and about half the cards on a CLI project were one.
 * A card cannot be read any other way than the front door reads the
 * click, or the two drift — so both are built here, from the same two
 * pieces:
 *
 *   - {@link productRootRefusal}, which a composite product's root
 *     answers first: a capability belongs to one of its services;
 *   - the planner, over {@link projectScope} — this project's effective
 *     tags, its installed verticals, and the rules those declare —
 *     through `./plan-refusal.ts`, whose {@link foresee} words a
 *     vertical asked alone exactly as `admit` words the plan of it.
 *
 * {@link addReadiness} composes them for one vertical, as a card reads
 * it; the front door composes them for the set it was given. The
 * composition grid holds the two to each other through `keel.preview`
 * (I4). What is not here is the harness-generation gate: it refuses
 * every vertical alike (but the harness itself), so a status reports it
 * once, not on every card.
 */

import path from 'node:path';
import { effectiveTags, projectScopeRoot, type ManifestV2 } from '../contract/manifest.js';
import type { Vertical } from '../contract/composition.js';
import type { ManifestStore } from '../contract/ports/manifest-store.js';
import type { Registry } from '../contract/ports/registry.js';
import type { ElsewhereService, RefusalError } from '../contract/refusal.js';
import { conflictsOf } from './compatibility.js';
import { foresee } from './plan-refusal.js';
import { defaultScope, readiness, type PlanScope } from './planner.js';
import { elsewhereRefusal, UNCOVERED_CODE } from './refusals.js';
import { installedVertical } from './registry.js';
import { coversFor } from './resolver.js';

/** The ports reading a project on disk takes. */
export interface ProjectReadDeps {
  readonly registry: Registry;
  readonly manifests: ManifestStore;
}

/** How ready one vertical is for `keel add` here, as a card reads it. */
export interface AddReadiness {
  /**
   * `ready` — it installs on its own; `needs` — it installs with
   * {@link requires} first; `unavailable` — {@link refusal} is what
   * `keel add` says instead.
   */
  readonly readiness: 'ready' | 'needs' | 'unavailable';
  /** What installs first, in install order; empty unless an admitted `needs`. */
  readonly requires: readonly string[];
  /**
   * What `keel add <id>` refuses it with, word for word: set on every
   * `unavailable`, and on a `needs` whose prerequisites are tied.
   */
  readonly refusal: RefusalError | null;
}

/**
 * The scope a project on disk plans onto: its effective tags (its own,
 * and what linked projects project here), the verticals it has
 * installed — less `except`, the ones a run re-renders and so plans as
 * if they were not there yet — and the rules those installed pieces
 * declare, which nothing the run adds may newly break.
 *
 * An installed vertical this keel does not know (a plugin no longer
 * loaded) still counts as installed; it only brings no rules, since
 * there is nothing to read them from.
 */
export function projectScope(
  registry: Registry,
  manifest: ManifestV2,
  except: readonly string[] = [],
): PlanScope {
  const installed = manifest.verticals.map((v) => v.id).filter((id) => !except.includes(id));
  return {
    tags: effectiveTags(manifest),
    installed,
    rules: conflictsOf(installed.flatMap((id) => installedVertical(registry, id) ?? [])),
  };
}

/**
 * How ready `vertical` is for `keel add` on the project `stored`
 * records at `cwd`, and the refusal where there is one — what the front
 * door answers `keel add <vertical>` with, before any file moves, the
 * harness-generation gate aside. `vertical` is registered and not
 * installed here.
 */
export async function addReadiness(
  deps: ProjectReadDeps,
  stored: ManifestV2,
  cwd: string,
  vertical: Vertical,
): Promise<AddReadiness> {
  const misplaced = await productRootRefusal(deps, vertical, stored, cwd);
  if (misplaced !== null) return { readiness: 'unavailable', requires: [], refusal: misplaced };
  const { readiness: ready, refusal } = foresee(
    deps.registry,
    projectScope(deps.registry, stored),
    vertical,
  );
  switch (ready.kind) {
    case 'ready':
      return { readiness: 'ready', requires: [], refusal: null };
    case 'needs':
      return {
        readiness: 'needs',
        requires: refusal === null ? ready.prerequisites : [],
        refusal,
      };
    case 'unavailable':
      return { readiness: 'unavailable', requires: [], refusal };
    case 'included':
      throw new Error(`addReadiness: '${vertical.id}' is installed here already`);
  }
}

/**
 * A composite product's root holds services, and a capability belongs
 * to one of them: whatever the root cannot carry is refused as
 * belonging elsewhere, naming the service directories and how ready
 * it is in each — read from each service's own manifest, or its
 * preset where there is none — rather than with the gap of whichever
 * adapter family sits nearest to a root's near-empty tag set. The
 * code stays the coverage one, since the condition is. The agent
 * harness is the one vertical refused here although it would
 * resolve: the root has a harness of its own, which indexes the
 * services' and must not be replaced by one of theirs. Null anywhere
 * but a product root, and for what a root does carry.
 *
 * Asked by the front door of each vertical it is named, before it
 * plans them (`admit`), and by {@link addReadiness} of a card.
 */
export async function productRootRefusal(
  deps: ProjectReadDeps,
  vertical: Vertical,
  stored: ManifestV2,
  cwd: string,
): Promise<RefusalError | null> {
  if (stored.services.length === 0) return null;
  const harness = vertical.id === 'agent-harness';
  if (!harness && coversFor(vertical, effectiveTags(stored))) return null;
  const registry = deps.registry;
  const services: ElsewhereService[] = [];
  for (const service of stored.services) {
    // Only the wording of this refusal rides on it: a service
    // manifest keel cannot read is that service's to report when
    // the user runs there, and its preset says well enough here
    // whether the vertical goes in it.
    const own = await deps.manifests
      .read(projectScopeRoot(path.join(cwd, service.path)))
      .catch(() => null);
    const stack = registry.stack(service.stack);
    const scope =
      own !== null ? projectScope(registry, own) : stack !== null ? defaultScope(stack) : null;
    services.push({
      path: service.path,
      stack: service.stack,
      readiness: scope === null ? 'unavailable' : readiness(registry, scope, vertical.id).kind,
    });
  }
  return elsewhereRefusal(
    registry,
    vertical,
    services,
    harness ? 'keel.invalid-agent-harness' : UNCOVERED_CODE,
  );
}
