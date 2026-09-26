/**
 * Growth: what adding an entrypoint to a project would do, or why it
 * cannot — read before anything runs, from the manifest and the
 * registry alone.
 *
 * `keel add entrypoint http` on a CLI project must leave exactly the
 * tree `keel new` leaves for the preset carrying both, on the same
 * dials: its **twin**. Growth adds files and never removes one — the
 * other entrypoint's bootstrap newly matches, and the twin's verticals
 * the project lacks install — so the whole answer is a reading of the
 * adapter set before and after one tag. The command and its preview
 * read this one function (roadmap R.2b), and so do `keel.project-status`
 * and `keel add`'s front door (`./add-readiness.ts` `addScopeOf`), which
 * hand the planner the scope {@link grownScope} gives the grown project:
 * the planner reads a vertical only the entrypoint stops again over it,
 * so its refusal carries the entrypoint as the action (R.2c) — as every
 * surface reads readiness through `./planner.ts`.
 *
 * **The twin** is found through the drill-down `./profile.ts` walks:
 * the tags less anything a vertical can add, plus the new entrypoint,
 * placed by `axesOf` and `pathFor` among the single-service presets
 * `keel new` makes the grown project of on its dials — carrying
 * nothing it does not, and offering its build system, module layout
 * and peer context, and its harness left out where it has none. A
 * project the drill-down cannot place — a plugin's preset off the
 * tree, one with no language or no entrypoint — has no twin, and is
 * refused.
 *
 * **Bounded contexts are wired in by what growing runs.** A bounded
 * context other than the skeleton — the peer context, and each context
 * `keel add module` added — is wired into each assembly by an adapter
 * of its own, and the new assembly needs its wiring too. The peer's
 * wiring adapter is the installed skeleton's, so it newly matches and
 * installs with the bootstrap. An added context's matches neither
 * before nor after — its marker is set only while `keel add module`
 * runs — so growing replays `bounded-context` for each, keel's own, as
 * that command runs it, installing what newly matches
 * ({@link GrowthModule}). A family whose context adapter reads the
 * entrypoint tags inside `contribute()` instead would leave the new
 * assembly half-wired, since that adapter matched before: growth is
 * refused while no adapter it runs requires the context's marker and
 * the new entrypoint's tag, read off the adapter set the way `emitsFor`
 * reads it. A family that splits its context adapter into a shell and
 * one wiring adapter per entrypoint lifts the refusal for itself, with
 * no edit here.
 * `tests/domain/core/growth-render.test.ts` holds that reading to what
 * the adapters render.
 *
 * Pure: a registry and a manifest in, data out. Nothing here is worded;
 * a refusal is a {@link GrowthRefusal}, carrying the code the command
 * is to refuse under.
 */

import type { Conflict, Tag, Vertical } from '../contract/composition.js';
import { effectiveTags, type ManifestV2 } from '../contract/manifest.js';
import type { Registry } from '../contract/ports/registry.js';
import type { Stack } from '../contract/stack.js';
import { CONTEXT_TAG } from './adapters/added-context.js';
import { emitsFor } from './adapters/context-support.js';
import { PEER_CONTEXT_TAG, PEER_MODULE } from './adapters/module-layout.js';
import { assemblyRefusal, conflictsOf, wouldViolate } from './compatibility.js';
import { harnessActivatedBy, peerContextOffered, piecesOf, withoutHarness } from './dials.js';
import { acquirableIn, matchingIds, plan, tagsAfter, type PlanScope } from './planner.js';
import type { UncoverableEntrypointReason } from './refusals.js';
import { assemblableStacks, installedVertical } from './registry.js';
import { projectScope } from './scope.js';
import { axesOf, entrypointNamed, pathFor, wizardPaths } from './stack-wizard.js';
import { stackTagsFor } from './stacks.js';
import { boundedContextVertical } from './verticals/bounded-context.js';

