/**
 * `walking-skeleton/quarkus-rest-bootstrap` adapter — emits a runnable
 * multi-module Quarkus REST project (Java): the shared domain
 * trisection plus the earned application pair
 * `application/rest/contract` (transport DTOs) +
 * `application/rest/executable` (Jakarta REST resource for
 * `GET /greet?name=…`, the domain-error → RFC 9457 Problem Details
 * mapper, the CDI composition root), and a `@QuarkusTest` +
 * RestAssured test that drives the endpoint end to end.
 *
 * One of the JVM bootstrap family built by {@link jvmBootstrapAdapter};
 * the resolver picks it on
 * `framework.quarkus + arch.server-http + lang.java`.
 */

import { jvmBootstrapAdapter } from './jvm-bootstrap.js';

export const QUARKUS_REST_BOOTSTRAP_ID = 'walking-skeleton/quarkus-rest-bootstrap';

export const quarkusRestBootstrapAdapter = jvmBootstrapAdapter({
  id: QUARKUS_REST_BOOTSTRAP_ID,
  framework: 'quarkus',
  arch: 'rest',
  language: 'java',
  templateDir: 'quarkus-rest-bootstrap',
});
