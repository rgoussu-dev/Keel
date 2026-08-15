/**
 * Grid cell: **Micronaut CLI · Kotlin · Maven**, `modulith` layout
 * with the peer bounded context.
 *
 * The last cell of the grid, and the one stacking the most unbuilt
 * dimensions: Micronaut's Maven shape, Kotlin annotation processing
 * under `kapt` rather than KSP, the by-hand handler list, and the CLI
 * assembly. Each of those was shipped without a build behind it
 * before item J.
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
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-mod-mkclim-'));
  mavenRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-mod-mkclim-repo-'));
});

afterEach(async () => {
  await fs.remove(cwd);
  await fs.remove(mavenRepo);
});

describe.skipIf(skipJvmMavenE2E)(
  'walking-skeleton modulith e2e (Micronaut CLI, Kotlin, Maven)',
  () => {
    it(
      'builds a two-context Kotlin Micronaut CLI modulith on Maven and greets from the jar',
      () =>
        runJvmCliE2E(
          {
            stack: 'micronaut-cli-kotlin',
            moduleLayout: 'modulith',
            buildSystem: 'maven',
            withPeerContext: true,
            bootstrapId: 'walking-skeleton/micronaut-cli-kotlin-bootstrap',
            runJar: [
              'application',
              'cli',
              'build',
              'libs',
              'application-cli-0.1.0-SNAPSHOT-all.jar',
            ],
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
