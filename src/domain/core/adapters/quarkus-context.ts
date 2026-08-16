/**
 * The Quarkus added-context adapters —
 * `bounded-context/quarkus-context` and its Kotlin twin.
 *
 * Quarkus is the framework that needs **no list widened**. ArC
 * discovers `@DomainHandler` because the kernel declares it a CDI
 * stereotype, so a new context's handler is found the moment its
 * module is a bean archive — which is the one thing this adapter adds
 * beyond the shared machinery: the same empty `beans.xml` marker the
 * greeting and guestbook modules already carry.
 *
 * Everything a container has to be *told* lives in the context's own
 * `<Module>Wiring` class, emitted from the template tree rather than
 * patched into `MediatorProducer`. See
 * [`jvm-context.ts`](./jvm-context.ts) for why that is a new file per
 * context and not another producer method on the shared root.
 */

import { jvmContextAdapter } from './jvm-context.js';
import { QUARKUS_CLI_BOOTSTRAP_ID } from './quarkus-cli-bootstrap.js';
import { QUARKUS_CLI_KOTLIN_BOOTSTRAP_ID } from './quarkus-cli-kotlin-bootstrap.js';
import { QUARKUS_REST_BOOTSTRAP_ID } from './quarkus-rest-bootstrap.js';
import { QUARKUS_REST_KOTLIN_BOOTSTRAP_ID } from './quarkus-rest-kotlin-bootstrap.js';
import type { Adapter } from '../../contract/composition.js';

export const QUARKUS_CONTEXT_ID = 'bounded-context/quarkus-context';
export const QUARKUS_CONTEXT_KOTLIN_ID = 'bounded-context/quarkus-context-kotlin';

/** The bean-archive marker for `modules/<name>/domain/core`, Quarkus-only. */
const BEAN_ARCHIVE_TREE = 'quarkus';

/** Quarkus' composition root. */
const ROOT_CLASS = 'MediatorProducer';

/** Quarkus + Java. */
export const quarkusContextAdapter: Adapter = jvmContextAdapter({
  id: QUARKUS_CONTEXT_ID,
  framework: 'quarkus',
  language: 'java',
  bootstrapIds: [QUARKUS_REST_BOOTSTRAP_ID, QUARKUS_CLI_BOOTSTRAP_ID],
  rootClass: ROOT_CLASS,
  frameworkTemplates: [BEAN_ARCHIVE_TREE],
  bind: () => [],
});

/** Quarkus + Kotlin. */
export const quarkusContextKotlinAdapter: Adapter = jvmContextAdapter({
  id: QUARKUS_CONTEXT_KOTLIN_ID,
  framework: 'quarkus',
  language: 'kotlin',
  bootstrapIds: [QUARKUS_REST_KOTLIN_BOOTSTRAP_ID, QUARKUS_CLI_KOTLIN_BOOTSTRAP_ID],
  rootClass: ROOT_CLASS,
  frameworkTemplates: [BEAN_ARCHIVE_TREE],
  bind: () => [],
});
