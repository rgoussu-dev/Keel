/**
 * The converge reading (roadmap S.2): the composition a project has,
 * the one a command asks for, and the run that takes it there — read
 * before anything runs, from a registry, a manifest and a request.
 *
 * Every path that installs or re-renders verticals — `keel new`, `keel
 * add` with `--refresh` and `--reapply`, `keel add entrypoint` and
 * `keel add module` — is one operation run on a different request.
 * This is its reading, pure as `./planner.ts` and `./growth.ts` are:
 * nothing here runs, reads a file or is worded; `./converge-run.ts`
 * runs it. `keel add entrypoint` is its first caller (S.3), and `keel
 * add`, with `--refresh` and `--reapply`, its second (S.4); until
 * `keel add module` and `keel new` are (S.5 and S.6), it is the reading
 * their handlers make today, and
 * `tests/domain/core/converge.golden.test.ts` records it on every cell
 * of the paths golden.
 *
 * **The composition needs no new record** (DS2). A manifest already
 * says what `keel new` was given ({@link compositionOf}): the preset the
 * drill-down places it on (`./profile.ts` `projectProfile`), on the
 * setting of its dials the tags record, read as growth reads a twin's
 * (`./growth.ts` `settingOf`); the harness, by whether it is recorded;
 * the extras, as what is recorded beyond the preset — among them, for a
 * service of a composite product, what the product installs there of
 * its own accord; and the contexts `keel add module` added after the
 * skeleton (`./contexts.ts`).
 *
 * **One reference order** ({@link referenceOrder}): the order one run
 * of `keel new` of the composition records — the preset's verticals in
 * the preset's order, then what a product gives its service in the
 * product's, then the other extras in `admit`'s, then
 * `bounded-context`, which one run never records and `keel add module`
 * records last. Where no preset reads back, the recorded order stands
 * in for it. Read here; S.8 records by it.
 *
 * **A request names nothing to take away** (DS5). Each kind adds —
 * verticals, a re-render, an entrypoint, a context, a preset from its
 * seed manifest — and none has a field that removes, so no command can
 * ask for a removal. Where reaching the composition would stop an
 * adapter from applying, growth refuses it.
 *
 * **The plan** ({@link convergeOf}) is the target composition; the run,
 * one step per vertical in run order, each installed whole, installed
 * in part, re-rendered, or replayed for its deferred actions alone
 * where the caller settles (DR5, DS7); the contexts to wire; and the
 * caller's placement, as it is today — growth records at its twin's
 * rank and realizes the harness in its twin's order, every other
 * caller appends and realizes it in run order. S.8 moves the second
 * onto the reference order.
 */

import path from 'node:path';
import type { DomainError, Result } from '../kernel/result.js';
import type { Tag, Vertical } from '../contract/composition.js';
import { effectiveTags, type ManifestV2, type PeerLink } from '../contract/manifest.js';
import type { Registry } from '../contract/ports/registry.js';
import type { Stack } from '../contract/stack.js';
import { CONTEXT_TAG } from './adapters/added-context.js';
import { PEER_CONTEXT_TAG } from './adapters/module-layout.js';
import { contextsOf } from './contexts.js';
import { presetScope, presetServicesOf, withoutHarness } from './dials.js';
import {
  growthOf,
  settingOf,
  type GrowthModule,
  type GrowthPlan,
  type GrowthRefusal,
} from './growth.js';
import { admit, type AdmittedSet } from './plan-refusal.js';
import { acquirableIn, matchingIds, type PlanScope } from './planner.js';
import { projectProfile } from './profile.js';
import { rankedIndex } from './rank.js';
import { installedVertical } from './registry.js';
import {
  presetServiceScope,
  presetServiceVerticals,
  projectScope,
  type PresetService,
  type ProductServiceScope,
} from './scope.js';
import { boundedContextVertical } from './verticals/bounded-context.js';

/** The vertical whose record is the harness dial, and that `--no-agent-harness` leaves out. */
const HARNESS = 'agent-harness';

