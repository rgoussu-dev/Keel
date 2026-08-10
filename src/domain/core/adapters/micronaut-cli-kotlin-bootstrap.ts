/**
 * `walking-skeleton/micronaut-cli-kotlin-bootstrap` adapter — the Kotlin
 * sibling of the Micronaut CLI bootstrap: the same runnable
 * multi-module Micronaut picocli CLI shape, emitted as idiomatic
 * Kotlin over the shared Kotlin domain trisection.
 *
 * One of the JVM bootstrap family built by {@link jvmBootstrapAdapter};
 * the resolver picks it on
 * `framework.micronaut + arch.cli + lang.kotlin`.
 */

import { jvmBootstrapAdapter } from './jvm-bootstrap.js';

export const MICRONAUT_CLI_KOTLIN_BOOTSTRAP_ID = 'walking-skeleton/micronaut-cli-kotlin-bootstrap';

export const micronautCliKotlinBootstrapAdapter = jvmBootstrapAdapter({
  id: MICRONAUT_CLI_KOTLIN_BOOTSTRAP_ID,
  framework: 'micronaut',
  arch: 'cli',
  language: 'kotlin',
  templateDir: 'micronaut-cli-kotlin-bootstrap',
});