/** The vertical growth re-renders, and the one `--no-agent-harness` leaves out. */
const HARNESS = 'agent-harness';

/** Adapters of one installed vertical, by id, in declaration order. */
export interface GrowthAdapters {
  readonly vertical: string;
  readonly adapters: readonly string[];
}

/**
 * A bounded context growth would have to rewire: its name, and the
 * marker tag that selects its adapters — `modules.peer-context` for the
 * peer, `modules.context` for one `keel add module` added.
 */
export interface GrowthContext {
  readonly name: string;
  readonly marker: Tag;
}

/**
 * A context `keel add module` added, as growing wires it into the new
 * assembly: a run of keel's own `bounded-context` — the vertical that
 * command runs, whatever a registry lists — with the context's marker
 * and its inputs, as that command ran it, installing only the adapters
 * of it the grown tags newly match — on a family that splits its
 * context adapter, the new entrypoint's wiring adapter.
 */
export interface GrowthModule {
  /** The context's name, as the manifest records it. */
  readonly name: string;
  /** The adapters that install, by id, in declaration order. */
  readonly adapters: readonly string[];
}

/**
 * Why an entrypoint cannot be added, as data, under the code the
 * command is to refuse with:
 *
 * - `keel.unknown-entrypoint` — the word names no entrypoint;
 * - `keel.uncoverable-entrypoint` — no preset is this project with it:
 *   the entrypoint, or the project, is driven from the front end
 *   (`front-end`), the drill-down cannot place the project, or places
 *   the grown project on no single-service preset `keel new` makes it
 *   of on its dials (`no-twin`), or an adapter it matches would stop
 *   matching (`drops`), and keel removes nothing;
 * - `keel.incompatible` — the entrypoint would break a rule a vertical
 *   the project has declares: `keel new` of the twin with that vertical
 *   is refused alike, and so is `keel add` of it on the grown project;
 * - `keel.contexts-need-rewiring` — bounded contexts already wired
 *   into the existing assemblies would need rewiring into the new one.
 */
export type GrowthRefusal =
  | { readonly code: 'keel.unknown-entrypoint'; readonly word: string }
  | {
      readonly code: 'keel.uncoverable-entrypoint';
      readonly entrypoint: string;
      readonly reason: UncoverableEntrypointReason;
      /** Where `reason` is `drops`: the adapters that would stop matching. */
      readonly drops?: readonly GrowthAdapters[];
    }
  | {
      readonly code: 'keel.incompatible';
      readonly entrypoint: string;
      /** The rules the entrypoint would newly break, in declaration order. */
      readonly rules: readonly Conflict[];
    }
  | {
      readonly code: 'keel.contexts-need-rewiring';
      readonly entrypoint: string;
      /** In the order the manifest records them. */
      readonly contexts: readonly GrowthContext[];
    };

/** What adding an entrypoint to a project does. */
export interface GrowthPlan {
  readonly kind: 'grows';
  /** The entrypoint added, by its `ENTRYPOINTS` id. */
  readonly entrypoint: string;
  /** The preset the grown project is: `keel new` of it on these dials writes the same tree. */
  readonly twin: string;
  /** The project's tags with the entrypoint's folded in, sorted as an install folds tags. */
  readonly tags: readonly Tag[];
  /** What the grown project projects onto a linked sibling: the twin's. */
  readonly projects: readonly Tag[];
  /**
   * The adapters the grown tags newly match, per installed vertical,
   * in the order the manifest records them — on every shipped preset
   * the other entrypoint's bootstrap, and beside it, on a modulith
   * whose peer context is wired per entrypoint (Go's, Rust's), the
   * peer's wiring adapter; an extra's may newly match too, as the
   * native CLI's release does on a native Quarkus image.
   */
  readonly adapters: readonly GrowthAdapters[];
  /**
   * The twin's verticals the project does not have, in the twin's
   * order — the twin without the agent harness where the project was
   * scaffolded without it, since the harness is a dial.
   */
  readonly verticals: readonly string[];
  /**
   * The contexts `keel add module` added, in the order the manifest
   * records them — a context's wiring calls the wiring of the one it
   * consumes — each wired into the new assembly after every vertical
   * the twin lists, where the twin's own history adds them.
   */
  readonly modules: readonly GrowthModule[];
  /**
   * Installed verticals re-rendered whole: the agent harness, wherever
   * it is installed ({@link rerendersOf}).
   */
  readonly rerender: readonly string[];
}