/** The row `keel add module` records, which one run of `keel new` never does. */
const BOUNDED_CONTEXT = boundedContextVertical.id;

/**
 * What a project is, as the composition `keel new` would have been
 * given for it — read off its manifest ({@link compositionOf}), or the
 * target a request converges it onto ({@link ConvergePlan}).
 */
export interface Composition {
  /**
   * The preset, by id: the one the drill-down places the project on,
   * where the tags record a setting of its dials — null where none
   * reads back (a plugin's preset off the tree, a manifest migrated
   * from v1).
   */
  readonly preset: string | null;
  /**
   * The dial tags that setting folds in — the build system's, the
   * module layout's, the peer context's marker — each where it has
   * one; none where no preset reads back.
   */
  readonly dials: readonly Tag[];
  /** The harness dial: whether `agent-harness` is recorded. */
  readonly harness: boolean;
  /**
   * Whether the project is a service of a monorepo product: its preset
   * lists verticals a repository root carries (`Vertical.placement`)
   * and it records none of them, since the product root carries them
   * and keel removes nothing a project of its own records.
   */
  readonly member: boolean;
  /**
   * What a composite product installs in the project as a service of
   * it, of its own accord (`StackService.extraVerticals`), by id in the
   * product's order — less, in a monorepo service, what its product
   * root carries. Read where the project links each other service of a
   * registered product with a service on its preset, by the path
   * `keel new` of the product links it at, and records each of what
   * that service is given: the first such service, in registry order.
   * Products that place a service alike read alike. None for a project
   * of its own, and where no preset reads back.
   */
  readonly given: readonly string[];
  /**
   * The verticals recorded beyond the preset's, in recorded order,
   * `bounded-context` apart — {@link given} among them; every other
   * recorded one, where no preset reads back.
   */
  readonly extras: readonly string[];
  /**
   * The contexts `keel add module` added, by name, in the order
   * recorded: the modules after the skeleton, the peer apart.
   */
  readonly contexts: readonly string[];
  /**
   * The tags the project plans on — its own and what linked projects
   * project here; a target's are those its run starts from, before
   * anything it installs promotes.
   */
  readonly tags: readonly Tag[];
  /** What the project projects onto a linked sibling. */
  readonly projects: readonly Tag[];
  /**
   * The verticals the project records, in the order it records them —
   * a target's with what its run records anew placed where the
   * caller places it ({@link Placement}).
   */
  readonly recorded: readonly string[];
  /** The order one run of `keel new` of this composition records ({@link referenceOrder}). */
  readonly order: readonly string[];
}

/**
 * What a command asks of the project a manifest records. Each kind
 * adds; none names anything to take away (DS5), so a removal cannot be
 * asked for.
 *
 * - `add` — `keel add`: the verticals it installs, by id, named less
 *   what the project has, closed over their prerequisites (`admit`),
 *   and those `--refresh` re-renders beside them. The caller hands in
 *   the scope and the siblings it plans on (`./add-readiness.ts`
 *   `addScopeOf`, `./scope.ts` `siblingsOf`), since a manifest alone
 *   does not say where a monorepo service sits;
 * - `reapply` — `keel add --reapply`: installed verticals re-rendered,
 *   by id;
 * - `entrypoint` — `keel add entrypoint`: the entrypoint by its word or
 *   id, read by `growthOf`;
 * - `module` — `keel add module`: the context to add, and the one it
 *   consumes, which its adapters read from the inputs the caller seeds;
 * - `new` — `keel new`, run from a seed manifest (the preset's and the
 *   dials' tags, `projects`, `peers`, `services`, the scaffolded
 *   modules): the preset by id, the harness dial, the extras the user
 *   names by id, whether the scope is a service of a monorepo product,
 *   which leaves what the product root carries out of it, and — where
 *   it is a service of a composite product — the product by id and the
 *   service's path in it. What the product gives the service of its
 *   own accord installs straight after the preset's verticals, in the
 *   product's order and never admitted, and the extras are admitted
 *   on the scope `keel new` plans them on there
 *   (`./scope.ts` `presetServiceScope`), which has it.
 */
