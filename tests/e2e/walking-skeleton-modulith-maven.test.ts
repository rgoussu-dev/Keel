/**
 * The Maven half of the `modulith` layout, with the peer bounded
 * context — under Quarkus and under Spring.
 *
 * This combination is where the modulith's central claim actually
 * gets tested — a peer consuming the seam — and it is the combination
 * that shipped two defects nothing else could see: the service
 * module's domain dependency was transitive under Maven, and the
 * assembly's peer dependencies landed under dependencyManagement
 * rather than on the compile classpath. Both were invisible to tests
 * that read emitted files; both fail this build loudly.
 *
 * Spring earns its own case because its peer binding has a silent
 * failure mode the others do not: the assembly's component scan names
 * each bounded context explicitly, so a context missing from that list
 * is never scanned, `SignHandler` is never discovered, and the
 * application starts perfectly. The generated `GuestbookWiringTest`
 * dispatches a `SignCommand` through the real container, which is what
 * turns that into a red build — on the build system whose peer wiring
 * is the more fragile of the two.
 *
 * Skipped unless `mvn` is on PATH and `JAVA_HOME` is a JDK 25+ —
 * Maven has no equivalent of Gradle's toolchain provisioning, so an
 * older `JAVA_HOME` fails with `release version 25 not supported`,
 * which would read as a keel bug rather than an environment one.
 *
 * Sibling of `walking-skeleton-modulith.test.ts`; see that file for
 * why the layout's cases live in separate files. These two share one
 * file because together they run in about a minute and a half — well
 * under the Gradle cases they would otherwise queue behind.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, it } from 'vitest';
import { E2E_TIMEOUT_MS, runJvmRestE2E, skipJvmMavenE2E } from '../support/jvm-rest-e2e.js';

let mavenCwd: string;
let mavenRepo: string;
let springMavenCwd: string;
let springMavenRepo: string;

beforeEach(async () => {
  mavenCwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-modulith-mvn-'));
  mavenRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-modulith-mvn-repo-'));
  springMavenCwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-modulith-spring-mvn-'));
  springMavenRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-modulith-spring-mvn-repo-'));
});

afterEach(async () => {
  await fs.remove(mavenCwd);
  await fs.remove(mavenRepo);
  await fs.remove(springMavenCwd);
  await fs.remove(springMavenRepo);
});

describe.skipIf(skipJvmMavenE2E)('walking-skeleton modulith e2e (Maven, two contexts)', () => {
  it(
    'builds a two-context modulith on Maven and serves /greet',
    () =>
      runJvmRestE2E(
        {
          stack: 'quarkus-rest',
          moduleLayout: 'modulith',
          buildSystem: 'maven',
          withPeerContext: true,
          bootstrapId: 'walking-skeleton/quarkus-rest-bootstrap',
          runJar: ['application', 'api', 'build', 'quarkus-app', 'quarkus-run.jar'],
          runJarMaven: ['application', 'api', 'target', 'quarkus-app', 'quarkus-run.jar'],
          randomPortFlag: '-Dquarkus.http.port=0',
          announceRe: /Listening on: https?:\/\/[^:\s]+:(\d+)/,
          healthLivePath: '/q/health/live',
          healthReadyPath: '/q/health/ready',
          extraJvmFlags: ['-Dquarkus.otel.sdk.disabled=true'],
        },
        mavenCwd,
        mavenRepo,
      ),
    E2E_TIMEOUT_MS,
  );
});

describe.skipIf(skipJvmMavenE2E)(
  'walking-skeleton modulith e2e (Spring on Maven, two contexts)',
  () => {
    it(
      'builds a two-context Spring modulith on Maven and serves /greet',
      () =>
        runJvmRestE2E(
          {
            stack: 'spring-rest',
            moduleLayout: 'modulith',
            buildSystem: 'maven',
            withPeerContext: true,
            bootstrapId: 'walking-skeleton/spring-rest-bootstrap',
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
          springMavenCwd,
          springMavenRepo,
        ),
      E2E_TIMEOUT_MS,
    );
  },
);
