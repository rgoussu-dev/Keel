/**
 * `walking-skeleton/spring-rest-bootstrap` adapter — emits a runnable
 * multi-module Spring Boot REST project (Java): the shared domain
 * trisection plus the earned application pair
 * `application/rest/contract` (transport DTOs) +
 * `application/rest/executable` (Spring MVC controller for
 * `GET /greet?name=…`, the domain-error → RFC 9457 Problem Details
 * advice, the composition root), and a random-port `@SpringBootTest`
 * that drives the endpoint over real HTTP.
 *
 * One of the JVM bootstrap family built by {@link jvmBootstrapAdapter};
 * the resolver picks it on
 * `framework.spring + arch.server-http + lang.java`.
 */

import { jvmBootstrapAdapter } from './jvm-bootstrap.js';

export const SPRING_REST_BOOTSTRAP_ID = 'walking-skeleton/spring-rest-bootstrap';

export const springRestBootstrapAdapter = jvmBootstrapAdapter({
  id: SPRING_REST_BOOTSTRAP_ID,
  framework: 'spring',
  arch: 'rest',
  language: 'java',
  templateDir: 'spring-rest-bootstrap',
});