export type ConvergeRequest =
  | {
      readonly kind: 'add';
      readonly verticals: readonly string[];
      readonly refresh?: readonly string[];
      readonly scope: PlanScope;
      readonly siblings?: readonly ProductServiceScope[];
    }
  | { readonly kind: 'reapply'; readonly verticals: readonly string[] }
  | { readonly kind: 'entrypoint'; readonly word: string }
  | { readonly kind: 'module'; readonly name: string; readonly consumes: string | null }
  | {
      readonly kind: 'new';
      readonly stack: string;
      readonly harness: boolean;
      readonly extras: readonly string[];
      readonly member: boolean;
      readonly service?: { readonly product: string; readonly path: string };
    };

/**
 * One vertical of a run, in its posture:
 *
 * - `install` — installed whole;
 * - `only` — only `adapters` install, the ones the target's tags newly
 *   match; where `settles`, the others replay for their deferred
 *   actions alone;
 * - `rerender` — re-rendered from its recorded answers;
 * - `settle` — replayed for its deferred actions alone (`actionsOnly`),
 *   where the caller settles (DR5).
 */
export interface ConvergeStep {
  readonly vertical: Vertical;
  readonly posture: 'install' | 'only' | 'rerender' | 'settle';
  /** Where `posture` is `only`: the adapters that install, by id, in declaration order. */
  readonly adapters?: readonly string[];
  /** Where `posture` is `only`: set where the adapters that do not install settle. */
  readonly settles?: true;
}

/**
 * Where the caller records a run, as it does today (S.8 moves `append`
 * onto the reference order):
 *
 * - `rows` — `twin`, each new row of the manifest at its twin's rank
 *   (growth); `append`, after every recorded one;
 * - `harness` — `twin`, the harness buffer realized in the twin's
 *   order (growth); `run`, in the order the run filled it.
 */
export interface Placement {
  readonly rows: 'twin' | 'append';
  readonly harness: 'twin' | 'run';
}

/**
 * Why a request does not converge: growth's refusal of the entrypoint
 * (`growth`), or the planner's of the verticals it would install,
 * worded as both front doors word it (`plan`, `./plan-refusal.ts`).
 */
export type ConvergeRefusal =
  | { readonly kind: 'growth'; readonly refusal: GrowthRefusal }
  | { readonly kind: 'plan'; readonly error: DomainError };

/** What {@link convergeOf} makes of a request: a plan, or its refusal. */
export type ConvergePlan =
  | {
      readonly kind: 'converges';
      /** The composition the project is to have. */
      readonly target: Composition;
      /** One step per vertical, in run order. */
      readonly run: readonly ConvergeStep[];
      /**
       * The contexts `keel add module` added that the run wires, each
       * by a run of keel's own `bounded-context` with its adapters, in
       * the order recorded, after every step.
       */
      readonly modules: readonly GrowthModule[];
      readonly placement: Placement;
    }
  | { readonly kind: 'refused'; readonly refusal: ConvergeRefusal };

/** How every caller but growth records, today. */
const APPENDED: Placement = { rows: 'append', harness: 'run' };

/** How growth records: where its twin records. */
const AT_TWIN: Placement = { rows: 'twin', harness: 'twin' };

/**
 * The composition the project `manifest` records, as `keel new` would
 * have been given it (DS2): the preset the drill-down places it on, on
 * the setting of its dials its tags record; whether it records the
 * harness; the extras, what it records beyond the preset; and the
 * contexts `keel add module` added.
 */
export function compositionOf(registry: Registry, manifest: ManifestV2): Composition {
  return recording(
    registry,
    manifest,
    manifest.verticals.map(({ id }) => id),
    addedContexts(manifest),
  );
}

