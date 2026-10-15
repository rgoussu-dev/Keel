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
 * **The checks are the ones that need no run's tag set.** A malformed
 * {@link Conflict}, a dimension no adapter of its own vertical ever
 * covers, an adapter promoting what its vertical does not declare, and
 * a cycle of `reads` are all statically wrong — no assembly makes them
 * right — so they fail at registration, before a user has answered a
 * single question. The last is a check across pieces, so it runs once
 * every source is in, as does the one check that reads where the
 * drill-down places a stack: a plugin stack whose id and another's read
 * as one another by their facets, which would make a typed `--stack`
 * read two ways. Everything that depends on the tag set in hand (does
 * *this* assembly cover *that* dimension, does it violate a rule) stays
 * where it was, in the resolver and in `compatibility.ts`: those
 * answers are properties of a run, not of a piece.
 */

import { DomainError } from '../kernel/result.js';
import { ENGINE_CONTRIBUTOR_ID, type Conflict, type Vertical } from '../contract/composition.js';
import type { Registry } from '../contract/ports/registry.js';
import type { Stack } from '../contract/stack.js';
import { validateConflict } from './compatibility.js';
import { validatePattern } from './predicate.js';
import { stackReader } from './stack-spelling.js';
import { isAssemblable, STACKS } from './stacks.js';
import { SHIPPED_SUPPORT_FACTS, type SupportSource } from './support-tier.js';
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
 * Ids no vertical may take: the first words `keel add` reads as
 * another command — `keel add module <name>` adds a bounded context,
 * `keel add entrypoint <cli|http>` an entrypoint — so a vertical of
 * either id could never be added with `keel add <id>`, though
 * `keel new --with` could still name it. Neither names a capability,
 * so a plugin renames rather than half-works.
 */
export const RESERVED_VERTICAL_IDS: readonly string[] = ['module', 'entrypoint'];

/**
 * What a stack id is spelled in: words of `a`–`z` and `0`–`9`, joined
 * by single `-`s. keel reads an id as its words — lowercased, broken at
 * every character but `a`–`z` and `0`–`9`, as the nearest id an
 * unknown `--stack` is answered with is read — so `Acme-Web`,
 * `acme_web` and `acme.web` would be three ids that read as
 * `acme-web`, and `AcmeWeb` one that reads as a single word. The
 * rule leaves each id one spelling; and `+ / @ # , :` or a space would
 * break the keys and hints keel builds from an id.
 */
const STACK_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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
  refuseSpellingClashes(stackList, stackOrigins);
  const verticalList = [...verticals.values()];
  validateReads(knownVerticals(sources, verticalList, verticalOrigins));
  return {
    stacks: () => stackList,
    verticals: () => verticalList,
    stack: (id) => stacks.get(id) ?? null,
    vertical: (id) => verticals.get(id) ?? null,
  };
}

/**
 * Refuses a plugin stack whose id and an earlier stack's read as one
 * another by their facets — `quarkus-cli-http` beside keel's
 * `quarkus-cli-rest`, or a bare `cli` that keel's `quarkus-cli` would
 * read as — naming it, the other and both origins.
 *
 * A typed `--stack` that is not an id is read by its facet words
 * (`./stack-spelling.ts`), and a registered id is taken first. So a
 * stack registered under a spelling of another would quietly take what
 * users type for that one, and a stack another's id reads as would make
 * that id's spellings name two; refused, a typed id reads one way. The
 * same rule as {@link claim}'s: never shadow by accident.
 *
 * Each pair is judged alone, in the words of keel's presets and of the
 * earlier stack only: a word another plugin's tags — or the stack's
 * own — make name two facets (a `framework.go`) cannot hide a clash, so
 * what registers does not hang on load order. Every stack is placed
 * over the whole registry, so a plugin composite is judged wherever its
 * services sit. keel's presets alone are not read: each id
 * reads as itself and no other, which `stack-spelling.test.ts` holds.
 */
