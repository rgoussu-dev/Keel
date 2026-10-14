/**
 * A `--stack` spelled in facet words: the registered preset a typed id
 * names by what it is, where it names exactly one.
 *
 * Preset ids grew family by family, so the spelling a user types is
 * often the right preset in the family's other word — `quarkus-cli-http`
 * (the JVM presets say `rest`), `kotlin-quarkus-rest`, `fullstack-go-http`
 * (a product named by its backend). Each of those names exactly one
 * preset by its facets, so it is that preset: the run goes on under the
 * preset's own id, which is what every report and record carries, and
 * says so in a note. Anything else is refused as an unknown id, with
 * the nearest one (`./nearest-id.ts`).
 *
 * **The reading.** A typed spelling's words name facets — a language
 * (`java`, `kotlin`, `ts`), its runtime (`jvm`, `node`), a framework
 * (`quarkus`, `web-components`), an entrypoint (`cli`, `http`, `rest`,
 * `spa`) and the fullstack shape — and it names stack `S` when
 *
 *     the facets S's own id spells ⊆ the facets typed ⊆ S's facets
 *
 * S's facets are where the drill-down places it (`wizardPaths`): its
 * shape, language, framework and entrypoints — a product's, its
 * backend's and every service's entrypoints. So what an id leaves
 * unsaid is the default its family spells it with (Java under a JVM
 * framework; Quarkus, Java and the HTTP server in a product), and what
 * it says must be said. A word no facet answers to names nothing.
 *
 * **Words, from the registry.** Each word is a tag's last segment —
 * the language, runtime and framework of every preset the drill-down
 * places, so a plugin's language is a word as keel's are — or an
 * entrypoint's id or word (`ENTRYPOINTS`), or `fullstack`, or one of
 * the two words keel's own ids spell that no tag does ({@link ID_WORDS}).
 * A word two facets answer to — a plugin's `framework.ts` beside
 * keel's `ts` — names neither, so a spelling using it is refused rather
 * than read one way by a guess. A typed id that is a registered id is
 * that stack, always, before any of this is read.
 */

import type { Registry } from '../contract/ports/registry.js';
import type { Stack } from '../contract/stack.js';
import { ENTRYPOINTS, wizardPaths, type WizardPath } from './stack-wizard.js';

/**
 * The words keel's own preset ids spell that no tag does: the JVM
 * presets say `rest` for the HTTP server (their rows' `words` in
 * `stack-presets.json`), the TypeScript ones `ts`. A test holds this
 * list to the table's ids, word for word.
 */
export const ID_WORDS: Readonly<Record<string, readonly string[]>> = {
  rest: ['entrypoint:server-http'],
  ts: ['language:typescript'],
};

/** The shapes an id spells: only a product says what it is. */
const SHAPE_WORDS: readonly string[] = ['fullstack'];

/** What a typed `--stack` names. */
export type StackSpelling =
  /** A registered id, as typed. */
  | { readonly kind: 'id'; readonly stack: Stack }
  /** One preset, named by its facets; `path` is where the drill-down places it. */
  | { readonly kind: 'spelled'; readonly stack: Stack; readonly path: WizardPath }
  /** No preset, or more than one. */
  | { readonly kind: 'unknown' };

interface Spellable {
  readonly path: WizardPath;
  readonly facets: ReadonlySet<string>;
  /** The facets the id spells; null where it spells a word no facet answers to. */
  readonly spelled: ReadonlySet<string> | null;
}

interface Spellings {
  readonly words: ReadonlyMap<string, readonly string[]>;
  readonly stacks: readonly Spellable[];
}

/**
 * The stack `typed` names: its id, or exactly one preset by its facets.
 * It reads the registry afresh each call — a front door asks once per
 * run; {@link stackReader} builds the reading once for many lookups.
 */
export function stackSpelled(registry: Registry, typed: string): StackSpelling {
  const stack = registry.stack(typed);
  if (stack !== null) return { kind: 'id', stack };
  const [only, ...more] = stackReader(registry.stacks())(typed);
  const named = only === undefined || more.length > 0 ? null : registry.stack(only.stackId);
  return only === undefined || named === null
    ? { kind: 'unknown' }
    : { kind: 'spelled', stack: named, path: only };
}

