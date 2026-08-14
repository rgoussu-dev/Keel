/**
 * The Spring peer-context adapters — `walking-skeleton/spring-peer-context`
 * and its Kotlin twin.
 *
 * Spring needs **two** edits, and the second is the one that fails
 * silently if it is forgotten:
 *
 * 1. An `@Bean` method on `MediatorConfig` binding `Welcome` to the
 *    gateway. The peer arrives as an `ObjectProvider`, Spring's
 *    deferred handle: the mediator bean is built from a
 *    `List<Handler<?, ?>>`, so resolving `GreetingService` while
 *    producing `Welcome` closes the cycle mediator → SignHandler →
 *    Welcome → GreetingService → mediator, which Spring rejects as a
 *    circular reference.
 * 2. The new context's package added to the assembly's explicit
 *    `@ComponentScan(basePackages = …)` list. That list names every
 *    context one by one — nothing scans the base package wholesale,
 *    deliberately, so the domain keeps no Spring stereotype — and a
 *    context missing from it is simply never scanned. `SignHandler`
 *    is then never discovered, the handler list is short by one, and
 *    the application starts perfectly. Only dispatching a
 *    `SignCommand` reveals it.
 *
 * See [`jvm-peer-context.ts`](./jvm-peer-context.ts) for what the peer
 * context is and what it proves; this file is only how Spring wires
 * it.
 */

import {
  appendToClassBody,
  freshServiceDoc,
  jvmPeerContextAdapter,
  peerNames,
  STALE_SERVICE_DOC,
  type PeerBinding,
} from './jvm-peer-context.js';
import { PEER_MODULE, SKELETON_MODULE } from './module-layout.js';
import { SPRING_CLI_BOOTSTRAP_ID } from './spring-cli-bootstrap.js';
import { SPRING_CLI_KOTLIN_BOOTSTRAP_ID } from './spring-cli-kotlin-bootstrap.js';
import { SPRING_REST_BOOTSTRAP_ID } from './spring-rest-bootstrap.js';
import { SPRING_REST_KOTLIN_BOOTSTRAP_ID } from './spring-rest-kotlin-bootstrap.js';
import type { Adapter, ContributionPatch } from '../../contract/composition.js';

export const SPRING_PEER_CONTEXT_ID = 'walking-skeleton/spring-peer-context';
export const SPRING_PEER_CONTEXT_KOTLIN_ID = 'walking-skeleton/spring-peer-context-kotlin';

/**
 * The Spring class carrying `@SpringBootApplication` — `Application`
 * for the REST assembly, `Main` for the CLI one, which also
 * implements `CommandLineRunner`.
 */
const bootClass = (binding: PeerBinding): string =>
  binding.assemblyPkg.endsWith('cli') ? 'Main' : 'Application';

const SCAN_NOTE = [
  '        // Every bounded context is named here, one by one. Nothing',
  '        // scans the base package wholesale, so a context missing',
  '        // from this list is never scanned: its handlers are never',
  '        // discovered, and the application starts perfectly without',
  '        // them.',
];

const JAVA_BEAN_DOC = `    /**
     * Binds guestbook's {@link Welcome} port to the greeting module.
     * This is the carve-out seam: swapping {@link GreetingWelcome}
     * for an HTTP twin built on greeting's published API moves that
     * module into its own service, and nothing above this line
     * changes.
     *
     * <p>The peer is injected as an {@link ObjectProvider} and handed
     * over as a supplier, not resolved here. The mediator is built
     * from every discovered handler, so resolving the greeting
     * service at this point would close a construction cycle —
     * mediator → SignHandler → Welcome → GreetingService → mediator —
     * which Spring refuses as a circular reference. Deferring the
     * lookup to the first call breaks it.
     */`;

const KOTLIN_BEAN_DOC = `    /**
     * Binds guestbook's [Welcome] port to the greeting module. This is
     * the carve-out seam: swapping [GreetingWelcome] for an HTTP twin
     * built on greeting's published API moves that module into its own
     * service, and nothing above this line changes.
     *
     * The peer is injected as an [ObjectProvider] and handed over as a
     * supplier, not resolved here. The mediator is built from every
     * discovered handler, so resolving the greeting service at this
     * point would close a construction cycle — mediator → SignHandler
     * → Welcome → GreetingService → mediator — which Spring refuses as
     * a circular reference. Deferring the lookup to the first call
     * breaks it.
     */`;

