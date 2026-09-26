/**
 * The two lists a Micronaut composition root keeps, read and widened:
 * Java's `@Import(packages = …)` on `MediatorFactory`, and Kotlin's
 * hand-wired `mediator(…)`, whose parameters and `listOf(…)` have to
 * grow together.
 *
 * Three adapters add to them. The peer context rewrites each once,
 * from the shape the bootstrap rendered, and always runs first, inside
 * `keel new`. `keel add module` adds one context per run, and
 * persistence the greeting log's package, or its two handlers and the
 * ports they take; those two arrive in either order, so both read the
 * list as it is — parse, add, re-emit in a form they can parse again
 * (the round-trip property in [`jvm-context.ts`](./jvm-context.ts)) —
 * rather than match the one rendering the walking skeleton emitted.
 *
 * What they read is a list, not Java or Kotlin: a comment inside one
 * would be split on its commas and re-emitted as code, and a mediator
 * with a block body would lose its `return`. So each reads only the
 * shapes it can write back as they were — a list with no comment in
 * it, an expression-bodied mediator — and is null on anything else,
 * which its callers refuse as a file in the way, untouched. What is
 * inside a string literal is the literal's, not the list's
 * (`codeOnly`): a handler taking `"https://…"` or `"a, b"` is read
 * and written back as it is.
 */

import { fenceClose, fenceOpen, rewriteList, FENCE_ON_TAIL } from './jvm-context.js';
import { codeOnly } from '../util.js';

/**
 * What a Java root lacks, as a `PathConflictError` names it, when
 * {@link widenImportPackages} cannot read its list.
 */
export const IMPORT_ANCHOR = "'@Import(packages = …)' list holding only package names";

/**
 * What a Kotlin root lacks, as a `PathConflictError` names it, when
 * {@link widenKotlinMediator} cannot read its mediator.
 */
export const MEDIATOR_ANCHOR =
  "'fun mediator(…): Mediator = RegistryMediator(listOf(…))' holding only parameters and handlers";

/**
 * A parameter {@link widenKotlinMediator} would add whose name the
 * mediator already gives another type — the `taken` of a
 * `PathConflictError`.
 */
export interface ParameterTaken {
  /** The name both want. */
  readonly taken: string;
}

/** Whether Java or Kotlin source holds a comment, which a list reader would take for code. */
const hasComment = (text: string): boolean => codeOnly(text).hasComment;

/** Why the `@Import` list is explicit; carried inside the fence. */
export const IMPORT_NOTE: readonly string[] = [
  'One entry per aggregate package, per context: @Import does',
  'not recurse into subpackages, so a package missing here',
  'yields no bean definition and its handler is never',
  'dispatched to.',
];

/**
 * The `packages` member of `@Import` in either of its renderings —
 * the bootstrap's single string, or the brace list left by
 * `--with-peer-context`, by persistence or by an earlier widening.
 * Any leading `//` note is swallowed so re-emitting it cannot stack up
 * copies.
 */
const IMPORT_REGION = new RegExp(
  `^(?:[ \\t]*\\/\\/[^\\n]*\\n)*[ \\t]*packages = (?:\\{([\\s\\S]*?)\\}|("[^"]*")),${FENCE_ON_TAIL}`,
  'm',
);

const IMPORT_INDENT = ' '.repeat(4);

const renderImportPackages = (entries: readonly string[]): string =>
  [
    ...fenceOpen(IMPORT_INDENT, IMPORT_NOTE),
    `${IMPORT_INDENT}packages = {`,
    ...entries.map((e, i) => `${IMPORT_INDENT}    ${e}${i === entries.length - 1 ? '' : ','}`),
    `${IMPORT_INDENT}},`,
    fenceClose(IMPORT_INDENT),
  ].join('\n');

/**
 * Adds `entry` — a quoted package name — to `@Import(packages = …)`,
 * re-emitting the list fenced, one entry a line. The source unchanged
 * when it is listed already; null when the file has no such list, or
 * one with a comment among its entries.
 */
export function widenImportPackages(source: string, entry: string): string | null {
  if (hasComment(IMPORT_REGION.exec(source)?.[1] ?? '')) return null;
  return rewriteList(source, IMPORT_REGION, entry, renderImportPackages);
}

/**
 * Index of the `)` closing the bracket opened at `open`, in source
 * {@link codeOnly} has blanked.
 *
 * A regex cannot do this: the shortest match of `listOf\((.*?)\)`
 * stops at the `)` inside `GreetHandler()`, and the longest one runs
 * past the end of the call. The list this reads is a list of
 * constructor calls, so nesting is the normal case rather than the
 * exotic one.
 */
