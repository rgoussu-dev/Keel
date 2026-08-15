/**
 * Grid cell: **Spring CLI · Kotlin · Gradle**, `modulith` layout with
 * the peer bounded context.
 *
 * Spring's Kotlin configuration classes are subclassed at runtime, so
 * the all-open `kotlin("plugin.spring")` has to be applied wherever a
 * `@Configuration` lives — and under this cell that is the CLI
 * assembly, which the peer binding then appends a producer to. A
 * final class there fails in the container rather than at compile
 * time, which is why the wiring test rather than the build is what
 * catches it.
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
import { E2E_TIMEOUT_MS, runJvmCliE2E, skipJvmCliE2E } from '../support/jvm-cli-e2e.js';

let cwd: string;
let gradleUserHome: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-mod-skcli-'));
  gradleUserHome = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-mod-skcli-gradle-'));
});

afterEach(async () => {
  await fs.remove(cwd);
  await fs.remove(gradleUserHome);
});

describe.skipIf(skipJvmCliE2E)('walking-skeleton modulith e2e (Spring CLI, Kotlin, Gradle)', () => {
  it(
    'builds a two-context Kotlin Spring CLI modulith on Gradle and greets from the jar',
    () =>
      runJvmCliE2E(
        {
          stack: 'spring-cli-kotlin',
          moduleLayout: 'modulith',
          withPeerContext: true,
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
