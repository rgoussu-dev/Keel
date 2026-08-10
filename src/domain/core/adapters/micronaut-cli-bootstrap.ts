/**
 * `walking-skeleton/micronaut-cli-bootstrap` adapter — emits a
 * runnable multi-module Micronaut picocli project (Java): the shared
 * domain trisection plus an `application/cli` module where
 * `PicocliRunner` boots the compile-time DI context, commands are
 * injected beans, and an output-capturing test drives the whole
 * context end-to-end.
 *
 * One of the JVM bootstrap family built by {@link jvmBootstrapAdapter};
 * the resolver picks it on
 * `framework.micronaut + arch.cli + lang.java`.
 */

import { jvmBootstrapAdapter } from './jvm-bootstrap.js';

export const MICRONAUT_CLI_BOOTSTRAP_ID = 'walking-skeleton/micronaut-cli-bootstrap';

export const micronautCliBootstrapAdapter = jvmBootstrapAdapter({
  id: MICRONAUT_CLI_BOOTSTRAP_ID,
  framework: 'micronaut',
  arch: 'cli',
  language: 'java',
  templateDir: 'micronaut-cli-bootstrap',
});
