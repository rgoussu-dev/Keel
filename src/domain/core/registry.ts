/**
 * Building a {@link Registry}, and the checks a piece has to survive
 * to get into one.
 *
 * The {@link Registry} port says *what* a run may compose from.
 * This module is the one place a registry is assembled from
 * sources — the pieces keel ships, plus whatever a plugin brought —
 * and the one place a piece is refused.
 *
 * **Every refusal names its source.** A {@link RegistrySource}
 * carries an `origin` (`'keel'`, or `plugin 'acme-stacks'`) and
 * every error here quotes it, because the reader's first question
 * about a broken piece is whose it is. An engine-shaped message
 * ("conflict 'x': 'when' must name at least one tag") sends someone
 * to read keel's source for a rule keel did not write.
 *
 * **The checks are the ones that can be made without tags.** A
 * malformed {@link Conflict} and a dimension no adapter of its own
 * vertical ever covers are both statically wrong — no assembly
 * makes them right — so they fail at registration, before a user has
 * answered a single question. Everything that depends on the tag set
 * in hand (does *this* assembly cover *that* dimension, does it
 * violate a rule) stays where it was, in the resolver and in
 * `compatibility.ts`: those answers are properties of a run, not of
 * a piece.
 */

import { DomainError } from '../kernel/result.js';
import type { Conflict, Vertical } from '../contract/composition.js';
import type { Registry } from '../contract/ports/registry.js';
import type { Stack } from '../contract/stack.js';
import { validateConflict } from './compatibility.js';
import { isAssemblable, STACKS } from './stacks.js';
import { SHIPPED_VERTICALS } from './verticals/index.js';

/** The origin string every shipped piece registers under. */
export const KEEL_ORIGIN = 'keel';

/**
 * The origin string a plugin's pieces register under — quoted by
 * every refusal, which is what "fail naming the plugin, not the
 * engine" comes down to in practice.
 */
export function pluginOrigin(name: string): string {
  return `plugin '${name}'`;
}

/** Error code every registration refusal carries. */
export const REGISTRY_ERROR_CODE = 'keel.invalid-piece';

/**
 * One contributor of pieces: keel itself, or a plugin.
 *
 * `origin` is the whole reason this is a record rather than two
 * flat arrays — it is what a refusal quotes, and what distinguishes
 * "keel already registers stack 'quarkus-cli'" from "plugin
 * 'acme' registers stack 'quarkus-cli' twice".
 */
export interface RegistrySource {
  /** Human-readable owner, quoted verbatim in every refusal. */
  readonly origin: string;
  readonly stacks?: readonly Stack[];
  readonly verticals?: readonly Vertical[];
}

/** The pieces keel itself ships. */
export const shippedSource: RegistrySource = {
  origin: KEEL_ORIGIN,
  stacks: Object.values(STACKS),
  verticals: SHIPPED_VERTICALS,
};

/**
 * Builds a registry over `sources`, in order, refusing any piece
 * that cannot be composed from — and naming its origin when it does.
 *
 * Sources are read in order and the order is preserved in
 * {@link Registry.stacks} and {@link Registry.verticals}, so putting
 * {@link shippedSource} first is what keeps a menu's shipped entries
 * where a user last saw them when a plugin arrives.
 *
 * @throws DomainError naming the offending source and piece.
 */
export function registryOf(sources: readonly RegistrySource[]): Registry {
  const stacks = new Map<string, Stack>();
  const verticals = new Map<string, Vertical>();
  const stackOrigins = new Map<string, string>();
  const verticalOrigins = new Map<string, string>();

  for (const source of sources) {
    for (const stack of source.stacks ?? []) {
      validateStack(source.origin, stack);
      claim(stackOrigins, stack.id, source.origin, 'stack');
      stacks.set(stack.id, stack);
    }
    for (const vertical of source.verticals ?? []) {
      validateVertical(source.origin, vertical);
      claim(verticalOrigins, vertical.id, source.origin, 'vertical');
      verticals.set(vertical.id, vertical);
    }
  }

  const stackList = [...stacks.values()];
  const verticalList = [...verticals.values()];
  return {
    stacks: () => stackList,
    verticals: () => verticalList,
    stack: (id) => stacks.get(id) ?? null,
    vertical: (id) => verticals.get(id) ?? null,
  };
}

/** The registry over keel's own pieces and nothing else. */
export const shippedRegistry: Registry = registryOf([shippedSource]);

/**
 * Refuses a second claim on an id, naming both claimants.
 *
 * Last-one-wins would be the other option, and it is the wrong one:
 * a plugin that silently replaced `quarkus-cli` would make every
 * report about that id — the manifest's, the catalog's, a bug
 * report's — mean something other than what it says. Shadowing a
 * shipped piece is a thing to ask for explicitly, if ever; it is
 * never a thing to get by accident.
 */
function claim(
  origins: Map<string, string>,
  id: string,
  origin: string,
  kind: 'stack' | 'vertical',
): void {
  const held = origins.get(id);
  if (held !== undefined) {
    throw refuse(
      origin,
      held === origin
        ? `registers ${kind} '${id}' twice`
        : `registers ${kind} '${id}', which is already registered by ${held}`,
    );
  }
  origins.set(id, origin);
}

