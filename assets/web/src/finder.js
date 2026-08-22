/**
 * Walking the catalog's stack finder — the `keel new` drill-down as
 * data (`Catalog.finder`).
 *
 * The finder is a tree of language → entrypoint combination →
 * framework, each leaf naming a preset. The engine builds it by
 * reading the stacks' capability tags; nothing here knows what a tag
 * is. What these functions do is pick a path through the tree and
 * report the preset it lands on, keeping as much of the previous
 * choice as the new one allows — which is what makes three dependent
 * controls feel like facets rather than a wizard you have to restart.
 *
 * Pure, and separate from any element, so the narrowing is testable
 * without a DOM — the same split `tree.js` lives under.
 *
 * @typedef {{ id: string, label: string, stack: string }} FrameworkPreset
 * @typedef {{ entrypoints: string[], frameworks: FrameworkPreset[] }} Combination
 * @typedef {{ kind: string, choices: { id: string, label: string, doc: string }[], default: string }} EntrypointStep
 * @typedef {{ id: string, label: string, doc: string, entrypointStep: EntrypointStep | null, combinations: Combination[] }} LanguageNode
 * @typedef {{ languages: LanguageNode[], defaultStack: string }} Finder
 * @typedef {{ language: LanguageNode, combination: Combination, framework: FrameworkPreset }} Located
 */

/** Encodes a chosen set the way a `multi-select` answer travels. */
export function encodeSelection(values) {
  return values.join(',');
}

/** Splits an encoded selection, dropping blanks. */
export function decodeSelection(answer) {
  return (answer ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

/**
 * Where `stackId` sits in the tree, or null when it sits nowhere —
 * which is the honest answer for a fullstack product, since a
 * two-service product names no single language.
 *
 * @param {Finder} finder
 * @param {string} stackId
 * @returns {Located | null}
 */
export function locate(finder, stackId) {
  for (const language of finder.languages) {
    for (const combination of language.combinations) {
      for (const framework of combination.frameworks) {
        if (framework.stack === stackId) return { language, combination, framework };
      }
    }
  }
  return null;
}

/**
 * The preset a form should open on, as the finder reports it — the
 * one an omitted `--stack` resolves to in a terminal.
 *
 * Read rather than recomposed from the facets' own defaults, which is
 * the version of this that was wrong: the framework facet is
 * alphabetical, so its first entry is `micronaut` where the default
 * preset is Quarkus.
 *
 * @param {Finder} finder
 * @returns {string | null}
 */
export function defaultStack(finder) {
  return finder?.defaultStack || null;
}

/**
 * The preset reached by moving to `languageId` from `from`, keeping
 * the entrypoints and framework where the new language offers them.
 *
 * @param {Finder} finder
 * @param {string} languageId
 * @param {Located | null} from
 * @returns {string | null}
 */
export function pickLanguage(finder, languageId, from) {
  const language = finder.languages.find((node) => node.id === languageId);
  if (!language) return null;
  const wanted = from ? encodeSelection(from.combination.entrypoints) : '';
  const combination =
    combinationFor(language, wanted) ??
    combinationFor(language, language.entrypointStep?.default ?? '') ??
    language.combinations[0];
  return combination ? (frameworkIn(combination, from?.framework.id)?.stack ?? null) : null;
}

/**
 * The preset reached by moving to the entrypoint set `answer` names,
 * keeping the framework where the new combination offers it. Null
 * when no combination matches — an empty checkbox group, say, which
 * the caller should refuse rather than resolve.
 *
 * @param {LanguageNode} language
 * @param {string} answer encoded selection
 * @param {Located | null} from
 * @returns {string | null}
 */
export function pickEntrypoints(language, answer, from) {
  const combination = combinationFor(language, answer);
  if (!combination) return null;
  return frameworkIn(combination, from?.framework.id)?.stack ?? null;
}

/**
 * The combination of `language` whose entrypoints `answer` names.
 * Order-insensitive: a checkbox group reports clicks, not menu order.
 */
function combinationFor(language, answer) {
  const wanted = [...decodeSelection(answer)].sort().join(',');
  return (
    language.combinations.find(
      (combination) => [...combination.entrypoints].sort().join(',') === wanted,
    ) ?? null
  );
}

/** `frameworkId` where this combination offers it, its first entry otherwise. */
function frameworkIn(combination, frameworkId) {
  return (
    combination.frameworks.find((framework) => framework.id === frameworkId) ??
    combination.frameworks[0] ??
    null
  );
}
