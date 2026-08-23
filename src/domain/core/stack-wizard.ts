/**
 * The `keel new` wizard's guided drill-down: **shape → language →
 * framework → user-side adapters**, resolving to a stack id the
 * ordinary `--stack` path already knows how to install.
 *
 * The 34-entry stack list is a fine reference and a poor menu. A
 * newcomer knows they want "a backend, in Kotlin, on Spring, with a
 * CLI and an HTTP endpoint" long before they know that spelling is
 * `spring-cli-rest-kotlin`. This module turns the catalog inside out
 * so those four facts can be asked one at a time, widest first.
 *
 * **Derived, never composed.** Every node here comes from reading the
 * `tags` of the stacks in the registry — a stack added tomorrow shows
 * up in the menus by itself. Nothing synthesises a stack: the answer
 * is always an id from `./stacks.ts`, so the wizard and `--stack`
 * resolve through exactly the same code, and a combination no preset
 * covers is a combination the menus never offer rather than an error
 * discovered at the bottom of the flow.
 *
 * **The four axes, and where they come from.**
 *
 * - _Shape_ is what is being built, and it is read off the **sides**
 *   of the entrypoints a preset reaches: a preset driven only from
 *   the back (`arch.cli`, `arch.server-http`) is a backend, one
 *   driven only from the front (`arch.spa`) is a frontend, and one
 *   reaching both — whether as one project or as a composite's two
 *   services — is fullstack. See {@link SHAPES}.
 * - _Language_ is the `lang.*` tag, qualified by the `runtime.*` tag
 *   when the stack carries one. The qualifier is what separates
 *   `ts-cli` (`runtime.node`) from `web-components`
 *   (`runtime.browser`): same language, different target — though
 *   with shape asked first they now sit under different shapes too,
 *   which is the honest place for that distinction to land.
 * - _Framework_ is the `framework.*` tag, or none. Asked only where
 *   the chosen shape and language leave more than one open, which
 *   today means the JVM's Quarkus/Spring/Micronaut and nothing else.
 * - _User-side adapters_ are the `arch.*` tags naming an entrypoint,
 *   registered in {@link ENTRYPOINTS}. This is the multi-select step,
 *   and picking more than one resolves to the **composed** stack —
 *   one hexagon with two entrypoints (`quarkus-cli-rest`,
 *   `go-cli-http`), never a two-service product. Asked last, because
 *   it is the one axis that narrows nothing else: a backend reaches
 *   the same entrypoints whichever language and framework it is on.
 *
 * **Why the entrypoint step is safe as a checkbox group.** A
 * multi-select can express any subset of what it offers, so every
 * subset it offers must resolve. Under a shape it usually does —
 * `backend` + `java@jvm` + `quarkus` reaches `{cli}`,
 * `{server-http}` and both, which is every non-empty subset of
 * `{cli, server-http}`. {@link entrypointStep} does not take that on
 * faith: it checks the group's subsets really are complete and falls
 * back to a single-select over the combinations that exist when they
 * are not, so a future catalog cannot open a hole here.
 *
 * **Composites are in the tree now, and that is the point of the
 * shape axis.** A product carries no `lang.*` tag of its own, so
 * before there was a shape it sat outside every facet and could only
 * be reached by typing its id. Read through its services it places
 * perfectly well: the union of their entrypoints gives the shape,
 * and its one back-side service — its **engine** — gives the
 * language and framework, which is exactly the choice a fullstack
 * product leaves open. A composite with no engine, or with two, is
 * left out rather than guessed at; the by-id list still reaches it.
 */

import { encodeSelection, type QuestionChoice, decodeSelection } from '../contract/composition.js';
import type { Tag } from '../contract/tags.js';
import type { Stack } from './stacks.js';

/** Which end of a system a user-side adapter is driven from. */
type Side = 'front' | 'back';

/** A user-side adapter a stack can be scaffolded with. */
interface EntrypointRecord {
  /** The `arch.*` tag a stack carries to declare it. */
  readonly tag: Tag;
  /** Answer value — the tag's last segment. */
  readonly id: string;
  /**
   * Which end this adapter is driven from — what {@link shapeOf}
   * reads to decide whether a preset is a backend, a frontend or
   * both. A shape is not a fourth tag to keep in step; it is this
   * one, counted.
   */
  readonly side: Side;
  /** Name used when combinations are spelled out (`CLI + HTTP server`). */
  readonly short: string;
  readonly label: string;
  readonly doc: string;
}

