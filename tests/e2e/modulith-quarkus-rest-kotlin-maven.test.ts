/**
 * Grid cell: **Quarkus REST · Kotlin · Maven**, `modulith` layout with
 * the peer bounded context.
 *
 * Kotlin and Maven had never met in this repo. Before item J the only
 * suites passing `buildSystem: 'maven'` were Quarkus/Java and
 * Spring/Java, so every `jvm-build-modulith/maven/*-kotlin/` tree —
 * the `kotlin-maven-plugin` executions, the `kapt`/`compile` ordering
 * an annotation-processed Kotlin module needs, the source directory
 * each declares — shipped without ever being run.
 *
 * That matters most under Maven, because Kotlin compilation there is
 * plugin configuration rather than a first-class language: Gradle's
 * Kotlin plugin wires `src/main/kotlin` and the JVM target by itself,
 * while every Maven module has to say so, in every one of the modulith's
 * modules. This is the cell where a copy-paste slip across those poms
 * surfaces.
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
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-mod-qkm-'));
  mavenRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-mod-qkm-repo-'));
});

afterEach(async () => {
  await fs.remove(cwd);
  await fs.remove(mavenRepo);
});

describe.skipIf(skipJvmMavenE2E)(
  'walking-skeleton modulith e2e (Quarkus REST, Kotlin, Maven)',
  () => {
    it(
      'builds a two-context Kotlin Quarkus modulith on Maven and serves /greet',
      () =>
        runJvmRestE2E(
          {
            stack: 'quarkus-rest-kotlin',
            moduleLayout: 'modulith',
            buildSystem: 'maven',
            withPeerContext: true,
            bootstrapId: 'walking-skeleton/quarkus-rest-kotlin-bootstrap',
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
  },
);
