/**
 * Grid cell: **Quarkus REST · Java · Maven**, `modulith` layout with
 * the peer bounded context.
 *
 * This combination is where the modulith's central claim actually
 * gets tested — a peer consuming the seam — and it is the combination
 * that shipped two defects nothing else could see: the service
 * module's domain dependency was transitive under Maven, and the
 * assembly's peer dependencies landed under dependencyManagement
 * rather than on the compile classpath. Both were invisible to tests
 * that read emitted files; both fail this build loudly.
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
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-modulith-mvn-'));
  mavenRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-modulith-mvn-repo-'));
});

afterEach(async () => {
  await fs.remove(cwd);
  await fs.remove(mavenRepo);
});

describe.skipIf(skipJvmMavenE2E)('walking-skeleton modulith e2e (Quarkus REST, Maven)', () => {
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
        cwd,
        mavenRepo,
      ),
    E2E_TIMEOUT_MS,
  );
});
