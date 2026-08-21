/**
 * End-to-end test for the `walking-skeleton` vertical's Spring CLI
 * shape in Kotlin: scaffolds `spring-cli-kotlin`, builds it (running
 * the generated `@SpringBootTest` command suite against the Kotlin
 * sources), then runs the boot jar and verifies the picocli wiring and
 * mediator dispatch. Shared machinery and skip rules live in
 * `tests/support/jvm-cli-e2e.ts`.
 *
 * The Java sibling is `walking-skeleton-spring-cli.test.ts`, and the
 * spec differs only in the stack id — the two emit the same module
 * paths and the same archive name. What differs in the emitted project
 * is `kotlin("plugin.spring")` and `kotlin-reflect`: without the
 * all-open plugin the container cannot proxy a Kotlin
 * `@Configuration`, which no file assertion sees and a boot does.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, it } from 'vitest';
import { E2E_TIMEOUT_MS, runJvmCliE2E, skipJvmCliE2E } from '../support/jvm-cli-e2e.js';

let cwd: string;
let gradleUserHome: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-spring-cli-kt-'));
  gradleUserHome = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-spring-cli-kt-gradle-'));
});

afterEach(async () => {
  await fs.remove(cwd);
  await fs.remove(gradleUserHome);
});

describe.skipIf(skipJvmCliE2E)('walking-skeleton Spring CLI (Kotlin) e2e', () => {
  it(
    'generates a Kotlin Spring CLI project that builds, whose tests pass, and that runs',
    () =>
      runJvmCliE2E(
        {
          stack: 'spring-cli-kotlin',
          bootstrapId: 'walking-skeleton/spring-cli-kotlin-bootstrap',
          runJar: ['application', 'cli', 'build', 'libs', 'application-cli-0.1.0-SNAPSHOT.jar'],
          argv: ['hello', '--name', 'E2E'],
          expectedStdout: 'Hello, E2E!',
        },
        cwd,
        gradleUserHome,
      ),
    E2E_TIMEOUT_MS,
  );
});