/** Widens the boot class's explicit component scan to the peer context. */
function componentScanPatch(
  adapterId: string,
  binding: PeerBinding,
  language: 'java' | 'kotlin',
): ContributionPatch {
  const { basePackage, assemblyPkg } = binding;
  const contexts = [SKELETON_MODULE, PEER_MODULE].map((m) => `${basePackage}.${m}`);
  const anchor =
    language === 'java'
      ? `        basePackages = {"${basePackage}.${assemblyPkg}", "${basePackage}.${SKELETON_MODULE}"},`
      : `    basePackages = ["${basePackage}.${assemblyPkg}", "${basePackage}.${SKELETON_MODULE}"],`;
  const widened =
    language === 'java'
      ? [
          ...SCAN_NOTE,
          '        basePackages = {',
          `            "${basePackage}.${assemblyPkg}",`,
          ...contexts.map((c, i) => `            "${c}"${i === contexts.length - 1 ? '' : ','}`),
          '        },',
        ].join('\n')
      : [
          ...SCAN_NOTE.map((l) => l.slice(4)),
          '    basePackages = [',
          `        "${basePackage}.${assemblyPkg}",`,
          ...contexts.map((c) => `        "${c}",`),
          '    ],',
        ].join('\n');
  return {
    target: binding.sourceFile(bootClass(binding)),
    apply: (existing) => {
      if (existing.includes(`${basePackage}.${PEER_MODULE}"`)) return existing;
      if (!existing.includes(anchor)) {
        throw new Error(
          `${adapterId}: could not find the @ComponentScan basePackages list in ${bootClass(binding)} — add "${basePackage}.${PEER_MODULE}" manually or SignHandler is never discovered`,
        );
      }
      return existing.replace(anchor, widened);
    },
  };
}

function javaBinding(binding: PeerBinding): readonly ContributionPatch[] {
  const names = peerNames(binding.basePackage);
  const anchorImport = `import ${names.serviceAdapter};`;
  const imports = [anchorImport, `import ${names.welcome};`, `import ${names.gateway};`].join('\n');
  const providerAnchor = 'import org.springframework.context.annotation.Bean;';
  const bean = `${JAVA_BEAN_DOC}
    @Bean
    public Welcome welcome(ObjectProvider<GreetingService> greeting) {
        return new GreetingWelcome(greeting::getObject);
    }`;
  return [
    {
      target: binding.sourceFile('MediatorConfig'),
      apply: (existing) => {
        if (existing.includes('GreetingWelcome')) return existing;
        if (!existing.includes(anchorImport) || !existing.includes(providerAnchor)) {
          throw new Error(
            `${SPRING_PEER_CONTEXT_ID}: could not find the imports to anchor on in MediatorConfig`,
          );
        }
        const withImports = existing
          .replace(
            providerAnchor,
            `import org.springframework.beans.factory.ObjectProvider;\n${providerAnchor}`,
          )
          .replace(anchorImport, imports);
        const withDoc = withImports.replace(STALE_SERVICE_DOC, freshServiceDoc('java'));
        return appendToClassBody(withDoc, bean);
      },
    },
    componentScanPatch(SPRING_PEER_CONTEXT_ID, binding, 'java'),
  ];
}

function kotlinBinding(binding: PeerBinding): readonly ContributionPatch[] {
  const names = peerNames(binding.basePackage);
  const anchorImport = `import ${names.serviceAdapter}`;
  const imports = [anchorImport, `import ${names.welcome}`, `import ${names.gateway}`].join('\n');
  const providerAnchor = 'import org.springframework.context.annotation.Bean';
  const bean = `${KOTLIN_BEAN_DOC}
    @Bean
    fun welcome(greeting: ObjectProvider<GreetingService>): Welcome =
        GreetingWelcome { greeting.getObject() }`;
  return [
    {
      target: binding.sourceFile('MediatorConfig'),
      apply: (existing) => {
        if (existing.includes('GreetingWelcome')) return existing;
        if (!existing.includes(anchorImport) || !existing.includes(providerAnchor)) {
          throw new Error(
            `${SPRING_PEER_CONTEXT_KOTLIN_ID}: could not find the imports to anchor on in MediatorConfig`,
          );
        }
        const withImports = existing
          .replace(
            providerAnchor,
            `import org.springframework.beans.factory.ObjectProvider\n${providerAnchor}`,
          )
          .replace(anchorImport, imports);
        const withDoc = withImports.replace(STALE_SERVICE_DOC, freshServiceDoc('kotlin'));
        return appendToClassBody(withDoc, bean);
      },
    },
    componentScanPatch(SPRING_PEER_CONTEXT_KOTLIN_ID, binding, 'kotlin'),
  ];
}

/** Spring Boot + Java. */
export const springPeerContextAdapter: Adapter = jvmPeerContextAdapter({
  id: SPRING_PEER_CONTEXT_ID,
  framework: 'spring',
  language: 'java',
  bootstrapIds: [SPRING_REST_BOOTSTRAP_ID, SPRING_CLI_BOOTSTRAP_ID],
  bind: javaBinding,
});

/** Spring Boot + Kotlin. */
export const springPeerContextKotlinAdapter: Adapter = jvmPeerContextAdapter({
  id: SPRING_PEER_CONTEXT_KOTLIN_ID,
  framework: 'spring',
  language: 'kotlin',
  bootstrapIds: [SPRING_REST_KOTLIN_BOOTSTRAP_ID, SPRING_CLI_KOTLIN_BOOTSTRAP_ID],
  bind: kotlinBinding,
});
