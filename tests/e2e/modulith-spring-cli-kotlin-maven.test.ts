/**
 * Grid cell: **Spring CLI · Kotlin · Maven**, `modulith` layout with
 * the peer bounded context.
 *
 * All-open declared the Maven way — a `kotlin-maven-plugin`
 * `<compilerPlugins>` entry plus the `spring` dependency — over the
 * CLI assembly, then repackaged by Boot's `repackage` goal into
 * `application-cli`. Three plugin configurations that each have to
 * agree about which module is the runnable one.
 *
 * Skipped unless `mvn` is on PATH and `JAVA_HOME` is a JDK 25+ —
 * Maven has no equivalent of Gradle's toolchain provisioning, so an
 * older `JAVA_HOME` fails with `release version 25 not supported`,
 * which would read as a keel bug rather than an environment one.
 *
 * One of the 24 cells of the modulith grid (12 stacks × 2 build
 * systems), each of which gets a file of its own — see
 * `docs/roadmap.md` item J. Shared machinery and skip rules live in
 * `tests/support/jvm-cli-e2e.ts`.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, it } from 'vitest';
import { E2E_TIMEOUT_MS, runJvmCliE2E, skipJvmMavenE2E } from '../support/jvm-cli-e2e.js';

let cwd: string;
let mavenRepo: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-mod-skclim-'));
  mavenRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-mod-skclim-repo-'));
});

afterEach(async () => {
  await fs.remove(cwd);
  await fs.remove(mavenRepo);
});

describe.skipIf(skipJvmMavenE2E)(
  'walking-skeleton modulith e2e (Spring CLI, Kotlin, Maven)',
  () => {
    it(
      'builds a two-context Kotlin Spring CLI modulith on Maven and greets from the jar',
      () =>
        runJvmCliE2E(
          {
            stack: 'spring-cli-kotlin',
            moduleLayout: 'modulith',
            buildSystem: 'maven',
            withPeerContext: true,
            bootstrapId: 'walking-skeleton/spring-cli-kotlin-bootstrap',
            runJar: ['application', 'cli', 'build', 'libs', 'application-cli-0.1.0-SNAPSHOT.jar'],
            runJarMaven: ['application', 'cli', 'target', 'application-cli-0.1.0-SNAPSHOT.jar'],
            argv: ['hello', '--name', 'E2E'],
            expectedStdout: 'Hello, E2E!',
          },
          cwd,
          mavenRepo,
        ),
      E2E_TIMEOUT_MS,
    );
  },
);
