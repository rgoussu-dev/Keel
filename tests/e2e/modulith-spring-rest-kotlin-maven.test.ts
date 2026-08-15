/**
 * Grid cell: **Spring REST · Kotlin · Maven**, `modulith` layout with
 * the peer bounded context.
 *
 * The Kotlin all-open problem again — Spring subclasses its
 * `@Configuration` classes at runtime, so a final Kotlin class fails
 * in the container rather than at compile time — but declared the
 * Maven way, as a `kotlin-maven-plugin` `<compilerPlugins>` entry
 * plus the `spring` dependency, in each of the modulith's modules
 * that needs it. Gradle says the same thing in one line of the
 * plugins block, which is exactly why proving one build system says
 * nothing about the other.
 *
 * Skipped unless `mvn` is on PATH and `JAVA_HOME` is a JDK 25+ —
 * Maven has no equivalent of Gradle's toolchain provisioning, so an
 * older `JAVA_HOME` fails with `release version 25 not supported`,
 * which would read as a keel bug rather than an environment one.
 *
 * One of the 24 cells of the modulith grid (12 stacks × 2 build
 * systems), each of which gets a file of its own — see
 * `docs/roadmap.md` item J. Shared machinery and skip rules live in
 * `tests/support/jvm-rest-e2e.ts`.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, it } from 'vitest';
import { E2E_TIMEOUT_MS, runJvmRestE2E, skipJvmMavenE2E } from '../support/jvm-rest-e2e.js';

let cwd: string;
let mavenRepo: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-mod-skm-'));
  mavenRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-mod-skm-repo-'));
});

afterEach(async () => {
  await fs.remove(cwd);
  await fs.remove(mavenRepo);
});

describe.skipIf(skipJvmMavenE2E)(
  'walking-skeleton modulith e2e (Spring REST, Kotlin, Maven)',
  () => {
    it(
      'builds a two-context Kotlin Spring modulith on Maven and serves /greet',
      () =>
        runJvmRestE2E(
          {
            stack: 'spring-rest-kotlin',
            moduleLayout: 'modulith',
            buildSystem: 'maven',
            withPeerContext: true,
            bootstrapId: 'walking-skeleton/spring-rest-kotlin-bootstrap',
            runJar: ['application', 'api', 'build', 'libs', 'application-api-0.1.0-SNAPSHOT.jar'],
            runJarMaven: ['application', 'api', 'target', 'application-api-0.1.0-SNAPSHOT.jar'],
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
          mavenRepo,
        ),
      E2E_TIMEOUT_MS,
    );
  },
);
