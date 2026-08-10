/**
 * `walking-skeleton/spring-cli-kotlin-bootstrap` adapter — the Kotlin
 * sibling of the Spring Boot CLI bootstrap: the same runnable
 * multi-module Spring Boot picocli CLI shape, emitted as idiomatic
 * Kotlin over the shared Kotlin domain trisection.
 *
 * One of the JVM bootstrap family built by {@link jvmBootstrapAdapter};
 * the resolver picks it on
 * `framework.spring + arch.cli + lang.kotlin`.
 */

import { jvmBootstrapAdapter } from './jvm-bootstrap.js';

export const SPRING_CLI_KOTLIN_BOOTSTRAP_ID = 'walking-skeleton/spring-cli-kotlin-bootstrap';

export const springCliKotlinBootstrapAdapter = jvmBootstrapAdapter({
  id: SPRING_CLI_KOTLIN_BOOTSTRAP_ID,
  framework: 'spring',
  arch: 'cli',
  language: 'kotlin',
  templateDir: 'spring-cli-kotlin-bootstrap',
});
