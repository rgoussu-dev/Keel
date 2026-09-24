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
 * @typedef {{ id: string, label: string, doc: string, runtime: string | null, frameworks: ReadonlyArray<FrameworkNode> }} LanguageNode
 * @typedef {{ id: string, label: string, doc: string, languages: ReadonlyArray<LanguageNode> }} ShapeNode
 * @typedef {{ shapes: ReadonlyArray<ShapeNode>, defaultStack: string }} Finder
 * @typedef {{ shape: ShapeNode, language: LanguageNode, framework: FrameworkNode, combination: Combination }} Located
 * @typedef {{ shape: ShapeNode, from: LanguageNode, to: LanguageNode }} Jump
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
 * Where it does not offer the language, the move lands on its nearest
 * kin rather than on whichever language sorts first — see
 * {@link languageIn} — and {@link languageJump} is how the page finds
 * out, so it can say so.
 *
 * @param {Finder} finder
 * @param {string} shapeId
 * @param {Located | null} from
 * @returns {string | null}
 */
export function pickShape(finder, shapeId, from) {
  const shape = (finder?.shapes ?? []).find((node) => node.id === shapeId);
  return shape ? descend(finder, shape, from) : null;
}

/**
 * The language a move from one preset to another changed without
 * being asked to, or null when it changed none.
 *
 * A jump is a move onto another shape that does not offer the old
 * language at all — Kotlin moving to fullstack, where no product is
 * written in Kotlin. The language could not come along then, whichever
 * control made the move, and the one thing worse than landing on Java
 * is landing there without a word. A move within a shape never jumps:
 * a language changed there is a language someone picked.
 *
 * @param {Finder} finder
 * @param {string | undefined} fromStack
 * @param {string | undefined} toStack
 * @returns {Jump | null}
 */
export function languageJump(finder, fromStack, toStack) {
  const from = fromStack ? locate(finder, fromStack) : null;
  const to = toStack ? locate(finder, toStack) : null;
  if (!from || !to || from.shape.id === to.shape.id) return null;
  if (to.shape.languages.some((node) => node.id === from.language.id)) return null;
  return { shape: to.shape, from: from.language, to: to.language };
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

/**
 * Walks a shape down to a leaf, preferring `from`'s choices at each
 * level and the default preset's where `from`'s are not there.
 */
function descend(finder, shape, from) {
  const home = locate(finder, defaultStack(finder) ?? '');
  const language = languageIn(shape, from, home);
  return language ? resolve(language, from, home) : null;
}

/**
 * The language a move onto `shape` lands on: `from`'s own where the
 * shape offers it, and otherwise the nearest kin it does —
 *
 *   1. one with `from`'s framework, so Kotlin on Spring moving to
 *      fullstack lands on Java on Spring, where `fullstack-spring` is.
 *      "No framework" is not a framework: two languages sharing only
 *      the absence of one are not kin;
 *   2. then one on `from`'s runtime;
 *   3. then the default preset's, so a front end moving to the
 *      backend shape lands where a blank form opens.
 *
 * The shape's first language is the last resort, reached only where
 * the shape shares nothing with where the move came from nor with the
 * default — the frontend shape today, whose one language is the
 * browser's. It used to be the only resort, and languages sort by
 * label, which put a Kotlin backend moving to fullstack on Go.
 */
function languageIn(shape, from, home) {
  const framework = from?.framework.id ?? '';
  const runtime = from?.language.runtime ?? null;
  const offered = (test) => shape.languages.find(test);
  return (
    offered((node) => node.id === from?.language.id) ??
    offered((node) => framework !== '' && node.frameworks.some((f) => f.id === framework)) ??
    offered((node) => runtime !== null && node.runtime === runtime) ??
    offered((node) => node.id === home?.language.id) ??
    shape.languages[0]
  );
}

/**
 * Walks a language down to a leaf, preferring `from`'s framework, then
 * `home`'s — the default preset's, when a shape move passes one — then
 * the first.
 */
function resolve(language, from, home = null) {
  const framework =
    language.frameworks.find((node) => node.id === from?.framework.id) ??
    language.frameworks.find((node) => node.id === home?.framework.id) ??
    language.frameworks[0];
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