function validateStack(origin: string, stack: Stack): void {
  if (stack.id.length === 0) throw refuse(origin, 'registers a stack with no id');
  validateConflicts(origin, `stack '${stack.id}'`, stack);
  for (const vertical of stack.verticals) validateVertical(origin, vertical);
}

/**
 * A vertical is well-formed when every dimension it declares is
 * covered by at least one of its own adapters.
 *
 * The static half of the resolver's check. `coversFor` asks whether
 * a dimension is covered *for a tag set*, and answers "no" for an
 * uncovered dimension and for a perfectly good one whose adapters do
 * not match — the same answer for a broken piece and a legitimate
 * miss. Asking it without tags separates them: a dimension no
 * adapter of the vertical **ever** covers is a typo, and it fails
 * here, naming the plugin, rather than eight questions later as
 * "no adapter covers dimension 'boostrap'".
 */
function validateVertical(origin: string, vertical: Vertical): void {
  if (vertical.id.length === 0) throw refuse(origin, 'registers a vertical with no id');
  validateConflicts(origin, `vertical '${vertical.id}'`, vertical);
  const covered = new Set(vertical.adapters.flatMap((adapter) => adapter.covers));
  for (const dimension of vertical.dimensions) {
    if (!covered.has(dimension)) {
      throw refuse(
        origin,
        `vertical '${vertical.id}' declares dimension '${dimension}', which none of its adapters covers`,
      );
    }
  }
}

/**
 * Runs the rule validator every evaluation runs, at registration
 * time, so a malformed rule is refused before it can quietly forbid
 * every assembly.
 *
 * `validateConflict` already refuses these — its own doc says it
 * runs per evaluation precisely because a rule can arrive from a
 * plugin that never ran this repository's tests. That is still true
 * and it stays. What registration adds is *when* and *whose*: the
 * refusal arrives at load, quoting the plugin, instead of mid-run
 * quoting the engine.
 */
function validateConflicts(
  origin: string,
  subject: string,
  piece: { readonly conflicts?: readonly Conflict[] },
): void {
  for (const conflict of piece.conflicts ?? []) {
    try {
      validateConflict(conflict);
    } catch (error) {
      throw refuse(
        origin,
        `${subject} declares a malformed conflict: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

function refuse(origin: string, detail: string): DomainError {
  return new DomainError(`${origin} ${detail}`, REGISTRY_ERROR_CODE);
}

/** One stack's id + description, for `keel new --list`. */
export interface StackSummary {
  readonly id: string;
  readonly description: string;
}

/** One vertical's id, title and description, for `keel add --list`. */
export interface VerticalSummary {
  readonly id: string;
  /** Resolved, never absent. @see verticalTitle */
  readonly title: string;
  readonly description: string;
}

/**
 * The name a front end shows for a vertical: its declared
 * {@link Vertical.title}, or the id spelled out when it declares
 * none.
 *
 * Resolved here rather than in each front end for the reason every
 * other menu value is: two places deriving a label is two places to
 * disagree, and the fallback is exactly the kind of small rule that
 * drifts. A plugin declaring no title gets `acme-widget` → "Acme
 * widget", which is a worse title than one it could have written and
 * a better one than a raw id.
 */
export function verticalTitle(vertical: Vertical): string {
  if (vertical.title !== undefined && vertical.title !== '') return vertical.title;
  const spelled = vertical.id.replace(/[-_]+/g, ' ').trim();
  return spelled.charAt(0).toUpperCase() + spelled.slice(1);
}

/** Registered stack ids in deterministic order. */
export function listStackIds(registry: Registry): readonly string[] {
  return registry
    .stacks()
    .map((stack) => stack.id)
    .sort();
}

/** The stacks a menu may offer: every registered one that can be built. */
export function assemblableStacks(registry: Registry): readonly Stack[] {
  return [...registry.stacks()].sort(byId).filter(isAssemblable);
}

/**
 * Every stack a menu may offer, id-sorted.
 *
 * Filtered by {@link isAssemblable}: a preset no setting of its dials
 * can build is not an option, and listing it as one is a promise the
 * install would break. {@link listStackIds} stays unfiltered — an
 * "unknown stack 'x'; available: …" message is about which ids exist,
 * and hiding a real id there would send the reader looking for a typo
 * they did not make.
 */
export function listStacks(registry: Registry): readonly StackSummary[] {
  return assemblableStacks(registry).map((stack) => ({
    id: stack.id,
    description: stack.description,
  }));
}

/** Registered vertical ids in deterministic order. */
export function listVerticalIds(registry: Registry): readonly string[] {
  return registry
    .verticals()
    .map((vertical) => vertical.id)
    .sort();
}

/** Every registered vertical's id + description, in deterministic order. */
export function listVerticals(registry: Registry): readonly VerticalSummary[] {
  return [...registry.verticals()].sort(byId).map((vertical) => ({
    id: vertical.id,
    title: verticalTitle(vertical),
    description: vertical.description,
  }));
}

function byId(a: { readonly id: string }, b: { readonly id: string }): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