/**
 * The facet reading over `stacks`, built once: what a typed spelling
 * names, by its facets alone — every stack it reads as, where the
 * drill-down places each, and none for a word no facet answers to. A
 * registered id is not looked up here; {@link stackSpelled} does that
 * first. Its words are those of `vocabulary`'s places — `stacks`'
 * own, unless a caller judging a registration names whose words judge
 * it (`registry.ts`).
 */
export function stackReader(
  stacks: readonly Stack[],
  vocabulary: readonly Stack[] = stacks,
): (typed: string) => readonly WizardPath[] {
  const spellings = spellingsOf(stacks, vocabulary);
  return (typed) => facetReading(spellings, typed);
}

function facetReading(spellings: Spellings, typed: string): readonly WizardPath[] {
  const facets = facetsSpelled(spellings.words, typed);
  if (facets === null) return [];
  return spellings.stacks
    .filter(
      (stack) =>
        stack.spelled !== null &&
        [...stack.spelled].every((facet) => facets.has(facet)) &&
        [...facets].every((facet) => stack.facets.has(facet)),
    )
    .map((stack) => stack.path);
}

function spellingsOf(stacks: readonly Stack[], vocabulary: readonly Stack[]): Spellings {
  const paths = wizardPaths(stacks);
  const named = new Map<string, Set<string>>();
  const say = (word: string, facet: string): void => {
    // A plugin tag with an empty last segment (`framework.`) says no word.
    if (word === '') return;
    named.set(word, new Set([...(named.get(word) ?? []), facet]));
  };
  for (const path of vocabulary === stacks ? paths : wizardPaths(vocabulary)) {
    for (const facet of facetsOf(path)) say(facet.slice(facet.indexOf(':') + 1), facet);
  }
  for (const entry of ENTRYPOINTS) say(entry.word, `entrypoint:${entry.id}`);
  for (const [word, facets] of Object.entries(ID_WORDS))
    for (const facet of facets) say(word, facet);
  // A word answering to two facets names neither: which one was meant
  // is a guess, and a guess is the nearest id's to make.
  const words = new Map(
    [...named]
      .filter(([, facets]) => facets.size === 1)
      .filter(
        ([word, facets]) =>
          ![...facets].some((f) => f.startsWith('shape:')) || SHAPE_WORDS.includes(word),
      )
      .map(([word, facets]) => [word, [...facets]] as const),
  );
  return {
    words,
    stacks: paths.map((path) => ({
      path,
      facets: new Set(facetsOf(path)),
      spelled: facetsSpelled(words, path.stackId),
    })),
  };
}

function facetsOf(path: WizardPath): readonly string[] {
  const [language, runtime] = path.language.split('@');
  return [
    `shape:${path.shape}`,
    `language:${language ?? path.language}`,
    ...(runtime === undefined ? [] : [`runtime:${runtime}`]),
    ...(path.framework === null ? [] : [`framework:${path.framework}`]),
    ...path.entrypoints.map((entry) => `entrypoint:${entry}`),
  ];
}

/**
 * The facets `typed` spells, or null where a word names none. A word
 * may itself hold a `-` (`server-http`, `web-components`), so at each
 * point the longest run of parts that is a word is read.
 */
function facetsSpelled(
  words: ReadonlyMap<string, readonly string[]>,
  typed: string,
): Set<string> | null {
  const parts = typed.trim().toLowerCase().split('-');
  const facets = new Set<string>();
  for (let at = 0; at < parts.length; ) {
    let length = parts.length - at;
    while (length > 0 && !words.has(parts.slice(at, at + length).join('-'))) length--;
    if (length === 0) return null;
    const named = words.get(parts.slice(at, at + length).join('-'));
    if (named === undefined) return null;
    for (const facet of named) facets.add(facet);
    at += length;
  }
  return facets;
}