/**
 * The `arch.*` tags that name a **user-side adapter**, in the order
 * the menus list them.
 *
 * Explicit rather than "every `arch.*` tag", because most of them are
 * not entrypoints: `arch.hexagonal` is a shape, not a way in. An
 * entrypoint tag missing from this list would silently collapse two
 * stacks onto one drill-down path, which is what
 * `stack-wizard.test.ts` asserts against.
 */
export const ENTRYPOINTS: readonly EntrypointRecord[] = [
  {
    tag: 'arch.cli',
    id: 'cli',
    side: 'back',
    short: 'CLI',
    label: 'CLI — a command-line entrypoint',
    doc: 'A command the user runs; the hexagon is driven by argument parsing.',
  },
  {
    tag: 'arch.server-http',
    id: 'server-http',
    side: 'back',
    short: 'HTTP server',
    label: 'HTTP server — a REST endpoint',
    doc: 'A long-running service; the hexagon is driven by HTTP requests.',
  },
  {
    tag: 'arch.spa',
    id: 'spa',
    side: 'front',
    short: 'Browser SPA',
    label: 'Browser SPA — a single-page front end',
    doc: 'A page in a browser; the hexagon is driven by user interaction.',
  },
];

/** What kind of thing a preset scaffolds. @see SHAPES */
export type ProjectShape = 'fullstack' | 'backend' | 'frontend';

/** One shape of the drill-down's first question. */
interface ShapeRecord {
  readonly id: ProjectShape;
  readonly label: string;
  readonly doc: string;
}

/**
 * The three shapes, in the order the first menu lists them.
 *
 * Closed rather than derived, because there are only three ways the
 * two sides can be covered and the wording of each is editorial. What
 * is derived is **membership**: which presets land under which shape
 * is {@link shapeOf} counting entrypoint sides, so a stack gaining an
 * `arch.spa` moves shape on its own.
 */
export const SHAPES: readonly ShapeRecord[] = [
  {
    id: 'fullstack',
    label: 'Fullstack — a backend and a front end together',
    doc: 'Both ends of one product: an HTTP service and a browser front end, scaffolded side by side and wired to each other through a gateway. One repository or two is a later question.',
  },
  {
    id: 'backend',
    label: 'Backend — a service with no front end of its own',
    doc: 'One project, one hexagon, driven from the back: a command line, an HTTP endpoint, or both in the same project.',
  },
  {
    id: 'frontend',
    label: 'Frontend — a front end in the browser',
    doc: 'One project whose hexagon is driven by user interaction in a page, talking to whatever backend already exists.',
  },
];

/**
 * Display names for the language nodes the catalog produces. Labels
 * only — membership is derived, so a stack in a language nobody named
 * here still appears, spelled from its own tags.
 */
const LANGUAGE_LABELS: Readonly<Record<string, string>> = {
  'java@jvm': 'Java',
  'kotlin@jvm': 'Kotlin',
  go: 'Go',
  rust: 'Rust',
  'typescript@node': 'TypeScript (Node)',
  'typescript@browser': 'TypeScript (browser)',
};

/**
 * One reachable combination of the four axes, and the registered
 * stack it names. The whole drill-down is a search over these.
 */
export interface WizardPath {
  /** What this preset builds; see {@link SHAPES}. */
  readonly shape: ProjectShape;
  /** Language node key: `java@jvm`, `go`, `typescript@browser`, … */
  readonly language: string;
  /** Framework tag's last segment, or null for a stack declaring none. */
  readonly framework: string | null;
  /** Entrypoint ids in {@link ENTRYPOINTS} order; never empty. */
  readonly entrypoints: readonly string[];
  readonly stackId: string;
}

/** What the entrypoint step asks, once the axes above it are chosen. */
export interface EntrypointStep {
  /**
   * `multi-select` when every non-empty subset of the entrypoints
   * reachable here is a preset — the ordinary case, and the one the
   * issue asks for. `select` over spelled-out combinations when it is
   * not, so an unreachable pairing is never on the menu.
   */
  readonly kind: 'select' | 'multi-select';
  readonly choices: readonly QuestionChoice[];
  /** Encoded selection; see `Question.default`. */
  readonly default: string;
}