/**
 * The order one run of `keel new` of `composition` records: the
 * preset's verticals in the preset's order — less the harness where
 * the harness dial is off, and less what a monorepo service leaves to
 * its product root — then what a product gives its service
 * ({@link Composition.given}) in the product's order, then the other
 * extras in `admit`'s order on the scope `keel new` plans them on,
 * then `bounded-context` where it is recorded. Where no preset reads
 * back, the recorded order. An extra no registered vertical is any
 * more comes after the others, and extras `admit` refuses together on
 * that scope keep their recorded order.
 */
export function referenceOrder(
  registry: Registry,
  composition: Omit<Composition, 'order'>,
): readonly string[] {
  const stack = composition.preset === null ? null : registry.stack(composition.preset);
  if (stack === null) return [...composition.recorded];
  const dialed = composition.harness ? stack : withoutHarness(stack);
  const own = ownOf(dialed, [], composition.member).map(({ id }) => id);
  const { given } = composition;
  const acquirable = acquirableIn(registry);
  const tags = [
    ...new Set([
      ...stack.tags,
      ...composition.dials,
      ...composition.tags.filter((tag) => !acquirable.has(tag)),
    ]),
  ];
  const service =
    given.length > 0 || composition.member
      ? serviceGiving(registry, stack.id, given, composition.member)
      : null;
  const scope = extrasScope(registry, dialed, tags, composition.member, service);
  const extras = composition.extras.filter((id) => !given.includes(id));
  const context = composition.recorded.includes(BOUNDED_CONTEXT) ? [BOUNDED_CONTEXT] : [];
  return [...own, ...given, ...extrasInOrder(registry, scope, extras), ...context];
}

/**
 * What `request` makes of the project `manifest` records: the plan
 * that converges it onto the composition asked for, or the refusal —
 * the plan each front door builds today.
 *
 * @throws Error where the request names a vertical or a preset the
 *   registry does not know, which every front door refuses first
 */
export function convergeOf(
  registry: Registry,
  manifest: ManifestV2,
  request: ConvergeRequest,
): ConvergePlan {
  switch (request.kind) {
    case 'add':
      return addOf(registry, manifest, request);
    case 'reapply':
      return reapplyOf(registry, manifest, request.verticals);
    case 'entrypoint':
      return entrypointOf(registry, manifest, request.word);
    case 'module':
      return moduleOf(registry, manifest, request.name);
    case 'new':
      return newOf(registry, manifest, request);
  }
}

/**
 * `recorded`, the verticals a project records in its order, with
 * `incoming` placed among them where `twin` lists them: each before
 * the first recorded one the twin lists after it — one the twin does
 * not list takes the place of the next incoming one it does — and
 * after any other. Nothing recorded moves. Growth's order, for its run
 * and for its record (`./converge-run.ts`).
 */
export function placed(
  recorded: readonly string[],
  incoming: readonly string[],
  twin: readonly string[],
): readonly string[] {
  const rankFrom = (from: number): number | undefined => {
    for (const next of incoming.slice(from)) {
      const rank = twin.indexOf(next);
      if (rank !== -1) return rank;
    }
    return undefined;
  };
  const rows = [...recorded];
  incoming.forEach((id, index) => {
    const own = rankFrom(index);
    const at =
      own === undefined
        ? -1
        : rankedIndex(
            rows.map((row) => (twin.includes(row) ? twin.indexOf(row) : undefined)),
            own,
          );
    rows.splice(at === -1 ? rows.length : at, 0, id);
  });
  return rows;
}

/** The project `stored` records, with the tags and `projects` `growth` folds in. */
export function grownManifest(stored: ManifestV2, growth: GrowthPlan): ManifestV2 {
  return { ...stored, tags: growth.tags, projects: growth.projects };
}

/**
 * The verticals growth installs, admitted on `grown` — the harness it
 * re-renders planned as if it were not there yet, as `keel add
 * --refresh` plans one — closed over their prerequisites, or refused.
 */
