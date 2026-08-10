/**
 * `walking-skeleton/spring-rest-kotlin-bootstrap` adapter — the Kotlin
 * sibling of the Spring Boot REST bootstrap: the same runnable
 * multi-module Spring Boot REST service shape, emitted as idiomatic
 * Kotlin over the shared Kotlin domain trisection.
 *
 * One of the JVM bootstrap family built by {@link jvmBootstrapAdapter};
 * the resolver picks it on
 * `framework.spring + arch.server-http + lang.kotlin`.
 */

import { jvmBootstrapAdapter } from './jvm-bootstrap.js';

export const SPRING_REST_KOTLIN_BOOTSTRAP_ID = 'walking-skeleton/spring-rest-kotlin-bootstrap';

export const springRestKotlinBootstrapAdapter = jvmBootstrapAdapter({
  id: SPRING_REST_KOTLIN_BOOTSTRAP_ID,
  framework: 'spring',
  arch: 'rest',
  language: 'kotlin',
  templateDir: 'spring-rest-kotlin-bootstrap',
});
