/**
 * Grid cell: **Micronaut REST · Kotlin · Maven**, `modulith` layout
 * with the peer bounded context.
 *
 * The emptiest cell in the table on two counts at once: Micronaut had
 * never been built by Maven in any layout or language, and Kotlin had
 * never been built by Maven at all. Both halves of this cell's
 * toolchain were shipped unexecuted.
 *
 * Micronaut's Kotlin build is annotation processing under another
 * name — KSP under Gradle, `kapt` under Maven — and the two are
 * configured nothing alike. The by-hand `MediatorFactory` this
 * peer binding rewrites is what has to come out the far side of that
 * processor as a bean definition; if the Maven processor is wired to
 * the wrong source root or runs in the wrong phase, the container
 * simply has no mediator and the wiring test says so.
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
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-mod-mkm-'));
  mavenRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-mod-mkm-repo-'));
});

afterEach(async () => {
  await fs.remove(cwd);
  await fs.remove(mavenRepo);
});

describe.skipIf(skipJvmMavenE2E)(
  'walking-skeleton modulith e2e (Micronaut REST, Kotlin, Maven)',
  () => {
    it(
      'builds a two-context Kotlin Micronaut modulith on Maven and serves /greet',
      () =>
        runJvmRestE2E(
          {
            stack: 'micronaut-rest-kotlin',
            moduleLayout: 'modulith',
            buildSystem: 'maven',
            withPeerContext: true,
            bootstrapId: 'walking-skeleton/micronaut-rest-kotlin-bootstrap',
            runJar: [
              'application',
              'api',
              'build',
              'libs',
              'application-api-0.1.0-SNAPSHOT-all.jar',
            ],
            runJarMaven: ['application', 'api', 'target', 'application-api-0.1.0-SNAPSHOT.jar'],
            randomPortFlag: '-Dmicronaut.server.port=0',
            announceRe: /Server Running: https?:\/\/[^:\s]+:(\d+)/,
            healthLivePath: '/health/liveness',
            healthReadyPath: '/health/readiness',
            extraJvmFlags: ['-Dmicronaut.metrics.export.otlp.enabled=false'],
          },
          cwd,
          mavenRepo,
        ),
      E2E_TIMEOUT_MS,
    );
  },
);