/**
 * The reading: a {@link GrowthPlan}; `present` where the project has
 * the entrypoint already, which adds nothing; or `refused`.
 */
export type Growth =
  | GrowthPlan
  | { readonly kind: 'present'; readonly entrypoint: string }
  | { readonly kind: 'refused'; readonly refusal: GrowthRefusal };

/**
 * What `keel add entrypoint <word>` would do to the project `manifest`
 * records, or why it cannot.
 *
 * @param registry what the project composes from — the stacks the twin
 *   is found among, and its installed verticals
 * @param manifest the project as keel recorded it: its tags, verticals,
 *   modules and peers are what growth reads
 * @param word the entrypoint as a user names it: its word (`http`) or
 *   its id (`server-http`)
 */
export function growthOf(registry: Registry, manifest: ManifestV2, word: string): Growth {
  const entry = entrypointNamed(word);
  if (entry === null) return refused({ code: 'keel.unknown-entrypoint', word });
  if (manifest.tags.includes(entry.tag)) return { kind: 'present', entrypoint: entry.id };
  const uncoverable = (reason: UncoverableEntrypointReason, drops?: readonly GrowthAdapters[]) =>
    refused({
      code: 'keel.uncoverable-entrypoint',
      entrypoint: entry.id,
      reason,
      ...(drops === undefined ? {} : { drops }),
    });

  const acquirable = acquirableIn(registry);
  const identity = (tags: readonly Tag[]) => tags.filter((tag) => !acquirable.has(tag));
  const shape = axesOf(identity(manifest.tags))?.shape;
  if (entry.side !== 'back' || (shape !== undefined && shape !== 'backend')) {
    return uncoverable('front-end');
  }
  if (shape === undefined) return uncoverable('no-twin');
  const tags = [...new Set([...manifest.tags, entry.tag])].sort();
  const has = new Set(manifest.verticals.map(({ id }) => id));
  const twin = twinOf(registry, identity(tags), tags, has.has(HARNESS));
  if (twin === null) return uncoverable('no-twin');

  // `keel add module` records the context vertical and runs keel's
  // own, so one a registry lists is none of what growing reads or runs.
  const installed = manifest.verticals
    .filter(({ id }) => id !== boundedContextVertical.id)
    .flatMap(({ id }) => installedVertical(registry, id) ?? []);
  const before = new Set(effectiveTags(manifest));
  const after = new Set(effectiveTags({ ...manifest, tags }));
  const newly: GrowthAdapters[] = [];
  const drops: GrowthAdapters[] = [];
  for (const vertical of installed) {
    const then = matchingIds(vertical, before);
    const now = matchingIds(vertical, after);
    const gained = now.filter((id) => !then.includes(id));
    const lost = then.filter((id) => !now.includes(id));
    if (gained.length > 0) newly.push({ vertical: vertical.id, adapters: gained });
    if (lost.length > 0) drops.push({ vertical: vertical.id, adapters: lost });
  }
  if (drops.length > 0) return uncoverable('drops', drops);
  const rules = wouldViolate(conflictsOf(installed), before, [entry.tag]);
  if (rules.length > 0) return refused({ code: 'keel.incompatible', entrypoint: entry.id, rules });

  const contexts = unwired(installed, manifest, entry.tag, [...after]);
  if (contexts.length > 0) {
    return refused({ code: 'keel.contexts-need-rewiring', entrypoint: entry.id, contexts });
  }
  // What a context's own add ran, on the tags before and after: the
  // same for every context, since only the marker selects them.
  const wired = matchingIds(boundedContextVertical, new Set([...before, CONTEXT_TAG]));
  const wiring = matchingIds(boundedContextVertical, new Set([...after, CONTEXT_TAG])).filter(
    (id) => !wired.includes(id),
  );
  const modules = contextsOf(manifest)
    .filter(({ marker }) => marker === CONTEXT_TAG)
    .map(({ name }) => ({ name, adapters: wiring }));
  // The agent harness is a dial: a project scaffolded without it is
  // the twin scaffolded without it.
  const dialed = has.has(HARNESS) ? twin : withoutHarness(twin);
  return {
    kind: 'grows',
    entrypoint: entry.id,
    twin: twin.id,
    tags,
    projects: [...(twin.projects ?? [])],
    adapters: newly,
    verticals: dialed.verticals.map(({ id }) => id).filter((id) => !has.has(id)),
    modules,
    rerender: rerendersOf(manifest),
  };
}