export function admitGrowth(
  registry: Registry,
  grown: ManifestV2,
  growth: GrowthPlan,
): Result<AdmittedSet> {
  return admit(
    registry,
    projectScope(registry, grown, growth.rerender),
    lackingOf(registry, growth),
  );
}

/**
 * What a run growth plans installs: what the planner adds for what the
 * twin names, then that, in the twin's order.
 */
export function incomingOf(
  registry: Registry,
  growth: GrowthPlan,
  admitted: AdmittedSet,
): readonly Vertical[] {
  return [
    ...admitted.order.filter((v) => !growth.verticals.includes(v.id)),
    ...lackingOf(registry, growth),
  ];
}

/** The verticals growth installs, registered, in the twin's order. */
function lackingOf(registry: Registry, growth: GrowthPlan): readonly Vertical[] {
  return growth.verticals.flatMap((id) => registry.vertical(id) ?? []);
}

/** A composition's parts, before its preset and extras are read off them. */
interface Parts {
  /** The project's own tags, which place its preset and read its dials. */
  readonly own: readonly Tag[];
  readonly tags: readonly Tag[];
  readonly projects: readonly Tag[];
  /** The siblings the project links, which say whether it is a product's service. */
  readonly peers: readonly PeerLink[];
  readonly recorded: readonly string[];
  readonly contexts: readonly string[];
}

/**
 * The composition `parts` make on `stack` — kept as its preset where
 * the tags record a setting of its dials, and read as none where they
 * do not.
 */
function composed(registry: Registry, stack: Stack | null, parts: Parts): Composition {
  const harness = parts.recorded.includes(HARNESS);
  const acquirable = acquirableIn(registry);
  const identity = parts.own.filter((tag) => !acquirable.has(tag));
  const setting = stack === null ? null : settingOf(stack, identity, parts.own, harness);
  const preset = setting === null ? null : stack;
  const own = preset?.verticals.map(({ id }) => id) ?? [];
  const repository = (preset?.verticals ?? [])
    .filter((vertical) => vertical.placement?.scope === 'repository')
    .map(({ id }) => id);
  const member = repository.length > 0 && repository.every((id) => !parts.recorded.includes(id));
  const reading: Omit<Composition, 'order'> = {
    preset: preset?.id ?? null,
    dials:
      setting === null
        ? []
        : [
            ...(setting.build === null ? [] : [setting.build]),
            ...(setting.layout === null ? [] : [setting.layout]),
            ...(setting.peer ? [PEER_CONTEXT_TAG] : []),
          ],
    harness,
    member,
    given: preset === null ? [] : givenOf(registry, preset.id, parts, member),
    extras: parts.recorded.filter((id) => !own.includes(id) && id !== BOUNDED_CONTEXT),
    contexts: parts.contexts,
    tags: parts.tags,
    projects: parts.projects,
    recorded: parts.recorded,
  };
  return { ...reading, order: referenceOrder(registry, reading) };
}

/**
 * What a composite product installs in a service on the preset `preset`
 * of its own accord, where the project `parts` make is one
 * ({@link Composition.given}): the first registered product's service
 * on it whose other services the project links, each at the path
 * `keel new` of the product links it at, and whose own verticals it
 * records — less, in a monorepo service (`member`), what its product
 * root carries.
 */
function givenOf(
  registry: Registry,
  preset: string,
  parts: Parts,
  member: boolean,
): readonly string[] {
  const refs = new Set(parts.peers.map(({ ref }) => ref));
  for (const product of registry.stacks()) {
    const services = presetServicesOf(registry, product);
    for (const service of services) {
      if (service.stack.id !== preset) continue;
      const linked = services.every(
        (other) =>
          other.path === service.path || refs.has(path.posix.relative(service.path, other.path)),
      );
      const given = givenIn(service, member);
      if (linked && given.every((id) => parts.recorded.includes(id))) return given;
    }
  }
  return [];
}

