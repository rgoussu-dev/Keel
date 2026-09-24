/**
 * Where a directory sits in a product — read off the manifests on
 * disk, through the `ManifestStore` port — and the scope a plan there
 * reads (`./planner.ts`, which stays pure over it).
 *
 * A composite product's scopes do not know about each other from
 * their own tags. A monorepo service is a directory of the product's
 * repository, and nothing in its manifest says so: only the product
 * root's does, by listing it in `services` — and only a monorepo
 * product writes a root manifest at all (a polyrepo one has no shared
 * root). So the answer to "may a pipeline go here?" is one level up,
 * and to "which of the product's services can take persistence?" one
 * level down. {@link scopeOf} reads both, once per question, and the
 * functions below turn what it read into a {@link PlanScope}:
 *
 *   - **At a product root**, each service's own manifest — so the
 *     root's refusal of a vertical names the services that can take
 *     it, read from what each has rather than what its preset had.
 *   - **In a monorepo service** — a directory the product root above
 *     it lists, which only a monorepo product has — what the product
 *     gives it without an install of its own ({@link provisionsFor}):
 *     each vertical placed at a repository root that the product root
 *     installed (`Vertical.placement` — `vcs`), and each vertical the
 *     product root's adapters build for this service's stack
 *     (`Adapter.providesInServices` — the image the root's
 *     `compose.yaml` builds). Both read as there already, and a
 *     placed vertical the root does not have as not for this scope —
 *     `PlanScope.member`.
 *
 * Two declarations and one reading of each, never a list of ids here:
 * a plugin's vertical that writes repository-root files, or a plugin
 * product whose glue builds its services something, is read the same
 * way keel's own are.
 */

import path from 'node:path';
import type { Tag, Vertical } from '../contract/composition.js';
import {
  effectiveTags,
  projectScopeRoot,
  type ManifestV2,
  type ServiceRef,
} from '../contract/manifest.js';
import type { ManifestStore } from '../contract/ports/manifest-store.js';
import type { Registry } from '../contract/ports/registry.js';
import { conflictsOf } from './compatibility.js';
import { defaultScope, seedFor, type PlanScope } from './planner.js';
import { matches } from './predicate.js';
import { installedVertical } from './registry.js';
import { stackTagsFor, type Stack } from './stacks.js';

/** The ports reading a project on disk takes. */
export interface ProjectReadDeps {
  readonly registry: Registry;
  readonly manifests: ManifestStore;
}

/** What {@link scopeOf} read about one directory. */
export interface DirectoryScope {
  /** The directory asked about. */
  readonly cwd: string;
  /** Its own manifest; null when keel finds no project there. */
  readonly manifest: ManifestV2 | null;
  /**
   * The product it sits inside, when the nearest keel project above it
   * is a product root; null anywhere else.
   */
  readonly product: EnclosingProduct | null;
  /**
   * At a product root, its services in the product's order, each with
   * its own manifest; empty anywhere else.
   */
  readonly services: readonly ServiceScope[];
}

/** The product root above a directory. @see DirectoryScope.product */
export interface EnclosingProduct {
  /** The product root's directory. */
  readonly root: string;
  /** The directory asked about, relative to {@link root}, with `/` separators. */
  readonly relative: string;
  /** The product root's manifest. */
  readonly manifest: ManifestV2;
  /**
   * The service the directory is, by the product's own record; null
   * when the product lists no service there — a directory inside the
   * product that is not one of its services.
   */
  readonly service: ServiceRef | null;
}

/** One service of a product root, as {@link scopeOf} read it. */
export interface ServiceScope {
  /** The service as the product root's manifest records it. */
  readonly ref: ServiceRef;
  /** The service's directory. */
  readonly directory: string;
  /**
   * Its manifest; null where none can be read — absent, or one keel
   * cannot parse, which is that service's to report when the user
   * works there rather than the root's.
   */
  readonly manifest: ManifestV2 | null;
}