/**
 * The scope the project `manifest` records plans on once `growth` has
 * run: its tags grown, with what the run promotes — the adapters that
 * newly match, then the verticals it installs, folded as the planner
 * folds a plan — and the twin's `projects`, and the verticals growth
 * installs, with what the planner closes them over, among what it has;
 * or null where the planner refuses what growth installs, as the
 * command then does. What a vertical only the entrypoint stops is read
 * again over, to say whether adding the entrypoint lets it install
 * (`./planner.ts` `GrownScope`).
 */
export function grownScope(
  registry: Registry,
  manifest: ManifestV2,
  growth: GrowthPlan,
): PlanScope | null {
  const grown: ManifestV2 = { ...manifest, tags: growth.tags, projects: growth.projects };
  // Planned as the command admits it: the set by id, the re-rendered
  // harness as if it were not there yet.
  const planned = plan(
    registry,
    projectScope(registry, grown, growth.rerender),
    [...growth.verticals].sort(),
  );
  if (planned.kind !== 'planned') return null;
  const own = projectScope(registry, grown);
  const incoming = planned.order.flatMap(({ id }) => registry.vertical(id) ?? []);
  const newly = growth.adapters.flatMap(({ vertical: id, adapters }) => {
    const vertical = installedVertical(registry, id);
    if (vertical === null) return [];
    return [{ ...vertical, adapters: vertical.adapters.filter((a) => adapters.includes(a.id)) }];
  });
  const installed = [
    ...own.installed,
    ...incoming.map(({ id }) => id).filter((id) => !own.installed.includes(id)),
  ];
  return {
    ...own,
    tags: [...tagsAfter([...newly, ...incoming], own.tags)].sort(),
    installed,
    rules: conflictsOf(installed.flatMap((id) => installedVertical(registry, id) ?? [])),
  };
}

/**
 * The installed verticals growth re-renders whole: the agent harness,
 * wherever it is installed. A family kit matches on the family alone
 * and reads the entrypoints inside `contribute()` — the runbook, the
 * `run` skill, the layer docs — so no adapter newly matches, and only
 * re-rendering it keeps the harness true to the grown project.
 */
export function rerendersOf(manifest: ManifestV2): readonly string[] {
  return manifest.verticals.some(({ id }) => id === HARNESS) ? [HARNESS] : [];
}

function refused(refusal: GrowthRefusal): Growth {
  return { kind: 'refused', refusal };
}

/**
 * The single-service preset the drill-down places `identity` on — the
 * grown project's tags less what a vertical can add — among those
 * {@link scaffoldsAs} the grown project; null where there is none.
 * The rest are left out before placing, so none sitting at that node
 * hides the twin: a product with a single back-side engine sits at
 * that engine's node, and a preset with a tag of its own there may
 * sort first.
 */
