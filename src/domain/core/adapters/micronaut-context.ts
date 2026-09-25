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
 * in [`jvm-context.ts`](./jvm-context.ts) — through
 * [`micronaut-root.ts`](./micronaut-root.ts), which persistence reads
 * the same lists through. A root without a list they can read is a
 * file in the way, refused naming what it lacks — as is a Kotlin
 * mediator that already has a parameter of the context's name, the
 * peer context's `welcome` or persistence's `clock`, refused naming
 * that.
 */

import type { JvmLanguage } from './jvm-bootstrap.js';
import { jvmContextAdapter, type JvmContextBinding } from './jvm-context.js';
import { MICRONAUT_CLI_BOOTSTRAP_ID } from './micronaut-cli-bootstrap.js';
import { MICRONAUT_CLI_KOTLIN_BOOTSTRAP_ID } from './micronaut-cli-kotlin-bootstrap.js';
import { MICRONAUT_REST_BOOTSTRAP_ID } from './micronaut-rest-bootstrap.js';
import { MICRONAUT_REST_KOTLIN_BOOTSTRAP_ID } from './micronaut-rest-kotlin-bootstrap.js';
import {
  IMPORT_ANCHOR,
  MEDIATOR_ANCHOR,
  widenImportPackages,
  widenKotlinMediator,
} from './micronaut-root.js';
import { beforeFirstImport } from '../util.js';
import { PathConflictError } from '../../contract/refusal.js';
import type { Adapter, ContributionPatch } from '../../contract/composition.js';

export const MICRONAUT_CONTEXT_ID = 'bounded-context/micronaut-context';
export const MICRONAUT_CONTEXT_KOTLIN_ID = 'bounded-context/micronaut-context-kotlin';

/** Micronaut's composition root, under both languages. */
const ROOT_CLASS = 'MediatorFactory';

/** Widens `@Import(packages = …)` to the new context's core package. */
function importPackagesPatch(binding: JvmContextBinding): ContributionPatch {
  const target = binding.sourceFile(ROOT_CLASS);
  return {
    target,
    apply: (existing) => {
      const widened = widenImportPackages(existing, `"${binding.names.corePkg}"`);
      if (widened === null) {
        throw new PathConflictError(target, MICRONAUT_CONTEXT_ID, IMPORT_ANCHOR);
      }
      return widened;
    },
  };
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
  const target = binding.sourceFile(ROOT_CLASS);
  return {
    target,
    apply: (existing) => {
      const imported = withProjectImport(existing, binding.basePackage, binding.names.handler);
      const widened = widenKotlinMediator(
        imported,
        [`${binding.added.name}: ${handler}`],
        [binding.added.name],
      );
      if (widened === null) {
        throw new PathConflictError(target, MICRONAUT_CONTEXT_KOTLIN_ID, MEDIATOR_ANCHOR);
      }
      if (typeof widened !== 'string') {
        throw new PathConflictError(target, MICRONAUT_CONTEXT_KOTLIN_ID, undefined, widened.taken);
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