/**
 * A vertical a monorepo service has from its product rather than from
 * an install of its own, and where from:
 *
 * - `repository` — the product root installed it, and it is placed at
 *   a repository root (`Vertical.placement`), which the product root
 *   is;
 * - `product` — an adapter the product root ran builds it for this
 *   service's stack (`Adapter.providesInServices`).
 */
export interface Provision {
  readonly vertical: Vertical;
  readonly by: 'repository' | 'product';
}

/**
 * Reads where `cwd` sits: its own manifest, the product above it if
 * any, and — at a product root — each service's manifest.
 *
 * The walk up stops at the first keel project it meets, which decides:
 * a product root makes `cwd` part of that product (a listed service,
 * or a directory the product does not list), and any other project
 * makes it part of that project, which is no product's business. It
 * looks no further up than the deepest service path a registered
 * product declares — a product holds its services no deeper than that,
 * so no manifest higher up can be the root of one — which for keel's
 * own products is the parent directory alone. A manifest up there that
 * cannot be read is passed over as not a product's: it is not this
 * directory's to report.
 */
export async function scopeOf(deps: ProjectReadDeps, cwd: string): Promise<DirectoryScope> {
  const manifest = await deps.manifests.read(projectScopeRoot(cwd));
  const services = await Promise.all(
    (manifest?.services ?? []).map(async (ref): Promise<ServiceScope> => {
      const directory = path.join(cwd, ref.path);
      return {
        ref,
        directory,
        manifest: await deps.manifests.read(projectScopeRoot(directory)).catch(() => null),
      };
    }),
  );
  return { cwd, manifest, product: await enclosingProduct(deps, cwd), services };
}

/** Where the keel projects nearest a directory holding none are — see {@link nearbyProjects}. */
export interface NearbyProjects {
  /** The nearest project above, relative to the directory (`..`); null when none is. */
  readonly above: string | null;
  /** Service directories below that hold a project, relative to it, in registry order. */
  readonly below: readonly string[];
}

/**
 * The keel projects nearest `cwd`, a directory that holds none: the
 * nearest one above it — `cwd` is a subdirectory of a project — and
 * the directories a registered product puts its services in, below it,
 * that hold one — `cwd` is a polyrepo product's parent directory, which
 * has no manifest of its own. What a command that needs a project
 * points at there, rather than at `keel new`, which would scaffold a
 * project inside another, or over a product's services.
 */
export async function nearbyProjects(deps: ProjectReadDeps, cwd: string): Promise<NearbyProjects> {
  const read = (directory: string) =>
    deps.manifests.read(projectScopeRoot(directory)).catch(() => null);
  let above: string | null = null;
  for (let directory = path.dirname(cwd); ; directory = path.dirname(directory)) {
    if ((await read(directory)) !== null) {
      above = path.relative(cwd, directory).split(path.sep).join('/');
      break;
    }
    if (path.dirname(directory) === directory) break;
  }
  const paths = [
    ...new Set(
      deps.registry
        .stacks()
        .flatMap((stack) => stack.services ?? [])
        .map((service) => path.posix.normalize(service.path).replace(/\/+$/, '')),
    ),
  ];
  const below: string[] = [];
  for (const service of paths) {
    if ((await read(path.join(cwd, service))) !== null) below.push(service);
  }
  return { above, below };
}

/**
 * The product root above `cwd`, when the nearest keel project above it
 * is one — see {@link scopeOf}, which this is the upward half of, for
 * where the walk stops. What `keel new` asks before scaffolding into a
 * directory, since it has no manifest of its own to read.
 */
export async function enclosingProduct(
  deps: ProjectReadDeps,
  cwd: string,
): Promise<EnclosingProduct | null> {
  let directory = cwd;
  for (let level = 0; level < deepestService(deps.registry); level++) {
    const parent = path.dirname(directory);
    if (parent === directory) return null;
    directory = parent;
    const found = await deps.manifests.read(projectScopeRoot(directory)).catch(() => null);
    if (found === null) continue;
    if (found.services.length === 0) return null;
    const relative = path.relative(directory, cwd).split(path.sep).join('/');
    return {
      root: directory,
      relative,
      manifest: found,
      service: found.services.find((service) => samePath(service.path, relative)) ?? null,
    };
  }
  return null;
}

