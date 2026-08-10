/**
 * `walking-skeleton/spring-cli-bootstrap` adapter — emits a runnable
 * multi-module Spring Boot picocli project (Java): the shared domain
 * trisection plus an `application/cli` module where a
 * `CommandLineRunner` hands the raw arguments to picocli, commands
 * are Spring beans, and an output-capturing test drives the whole
 * container end-to-end.
 *
 * One of the JVM bootstrap family built by {@link jvmBootstrapAdapter};
 * the resolver picks it on `framework.spring + arch.cli + lang.java`.
 */

import { jvmBootstrapAdapter } from './jvm-bootstrap.js';

export const SPRING_CLI_BOOTSTRAP_ID = 'walking-skeleton/spring-cli-bootstrap';

export const springCliBootstrapAdapter = jvmBootstrapAdapter({
  id: SPRING_CLI_BOOTSTRAP_ID,
  framework: 'spring',
  arch: 'cli',
  language: 'java',
  templateDir: 'spring-cli-bootstrap',
});
