/**
 * End-to-end test for the `walking-skeleton` vertical's Spring REST
 * shape in Kotlin: scaffolds `spring-rest-kotlin`, builds it (running
 * the generated random-port `@SpringBootTest` suite against the Kotlin
 * sources), boots the boot jar, and verifies the `/greet` wire
 * contract. Shared machinery and skip rules live in
 * `tests/support/jvm-rest-e2e.ts`.
 *
 * The Java sibling is `walking-skeleton-spring.test.ts` and the spec
 * is deliberately identical to it bar the stack id: the two stacks
 * emit the same module paths and the same archive names, so anything
 * that differs here is a difference in the *emitted project*, which is
 * what this file exists to catch. The Kotlin bootstrap adds
 * `kotlin-reflect` and `jackson-module-kotlin` to the executable and
 * swaps the `java` plugin for `kotlin("plugin.spring")` — the
 * all-open plugin without which Spring cannot proxy a Kotlin
 * `@Configuration` class, a failure no file assertion sees.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, it } from 'vitest';
import { E2E_TIMEOUT_MS, runJvmRestE2E, skipJvmRestE2E } from '../support/jvm-rest-e2e.js';

let cwd: string;
let gradleUserHome: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-spring-kt-'));
  gradleUserHome = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-spring-kt-gradle-'));
});

afterEach(async () => {
  await fs.remove(cwd);
  await fs.remove(gradleUserHome);
});

describe.skipIf(skipJvmRestE2E)('walking-skeleton Spring REST (Kotlin) e2e', () => {
  it(
    'generates a Kotlin Spring REST project that builds, whose tests pass, and that serves /greet',
    () =>
      runJvmRestE2E(
        {
          stack: 'spring-rest-kotlin',
          bootstrapId: 'walking-skeleton/spring-rest-kotlin-bootstrap',
          runJar: [
            'application',
            'rest',
            'executable',
            'build',
            'libs',
            'application-rest-executable-0.1.0-SNAPSHOT.jar',
          ],
          randomPortFlag: '-Dserver.port=0',
          announceRe: /Tomcat started on port(?:\(s\))?:? (\d+)/,
          healthLivePath: '/actuator/health/liveness',
          healthReadyPath: '/actuator/health/readiness',
          extraJvmFlags: [
            '-Dmanagement.tracing.enabled=false',
            '-Dmanagement.otlp.tracing.export.enabled=false',
            '-Dmanagement.otlp.metrics.export.enabled=false',
          ],
        },
        cwd,
        gradleUserHome,
      ),
    E2E_TIMEOUT_MS,
  );
});