/**
 * The scope a plan on the project at `where` reads: its own effective
 * tags, its installed verticals less `except` (the ones a run
 * re-renders, planned as if they were not there yet) and their rules —
 * and, in a monorepo service, what the product gives it
 * ({@link provisionsFor}), read as there already, with placement held
 * (`PlanScope.member`). `where` holds a manifest.
 */
export function planScopeOf(
  registry: Registry,
  where: DirectoryScope,
  except: readonly string[] = [],
): PlanScope {
  if (where.manifest === null) {
    throw new Error(`planScopeOf: no project at ${where.cwd} to plan onto`);
  }
  const own = projectScope(registry, where.manifest, except);
  const product = where.product;
  if (product === null || product.service === null) return own;
  return memberScope(own, provisionsFor(registry, rootOf(product.manifest), product.service.stack));
}

/**
 * What the product gives the service `where` is, when it is a
 * monorepo service; empty anywhere else. @see provisionsFor
 */
export function provisionsHere(registry: Registry, where: DirectoryScope): readonly Provision[] {
  const product = where.product;
  if (product === null || product.service === null) return [];
  return provisionsFor(registry, rootOf(product.manifest), product.service.stack);
}

/**
 * The scope a product root's service plans onto, read from the root:
 * its own manifest where `service` holds one, its preset's default
 * scope where it holds none — and either way as a monorepo service of
 * that root, since only a monorepo product has a root to read it from.
 * Null when neither is known: a service of a preset this keel does not
 * register, and no manifest to go on.
 */
export function serviceScopeOf(
  registry: Registry,
  root: ManifestV2,
  service: ServiceScope,
): PlanScope | null {
  const stack = registry.stack(service.ref.stack);
  const own =
    service.manifest !== null
      ? projectScope(registry, service.manifest)
      : stack !== null
        ? defaultScope(stack)
        : null;
  if (own === null) return null;
  return memberScope(own, provisionsFor(registry, rootOf(root), service.ref.stack));
}

/**
 * One service of a product preset as `keel new` scaffolds it: its
 * directory, its preset, and the verticals the product installs in it
 * of its own accord (the preset's `services[].extraVerticals`).
 */
export interface PresetService {
  readonly path: string;
  readonly stack: Stack;
  readonly extraVerticals: readonly Vertical[];
}

/**
 * The verticals a service of a product installs before any extra is
 * named: its preset's own, then the product's for it — less, under the
 * monorepo layout, those whose place is a repository root, which the
 * product root carries instead (`Vertical.placement`). The list `keel
 * new` installs there, and the one {@link presetServiceScope} reads as
 * there already.
 */
export function presetServiceVerticals(
  service: PresetService,
  monorepo: boolean,
): readonly Vertical[] {
  return [...service.stack.verticals, ...service.extraVerticals].filter(
    (vertical) => !(monorepo && vertical.placement?.scope === 'repository'),
  );
}

/**
 * The tags a service of a product seeds as `keel new` scaffolds it:
 * its preset's, the build system chosen for it (`buildTag`, null where
 * the preset pins one), its preset's default module layout — a product
 * offers no other — and what each of its sibling services projects
 * there, as the peers its manifest records.
 */
export function presetServiceTags(
  service: PresetService,
  buildTag: Tag | null,
  services: readonly PresetService[],
): readonly Tag[] {
  return [
    ...stackTagsFor(service.stack, buildTag, service.stack.moduleLayouts?.[0]?.tag ?? null),
    ...services
      .filter((other) => other.path !== service.path)
      .flatMap((other) => other.stack.projects ?? []),
  ];
}

/**
 * The scope a service of the product preset `product` plans onto
 * before `keel new` writes anything: its tags (`tags`,
 * {@link presetServiceTags}) as {@link presetServiceVerticals} leave
 * them, those verticals as there already with the rules they and the
 * service's preset declare — and, under the monorepo layout, what the
 * product root the same run scaffolds gives it. What a service's extras
 * menu, a product's `--with` and a service's own extras all plan onto,
 * so the three read one scope.
 */
