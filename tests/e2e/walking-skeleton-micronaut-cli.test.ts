/**
 * End-to-end test for the `walking-skeleton` vertical's Micronaut CLI
 * shape: scaffolds `micronaut-cli`, builds it (running the generated
 * command suite), then runs the shadow jar and verifies the picocli
 * wiring and mediator dispatch. Shared machinery and skip rules live
 * in `tests/support/jvm-cli-e2e.ts`.
 *
 * The runnable artifact is the `-all.jar` the shadow plugin writes,
 * not the `-runner.jar` the Micronaut application plugin leaves
 * beside it — that one carries no dependencies and dies on
 * `ClassNotFoundException: PicocliRunner`. The emitted README names
 * the same jar this spec does, which is the claim this suite now
 * keeps honest.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, it } from 'vitest';
import { E2E_TIMEOUT_MS, runJvmCliE2E, skipJvmCliE2E } from '../support/jvm-cli-e2e.js';

let cwd: string;
let gradleUserHome: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-micronaut-cli-'));
  gradleUserHome = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-micronaut-cli-gradle-'));
});

afterEach(async () => {
  await fs.remove(cwd);
  await fs.remove(gradleUserHome);
});

describe.skipIf(skipJvmCliE2E)('walking-skeleton Micronaut CLI e2e', () => {
  it(
    'generates a Micronaut CLI project that builds, whose tests pass, and that runs',
    () =>
      runJvmCliE2E(
        {
          stack: 'micronaut-cli',
          bootstrapId: 'walking-skeleton/micronaut-cli-bootstrap',
          runJar: ['application', 'cli', 'build', 'libs', 'cli-0.1.0-SNAPSHOT-all.jar'],
          argv: ['hello', '--name', 'E2E'],
          expectedStdout: 'Hello, E2E!',
        },
        cwd,
        gradleUserHome,
      ),
    E2E_TIMEOUT_MS,
  );
});