function closeOf(source: string, open: number): number {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const c = source[i];
    if (c === '(') depth += 1;
    else if (c === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Adds handlers to the hand-wired Kotlin mediator: the parameters the
 * container injects, and the entries of the list it builds — each only
 * where it is not there already.
 *
 * Re-emits the whole factory method in a canonical multi-line form
 * rather than splicing into whatever shape it found. Both edits have
 * to agree — a parameter with no list entry compiles and dispatches
 * nothing — so making them together, from one parse, is the only way
 * they cannot drift. The emitted form is the one this same function
 * parses on the next run, which is what makes it repeatable; the
 * bootstrap's one-liner, the peer context's two-handler form and
 * persistence's are the other inputs it accepts. The source unchanged
 * when everything is there; null when the file has no
 * `fun mediator(…): Mediator =` whose body is a
 * `RegistryMediator(listOf(…))` and nothing else, or one with a
 * comment among its parameters or handlers — {@link MEDIATOR_ANCHOR}.
 *
 * A parameter counts as there by its name and type together. One whose
 * name the mediator already gives another type — a context named
 * `clock` beside persistence's `clock: Clock`, or `welcome` beside the
 * peer context's — is not added beside it: two parameters of one name
 * do not compile, and every entry naming it would be ambiguous. That
 * returns the name instead, a {@link ParameterTaken}, for the caller
 * to refuse the root over.
 */
export function widenKotlinMediator(
  source: string,
  params: readonly string[],
  elements: readonly string[],
): string | ParameterTaken | null {
  const { code } = codeOnly(source);
  const funAt = code.indexOf('fun mediator(');
  if (funAt === -1) return null;
  const paramsOpen = funAt + 'fun mediator'.length;
  const paramsClose = closeOf(code, paramsOpen);
  if (paramsClose === -1) return null;
  const registryAt = code.indexOf('RegistryMediator(', paramsClose);
  if (registryAt === -1) return null;
  const registryOpen = registryAt + 'RegistryMediator'.length;
  const registryClose = closeOf(code, registryOpen);
  const listAt = code.indexOf('listOf(', registryOpen);
  if (registryClose === -1 || listAt === -1) return null;
  const listClose = closeOf(code, listAt + 'listOf'.length);
  if (listClose === -1) return null;
  // The whole body is the one expression the re-emit writes back:
  // nothing of the user's between the pieces for it to drop.
  const alone =
    /^\s*:\s*Mediator\s*=\s*$/.test(source.slice(paramsClose + 1, registryAt)) &&
    source.slice(registryOpen + 1, listAt).trim() === '' &&
    /^[\s,]*$/.test(source.slice(listClose + 1, registryClose));
  const paramText = source.slice(paramsOpen + 1, paramsClose);
  const listText = source.slice(listAt + 'listOf'.length + 1, listClose);
  if (!alone || hasComment(paramText) || hasComment(listText)) return null;

  const present = splitEntries(paramText);
  const listed = splitEntries(listText);
  const newParams = params.filter((p) => !present.some((q) => bare(q) === bare(p)));
  const taken = newParams.find((p) => present.some((q) => nameOf(q) === nameOf(p)));
  if (taken !== undefined) return { taken: nameOf(taken) };
  const newElements = elements.filter((e) => !listed.includes(e));
  if (newParams.length === 0 && newElements.length === 0) return source;

  const rewritten = [
    'fun mediator(',
    ...[...present, ...newParams].map((p) => `        ${p},`),
    '    ): Mediator =',
    '        RegistryMediator(',
    '            listOf(',
    ...[...listed, ...newElements].map((e) => `                ${e},`),
    '            ),',
    '        )',
  ].join('\n');
  return `${source.slice(0, funAt)}${rewritten}${source.slice(registryClose + 1)}`;
}

/** A Kotlin parameter's name: `clock` in `clock: Clock`. */
const nameOf = (param: string): string => /(\w+)\s*:/.exec(param)?.[1] ?? param;

/** A parameter with its whitespace dropped, so `clock:Clock` is `clock: Clock`. */
const bare = (param: string): string => param.replace(/\s+/g, '');

/** Splits a Kotlin parameter or argument list on its top-level commas, a literal's aside. */
function splitEntries(list: string): readonly string[] {
  const { code } = codeOnly(list);
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < code.length; i += 1) {
    const c = code[i];
    if (c === '(' || c === '<') depth += 1;
    else if (c === ')' || c === '>') depth -= 1;
    else if (c === ',' && depth === 0) {
      out.push(list.slice(start, i));
      start = i + 1;
    }
  }
  out.push(list.slice(start));
  return out.map((item) => item.trim()).filter((item) => item.length > 0);
}
