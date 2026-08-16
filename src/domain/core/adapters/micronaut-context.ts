/**
 * The Micronaut added-context adapters —
 * `bounded-context/micronaut-context` and its Kotlin twin.
 *
 * The two languages diverge here more than under any other framework,
 * because their composition roots already do — and in both cases the
 * thing that has to change is a list, which is the whole reason this
 * family cannot reuse the peer context's patches.
 *
 * - **Java** discovers handlers through `@Import(packages = …,
 *   annotated = @DomainHandler)`, the escape hatch that keeps
 *   Micronaut's annotation processor out of the domain's own build.
 *   `@Import` does not recurse into subpackages, so each context's
 *   core package has to join the list. Miss it and `<Name>Handler`
 *   yields no bean definition, the mediator is short one handler, and
 *   the application starts perfectly.
 * - **Kotlin** wires handlers by hand: `@Import` is documented as
 *   Java-only, and discovery would put Micronaut's KSP processor
 *   inside `domain/core`. So the new handler joins `mediator`'s
 *   explicit `listOf(…)`, and arrives as a parameter the container
 *   injects — produced, with whatever driven port it needs, by the
 *   context's own `<Module>Wiring` factory.
 *
 * **Injecting the handler rather than its port is what keeps the
 * Kotlin patch safe to repeat.** `mediator` could take the driven port
 * and construct the handler inline, as it does for guestbook's
 * `Welcome`; but two contexts consuming the same third context both
 * declare a `<Consumes>Client`, and one import block cannot name two
 * types of that simple name. `<Name>Handler` is unique by
 * construction, because context names are.
 *
 * Both list edits parse what is there, add to it, and re-emit
 * something they can parse again — the round-trip property described
 * in [`jvm-context.ts`](./jvm-context.ts).
 */

import type { JvmLanguage } from './jvm-bootstrap.js';
import { jvmContextAdapter, rewriteList, type JvmContextBinding } from './jvm-context.js';
import { MICRONAUT_CLI_BOOTSTRAP_ID } from './micronaut-cli-bootstrap.js';
import { MICRONAUT_CLI_KOTLIN_BOOTSTRAP_ID } from './micronaut-cli-kotlin-bootstrap.js';
import { MICRONAUT_REST_BOOTSTRAP_ID } from './micronaut-rest-bootstrap.js';
import { MICRONAUT_REST_KOTLIN_BOOTSTRAP_ID } from './micronaut-rest-kotlin-bootstrap.js';
import { beforeFirstImport } from '../util.js';
import type { Adapter, ContributionPatch } from '../../contract/composition.js';

export const MICRONAUT_CONTEXT_ID = 'bounded-context/micronaut-context';
export const MICRONAUT_CONTEXT_KOTLIN_ID = 'bounded-context/micronaut-context-kotlin';

/** Micronaut's composition root, under both languages. */
const ROOT_CLASS = 'MediatorFactory';

const IMPORT_NOTE = [
  'One entry per aggregate package, per context: @Import does',
  'not recurse into subpackages, so a package missing here',
  'yields no bean definition and its handler is never',
  'dispatched to.',
];

/**
 * The `packages` member of `@Import` in either of its renderings —
 * the bootstrap's single string, or the brace list left by
 * `--with-peer-context` or by this adapter's own previous run. Any
 * leading `//` note is swallowed so re-emitting it cannot stack up
 * copies.
 */