function refuseSpellingClashes(
  stacks: readonly Stack[],
  origins: ReadonlyMap<string, string>,
): void {
  const keel = stacks.filter((stack) => origins.get(stack.id) === KEEL_ORIGIN);
  const said = (id: string): string => `'${id}', registered by ${origins.get(id) ?? ''}`;
  stacks.forEach((stack, at) => {
    if (origins.get(stack.id) === KEEL_ORIGIN) return;
    const plugins = stacks.slice(0, at).filter((other) => origins.get(other.id) !== KEEL_ORIGIN);
    for (const judges of [keel, ...plugins.map((other) => [...keel, other])]) {
      // Every stack is placed — a composite only once its services
      // are in — but read in the pair's words alone.
      const read = stackReader(stacks, judges);
      const judged = new Set(judges.map((other) => other.id));
      const as = read(stack.id).find((path) => judged.has(path.stackId));
      if (as !== undefined) {
        throw refuse(
          origins.get(stack.id) ?? '',
          `registers stack '${stack.id}', which reads by its facets as ${said(as.stackId)} — a typed --stack must read one way; rename it`,
        );
      }
      const reader = judges.find((other) =>
        read(other.id).some((path) => path.stackId === stack.id),
      );
      if (reader !== undefined) {
        throw refuse(
          origins.get(stack.id) ?? '',
          `registers stack '${stack.id}', which ${said(reader.id)} reads as by its facets — a typed --stack must read one way; rename it`,
        );
      }
    }
  });
}

/** The registry over keel's own pieces and nothing else. */
export const shippedRegistry: Registry = registryOf([shippedSource]);

/**
 * How far keel vouches for its own presets: the rows
 * `support-tier.json` records, over the stacks {@link shippedSource}
 * registers, and no plugin's. Built here, beside the registry, so the
 * tier's rules never read `STACKS`: the composition root hands this to
 * the handlers that show a tier as it hands them the registry
 * (roadmap T.2e), and their tests hand in their own.
 */
export const shippedSupport: SupportSource = {
  facts: SHIPPED_SUPPORT_FACTS,
  stacks: shippedSource.stacks ?? [],
};

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
  // A plugin written in plain JavaScript can hand any value here, or
  // none: `test` would read a number or a list as its string.
  const id: unknown = stack.id;
  if (typeof id !== 'string') {
    throw refuse(origin, `registers a stack whose id is not a string (${String(id)})`);
  }
  if (id.length === 0) throw refuse(origin, 'registers a stack with no id');
  if (!STACK_ID.test(id)) {
    throw refuse(
      origin,
      `registers stack '${stack.id}', whose id is not lowercase words joined by '-'`,
    );
  }
  const tags: unknown = stack.tags;
  if (!Array.isArray(tags) || !tags.every((tag) => typeof tag === 'string')) {
    throw refuse(origin, `registers stack '${stack.id}', whose tags are not a list of strings`);
  }
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
 * here, naming the plugin, rather than eight questions later as a
 * coverage refusal that reads exactly like a project of the wrong
 * shape.
 */
function validateVertical(origin: string, vertical: Vertical): void {
  if (vertical.id.length === 0) throw refuse(origin, 'registers a vertical with no id');
  if (RESERVED_VERTICAL_IDS.includes(vertical.id)) {
    throw refuse(
      origin,
      `registers vertical '${vertical.id}', a word 'keel add' reads as a command of its own ('keel add ${vertical.id} …') — a vertical of that id could never be added with 'keel add ${vertical.id}'; rename it`,
    );
  }
  validateConflicts(origin, `vertical '${vertical.id}'`, vertical);
  for (const adapter of vertical.adapters) {
    if (adapter.id === ENGINE_CONTRIBUTOR_ID) {
      throw refuse(
        origin,
        `vertical '${vertical.id}' registers an adapter as '${ENGINE_CONTRIBUTOR_ID}', the engine's own contributor identity — a region or a file attributed to it would read as keel's`,
      );
    }
  }
  const covered = new Set(vertical.adapters.flatMap((adapter) => adapter.covers));
  for (const dimension of vertical.dimensions) {
    if (!covered.has(dimension)) {
      throw refuse(
        origin,
        `vertical '${vertical.id}' declares dimension '${dimension}', which none of its adapters covers`,
      );
    }
  }
  validateAdapterPromotes(origin, vertical);
  validatePlacement(origin, vertical);
  validateProvisions(origin, vertical);
  validateSharedQuestions(origin, vertical);
}

