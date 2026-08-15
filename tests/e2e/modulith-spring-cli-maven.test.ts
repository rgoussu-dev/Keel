/**
 * Grid cell: **Spring CLI · Java · Maven**, `modulith` layout with
 * the peer bounded context.
 *
 * Spring Boot's Maven packaging is a `repackage` goal rather than a
 * plugin that rewrites the jar task, and under the modulith it has to
 * repackage an assembly whose dependencies are reactor siblings with
 * per-path artifact ids. This is that combination on the CLI
 * assembly, where the runnable artifact is `application-cli` rather
 * than `application-api`.
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
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-mod-sclim-'));
  mavenRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-mod-sclim-repo-'));
});

afterEach(async () => {
  await fs.remove(cwd);
  await fs.remove(mavenRepo);
});

describe.skipIf(skipJvmMavenE2E)('walking-skeleton modulith e2e (Spring CLI, Maven)', () => {
  it(
    'builds a two-context Spring CLI modulith on Maven and greets from the jar',
    () =>
      runJvmCliE2E(
        {
          stack: 'spring-cli',
          moduleLayout: 'modulith',
          buildSystem: 'maven',
          withPeerContext: true,
          bootstrapId: 'walking-skeleton/spring-cli-bootstrap',
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
});
