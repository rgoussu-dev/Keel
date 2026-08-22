/**
 * The `keel new` wizard's guided drill-down: **language → user-side
 * adapters → framework**, resolving to a stack id the ordinary
 * `--stack` path already knows how to install.
 *
 * The 33-entry stack list is a fine reference and a poor menu. A
 * newcomer knows they want "Kotlin, a CLI and an HTTP endpoint,
 * Spring" long before they know that spelling is
 * `spring-cli-rest-kotlin`. This module turns the catalog inside out
 * so those three facts can be asked one at a time.
 *
 * **Derived, never composed.** Every node here comes from reading the
 * `tags` of the stacks in the registry — a stack added tomorrow shows
 * up in the menus by itself. Nothing synthesises a stack: the answer
 * is always an id from `./stacks.ts`, so the wizard and `--stack`
 * resolve through exactly the same code, and a combination no preset
 * covers is a combination the menus never offer rather than an error
 * discovered at the bottom of the flow.
 *
 * **The three axes, and where they come from.**
 *
 * - _Language_ is the `lang.*` tag, qualified by the `runtime.*` tag
 *   when the stack carries one. The qualifier is what separates
 *   `ts-cli` (`runtime.node`) from `web-components`
 *   (`runtime.browser`): same language, different target, and
 *   emphatically not the same menu — see the combinability note
 *   below.
 * - _User-side adapters_ are the `arch.*` tags naming an entrypoint,
 *   registered in {@link ENTRYPOINTS}. This is the multi-select step,
 *   and picking more than one resolves to the **composed** stack —
 *   one hexagon with two entrypoints (`quarkus-cli-rest`,
 *   `go-cli-http`), never a two-service product.
 * - _Framework_ is the `framework.*` tag, or none. Asked only where
 *   the chosen language and entrypoints leave more than one open,
 *   which today means the JVM's Quarkus/Spring/Micronaut and nothing
 *   else.
 *
 * **Why the runtime qualifies the language, restated as the rule it
 * is.** A multi-select can express any subset of what it offers, so
 * every subset it offers must resolve. Under `lang.typescript` alone
 * the entrypoints would be `{cli, server-http, spa}` and three of the
 * seven subsets (anything pairing `spa` with another) name no preset
 * — a dead end the menu would be offering. Splitting the browser
 * target off leaves `{cli, server-http}` on Node (all three subsets
 * are presets) and `{spa}` alone in the browser (one subset, so the
 * question is skipped entirely). {@link entrypointStep} does not
 * take that on faith: it checks the language's subsets really are
 * complete and falls back to a single-select over the combinations
 * that exist when they are not, so a future catalog cannot reopen
 * the hole.
 */

import { encodeSelection, type QuestionChoice, decodeSelection } from '../contract/composition.js';
import type { Tag } from '../contract/tags.js';
import type { Stack } from './stacks.js';

/** A user-side adapter a stack can be scaffolded with. */
interface EntrypointRecord {
  /** The `arch.*` tag a stack carries to declare it. */
  readonly tag: Tag;
  /** Answer value — the tag's last segment. */
  readonly id: string;
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
    short: 'CLI',
    label: 'CLI — a command-line entrypoint',
    doc: 'A command the user runs; the hexagon is driven by argument parsing.',
  },
  {
    tag: 'arch.server-http',
    id: 'server-http',
    short: 'HTTP server',
    label: 'HTTP server — a REST endpoint',
    doc: 'A long-running service; the hexagon is driven by HTTP requests.',
  },
  {
    tag: 'arch.spa',
    id: 'spa',
    short: 'Browser SPA',
    label: 'Browser SPA — a single-page front end',
    doc: 'A page in a browser; the hexagon is driven by user interaction.',
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
 * One reachable combination of the three axes, and the registered
 * stack it names. The whole drill-down is a search over these.
 */
export interface WizardPath {
  /** Language node key: `java@jvm`, `go`, `typescript@browser`, … */
  readonly language: string;
  /** Framework tag's last segment, or null for a stack declaring none. */
  readonly framework: string | null;
  /** Entrypoint ids in {@link ENTRYPOINTS} order; never empty. */
  readonly entrypoints: readonly string[];
  readonly stackId: string;
}

/** What the entrypoint step asks, once a language is chosen. */
export interface EntrypointStep {
  /**
   * `multi-select` when every non-empty subset of this language's
   * entrypoints is a preset — the ordinary case, and the one the
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
 * Composite stacks are absent by construction — they carry no
 * `lang.*` tag, being products rather than projects — and so is any
 * stack whose tags name no language. Both stay reachable through the
 * wizard's "pick a preset by id" escape hatch, which is why their
 * absence here is a filter and not a loss.
 */
export function wizardPaths(stacks: readonly Stack[]): readonly WizardPath[] {
  const paths: WizardPath[] = [];
  for (const stack of stacks) {
    if (stack.services !== undefined) continue;
    const language = languageKey(stack.tags);
    if (language === null) continue;
    const entrypoints = entrypointsOf(stack.tags);
    if (entrypoints.length === 0) continue;
    paths.push({ language, framework: frameworkOf(stack.tags), entrypoints, stackId: stack.id });
  }
  return paths.sort((a, b) => a.stackId.localeCompare(b.stackId));
}

/**
 * The language menu: one choice per language node, documented by the
 * presets it leads to so the list stays honest about its own reach.
 */
export function languageChoices(paths: readonly WizardPath[]): readonly QuestionChoice[] {
  const byLanguage = new Map<string, string[]>();
  for (const path of paths) {
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

/**
 * The entrypoint step for `language`, or null when there is nothing
 * to ask — a language reaching exactly one combination answers the
 * question by existing.
 *
 * `preferred` is a stack id whose own combination becomes the
 * default when it belongs to this language; that is what makes
 * pressing enter through the wizard land on the same preset an
 * omitted `--stack` always defaulted to.
 */
export function entrypointStep(
  paths: readonly WizardPath[],
  language: string,
  preferred?: string,
): EntrypointStep | null {
  const here = paths.filter((path) => path.language === language);
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
      label: combination.map((id) => entrypoint(id)?.short ?? id).join(' + '),
      doc: presetsDoc(here.filter((path) => sameCombination(path.entrypoints, combination))),
    })),
    default: encodeSelection([...fallback]),
  };
}

