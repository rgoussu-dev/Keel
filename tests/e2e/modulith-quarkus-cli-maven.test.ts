/**
 * Grid cell: **Quarkus CLI · Java · Maven**, `modulith` layout with
 * the peer bounded context.
 *
 * The CLI assembly under the reactor build. Maven is where the
 * modulith's two documented defects lived — the service module's
 * domain dependency was transitive, and the assembly's peer
 * dependencies landed under `dependencyManagement` rather than on the
 * compile classpath — and both were found by the REST assembly's pom.
 * `assemblyDepsPatch` anchors on the `greeting-user-side-service`
 * dependency of whichever assembly the layout resolved, so the CLI
 * assembly's pom is a second anchor site that had never been patched
 * for real.
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
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-mod-qclim-'));
  mavenRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-mod-qclim-repo-'));
});

afterEach(async () => {
  await fs.remove(cwd);
  await fs.remove(mavenRepo);
});

describe.skipIf(skipJvmMavenE2E)('walking-skeleton modulith e2e (Quarkus CLI, Maven)', () => {
  it(
    'builds a two-context Quarkus CLI modulith on Maven and greets from the jar',
    () =>
      runJvmCliE2E(
        {
          stack: 'quarkus-cli',
          moduleLayout: 'modulith',
          buildSystem: 'maven',
          withPeerContext: true,
          bootstrapId: 'walking-skeleton/quarkus-cli-bootstrap',
          runJar: ['application', 'cli', 'build', 'quarkus-app', 'quarkus-run.jar'],
          runJarMaven: ['application', 'cli', 'target', 'quarkus-app', 'quarkus-run.jar'],
          argv: ['hello', '--name', 'E2E'],
          expectedStdout: 'Hello, E2E!',
        },
        cwd,
        mavenRepo,
      ),
    E2E_TIMEOUT_MS,
  );
});