/**
 * Every drill-down path the registry covers, in stack-id order.
 *
 * A single-service stack places itself from its own tags. A composite
 * places itself through its services — see the module note — and is
 * skipped when it names a service this list does not hold, when its
 * services reach no entrypoint, or when it has no single back-side
 * engine to take a language and framework from. A stack naming no
 * language is skipped too. All of them stay reachable through the
 * wizard's "pick a preset by id" escape hatch, which is why these are
 * filters and not losses.
 */
export function wizardPaths(stacks: readonly Stack[]): readonly WizardPath[] {
  const byId = new Map(stacks.map((stack) => [stack.id, stack]));
  const paths: WizardPath[] = [];
  for (const stack of stacks) {
    const placed = stack.services ? compositePath(stack, byId) : singlePath(stack);
    if (placed !== null) paths.push(placed);
  }
  return paths.sort((a, b) => a.stackId.localeCompare(b.stackId));
}

/** Where `stackId` sits in the tree, or null when it sits nowhere. */
export function pathOf(paths: readonly WizardPath[], stackId: string): WizardPath | null {
  return paths.find((path) => path.stackId === stackId) ?? null;
}

/**
 * The shape menu: one choice per shape the registry actually reaches,
 * documented by how many presets sit under it.
 */
export function shapeChoices(paths: readonly WizardPath[]): readonly QuestionChoice[] {
  return SHAPES.filter((shape) => paths.some((path) => path.shape === shape.id)).map((shape) => {
    const count = paths.filter((path) => path.shape === shape.id).length;
    return {
      value: shape.id,
      label: shape.label,
      doc: `${shape.doc} (${count} preset${count === 1 ? '' : 's'})`,
    };
  });
}

/**
 * The language menu for a shape: one choice per language node,
 * documented by the presets it leads to so the list stays honest
 * about its own reach.
 */
export function languageChoices(
  paths: readonly WizardPath[],
  shape: ProjectShape,
): readonly QuestionChoice[] {
  const byLanguage = new Map<string, string[]>();
  for (const path of paths) {
    if (path.shape !== shape) continue;
    const ids = byLanguage.get(path.language) ?? [];
    ids.push(path.stackId);
    byLanguage.set(path.language, ids);
  }
  return [...byLanguage.entries()]
    .sort(([a], [b]) => languageLabel(a).localeCompare(languageLabel(b)))
    .map(([language, ids]) => ({
      value: language,
      label: languageLabel(language),
      doc: `${ids.length} preset${ids.length === 1 ? '' : 's'}: ${ids.join(', ')}`,
    }));
}

/** One framework of a (shape, language) pair. @see frameworkPaths */
export interface FrameworkPath {
  /** The framework tag's last segment; `''` for a stack declaring none. */
  readonly id: string;
  readonly label: string;
  /** How many presets sit under it, for a menu that documents its reach. */
  readonly presets: readonly string[];
}

/**
 * Every framework reachable from a chosen shape and language — always
 * the whole list, even when it holds one entry.
 *
 * The unfiltered half of {@link frameworkChoices}. A terminal asks
 * only where a choice remains, so `frameworkChoices` returns null for
 * a list of one; a form has to *render* what a single-framework
 * combination resolves to, and dropping the entry would leave it
 * nothing to name. Same data, two audiences.
 */
export function frameworkPaths(
  paths: readonly WizardPath[],
  shape: ProjectShape,
  language: string,
): readonly FrameworkPath[] {
  const here = paths.filter((path) => path.shape === shape && path.language === language);
  return [...new Set(here.map((path) => path.framework ?? ''))].sort().map((framework) => ({
    id: framework,
    label: frameworkLabel(framework),
    presets: here
      .filter((candidate) => (candidate.framework ?? '') === framework)
      .map((candidate) => candidate.stackId),
  }));
}

/**
 * The framework menu for a chosen shape and language, or null when
 * the choice makes itself — one framework, or none at all.
 */
export function frameworkChoices(
  paths: readonly WizardPath[],
  shape: ProjectShape,
  language: string,
): readonly QuestionChoice[] | null {
  const reachable = frameworkPaths(paths, shape, language);
  if (reachable.length <= 1) return null;
  return reachable.map((framework) => ({
    value: framework.id,
    label: framework.label,
    doc: framework.presets.join(', '),
  }));
}

