/**
 * End-to-end test for the `walking-skeleton` vertical's Quarkus CLI
 * shape: scaffolds `quarkus-cli`, builds it (running the generated
 * `@QuarkusMainTest` suite), then runs the packaged binary and
 * verifies the picocli wiring and mediator dispatch produced the
 * greeting its command says it should. Shared machinery and skip
 * rules live in `tests/support/jvm-cli-e2e.ts`.
 *
 * This was the first e2e keel had, and it carried its own copy of the
 * scaffold-build-run flow inline until the other four CLI stacks
 * needed the same one. Per the contributor brief: "the only part that
 * would not be exercised is the git/CI part; for those replace by a
 * fake that will do a no-op." Today the only CI-shaped side effect
 * emitted by the `quarkus-cli` stack is `vcs/git-init`, which the
 * harness fakes; every other deferred action — notably
 * `walking-skeleton/gradle-wrapper` — runs for real, since the
 * wrapper is the entrypoint to the build we want to exercise.
 *
 * Hermeticity: a fresh `GRADLE_USER_HOME` per test, so the scenario
 * starts from a blank cache the way a brand-new developer machine
 * does. Network access to Maven Central and the Gradle distribution
 * mirror is required, and the first run is slow for that reason.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, it } from 'vitest';
import { E2E_TIMEOUT_MS, runJvmCliE2E, skipJvmCliE2E } from '../support/jvm-cli-e2e.js';

let cwd: string;
let gradleUserHome: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-'));
  gradleUserHome = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-gradle-'));
});

afterEach(async () => {
  await fs.remove(cwd);
  await fs.remove(gradleUserHome);
});

describe.skipIf(skipJvmCliE2E)('walking-skeleton e2e', () => {
  it(
    'generates a project that builds, whose tests pass, and that runs',
    () =>
      runJvmCliE2E(
        {
          stack: 'quarkus-cli',
          bootstrapId: 'walking-skeleton/quarkus-cli-bootstrap',
          runJar: ['application', 'cli', 'build', 'quarkus-app', 'quarkus-run.jar'],
          argv: ['hello', '--name', 'E2E'],
          expectedStdout: 'Hello, E2E!',
        },
        cwd,
        gradleUserHome,
      ),
    E2E_TIMEOUT_MS,
  );
});
