/**
 * End-to-end test for the `walking-skeleton` vertical's Micronaut CLI
 * shape in Kotlin: scaffolds `micronaut-cli-kotlin`, builds it
 * (running the generated command suite against the Kotlin sources),
 * then runs the shadow jar and verifies the picocli wiring and
 * mediator dispatch. Shared machinery and skip rules live in
 * `tests/support/jvm-cli-e2e.ts`.
 *
 * The Java sibling is `walking-skeleton-micronaut-cli.test.ts`. The
 * divergence Micronaut's two languages carry is the largest in the
 * grid: bean definitions come from KSP here rather than from the Java
 * annotation processor, and the composition root wires its handlers by
 * hand because `@Import` is documented as Java-only. A definition KSP
 * fails to generate leaves a jar that packages cleanly and then
 * cannot resolve a command.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, it } from 'vitest';
import { E2E_TIMEOUT_MS, runJvmCliE2E, skipJvmCliE2E } from '../support/jvm-cli-e2e.js';

let cwd: string;
let gradleUserHome: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-micronaut-cli-kt-'));
  gradleUserHome = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-micronaut-cli-kt-gradle-'));
});

afterEach(async () => {
  await fs.remove(cwd);
  await fs.remove(gradleUserHome);
});

describe.skipIf(skipJvmCliE2E)('walking-skeleton Micronaut CLI (Kotlin) e2e', () => {
  it(
    'generates a Kotlin Micronaut CLI project that builds, whose tests pass, and that runs',
    () =>
      runJvmCliE2E(
        {
          stack: 'micronaut-cli-kotlin',
          bootstrapId: 'walking-skeleton/micronaut-cli-kotlin-bootstrap',
          runJar: ['application', 'cli', 'build', 'libs', 'application-cli-0.1.0-SNAPSHOT-all.jar'],
          argv: ['hello', '--name', 'E2E'],
          expectedStdout: 'Hello, E2E!',
        },
        cwd,
        gradleUserHome,
      ),
    E2E_TIMEOUT_MS,
  );
});
