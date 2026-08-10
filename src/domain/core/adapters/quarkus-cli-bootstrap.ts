/**
 * `walking-skeleton/quarkus-cli-bootstrap` adapter — emits a runnable
 * multi-module Quarkus picocli project (Java): the shared domain
 * trisection plus an `application/cli` module with a top-level `Main`,
 * one sample subcommand, the CDI composition root, and a
 * `@QuarkusMainTest` that drives it end-to-end.
 *
 * One of the JVM bootstrap family built by {@link jvmBootstrapAdapter};
 * the resolver picks it on `framework.quarkus + arch.cli + lang.java`.
 */

import { jvmBootstrapAdapter } from './jvm-bootstrap.js';

export const QUARKUS_CLI_BOOTSTRAP_ID = 'walking-skeleton/quarkus-cli-bootstrap';

export const quarkusCliBootstrapAdapter = jvmBootstrapAdapter({
  id: QUARKUS_CLI_BOOTSTRAP_ID,
  framework: 'quarkus',
  arch: 'cli',
  language: 'java',
  templateDir: 'quarkus-cli-bootstrap',
});
