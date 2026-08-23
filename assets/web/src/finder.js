/**
 * Walking the catalog's stack finder — the `keel new` drill-down as
 * data (`Catalog.finder`).
 *
 * The finder is a tree of shape → language → framework → entrypoint
 * combination, each leaf naming a preset. The engine builds it by
 * reading the stacks' capability tags; nothing here knows what a tag
 * is. What these functions do is pick a path through the tree and
 * report the preset it lands on, keeping as much of the previous
 * choice as the new one allows — which is what stops a step backwards
 * from throwing away every answer below it.
 *
 * Pure, and separate from any element, so the narrowing is testable
 * without a DOM — the same split `tree.js` and `steps.js` live under.
 *
 * The typedefs mirror `Catalog.finder` as the engine reports it,
 * readonly arrays and all — `tests/application/web/finder.test.ts`
 * drives these functions with the real payload, so a `StackFinder`
 * that stopped fitting them would fail the typecheck rather than
 * quietly diverge.
 *
 * @typedef {{ entrypoints: ReadonlyArray<string>, stack: string }} Combination
 * @typedef {{ kind: string, choices: ReadonlyArray<{ id: string, label: string, doc: string }>, default: string }} EntrypointStep
 * @typedef {{ id: string, label: string, entrypointStep: EntrypointStep | null, combinations: ReadonlyArray<Combination> }} FrameworkNode
 * @typedef {{ id: string, label: string, doc: string, frameworks: ReadonlyArray<FrameworkNode> }} LanguageNode
 * @typedef {{ id: string, label: string, doc: string, languages: ReadonlyArray<LanguageNode> }} ShapeNode
 * @typedef {{ shapes: ReadonlyArray<ShapeNode>, defaultStack: string }} Finder
 * @typedef {{ shape: ShapeNode, language: LanguageNode, framework: FrameworkNode, combination: Combination }} Located
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
 * which since the shape axis landed means a preset the engine could
 * not place at all, not merely a two-service product.
 *
 * @param {Finder} finder
 * @param {string} stackId
 * @returns {Located | null}
 */
export function locate(finder, stackId) {
  for (const shape of finder?.shapes ?? []) {
    for (const language of shape.languages) {
      for (const framework of language.frameworks) {
        for (const combination of framework.combinations) {
          if (combination.stack === stackId) return { shape, language, framework, combination };
        }
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
 * The preset reached by moving to `shapeId` from `from`, keeping the
 * language, framework and entrypoints wherever the new shape still
 * offers them.
 *
 * @param {Finder} finder
 * @param {string} shapeId
 * @param {Located | null} from
 * @returns {string | null}
 */
export function pickShape(finder, shapeId, from) {
  const shape = (finder?.shapes ?? []).find((node) => node.id === shapeId);
  return shape ? descend(shape, from) : null;
}

/**
 * The preset reached by moving to `languageId` within `shape`,
 * keeping the framework and entrypoints where the new language
 * offers them.
 *
 * @param {ShapeNode} shape
 * @param {string} languageId
 * @param {Located | null} from
 * @returns {string | null}
 */
export function pickLanguage(shape, languageId, from) {
  const language = shape.languages.find((node) => node.id === languageId);
  return language ? resolve(language, from) : null;
}

/**
 * The preset reached by moving to `frameworkId` within `language`,
 * keeping the entrypoints where the new framework offers them.
 *
 * @param {LanguageNode} language
 * @param {string} frameworkId
 * @param {Located | null} from
 * @returns {string | null}
 */
export function pickFramework(language, frameworkId, from) {
  const framework = language.frameworks.find((node) => node.id === frameworkId);
  return framework ? (combinationIn(framework, wanted(from))?.stack ?? null) : null;
}

/**
 * The preset reached by moving to the entrypoint set `answer` names.
 * Null when no combination matches — an empty checkbox group, say,
 * which the caller should refuse rather than resolve.
 *
 * @param {FrameworkNode} framework
 * @param {string} answer encoded selection
 * @returns {string | null}
 */
export function pickEntrypoints(framework, answer) {
  return exactCombination(framework, answer)?.stack ?? null;
}

/** Walks a shape down to a leaf, preferring `from`'s choices at each level. */
function descend(shape, from) {
  const language =
    shape.languages.find((node) => node.id === from?.language.id) ?? shape.languages[0];
  return language ? resolve(language, from) : null;
}

/** Walks a language down to a leaf, preferring `from`'s choices. */
function resolve(language, from) {
  const framework =
    language.frameworks.find((node) => node.id === from?.framework.id) ?? language.frameworks[0];
  return framework ? (combinationIn(framework, wanted(from))?.stack ?? null) : null;
}

/** The encoded entrypoint set `from` carries, or none. */
function wanted(from) {
  return from ? encodeSelection(from.combination.entrypoints) : '';
}

/**
 * `answer`'s combination where this framework offers it, and the
 * closest thing to it otherwise.
 *
 * "Closest" is the most entrypoints in common, ties going to the
 * first — and the combinations arrive fewest-first, so a tie resolves
 * to the smaller one. That partial carry is what makes stepping
 * *back* worth doing: coming off a fullstack product, whose
 * entrypoints are `server-http + spa`, into a backend should land on
 * the HTTP preset rather than on whatever happens to be listed first.
 * An exact-or-nothing fallback threw the whole answer away for want
 * of the half of it that could not survive the move.
 */
function combinationIn(framework, answer) {
  const exact = exactCombination(framework, answer);
  if (exact) return exact;
  const sought = new Set(decodeSelection(answer));
  let best = null;
  let score = -1;
  for (const combination of framework.combinations) {
    const shared = combination.entrypoints.filter((id) => sought.has(id)).length;
    if (shared > score) {
      best = combination;
      score = shared;
    }
  }
  return best;
}

/**
 * The combination whose entrypoints `answer` names, and only that
 * one. Order-insensitive: a checkbox group reports clicks, not menu
 * order.
 */
function exactCombination(framework, answer) {
  const sought = [...decodeSelection(answer)].sort().join(',');
  return (
    framework.combinations.find(
      (combination) => [...combination.entrypoints].sort().join(',') === sought,
    ) ?? null
  );
}
