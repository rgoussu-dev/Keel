/**
 * The Micronaut peer-context adapters —
 * `walking-skeleton/micronaut-peer-context` and its Kotlin twin.
 *
 * The two languages diverge more here than under any other framework,
 * because their composition roots already do:
 *
 * - **Java** discovers handlers through `@Import(packages = …,
 *   annotated = @DomainHandler)`, the escape hatch that keeps
 *   Micronaut's annotation processor out of the domain's own build.
 *   `@Import` does **not** recurse into subpackages, so guestbook's
 *   core package has to join the list. Miss it and `SignHandler`
 *   yields no bean definition, the mediator is short one handler, and
 *   the application starts perfectly.
 * - **Kotlin** wires handlers by hand: `@Import` is documented as
 *   Java-only, and discovery would put Micronaut's KSP processor
 *   inside `domain/core`. `@DomainHandler` is documentation there, so
 *   `SignHandler` is added to the explicit list — the one bootstrap
 *   where a new handler is a visible edit rather than a discovered
 *   bean.
 *
 * Both bind the port through `BeanProvider`, Micronaut's deferred
 * handle, for the reason every framework needs one: the mediator is
 * built from every handler, so resolving the greeting service while
 * producing `Welcome` closes the cycle mediator → SignHandler →
 * Welcome → GreetingService → mediator.
 *
 * See [`jvm-peer-context.ts`](./jvm-peer-context.ts) for what the peer
 * context is and what it proves; this file is only how Micronaut wires
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
import { MICRONAUT_CLI_BOOTSTRAP_ID } from './micronaut-cli-bootstrap.js';
import { MICRONAUT_CLI_KOTLIN_BOOTSTRAP_ID } from './micronaut-cli-kotlin-bootstrap.js';
import { MICRONAUT_REST_BOOTSTRAP_ID } from './micronaut-rest-bootstrap.js';
import { MICRONAUT_REST_KOTLIN_BOOTSTRAP_ID } from './micronaut-rest-kotlin-bootstrap.js';
import { SKELETON_MODULE } from './module-layout.js';
import type { Adapter, ContributionPatch } from '../../contract/composition.js';

export const MICRONAUT_PEER_CONTEXT_ID = 'walking-skeleton/micronaut-peer-context';
export const MICRONAUT_PEER_CONTEXT_KOTLIN_ID = 'walking-skeleton/micronaut-peer-context-kotlin';

const JAVA_BEAN_DOC = `    /**
     * Binds guestbook's {@link Welcome} port to the greeting module.
     * This is the carve-out seam: swapping {@link GreetingWelcome}
     * for an HTTP twin built on greeting's published API moves that
     * module into its own service, and nothing above this line
     * changes.
     *
     * <p>The peer is injected as a {@link BeanProvider} and handed
     * over as a supplier, not resolved here. The mediator is built
     * from every discovered handler, so resolving the greeting
     * service at this point would close a construction cycle —
     * mediator → SignHandler → Welcome → GreetingService → mediator —
     * and the container would refuse it as a circular dependency.
     * Deferring the lookup to the first call breaks it.
     */`;

const KOTLIN_BEAN_DOC = `    /**
     * Binds guestbook's [Welcome] port to the greeting module. This is
     * the carve-out seam: swapping [GreetingWelcome] for an HTTP twin
     * built on greeting's published API moves that module into its own
     * service, and nothing above this line changes.
     *
     * The peer is injected as a [BeanProvider] and handed over as a
     * supplier, not resolved here. The mediator is built from every
     * handler, so resolving the greeting service at this point would
     * close a construction cycle — mediator → SignHandler → Welcome →
     * GreetingService → mediator — and the container would refuse it
     * as a circular dependency. Deferring the lookup to the first call
     * breaks it.
     */`;

/**
 * Widens `@Import(packages = …)` to guestbook's core package. The
 * single-string form becomes an array, which is how it will keep
 * growing: one entry per aggregate package, per context.
 */
function importPackagesPatch(binding: PeerBinding): ContributionPatch {
  const { basePackage } = binding;
  const names = peerNames(basePackage);
  const greetingPkg = `${basePackage}.${SKELETON_MODULE}.domain.core.greet`;
  const anchor = `    packages = "${greetingPkg}",`;
  const widened = [
    '    // One entry per aggregate package, per context: @Import does',
    '    // not recurse into subpackages, so a package missing here',
    '    // yields no bean definition and its handler is never',
    '    // dispatched to.',
    '    packages = {',
    `        "${greetingPkg}",`,
    `        "${names.handlerPkg}"`,
    '    },',
  ].join('\n');
  return {
    target: binding.sourceFile('MediatorFactory'),
    apply: (existing) => {
      if (existing.includes(names.handlerPkg)) return existing;
      if (!existing.includes(anchor)) {
        throw new Error(
          `${MICRONAUT_PEER_CONTEXT_ID}: could not find the @Import packages entry in MediatorFactory — add "${names.handlerPkg}" manually or SignHandler is never discovered`,
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
  const providerAnchor = 'import io.micronaut.context.annotation.Factory;';
  const bean = `${JAVA_BEAN_DOC}
    @Singleton
    public Welcome welcome(BeanProvider<GreetingService> greeting) {
        return new GreetingWelcome(greeting::get);
    }`;
  return [
    {
      target: binding.sourceFile('MediatorFactory'),
      apply: (existing) => {
        if (existing.includes('GreetingWelcome')) return existing;
        if (!existing.includes(anchorImport) || !existing.includes(providerAnchor)) {
          throw new Error(
            `${MICRONAUT_PEER_CONTEXT_ID}: could not find the imports to anchor on in MediatorFactory`,
          );
        }
        const withImports = existing
          .replace(providerAnchor, `import io.micronaut.context.BeanProvider;\n${providerAnchor}`)
          .replace(anchorImport, imports);
        const withDoc = withImports.replace(STALE_SERVICE_DOC, freshServiceDoc('java'));
        return appendToClassBody(withDoc, bean);
      },
    },
    importPackagesPatch(binding),
  ];
}

function kotlinBinding(binding: PeerBinding): readonly ContributionPatch[] {
  const names = peerNames(binding.basePackage);
  const anchorImport = `import ${names.serviceAdapter}`;
  const imports = [
    anchorImport,
    `import ${names.handler}`,
    `import ${names.welcome}`,
    `import ${names.gateway}`,
  ].join('\n');
  const providerAnchor = 'import io.micronaut.context.annotation.Factory';
  // The explicit list is the whole point of this bootstrap, so the
  // new handler is added to it by hand — there is no discovery to
  // widen. It takes the port, which the producer below binds.
  const staleWiring = '    fun mediator(): Mediator = RegistryMediator(listOf(GreetHandler()))';
  const freshWiring = [
    '    fun mediator(welcome: Welcome): Mediator =',
    '        RegistryMediator(listOf(GreetHandler(), SignHandler(welcome)))',
  ].join('\n');
  const bean = `${KOTLIN_BEAN_DOC}
    @Singleton
    fun welcome(greeting: BeanProvider<GreetingService>): Welcome =
        GreetingWelcome { greeting.get() }`;
  return [
    {
      target: binding.sourceFile('MediatorFactory'),
      apply: (existing) => {
        if (existing.includes('GreetingWelcome')) return existing;
        if (!existing.includes(anchorImport) || !existing.includes(providerAnchor)) {
          throw new Error(
            `${MICRONAUT_PEER_CONTEXT_KOTLIN_ID}: could not find the imports to anchor on in MediatorFactory`,
          );
        }
        if (!existing.includes(staleWiring)) {
          throw new Error(
            `${MICRONAUT_PEER_CONTEXT_KOTLIN_ID}: could not find the explicit handler list in MediatorFactory — add SignHandler manually or it is never dispatched to`,
          );
        }
        const withImports = existing
          .replace(providerAnchor, `import io.micronaut.context.BeanProvider\n${providerAnchor}`)
          .replace(anchorImport, imports);
        const withDoc = withImports.replace(STALE_SERVICE_DOC, freshServiceDoc('kotlin'));
        const wired = withDoc.replace(staleWiring, freshWiring);
        return appendToClassBody(wired, bean);
      },
    },
  ];
}

/** Micronaut + Java. */
export const micronautPeerContextAdapter: Adapter = jvmPeerContextAdapter({
  id: MICRONAUT_PEER_CONTEXT_ID,
  framework: 'micronaut',
  language: 'java',
  bootstrapIds: [MICRONAUT_REST_BOOTSTRAP_ID, MICRONAUT_CLI_BOOTSTRAP_ID],
  bind: javaBinding,
});

/** Micronaut + Kotlin. */
export const micronautPeerContextKotlinAdapter: Adapter = jvmPeerContextAdapter({
  id: MICRONAUT_PEER_CONTEXT_KOTLIN_ID,
  framework: 'micronaut',
  language: 'kotlin',
  bootstrapIds: [MICRONAUT_REST_KOTLIN_BOOTSTRAP_ID, MICRONAUT_CLI_KOTLIN_BOOTSTRAP_ID],
  bind: kotlinBinding,
});
