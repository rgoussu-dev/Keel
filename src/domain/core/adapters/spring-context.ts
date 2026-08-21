/**
 * The Spring added-context adapters — `bounded-context/spring-context`
 * and its Kotlin twin.
 *
 * One patch, and it is the one that fails silently if it is missed:
 * the new context's package joins the boot class's explicit
 * `@ComponentScan(basePackages = …)` list. Nothing scans the base
 * package wholesale — deliberately, so the domain carries no Spring
 * stereotype — and a context absent from that list is simply never
 * scanned. Its handler is never discovered, the mediator is short by
 * one, and the application starts perfectly. Only dispatching the
 * command reveals it, which is why every added context also emits a
 * wiring test that dispatches it.
 *
 * **The list has to grow, not be replaced.** The bootstrap writes it
 * on one line, `--with-peer-context` rewrites it into a multi-line
 * block, and each `keel add module` adds another entry to whichever
 * form it finds. The peer adapter's patch anchors on the exact
 * one-line rendering and could only ever fire once; this one parses
 * the list, appends, and re-emits it in a form it can parse again —
 * see `rewriteList` in [`jvm-context.ts`](./jvm-context.ts).
 *
 * The bindings themselves are not here: each context brings its own
 * `<Module>Wiring` `@Configuration` class from the template tree. See
 * [`jvm-context.ts`](./jvm-context.ts) for why.
 */

import type { JvmLanguage } from './jvm-bootstrap.js';
import {
  fenceClose,
  fenceOpen,
  jvmContextAdapter,
  rewriteList,
  FENCE_ON_TAIL,
  type JvmContextBinding,
} from './jvm-context.js';
import { SPRING_CLI_BOOTSTRAP_ID } from './spring-cli-bootstrap.js';
import { SPRING_CLI_KOTLIN_BOOTSTRAP_ID } from './spring-cli-kotlin-bootstrap.js';
import { SPRING_REST_BOOTSTRAP_ID } from './spring-rest-bootstrap.js';
import { SPRING_REST_KOTLIN_BOOTSTRAP_ID } from './spring-rest-kotlin-bootstrap.js';
import type { Adapter, ContributionPatch } from '../../contract/composition.js';

export const SPRING_CONTEXT_ID = 'bounded-context/spring-context';
export const SPRING_CONTEXT_KOTLIN_ID = 'bounded-context/spring-context-kotlin';

/** Spring's composition root. */
const ROOT_CLASS = 'MediatorConfig';

/**
 * The Spring class carrying `@SpringBootApplication` — `Application`
 * for the REST assembly, `Main` for the CLI one, which also
 * implements `CommandLineRunner`.
 */
const bootClass = (binding: JvmContextBinding): string =>
  binding.assemblyPkg.endsWith('cli') ? 'Main' : 'Application';

/** Why the list is explicit; carried inside the fence. */
export const SCAN_NOTE: readonly string[] = [
  'Every bounded context is named here, one by one. Nothing',
  'scans the base package wholesale, so a context missing',
  'from this list is never scanned: its handlers are never',
  'discovered, and the application starts perfectly without',
  'them.',
];

/** How each language spells an array inside an annotation. */
const BRACKETS: Readonly<Record<JvmLanguage, readonly [string, string]>> = {
  java: ['{', '}'],
  kotlin: ['[', ']'],
};

/** Where the annotation sits, and so how deep its members are indented. */
const INDENT: Readonly<Record<JvmLanguage, string>> = {
  java: ' '.repeat(8),
  kotlin: ' '.repeat(4),
};

/**
 * The `basePackages` list in whichever of its three renderings the
 * boot class currently carries: the bootstrap's one-liner, the
 * multi-line block `--with-peer-context` leaves behind, or the one
 * this adapter itself last wrote. Any leading `//` note is swallowed
 * so re-emitting it cannot stack up copies.
 */
function scanRegion(language: JvmLanguage): RegExp {
  const [open, close] = BRACKETS[language];
  return new RegExp(
    `^(?:[ \\t]*//[^\\n]*\\n)*[ \\t]*basePackages = \\${open}([\\s\\S]*?)\\${close},${FENCE_ON_TAIL}`,
    'm',
  );
}

/** Widens the boot class's explicit component scan to the new context. */
function componentScanPatch(
  id: string,
  language: JvmLanguage,
  binding: JvmContextBinding,
): ContributionPatch {
  const [open, close] = BRACKETS[language];
  const indent = INDENT[language];
  const entry = `"${binding.names.contextPkg}"`;
  // Java's array initialiser rejects a trailing comma after the last
  // element inside an annotation; Kotlin's accepts one, and the
  // bootstrap's own Kotlin rendering carries it.
  const comma = (last: boolean): string => (last && language === 'java' ? '' : ',');
  const render = (entries: readonly string[]): string =>
    [
      ...fenceOpen(indent, SCAN_NOTE),
      `${indent}basePackages = ${open}`,
      ...entries.map((e, i) => `${indent}    ${e}${comma(i === entries.length - 1)}`),
      `${indent}${close},`,
      fenceClose(indent),
    ].join('\n');
  return {
    target: binding.sourceFile(bootClass(binding)),
    apply: (existing) => {
      const widened = rewriteList(existing, scanRegion(language), entry, render);
      if (widened === null) {
        throw new Error(
          `${id}: could not find the @ComponentScan basePackages list in ${bootClass(binding)} — add ${entry} manually or ${binding.names.Module}Handler is never discovered`,
        );
      }
      return widened;
    },
  };
}

const springContext = (
  id: string,
  language: JvmLanguage,
  bootstrapIds: readonly string[],
): Adapter =>
  jvmContextAdapter({
    id,
    framework: 'spring',
    language,
    bootstrapIds,
    rootClass: ROOT_CLASS,
    bind: (binding) => [componentScanPatch(id, language, binding)],
  });

/** Spring Boot + Java. */
export const springContextAdapter: Adapter = springContext(SPRING_CONTEXT_ID, 'java', [
  SPRING_REST_BOOTSTRAP_ID,
  SPRING_CLI_BOOTSTRAP_ID,
]);

/** Spring Boot + Kotlin. */
export const springContextKotlinAdapter: Adapter = springContext(
  SPRING_CONTEXT_KOTLIN_ID,
  'kotlin',
  [SPRING_REST_KOTLIN_BOOTSTRAP_ID, SPRING_CLI_KOTLIN_BOOTSTRAP_ID],
);