/** What `service` is given of its own accord, by id — less what a monorepo product's root carries. */
function givenIn(service: PresetService, member: boolean): readonly string[] {
  return ownOf({ ...service.stack, verticals: [] }, service.extraVerticals, member).map(
    ({ id }) => id,
  );
}

/** A service of a registered product, with the product: where `keel new` of it plans the service's extras. */
interface ProductService {
  readonly product: Stack;
  readonly service: PresetService;
}

/**
 * The first registered product's service on the preset `preset` that
 * is given `given` of its own accord, in a monorepo or not as `member`
 * says — which says where a monorepo service's product root is, for
 * the scope its extras are planned on — or null.
 */
function serviceGiving(
  registry: Registry,
  preset: string,
  given: readonly string[],
  member: boolean,
): ProductService | null {
  for (const product of registry.stacks()) {
    for (const service of presetServicesOf(registry, product)) {
      if (service.stack.id !== preset) continue;
      if (givenIn(service, member).join(' ') === given.join(' ')) return { product, service };
    }
  }
  return null;
}

/**
 * What `keel new` installs of `preset` before any extra is named: its
 * verticals, then `given` — what a product gives the service of its
 * own accord — less, in a monorepo service, what its product root
 * carries (`./scope.ts` `presetServiceVerticals`).
 */
function ownOf(preset: Stack, given: readonly Vertical[], member: boolean): readonly Vertical[] {
  return presetServiceVerticals({ path: '', stack: preset, extraVerticals: given }, member);
}

/**
 * The scope `keel new` plans `preset`'s extras on, over `tags`: a
 * product's service's where it is one (`./scope.ts`
 * `presetServiceScope` — what the product gives it, and in a monorepo
 * what the product root gives it, there already); the preset's own
 * otherwise, marked as a monorepo service's where `member`.
 */
function extrasScope(
  registry: Registry,
  preset: Stack,
  tags: readonly Tag[],
  member: boolean,
  service: ProductService | null,
): PlanScope {
  if (service !== null) {
    return presetServiceScope(
      registry,
      service.product,
      { ...service.service, stack: preset },
      tags,
      member,
    );
  }
  const scope = presetScope(preset, tags);
  return member ? { ...scope, member: { provided: [] } } : scope;
}

/**
 * `extras` in the order `admit` installs them on `scope` — then any no
 * registered vertical is any more, as recorded — or as recorded where
 * it refuses them together.
 */
function extrasInOrder(
  registry: Registry,
  scope: PlanScope,
  extras: readonly string[],
): readonly string[] {
  const verticals = extras.flatMap((id) => registry.vertical(id) ?? []);
  if (verticals.length === 0) return extras;
  const admitted = admit(registry, scope, verticals);
  if (!admitted.ok) return extras;
  const ordered = admitted.value.order.map(({ id }) => id).filter((id) => extras.includes(id));
  return [...ordered, ...extras.filter((id) => !ordered.includes(id))];
}

/** The contexts `keel add module` added to the project `manifest` records, by name. */
function addedContexts(manifest: ManifestV2): readonly string[] {
  return contextsOf(manifest)
    .filter(({ marker }) => marker === CONTEXT_TAG)
    .map(({ name }) => name);
}

/**
 * The composition of the project `manifest` records, recording
 * `recorded` and holding the added `contexts` — the manifest's own, or
 * a target's with what its run records anew.
 */
function recording(
  registry: Registry,
  manifest: ManifestV2,
  recorded: readonly string[],
  contexts: readonly string[],
): Composition {
  const placed = projectProfile(registry, manifest.tags, manifest.services).preset;
  return composed(registry, placed === null ? null : registry.stack(placed), {
    own: manifest.tags,
    tags: effectiveTags(manifest),
    projects: manifest.projects,
    peers: manifest.peers,
    recorded,
    contexts,
  });
}

/** The registered vertical `id` names; a front door refuses any other first. */
function registered(registry: Registry, id: string): Vertical {
  const vertical = registry.vertical(id);
  if (vertical === null) throw new Error(`convergeOf: no vertical '${id}' is registered`);
  return vertical;
}