export function presetServiceScope(
  registry: Registry,
  product: Stack,
  service: PresetService,
  tags: readonly Tag[],
  monorepo: boolean,
): PlanScope {
  const verticals = presetServiceVerticals(service, monorepo);
  const own: PlanScope = {
    tags: seedFor({ ...service.stack, verticals: [...verticals] }, tags),
    installed: verticals.map((vertical) => vertical.id),
    rules: conflictsOf([service.stack, ...verticals]),
  };
  if (!monorepo) return own;
  const root = {
    installed: product.verticals.map((vertical) => vertical.id),
    tags: seedFor(product, product.tags),
  };
  return memberScope(own, provisionsFor(registry, root, service.stack.id));
}

/**
 * What a monorepo product's root gives a service scaffolded from
 * `stack` — see {@link Provision}. `root` is the product root as a
 * plan reads it: the ids of the verticals it has, and its tags. In
 * registry order, each vertical once, a repository's before a build's.
 */
export function provisionsFor(
  registry: Registry,
  root: { readonly installed: readonly string[]; readonly tags: readonly Tag[] },
  stack: string,
): readonly Provision[] {
  const provisions: Provision[] = registry
    .verticals()
    .filter(
      (vertical) =>
        vertical.placement?.scope === 'repository' && root.installed.includes(vertical.id),
    )
    .map((vertical) => ({ vertical, by: 'repository' }));
  const tags = new Set(root.tags);
  for (const id of root.installed) {
    for (const adapter of installedVertical(registry, id)?.adapters ?? []) {
      const provides = adapter.providesInServices;
      if (provides === undefined || !provides.stacks.includes(stack)) continue;
      if (!matches(adapter.predicate, tags)) continue;
      const vertical = registry.vertical(provides.vertical);
      if (vertical === null || provisions.some((given) => given.vertical.id === vertical.id)) {
        continue;
      }
      provisions.push({ vertical, by: 'product' });
    }
  }
  return provisions;
}

/**
 * The scope a project on disk plans onto: its effective tags (its own,
 * and what linked projects project here), the verticals it has
 * installed — less `except`, the ones a run re-renders and so plans as
 * if they were not there yet — and the rules those installed pieces
 * declare, which nothing the run adds may newly break. Each of those
 * installed verticals is one a run may re-render
 * (`PlanScope.refreshable`); what a product gives a monorepo service
 * is not, since the service has nothing of it to re-render.
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
    refreshable: installed,
  };
}

/**
 * `own` — a service's own scope — as a monorepo service's: what
 * `provisions` give it there already, and its placement held
 * (`PlanScope.member`).
 */
export function memberScope(own: PlanScope, provisions: readonly Provision[]): PlanScope {
  const provided = provisions
    .map((given) => given.vertical.id)
    .filter((id) => !own.installed.includes(id));
  return { ...own, installed: [...own.installed, ...provided], member: { provided } };
}

/** A product root's manifest as {@link provisionsFor} reads it. */
function rootOf(manifest: ManifestV2): {
  readonly installed: readonly string[];
  readonly tags: readonly Tag[];
} {
  return { installed: manifest.verticals.map((v) => v.id), tags: effectiveTags(manifest) };
}

/**
 * How many directories deep a registered product holds a service — at
 * least one, so a product root on disk from a preset this keel no
 * longer registers is still found from its services.
 */
function deepestService(registry: Registry): number {
  return Math.max(
    1,
    ...registry
      .stacks()
      .flatMap((stack) => stack.services ?? [])
      .map((service) => service.path.split('/').filter((segment) => segment !== '').length),
  );
}

/**
 * Whether two service paths name one directory, however they were
 * spelled — `./apps/api/` is `apps/api`: a plugin's preset writes its
 * service paths as it likes, and the product root records them as
 * written.
 */
function samePath(a: string, b: string): boolean {
  const canonical = (spelled: string) => path.posix.normalize(spelled).replace(/\/+$/, '');
  return canonical(a) === canonical(b);
}