/**
 * Every framework reachable from a chosen language and entrypoint
 * set, with the preset each one names — always the whole list, even
 * when it holds one entry.
 *
 * The unfiltered half of {@link frameworkChoices}. A terminal asks
 * only where a choice remains, so `frameworkChoices` returns null for
 * a list of one; a form has to *render* what a single-framework
 * combination resolves to, and dropping the entry would leave it
 * nothing to name. Same data, two audiences.
 */
export function frameworkPaths(
  paths: readonly WizardPath[],
  language: string,
  entrypoints: readonly string[],
): readonly FrameworkPath[] {
  const here = matching(paths, language, entrypoints);
  return [...new Set(here.map((path) => path.framework ?? ''))].sort().flatMap((framework) => {
    const path = here.find((candidate) => (candidate.framework ?? '') === framework);
    return path === undefined
      ? []
      : [{ id: framework, label: frameworkLabel(framework), stackId: path.stackId }];
  });
}

/** One framework of a (language, entrypoints) pair. @see frameworkPaths */
export interface FrameworkPath {
  /** The framework tag's last segment; `''` for a stack declaring none. */
  readonly id: string;
  readonly label: string;
  /** The preset this framework names — one, by the uniqueness invariant. */
  readonly stackId: string;
}

/**
 * The framework menu for a chosen language and entrypoint set, or
 * null when the choice makes itself — one framework, or none at all.
 */
export function frameworkChoices(
  paths: readonly WizardPath[],
  language: string,
  entrypoints: readonly string[],
): readonly QuestionChoice[] | null {
  const reachable = frameworkPaths(paths, language, entrypoints);
  if (reachable.length <= 1) return null;
  return reachable.map((framework) => ({
    value: framework.id,
    label: framework.label,
    doc: framework.stackId,
  }));
}

/** Human-readable label of a framework node. */
export function frameworkLabel(framework: string): string {
  return framework === '' ? 'none — the language’s own runtime, no framework' : framework;
}

/**
 * The distinct entrypoint combinations a language reaches, fewest
 * entrypoints first — the keys {@link entrypointStep}'s answer
 * decodes to, and what a faceted front end walks instead of asking.
 */
export function entrypointCombinations(
  paths: readonly WizardPath[],
  language: string,
): readonly (readonly string[])[] {
  return distinctCombinations(paths.filter((path) => path.language === language));
}

/**
 * The path the three answers name, or null when they name none.
 *
 * `framework` is the value {@link frameworkChoices} offered, or null
 * when that step was skipped — in which case the single framework
 * reachable from the other two answers is the one meant.
 */
export function pathFor(
  paths: readonly WizardPath[],
  language: string,
  entrypoints: readonly string[],
  framework: string | null,
): WizardPath | null {
  const here = matching(paths, language, entrypoints);
  if (framework === null) return here.length === 1 ? (here[0] ?? null) : null;
  return here.find((path) => (path.framework ?? '') === framework) ?? null;
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

function matching(
  paths: readonly WizardPath[],
  language: string,
  entrypoints: readonly string[],
): readonly WizardPath[] {
  return paths.filter(
    (path) => path.language === language && sameCombination(path.entrypoints, entrypoints),
  );
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
