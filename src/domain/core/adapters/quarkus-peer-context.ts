/**
 * The Quarkus peer-context adapters — `walking-skeleton/quarkus-peer-context`
 * and its Kotlin twin.
 *
 * Quarkus binds guestbook's `Welcome` port with a CDI `@Produces`
 * method on the assembly's existing `MediatorProducer`, and marks
 * `guestbook/domain/core` a bean archive so ArC discovers the
 * `@DomainHandler`-stereotyped handler inside it — the same
 * `beans.xml` the greeting module already carries.
 *
 * See [`jvm-peer-context.ts`](./jvm-peer-context.ts) for what the peer
 * context is and what it proves; this file is only how Quarkus wires
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
import { QUARKUS_CLI_BOOTSTRAP_ID } from './quarkus-cli-bootstrap.js';
import { QUARKUS_CLI_KOTLIN_BOOTSTRAP_ID } from './quarkus-cli-kotlin-bootstrap.js';
import { QUARKUS_REST_BOOTSTRAP_ID } from './quarkus-rest-bootstrap.js';
import { QUARKUS_REST_KOTLIN_BOOTSTRAP_ID } from './quarkus-rest-kotlin-bootstrap.js';
import type { Adapter, ContributionPatch } from '../../contract/composition.js';

export const QUARKUS_PEER_CONTEXT_ID = 'walking-skeleton/quarkus-peer-context';
export const QUARKUS_PEER_CONTEXT_KOTLIN_ID = 'walking-skeleton/quarkus-peer-context-kotlin';

/** The bean-archive marker for `guestbook/domain/core`, Quarkus-only. */
const BEAN_ARCHIVE_TREE = 'quarkus';

const JAVA_PRODUCER_DOC = `    /**
     * Binds guestbook's {@link Welcome} port to the greeting module.
     * This is the carve-out seam: swapping {@link GreetingWelcome}
     * for an HTTP twin built on greeting's published API moves that
     * module into its own service, and nothing above this line
     * changes.
     *
     * <p>The peer is injected as {@link Instance} and handed over as
     * a supplier, not resolved here. The mediator is built by
     * materialising every handler, so resolving the greeting service
     * at this point would close a construction cycle — mediator →
     * SignHandler → Welcome → GreetingService → mediator — and the
     * container would recurse until the stack ran out. Deferring the
     * lookup to the first call breaks it.
     */`;

const KOTLIN_PRODUCER_DOC = `    /**
     * Binds guestbook's [Welcome] port to the greeting module. This is
     * the carve-out seam: swapping [GreetingWelcome] for an HTTP twin
     * built on greeting's published API moves that module into its own
     * service, and nothing above this line changes.
     *
     * The peer is injected as [Instance] and handed over as a
     * supplier, not resolved here. The mediator is built by
     * materialising every handler, so resolving the greeting service
     * at this point would close a construction cycle — mediator →
     * SignHandler → Welcome → GreetingService → mediator — and the
     * container would recurse until the stack ran out. Deferring the
     * lookup to the first call breaks it.
     */`;

function javaBinding(binding: PeerBinding): readonly ContributionPatch[] {
  const names = peerNames(binding.basePackage);
  const anchorImport = `import ${names.serviceAdapter};`;
  const imports = [anchorImport, `import ${names.welcome};`, `import ${names.gateway};`].join('\n');
  const producer = `${JAVA_PRODUCER_DOC}
    @Produces
    @Singleton
    public Welcome welcome(Instance<GreetingService> greeting) {
        return new GreetingWelcome(greeting::get);
    }`;
  return [
    {
      target: binding.sourceFile('MediatorProducer'),
      apply: (existing) => {
        if (existing.includes('GreetingWelcome')) return existing;
        if (!existing.includes(anchorImport)) {
          throw new Error(
            `${QUARKUS_PEER_CONTEXT_ID}: could not find the GreetingServiceAdapter import in the composition root`,
          );
        }
        const withImports = existing.replace(anchorImport, imports);
        const withDoc = withImports.replace(STALE_SERVICE_DOC, freshServiceDoc('java'));
        return appendToClassBody(withDoc, producer);
      },
    },
  ];
}

function kotlinBinding(binding: PeerBinding): readonly ContributionPatch[] {
  const names = peerNames(binding.basePackage);
  const anchorImport = `import ${names.serviceAdapter}`;
  const imports = [anchorImport, `import ${names.welcome}`, `import ${names.gateway}`].join('\n');
  const producer = `${KOTLIN_PRODUCER_DOC}
    @Produces
    @Singleton
    fun welcome(greeting: Instance<GreetingService>): Welcome = GreetingWelcome { greeting.get() }`;
  return [
    {
      target: binding.sourceFile('MediatorProducer'),
      apply: (existing) => {
        if (existing.includes('GreetingWelcome')) return existing;
        if (!existing.includes(anchorImport)) {
          throw new Error(
            `${QUARKUS_PEER_CONTEXT_KOTLIN_ID}: could not find the GreetingServiceAdapter import in the composition root`,
          );
        }
        const withImports = existing.replace(anchorImport, imports);
        const withDoc = withImports.replace(STALE_SERVICE_DOC, freshServiceDoc('kotlin'));
        return appendToClassBody(withDoc, producer);
      },
    },
  ];
}

/** Quarkus + Java. */
export const quarkusPeerContextAdapter: Adapter = jvmPeerContextAdapter({
  id: QUARKUS_PEER_CONTEXT_ID,
  framework: 'quarkus',
  language: 'java',
  bootstrapIds: [QUARKUS_REST_BOOTSTRAP_ID, QUARKUS_CLI_BOOTSTRAP_ID],
  frameworkTemplates: [BEAN_ARCHIVE_TREE],
  bind: javaBinding,
});

/** Quarkus + Kotlin. */
export const quarkusPeerContextKotlinAdapter: Adapter = jvmPeerContextAdapter({
  id: QUARKUS_PEER_CONTEXT_KOTLIN_ID,
  framework: 'quarkus',
  language: 'kotlin',
  bootstrapIds: [QUARKUS_REST_KOTLIN_BOOTSTRAP_ID, QUARKUS_CLI_KOTLIN_BOOTSTRAP_ID],
  frameworkTemplates: [BEAN_ARCHIVE_TREE],
  bind: kotlinBinding,
});
