/**
 * End-to-end test for the `walking-skeleton` vertical's Quarkus CLI
 * shape in Kotlin: scaffolds `quarkus-cli-kotlin`, builds it (running
 * the generated `@QuarkusMainTest` suite against the Kotlin sources),
 * then runs the packaged binary and verifies the picocli wiring and
 * mediator dispatch. Shared machinery and skip rules live in
 * `tests/support/jvm-cli-e2e.ts`.
 *
 * The Java sibling is `walking-skeleton.test.ts`. What only a build
 * says here is the `allOpen` configuration: Quarkus proxies
 * normal-scoped CDI beans and subclasses test classes, so the
 * annotated Kotlin classes have to compile open — final ones are
 * rejected at deployment, long after every file assertion has passed.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, it } from 'vitest';
import { E2E_TIMEOUT_MS, runJvmCliE2E, skipJvmCliE2E } from '../support/jvm-cli-e2e.js';

let cwd: string;
let gradleUserHome: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-quarkus-cli-kt-'));
  gradleUserHome = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-quarkus-cli-kt-gradle-'));
});

afterEach(async () => {
  await fs.remove(cwd);
  await fs.remove(gradleUserHome);
});

describe.skipIf(skipJvmCliE2E)('walking-skeleton Quarkus CLI (Kotlin) e2e', () => {
  it(
    'generates a Kotlin Quarkus CLI project that builds, whose tests pass, and that runs',
    () =>
      runJvmCliE2E(
        {
          stack: 'quarkus-cli-kotlin',
          bootstrapId: 'walking-skeleton/quarkus-cli-kotlin-bootstrap',
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
