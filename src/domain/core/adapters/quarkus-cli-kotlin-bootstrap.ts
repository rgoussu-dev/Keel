/**
 * `walking-skeleton/quarkus-cli-kotlin-bootstrap` adapter — the Kotlin
 * sibling of the Quarkus CLI bootstrap: the same runnable
 * multi-module Quarkus picocli CLI shape, emitted as idiomatic
 * Kotlin over the shared Kotlin domain trisection.
 *
 * One of the JVM bootstrap family built by {@link jvmBootstrapAdapter};
 * the resolver picks it on
 * `framework.quarkus + arch.cli + lang.kotlin`.
 */

import { jvmBootstrapAdapter } from './jvm-bootstrap.js';

export const QUARKUS_CLI_KOTLIN_BOOTSTRAP_ID = 'walking-skeleton/quarkus-cli-kotlin-bootstrap';

export const quarkusCliKotlinBootstrapAdapter = jvmBootstrapAdapter({
  id: QUARKUS_CLI_KOTLIN_BOOTSTRAP_ID,
  framework: 'quarkus',
  arch: 'cli',
  language: 'kotlin',
  templateDir: 'quarkus-cli-kotlin-bootstrap',
});
