/**
 * Grid cell: **Micronaut CLI · Java · Maven**, `modulith` layout with
 * the peer bounded context.
 *
 * Micronaut's Maven shape is the most opinionated of the three and
 * the modulith is where it shows: the assembly parents
 * `micronaut-parent` rather than the reactor root, so the reactor
 * aggregates a module inheriting its dependency management from
 * somewhere else, while the library modules parent the root and take
 * theirs from the BOM it imports.
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
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-mod-mnclim-'));
  mavenRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-mod-mnclim-repo-'));
});

afterEach(async () => {
  await fs.remove(cwd);
  await fs.remove(mavenRepo);
});

describe.skipIf(skipJvmMavenE2E)('walking-skeleton modulith e2e (Micronaut CLI, Maven)', () => {
  it(
    'builds a two-context Micronaut CLI modulith on Maven and greets from the jar',
    () =>
      runJvmCliE2E(
        {
          stack: 'micronaut-cli',
          moduleLayout: 'modulith',
          buildSystem: 'maven',
          withPeerContext: true,
          bootstrapId: 'walking-skeleton/micronaut-cli-bootstrap',
          runJar: ['application', 'cli', 'build', 'libs', 'application-cli-0.1.0-SNAPSHOT-all.jar'],
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