/** Human-readable label of a framework node. */
export function frameworkLabel(framework: string): string {
  return framework === '' ? 'none — the language’s own runtime, no framework' : framework;
}

/** Human-readable label of a shape node. */
export function shapeLabel(shape: ProjectShape): string {
  return SHAPES.find((record) => record.id === shape)?.label ?? shape;
}

/**
 * The entrypoint step for a chosen shape, language and framework, or
 * null when there is nothing to ask — a combination reaching exactly
 * one entrypoint set answers the question by existing.
 *
 * `framework` is null when that step was skipped, in which case every
 * framework reachable from the two answers above is in scope — which
 * is the same set, since the step is only skipped where there is one.
 *
 * `preferred` is a stack id whose own combination becomes the
 * default when it belongs here; that is what makes pressing enter
 * through the wizard land on the same preset an omitted `--stack`
 * always defaulted to.
 */
export function entrypointStep(
  paths: readonly WizardPath[],
  shape: ProjectShape,
  language: string,
  framework: string | null,
  preferred?: string,
): EntrypointStep | null {
  const here = matching(paths, shape, language, framework);
  const combinations = distinctCombinations(here);
  if (combinations.length <= 1) return null;

  const union = ENTRYPOINTS.map((e) => e.id).filter((id) =>
    here.some((path) => path.entrypoints.includes(id)),
  );
  const fallback =
    here.find((path) => path.stackId === preferred)?.entrypoints ?? combinations[0] ?? [];

  // Every non-empty subset present? Then a checkbox cannot express a
  // combination that is not a preset, and the multi-select is safe.
  if (combinations.length === 2 ** union.length - 1) {
    return {
      kind: 'multi-select',
      choices: union.map((id) => {
        const record = entrypoint(id);
        return { value: id, label: record?.label ?? id, doc: record?.doc ?? '' };
      }),
      default: encodeSelection([...fallback]),
    };
  }
  return {
    kind: 'select',
    choices: combinations.map((combination) => ({
      value: encodeSelection([...combination]),
      label: entrypointsLabel(combination),
      doc: presetsDoc(here.filter((path) => sameCombination(path.entrypoints, combination))),
    })),
    default: encodeSelection([...fallback]),
  };
}

/**
 * The distinct entrypoint combinations a (shape, language,
 * framework) triple reaches, fewest entrypoints first — the keys
 * {@link entrypointStep}'s answer decodes to, and what a faceted
 * front end walks instead of asking.
 */
export function entrypointCombinations(
  paths: readonly WizardPath[],
  shape: ProjectShape,
  language: string,
  framework: string | null,
): readonly (readonly string[])[] {
  return distinctCombinations(matching(paths, shape, language, framework));
}

/**
 * The path the four answers name, or null when they name none.
 *
 * `framework` is the value {@link frameworkChoices} offered, or null
 * when that step was skipped — in which case the single framework
 * reachable from the answers above it is the one meant.
 */
export function pathFor(
  paths: readonly WizardPath[],
  shape: ProjectShape,
  language: string,
  framework: string | null,
  entrypoints: readonly string[],
): WizardPath | null {
  return (
    matching(paths, shape, language, framework).find((path) =>
      sameCombination(path.entrypoints, entrypoints),
    ) ?? null
  );
}

/** Human-readable label of a language node, for menus and messages. */
export function languageLabel(language: string): string {
  const named = LANGUAGE_LABELS[language];
  if (named !== undefined) return named;
  const [lang, runtime] = language.split('@');
  return runtime === undefined ? (lang ?? language) : `${lang ?? language} (${runtime})`;
}

/** Spells an entrypoint set the way a message names it: `CLI + HTTP server`. */
export function entrypointsLabel(entrypoints: readonly string[]): string {
  return entrypoints.map((id) => entrypoint(id)?.short ?? id).join(' + ');
}

/** Normalises an answered selection into {@link ENTRYPOINTS} order. */
export function normaliseEntrypoints(answer: string): readonly string[] {
  const chosen = new Set(decodeSelection(answer));
  return ENTRYPOINTS.map((e) => e.id).filter((id) => chosen.has(id));
}

/**
 * The paths of one (shape, language) pair, narrowed to `framework`
 * when one was answered. A null framework means the step was skipped
 * and everything reachable is in scope.
 */
