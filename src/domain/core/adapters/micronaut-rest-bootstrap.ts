/**
 * `walking-skeleton/micronaut-rest-bootstrap` adapter — emits a
 * runnable multi-module Micronaut REST project (Java): the shared
 * domain trisection plus the earned application pair
 * `application/rest/contract` (transport DTOs) +
 * `application/rest/executable` (Micronaut controller for
 * `GET /greet?name=…`, the domain-error → RFC 9457 Problem Details
 * exception handler, the composition root), and a `@MicronautTest`
 * that drives the endpoint over the embedded server.
 *
 * One of the JVM bootstrap family built by {@link jvmBootstrapAdapter};
 * the resolver picks it on
 * `framework.micronaut + arch.server-http + lang.java`.
 */

import { jvmBootstrapAdapter } from './jvm-bootstrap.js';

export const MICRONAUT_REST_BOOTSTRAP_ID = 'walking-skeleton/micronaut-rest-bootstrap';

export const micronautRestBootstrapAdapter = jvmBootstrapAdapter({
  id: MICRONAUT_REST_BOOTSTRAP_ID,
  framework: 'micronaut',
  arch: 'rest',
  language: 'java',
  templateDir: 'micronaut-rest-bootstrap',
});
