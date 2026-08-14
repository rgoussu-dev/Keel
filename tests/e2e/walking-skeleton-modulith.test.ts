/**
 * End-to-end test for the `modulith` module layout: scaffolds
 * `quarkus-rest --module-layout=modulith`, builds it — which compiles
 * `platform/kernel`, the whole `modules/greeting` hexagon and the
 * `application/api` assembly, and runs every generated test including
 * the in-process service adapter's — then boots the packaged
 * assembly and verifies the same `/greet` wire contract the flat
 * layout serves.
 *
 * A second case layers `keel add persistence` onto the same layout
 * and builds again — the vertical splits across three modules there
 * (context contract, context infra, assembly), which is exactly the
 * kind of wiring only a compiler settles.
 *
 * This is the layout's real proof: the shape is asserted by
 * `tests/domain/core/verticals/walking-skeleton-modulith.test.ts`,
 * but only a build says the carved-up module graph actually
 * compiles and wires. Shared machinery and skip rules live in
 * `tests/support/jvm-rest-e2e.ts`.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, it } from 'vitest';
import {
  E2E_TIMEOUT_MS,
  runJvmPersistenceE2E,
  runJvmRestE2E,
  skipJvmMavenE2E,
  skipJvmRestE2E,
} from '../support/jvm-rest-e2e.js';

let cwd: string;
let gradleUserHome: string;
let mavenCwd: string;
let mavenRepo: string;
let persistenceCwd: string;
let persistenceGradleHome: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-modulith-'));
  gradleUserHome = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-modulith-gradle-'));
  persistenceCwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-modulith-pers-'));
  persistenceGradleHome = await fs.mkdtemp(
    path.join(os.tmpdir(), 'keel-e2e-modulith-pers-gradle-'),
  );
  mavenCwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-modulith-mvn-'));
  mavenRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-modulith-mvn-repo-'));
});

afterEach(async () => {
  await fs.remove(cwd);
  await fs.remove(gradleUserHome);
  await fs.remove(persistenceCwd);
  await fs.remove(persistenceGradleHome);
  await fs.remove(mavenCwd);
  await fs.remove(mavenRepo);
});

describe.skipIf(skipJvmRestE2E)('walking-skeleton modulith e2e', () => {
  it(
    'generates a modulith project that builds, whose tests pass, and that serves /greet',
    () =>
      runJvmRestE2E(
        {
          stack: 'quarkus-rest',
          moduleLayout: 'modulith',
          bootstrapId: 'walking-skeleton/quarkus-rest-bootstrap',
          runJar: ['application', 'api', 'build', 'quarkus-app', 'quarkus-run.jar'],
          randomPortFlag: '-Dquarkus.http.port=0',
          announceRe: /Listening on: https?:\/\/[^:\s]+:(\d+)/,
          healthLivePath: '/q/health/live',
          healthReadyPath: '/q/health/ready',
          extraJvmFlags: ['-Dquarkus.otel.sdk.disabled=true'],
        },
        cwd,
        gradleUserHome,
      ),
    E2E_TIMEOUT_MS,
  );

  it(
    'layers the persistence vertical onto the modulith and still builds',
    () =>
      runJvmPersistenceE2E(
        {
          stack: 'quarkus-rest',
          moduleLayout: 'modulith',
          bootstrapId: 'walking-skeleton/quarkus-rest-bootstrap',
          runJar: ['application', 'api', 'build', 'quarkus-app', 'quarkus-run.jar'],
          randomPortFlag: '-Dquarkus.http.port=0',
          announceRe: /Listening on: https?:\/\/[^:\s]+:(\d+)/,
          healthLivePath: '/q/health/live',
          healthReadyPath: '/q/health/ready',
        },
        persistenceCwd,
        persistenceGradleHome,
      ),
    E2E_TIMEOUT_MS,
  );
});

/**
 * The Maven half of the same layout, with the peer bounded context.
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
 */
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
