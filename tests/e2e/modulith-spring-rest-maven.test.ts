/**
 * Grid cell: **Spring REST · Java · Maven**, `modulith` layout with
 * the peer bounded context.
 *
 * Spring earns its own cell rather than riding on Quarkus' Maven case
 * because its peer binding has a silent failure mode the others do
 * not: the assembly's component scan names each bounded context
 * explicitly, so a context missing from that list is never scanned,
 * `SignHandler` is never discovered, and the application starts
 * perfectly. The generated `GuestbookWiringTest` dispatches a
 * `SignCommand` through the real container, which is what turns that
 * into a red build — on the build system whose peer wiring is the
 * more fragile of the two.
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
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-modulith-spring-mvn-'));
  mavenRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-modulith-spring-mvn-repo-'));
});

afterEach(async () => {
  await fs.remove(cwd);
  await fs.remove(mavenRepo);
});

describe.skipIf(skipJvmMavenE2E)('walking-skeleton modulith e2e (Spring REST, Maven)', () => {
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
        cwd,
        mavenRepo,
      ),
    E2E_TIMEOUT_MS,
  );
});