/**
 * `Question.shared` names what a question is shared across, and keel
 * reads one value, `project`. A plugin written in plain JavaScript
 * reaches here without the compiler's help, so any other is refused,
 * naming the plugin, rather than read as no marker at all — a front
 * end would drop that answer on a preset switch without a word.
 */
function validateSharedQuestions(origin: string, vertical: Vertical): void {
  for (const adapter of vertical.adapters) {
    for (const question of adapter.questions ?? []) {
      if (question.shared === undefined || question.shared === 'project') continue;
      throw refuse(
        origin,
        `vertical '${vertical.id}' adapter '${adapter.id}' marks question '${question.id}' shared '${String(question.shared)}', which keel does not know — the one value is 'project'`,
      );
    }
  }
}

/**
 * A placement is read as a sentence — its `because` is all a monorepo
 * service is told when it is refused the vertical — and as the one
 * scope keel knows, `repository`. A plugin written in plain JavaScript
 * reaches here without the compiler's help, so a blank reason or a
 * scope keel does not read is refused, naming the plugin, rather than
 * refused in no words, or not held at all.
 */
function validatePlacement(origin: string, vertical: Vertical): void {
  const placement = vertical.placement;
  if (placement === undefined) return;
  if (placement.scope !== 'repository') {
    throw refuse(
      origin,
      `vertical '${vertical.id}' declares placement scope '${String(placement.scope)}', which keel does not know — the one scope is 'repository'`,
    );
  }
  if (typeof placement.because !== 'string' || placement.because.trim() === '') {
    throw refuse(
      origin,
      `vertical '${vertical.id}' declares a placement with no 'because' — it is the sentence a monorepo service is refused the vertical in`,
    );
  }
}

/**
 * What an adapter builds in a product's services
 * (`Adapter.providesInServices`) is read as the services it names: by
 * stack id (`stacks`), or by what a stack is (`serves`). A plugin
 * written in plain JavaScript reaches here without the compiler's
 * help, so a declaration whose lists name no service, a list that is
 * not one, a `serves` predicate with no `requires` — which would name
 * every service of every stack — and a predicate whose patterns the
 * matcher cannot read are refused, naming the plugin, rather than read
 * as a vertical provided where nothing builds it, or thrown unnamed
 * from the first plan that reads a monorepo service.
 */
function validateProvisions(origin: string, vertical: Vertical): void {
  for (const adapter of vertical.adapters) {
    const provision = adapter.providesInServices;
    if (provision === undefined) continue;
    const where = `vertical '${vertical.id}' adapter '${adapter.id}'`;
    const stacks: unknown = provision.stacks;
    const serves: unknown = provision.serves;
    if (stacks !== undefined && !isStringList(stacks)) {
      throw refuse(
        origin,
        `${where} declares 'providesInServices.stacks' that is not a list of stack ids`,
      );
    }
    if (serves !== undefined && !Array.isArray(serves)) {
      throw refuse(
        origin,
        `${where} declares 'providesInServices.serves' that is not a list of predicates`,
      );
    }
    if ((stacks?.length ?? 0) === 0 && (serves?.length ?? 0) === 0) {
      throw refuse(
        origin,
        `${where} declares 'providesInServices' naming no service — neither 'stacks' nor 'serves' lists one`,
      );
    }
    for (const predicate of (serves ?? []) as readonly unknown[]) {
      validateServes(origin, where, predicate);
    }
  }
}