function refusedByPlan(error: DomainError): ConvergePlan {
  return { kind: 'refused', refusal: { kind: 'plan', error } };
}

/**
 * `keel add`: the verticals named and those `--refresh` re-renders,
 * admitted together on the caller's scope, in the order they install —
 * each installed, or re-rendered where it is refreshed — appended.
 */
function addOf(
  registry: Registry,
  manifest: ManifestV2,
  request: Extract<ConvergeRequest, { kind: 'add' }>,
): ConvergePlan {
  const refresh = request.refresh ?? [];
  const admitted = admit(
    registry,
    request.scope,
    [...request.verticals, ...refresh].map((id) => registered(registry, id)),
    request.siblings ?? [],
  );
  if (!admitted.ok) return refusedByPlan(admitted.error);
  const run = admitted.value.order.map(
    (vertical): ConvergeStep => ({
      vertical,
      posture: refresh.includes(vertical.id) ? 'rerender' : 'install',
    }),
  );
  const incoming = run.filter((step) => step.posture === 'install').map((step) => step.vertical.id);
  return {
    kind: 'converges',
    target: recording(
      registry,
      manifest,
      [...manifest.verticals.map(({ id }) => id), ...incoming],
      addedContexts(manifest),
    ),
    run,
    modules: [],
    placement: APPENDED,
  };
}

/** `keel add --reapply`: the named verticals re-rendered, in the order the project records them. */
function reapplyOf(
  registry: Registry,
  manifest: ManifestV2,
  named: readonly string[],
): ConvergePlan {
  const run = manifest.verticals
    .filter(({ id }) => named.includes(id))
    .map(({ id }): ConvergeStep => ({ vertical: registered(registry, id), posture: 'rerender' }));
  return {
    kind: 'converges',
    target: compositionOf(registry, manifest),
    run,
    modules: [],
    placement: APPENDED,
  };
}

/**
 * `keel add entrypoint`: growth's reading (`growthOf`), run in its
 * twin's order — each installed vertical the grown tags newly match
 * installing those adapters alone, the harness re-rendered, what the
 * project lacks installed, closed over its prerequisites, and every
 * other vertical of the twin not placed at a repository root settling
 * — then each context `keel add module` added wired in, recorded where
 * the twin records it. Growth's refusals, and the planner's of what it
 * installs.
 */
function entrypointOf(registry: Registry, manifest: ManifestV2, word: string): ConvergePlan {
  const growth = growthOf(registry, manifest, word);
  if (growth.kind === 'refused') {
    return { kind: 'refused', refusal: { kind: 'growth', refusal: growth.refusal } };
  }
  const composition = compositionOf(registry, manifest);
  if (growth.kind === 'present') {
    return { kind: 'converges', target: composition, run: [], modules: [], placement: APPENDED };
  }
  const grown = grownManifest(manifest, growth);
  const admitted = admitGrowth(registry, grown, growth);
  if (!admitted.ok) return refusedByPlan(admitted.error);
  const stack = registry.stack(growth.twin);
  if (stack === null) throw new Error(`growth named '${growth.twin}', which is not registered`);
  const twin = (composition.harness ? stack : withoutHarness(stack)).verticals.map(({ id }) => id);
  const incoming = incomingOf(registry, growth, admitted.value);
  const newly = new Map(growth.adapters.map((each) => [each.vertical, each.adapters]));
  const order = placed(
    composition.recorded,
    incoming.map(({ id }) => id),
    twin,
  );
  const run = order.flatMap((id): ConvergeStep[] => {
    const vertical = incoming.find((v) => v.id === id) ?? installedVertical(registry, id) ?? null;
    if (vertical === null) return [];
    const settles = twin.includes(id) && vertical.placement?.scope !== 'repository';
    if (growth.rerender.includes(id)) return [{ vertical, posture: 'rerender' }];
    if (incoming.includes(vertical)) return [{ vertical, posture: 'install' }];
    const only = newly.get(id);
    if (only !== undefined) {
      return [{ vertical, posture: 'only', adapters: only, ...(settles ? { settles: true } : {}) }];
    }
    return settles ? [{ vertical, posture: 'settle' }] : [];
  });
  return {
    kind: 'converges',
    target: composed(registry, stack, {
      own: grown.tags,
      tags: effectiveTags(grown),
      projects: grown.projects,
      peers: grown.peers,
      recorded: order,
      contexts: composition.contexts,
    }),
    run,
    modules: growth.modules,
    placement: AT_TWIN,
  };
}