function matching(
  paths: readonly WizardPath[],
  shape: ProjectShape,
  language: string,
  framework: string | null,
): readonly WizardPath[] {
  return paths.filter(
    (path) =>
      path.shape === shape &&
      path.language === language &&
      (framework === null || (path.framework ?? '') === framework),
  );
}

/** The drill-down node a single-service stack sits at, or null. */
function singlePath(stack: Stack): WizardPath | null {
  const language = languageKey(stack.tags);
  if (language === null) return null;
  const entrypoints = entrypointsOf(stack.tags);
  const shape = shapeOf(entrypoints);
  if (shape === null) return null;
  return { shape, language, framework: frameworkOf(stack.tags), entrypoints, stackId: stack.id };
}

/**
 * The drill-down node a composite sits at, read through its services.
 *
 * The shape comes from every service together — that is what makes a
 * product fullstack rather than the two halves it is made of. The
 * language and framework come from its **engine**: the one service
 * driven from the back, which is the half a fullstack product leaves
 * open. Null where any of that is ambiguous, so the by-id list stays
 * the honest answer rather than a guess dressed as a facet.
 */
function compositePath(stack: Stack, byId: ReadonlyMap<string, Stack>): WizardPath | null {
  const services: Stack[] = [];
  for (const service of stack.services ?? []) {
    const resolved = byId.get(service.stack);
    if (resolved === undefined) return null;
    services.push(resolved);
  }
  const reached = new Set(services.flatMap((service) => entrypointsOf(service.tags)));
  const entrypoints = ENTRYPOINTS.map((e) => e.id).filter((id) => reached.has(id));
  const shape = shapeOf(entrypoints);
  if (shape === null) return null;
  const engines = services.filter((service) =>
    entrypointsOf(service.tags).some((id) => entrypoint(id)?.side === 'back'),
  );
  const engine = engines.length === 1 ? engines[0] : undefined;
  if (engine === undefined) return null;
  const language = languageKey(engine.tags);
  if (language === null) return null;
  return { shape, language, framework: frameworkOf(engine.tags), entrypoints, stackId: stack.id };
}

/**
 * Which shape an entrypoint set makes, or null for a set that reaches
 * no registered entrypoint at all — a stack with no way in, which the
 * drill-down has nothing to say about.
 */
function shapeOf(entrypoints: readonly string[]): ProjectShape | null {
  const sides = new Set(entrypoints.flatMap((id) => [entrypoint(id)?.side ?? []].flat()));
  if (sides.size === 0) return null;
  if (sides.has('front') && sides.has('back')) return 'fullstack';
  return sides.has('front') ? 'frontend' : 'backend';
}

/** Distinct entrypoint combinations of `paths`, fewest entrypoints first. */
function distinctCombinations(paths: readonly WizardPath[]): readonly (readonly string[])[] {
  const seen = new Map<string, readonly string[]>();
  for (const path of paths) seen.set(encodeSelection([...path.entrypoints]), path.entrypoints);
  return [...seen.values()].sort(
    (a, b) => a.length - b.length || encodeSelection([...a]).localeCompare(encodeSelection([...b])),
  );
}

function sameCombination(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function presetsDoc(paths: readonly WizardPath[]): string {
  return paths.map((path) => path.stackId).join(', ');
}

function entrypoint(id: string): EntrypointRecord | undefined {
  return ENTRYPOINTS.find((e) => e.id === id);
}

/** `java@jvm`, `go`, `typescript@browser`, … or null for a stack naming no language. */
function languageKey(tags: readonly Tag[]): string | null {
  const lang = suffix(tags, 'lang.');
  if (lang === null) return null;
  const runtime = suffix(tags, 'runtime.');
  return runtime === null ? lang : `${lang}@${runtime}`;
}

function frameworkOf(tags: readonly Tag[]): string | null {
  return suffix(tags, 'framework.');
}

function entrypointsOf(tags: readonly Tag[]): readonly string[] {
  return ENTRYPOINTS.filter((e) => tags.includes(e.tag)).map((e) => e.id);
}

/** The last segment of the first tag under `prefix`, or null. */
function suffix(tags: readonly Tag[], prefix: string): string | null {
  const tag = tags.find((t) => t.startsWith(prefix));
  return tag === undefined ? null : tag.slice(prefix.length);
}
