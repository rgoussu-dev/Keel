/**
 * `walking-skeleton/micronaut-rest-kotlin-bootstrap` adapter — the Kotlin
 * sibling of the Micronaut REST bootstrap: the same runnable
 * multi-module Micronaut REST service shape, emitted as idiomatic
 * Kotlin over the shared Kotlin domain trisection.
 *
 * One of the JVM bootstrap family built by {@link jvmBootstrapAdapter};
 * the resolver picks it on
 * `framework.micronaut + arch.server-http + lang.kotlin`.
 */

import { jvmBootstrapAdapter } from './jvm-bootstrap.js';

export const MICRONAUT_REST_KOTLIN_BOOTSTRAP_ID =
  'walking-skeleton/micronaut-rest-kotlin-bootstrap';

export const micronautRestKotlinBootstrapAdapter = jvmBootstrapAdapter({
  id: MICRONAUT_REST_KOTLIN_BOOTSTRAP_ID,
  framework: 'micronaut',
  arch: 'rest',
  language: 'kotlin',
  templateDir: 'micronaut-rest-kotlin-bootstrap',
});
