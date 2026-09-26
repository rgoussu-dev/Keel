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
 * read this one function (roadmap R.2b); `keel.project-status` and the
 * refusal builder are to (R.2c) — as every surface reads readiness
 * through `./planner.ts`.
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
 * **The refusal is structural.** A bounded context other than the
 * skeleton — the peer context, and each context `keel add module`
 * added — wires itself into the assemblies it finds, reading the
 * entrypoint tags inside `contribute()`. Growth installs only what
 * newly matches, and such an adapter matched before, so the new
 * assembly would come out half-wired. It is refused while no adapter
 * requiring the context's marker also requires the new entrypoint's
 * tag, read off the adapter set the way `emitsFor` reads it: a family
 * that splits its context adapter into one wiring adapter per
 * entrypoint lifts the refusal for itself, with no edit here.
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
import { acquirableIn, matchingIds } from './planner.js';
import type { UncoverableEntrypointReason } from './refusals.js';
import { assemblableStacks, installedVertical } from './registry.js';
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
   * one: the other entrypoint's bootstrap; an extra's may newly match
   * too, as the native CLI's release does on a native Quarkus image.
   */
  readonly adapters: readonly GrowthAdapters[];
  /**
   * The twin's verticals the project does not have, in the twin's
   * order — the twin without the agent harness where the project was
   * scaffolded without it, since the harness is a dial.
   */
  readonly verticals: readonly string[];
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

  const installed = manifest.verticals.flatMap(({ id }) => installedVertical(registry, id) ?? []);
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

  const contexts = unwired(registry, installed, manifest, entry.tag, [...after]);
  if (contexts.length > 0) {
    return refused({ code: 'keel.contexts-need-rewiring', entrypoint: entry.id, contexts });
  }
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
    rerender: rerendersOf(manifest),
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
 * The bounded contexts no adapter would wire into the new entrypoint's
 * assembly: each context the project records after the skeleton — the
 * peer by its persisted marker, every other by the one `keel add
 * module` selects its adapters with — whose marker no adapter of the
 * installed verticals or of `bounded-context` requires together with
 * `tag`, on the grown tags and what a linked sibling projects.
 */
function unwired(
  registry: Registry,
  installed: readonly Vertical[],
  manifest: ManifestV2,
  tag: Tag,
  grown: readonly Tag[],
): readonly GrowthContext[] {
  const wiring = [...installed, registry.vertical('bounded-context') ?? boundedContextVertical].map(
    (vertical) => ({
      ...vertical,
      adapters: vertical.adapters.filter((adapter) =>
        (adapter.predicate.requires ?? []).includes(tag),
      ),
    }),
  );
  return contextsOf(manifest).filter(({ marker }) => !emitsFor(wiring, marker, grown));
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
