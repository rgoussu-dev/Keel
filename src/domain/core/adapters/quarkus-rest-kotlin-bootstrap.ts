/**
 * `walking-skeleton/quarkus-rest-kotlin-bootstrap` adapter — the Kotlin
 * sibling of the Quarkus REST bootstrap: the same runnable
 * multi-module Quarkus REST service shape, emitted as idiomatic
 * Kotlin over the shared Kotlin domain trisection.
 *
 * One of the JVM bootstrap family built by {@link jvmBootstrapAdapter};
 * the resolver picks it on
 * `framework.quarkus + arch.server-http + lang.kotlin`.
 */

import { jvmBootstrapAdapter } from './jvm-bootstrap.js';

export const QUARKUS_REST_KOTLIN_BOOTSTRAP_ID = 'walking-skeleton/quarkus-rest-kotlin-bootstrap';

export const quarkusRestKotlinBootstrapAdapter = jvmBootstrapAdapter({
  id: QUARKUS_REST_KOTLIN_BOOTSTRAP_ID,
  framework: 'quarkus',
  arch: 'rest',
  language: 'kotlin',
  templateDir: 'quarkus-rest-kotlin-bootstrap',
});