function twinOf(
  registry: Registry,
  identity: readonly Tag[],
  tags: readonly Tag[],
  harness: boolean,
): Stack | null {
  const axes = axesOf(identity);
  if (axes === null) return null;
  const candidates = assemblableStacks(registry).filter(
    (stack) => stack.services === undefined && scaffoldsAs(stack, identity, tags, harness),
  );
  const placed = pathFor(
    wizardPaths(candidates),
    axes.shape,
    axes.language,
    axes.framework ?? '',
    axes.entrypoints,
  );
  return placed === null ? null : registry.stack(placed.stackId);
}

/**
 * Whether `keel new` of `stack` records the grown project: on a
 * setting of its build system and module layout its rules admit, the
 * tags it seeds are all among `tags`, and each tag of `identity` is
 * one of them — the peer context's marker too, where the project has
 * it and that setting offers it. The harness is a dial as well: where
 * the project has none (`harness` false), `stack` must be one that
 * `keel new --no-agent-harness` takes.
 */
function scaffoldsAs(
  stack: Stack,
  identity: readonly Tag[],
  tags: readonly Tag[],
  harness: boolean,
): boolean {
  const dialed = harness ? stack : withoutHarness(stack);
  if (!harness && harnessActivatedBy(dialed)) return false;
  const peer = identity.includes(PEER_CONTEXT_TAG);
  const builds = stack.buildSystems?.map((option) => option.tag) ?? [null];
  const layouts = stack.moduleLayouts?.map((option) => option.tag) ?? [null];
  return builds.some((build) =>
    layouts.some((layout) => {
      const seeded = [...stackTagsFor(stack, build, layout), ...(peer ? [PEER_CONTEXT_TAG] : [])];
      return (
        seeded.every((tag) => tags.includes(tag)) &&
        identity.every((tag) => seeded.includes(tag)) &&
        assemblyRefusal(piecesOf(dialed), seeded) === null &&
        (!peer || peerContextOffered(dialed, build, layout))
      );
    }),
  );
}

/**
 * The bounded contexts no adapter growing runs would wire into the new
 * entrypoint's assembly: each context the project records after the
 * skeleton whose marker no such adapter requires together with `tag`,
 * on the grown tags and what a linked sibling projects. The peer, by
 * its persisted marker, is wired by what newly matches in the installed
 * verticals; every other context, by the one `keel add module` selects
 * its adapters with, by the replay of keel's `bounded-context`, the
 * vertical that command runs.
 */
function unwired(
  installed: readonly Vertical[],
  manifest: ManifestV2,
  tag: Tag,
  grown: readonly Tag[],
): readonly GrowthContext[] {
  const narrowed = (vertical: Vertical): Vertical => ({
    ...vertical,
    adapters: vertical.adapters.filter((adapter) =>
      (adapter.predicate.requires ?? []).includes(tag),
    ),
  });
  const peers = installed.map(narrowed);
  const added = [narrowed(boundedContextVertical)];
  return contextsOf(manifest).filter(
    ({ marker }) => !emitsFor(marker === PEER_CONTEXT_TAG ? peers : added, marker, grown),
  );
}

/**
 * The contexts a project records after its skeleton, each with the
 * marker that selects its adapters: the peer — the context recorded
 * without a seam of its own, or by name where the marker is on and no
 * record says so — by `modules.peer-context`, every other by
 * `modules.context`.
 */
function contextsOf(manifest: ManifestV2): readonly GrowthContext[] {
  const peer = manifest.tags.includes(PEER_CONTEXT_TAG);
  const contexts = manifest.modules.slice(1).map((module) => ({
    name: module.name,
    marker: peer && !module.seam ? PEER_CONTEXT_TAG : CONTEXT_TAG,
  }));
  if (!peer || contexts.some(({ marker }) => marker === PEER_CONTEXT_TAG)) return contexts;
  return [{ name: PEER_MODULE, marker: PEER_CONTEXT_TAG }, ...contexts];
}