/**
 * `keel add module`: one context, wired by keel's own `bounded-context`
 * — every adapter of it the project's tags match with the context's
 * marker, since none has run — its row recorded after every other the
 * first time.
 */
function moduleOf(registry: Registry, manifest: ManifestV2, name: string): ConvergePlan {
  const adapters = matchingIds(
    boundedContextVertical,
    new Set([...effectiveTags(manifest), CONTEXT_TAG]),
  );
  const had = manifest.verticals.map(({ id }) => id);
  const recorded = had.includes(BOUNDED_CONTEXT) ? had : [...had, BOUNDED_CONTEXT];
  return {
    kind: 'converges',
    target: recording(registry, manifest, recorded, [...addedContexts(manifest), name]),
    run: [],
    modules: [{ name, adapters }],
    placement: APPENDED,
  };
}

/**
 * `keel new`, from the seed manifest `seed`: the preset's verticals in
 * the preset's order — less the harness where the dial leaves it out —
 * then what a product gives its service of its own accord, in the
 * product's order, less what a monorepo service's product root
 * carries; then the extras not among them, admitted on the scope
 * `keel new` plans them on, in the order they install; each installed.
 */
function newOf(
  registry: Registry,
  seed: ManifestV2,
  request: Extract<ConvergeRequest, { kind: 'new' }>,
): ConvergePlan {
  const stack = registry.stack(request.stack);
  if (stack === null) throw new Error(`convergeOf: no preset '${request.stack}' is registered`);
  const dialed = request.harness ? stack : withoutHarness(stack);
  const service =
    request.service === undefined ? null : serviceAt(registry, request.service, stack.id);
  const own = ownOf(dialed, service?.service.extraVerticals ?? [], request.member);
  const scope = extrasScope(registry, dialed, effectiveTags(seed), request.member, service);
  let extras: readonly Vertical[] = [];
  const asked = request.extras.filter((id) => !scope.installed.includes(id));
  if (asked.length > 0) {
    const admitted = admit(
      registry,
      scope,
      asked.map((id) => registered(registry, id)),
    );
    if (!admitted.ok) return refusedByPlan(admitted.error);
    extras = admitted.value.order;
  }
  const run = [...own, ...extras].map(
    (vertical): ConvergeStep => ({ vertical, posture: 'install' }),
  );
  return {
    kind: 'converges',
    target: composed(registry, stack, {
      own: seed.tags,
      tags: effectiveTags(seed),
      projects: seed.projects,
      peers: seed.peers,
      recorded: run.map((step) => step.vertical.id),
      contexts: addedContexts(seed),
    }),
    run,
    modules: [],
    placement: APPENDED,
  };
}

/**
 * The service on the preset `preset` a `new` request names, with its
 * product; a front door scaffolds no other.
 */
function serviceAt(
  registry: Registry,
  place: { readonly product: string; readonly path: string },
  preset: string,
): ProductService {
  const product = registry.stack(place.product);
  const service =
    product === null
      ? undefined
      : presetServicesOf(registry, product).find(({ path: at }) => at === place.path);
  if (product === null || service?.stack.id !== preset) {
    throw new Error(
      `convergeOf: no product '${place.product}' has a '${preset}' service at '${place.path}'`,
    );
  }
  return { product, service };
}