/** One `serves` predicate of the adapter `where` names: see {@link validateProvisions}. */
function validateServes(origin: string, where: string, predicate: unknown): void {
  const fields: { readonly requires?: unknown; readonly excludes?: unknown } =
    typeof predicate === 'object' && predicate !== null ? predicate : {};
  const { requires, excludes } = fields;
  const subject = `${where} declares a 'providesInServices.serves' predicate`;
  if (requires !== undefined && !isStringList(requires)) {
    throw refuse(origin, `${subject} whose 'requires' is not a list of tag patterns`);
  }
  if (excludes !== undefined && !isStringList(excludes)) {
    throw refuse(origin, `${subject} whose 'excludes' is not a list of tag patterns`);
  }
  if (requires === undefined || requires.length === 0) {
    throw refuse(
      origin,
      `${subject} with no 'requires' — it would name every service, whatever its stack`,
    );
  }
  for (const pattern of [...requires, ...(excludes ?? [])]) {
    try {
      validatePattern(pattern);
    } catch (error) {
      throw refuse(
        origin,
        `${subject} that keel cannot read: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

function isStringList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/**
 * An adapter's own `promotes` is its share of the vertical's, so a
 * tag it lists that the vertical does not is one of two lists being
 * wrong — and whichever it is, a reader of the union would never see
 * the tag. Statically wrong, so refused here, naming the plugin.
 */
function validateAdapterPromotes(origin: string, vertical: Vertical): void {
  const union = new Set(vertical.promotes ?? []);
  for (const adapter of vertical.adapters) {
    const outside = (adapter.promotes ?? []).filter((tag) => !union.has(tag));
    if (outside.length === 0) continue;
    throw refuse(
      origin,
      `vertical '${vertical.id}' adapter '${adapter.id}' promotes '${outside.join("', '")}', which the vertical does not declare in 'promotes' — the vertical's list is the union over its adapters`,
    );
  }
}

/** A vertical the `reads` pass can see, with the origin to quote about it. */
interface KnownVertical {
  readonly vertical: Vertical;
  readonly origin: string;
}

/**
 * Every vertical a run could install, by id: the registered ones
 * first, then any a stack names inline that no source registered
 * under that id — `fullstack` and `bounded-context`, or a plugin
 * stack's own.
 */
function knownVerticals(
  sources: readonly RegistrySource[],
  registered: readonly Vertical[],
  origins: ReadonlyMap<string, string>,
): ReadonlyMap<string, KnownVertical> {
  const known = new Map<string, KnownVertical>(
    registered.map((vertical) => [
      vertical.id,
      { vertical, origin: origins.get(vertical.id) ?? KEEL_ORIGIN },
    ]),
  );
  for (const source of sources) {
    for (const stack of source.stacks ?? []) {
      for (const vertical of stack.verticals) {
        if (!known.has(vertical.id)) known.set(vertical.id, { vertical, origin: source.origin });
      }
    }
  }
  return known;
}

/**
 * The one check {@link Vertical.reads} needs that no single vertical
 * can answer, so it runs once every source has registered.
 *
 * An id nothing registers is ignored rather than refused: a read of
 * an absent vertical changes nothing, and refusing it would stop a
 * plugin from loading because another plugin it reads is not
 * installed. A cycle among known ids is refused — `reads` orders an
 * install, and a cycle orders nothing — naming the origin of the
 * vertical the walk, in registration order, first meets it at.
 */
function validateReads(known: ReadonlyMap<string, KnownVertical>): void {
  const done = new Set<string>();
  const visit = (id: string, path: readonly string[]): void => {
    const at = path.indexOf(id);
    if (at >= 0) {
      const cycle = [...path.slice(at), id];
      throw refuse(
        known.get(id)?.origin ?? KEEL_ORIGIN,
        `vertical '${id}' reads in a cycle: ${cycle.map((step) => `'${step}'`).join(' → ')} — 'reads' orders an install after what it reads, and a cycle orders nothing`,
      );
    }
    if (done.has(id)) return;
    for (const read of known.get(id)?.vertical.reads ?? []) {
      if (known.has(read)) visit(read, [...path, id]);
    }
    done.add(id);
  };
  for (const id of known.keys()) visit(id, []);
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

/**
 * The vertical an id a manifest records as installed names: the one
 * registered under it, or — for a stack's own vertical no source
 * registers on its own, a product's glue — the one a stack carries.
 * Null when neither knows it: a vertical from a plugin no longer
 * loaded, or one this keel has since renamed.
 */
export function installedVertical(registry: Registry, id: string): Vertical | null {
  return (
    registry.vertical(id) ??
    registry
      .stacks()
      .flatMap((stack) => stack.verticals)
      .find((vertical) => vertical.id === id) ??
    null
  );
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