const IMPORT_REGION = /^(?:[ \t]*\/\/[^\n]*\n)*[ \t]*packages = (?:\{([\s\S]*?)\}|("[^"]*")),/m;

/** Widens `@Import(packages = …)` to the new context's core package. */
function importPackagesPatch(binding: JvmContextBinding): ContributionPatch {
  const indent = ' '.repeat(4);
  const entry = `"${binding.names.corePkg}"`;
  const render = (entries: readonly string[]): string =>
    [
      ...IMPORT_NOTE.map((line) => `${indent}// ${line}`),
      `${indent}packages = {`,
      ...entries.map((e, i) => `${indent}    ${e}${i === entries.length - 1 ? '' : ','}`),
      `${indent}},`,
    ].join('\n');
  return {
    target: binding.sourceFile(ROOT_CLASS),
    apply: (existing) => {
      const widened = rewriteList(existing, IMPORT_REGION, entry, render);
      if (widened === null) {
        throw new Error(
          `${MICRONAUT_CONTEXT_ID}: could not find the @Import packages entry in ${ROOT_CLASS} — add ${entry} manually or ${binding.names.Module}Handler is never discovered`,
        );
      }
      return widened;
    },
  };
}

/**
 * Index of the `)` closing the bracket opened at `open`.
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
 * Adds one handler to the hand-wired Kotlin mediator: a parameter the
 * container injects, and an entry in the list it builds.
 *
 * Re-emits the whole factory method in a canonical multi-line form
 * rather than splicing into whatever shape it found. Both edits have
 * to agree — a parameter with no list entry compiles and dispatches
 * nothing — so making them together, from one parse, is the only way
 * they cannot drift. The emitted form is the one this same function
 * parses on the next `keel add module`, which is what makes it
 * repeatable; the bootstrap's one-liner and the peer context's
 * two-handler form are the other two inputs it accepts.
 */
function widenKotlinMediator(source: string, param: string, element: string): string | null {
  const funAt = source.indexOf('fun mediator(');
  if (funAt === -1) return null;
  const paramsOpen = funAt + 'fun mediator'.length;
  const paramsClose = closeOf(source, paramsOpen);
  if (paramsClose === -1) return null;
  const registryAt = source.indexOf('RegistryMediator(', paramsClose);
  if (registryAt === -1) return null;
  const registryClose = closeOf(source, registryAt + 'RegistryMediator'.length);
  const listAt = source.indexOf('listOf(', registryAt);
  if (registryClose === -1 || listAt === -1 || listAt > registryClose) return null;
  const listClose = closeOf(source, listAt + 'listOf'.length);
  if (listClose === -1) return null;

  const params = splitEntries(source.slice(paramsOpen + 1, paramsClose));
  const elements = splitEntries(source.slice(listAt + 'listOf'.length + 1, listClose));
  if (params.includes(param)) return source;

  const rewritten = [
    'fun mediator(',
    ...[...params, param].map((p) => `        ${p},`),
    '    ): Mediator =',
    '        RegistryMediator(',
    '            listOf(',
    ...[...elements, element].map((e) => `                ${e},`),
    '            ),',
    '        )',
  ].join('\n');
  return `${source.slice(0, funAt)}${rewritten}${source.slice(registryClose + 1)}`;
}

/** Splits a Kotlin parameter or argument list on its top-level commas. */
function splitEntries(list: string): readonly string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < list.length; i += 1) {
    const c = list[i];
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

/**
 * Adds an import to the composition root's block of *project*
 * imports, keeping it sorted.
 *
 * The block is found by base package rather than by position: the
 * framework's own imports sit above it, separated by a blank line,
 * and dropping `com.example.ordering.…` in among `io.micronaut.…`
 * compiles perfectly and reads like a mistake. Re-sorting the block
 * it just added to is what keeps a project with four contexts looking
 * like a project someone wrote.
 */
function withProjectImport(source: string, basePackage: string, fqn: string): string {
  const line = `import ${fqn}`;
  if (source.includes(`${line}\n`)) return source;
  const escaped = basePackage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const found = new RegExp(`(?:^import ${escaped}\\..*\\n)+`, 'm').exec(source);
  if (found === null) return beforeFirstImport(source, line);
  const block = found[0];
  const lines = [...block.trimEnd().split('\n'), line].sort();
  return source.replace(block, `${lines.join('\n')}\n`);
}

/** Adds the new context's handler to the Kotlin composition root. */
function mediatorListPatch(binding: JvmContextBinding): ContributionPatch {
  const handler = `${binding.names.Module}Handler`;
  return {
    target: binding.sourceFile(ROOT_CLASS),
    apply: (existing) => {
      const imported = withProjectImport(existing, binding.basePackage, binding.names.handler);
      const widened = widenKotlinMediator(
        imported,
        `${binding.added.name}: ${handler}`,
        binding.added.name,
      );
      if (widened === null) {
        throw new Error(
          `${MICRONAUT_CONTEXT_KOTLIN_ID}: could not find the explicit handler list in ${ROOT_CLASS} — add ${handler} manually or it is never dispatched to`,
        );
      }
      return widened;
    },
  };
}

const micronautContext = (
  id: string,
  language: JvmLanguage,
  bootstrapIds: readonly string[],
  bind: (binding: JvmContextBinding) => readonly ContributionPatch[],
): Adapter =>
  jvmContextAdapter({
    id,
    framework: 'micronaut',
    language,
    bootstrapIds,
    rootClass: ROOT_CLASS,
    bind,
  });

/** Micronaut + Java. */
export const micronautContextAdapter: Adapter = micronautContext(
  MICRONAUT_CONTEXT_ID,
  'java',
  [MICRONAUT_REST_BOOTSTRAP_ID, MICRONAUT_CLI_BOOTSTRAP_ID],
  (binding) => [importPackagesPatch(binding)],
);

/** Micronaut + Kotlin. */
export const micronautContextKotlinAdapter: Adapter = micronautContext(
  MICRONAUT_CONTEXT_KOTLIN_ID,
  'kotlin',
  [MICRONAUT_REST_KOTLIN_BOOTSTRAP_ID, MICRONAUT_CLI_KOTLIN_BOOTSTRAP_ID],
  (binding) => [mediatorListPatch(binding)],
);
