/**
 * End-to-end test for the `walking-skeleton` vertical's Spring CLI
 * shape: scaffolds `spring-cli`, builds it (running the generated
 * `@SpringBootTest` command suite), then runs the boot jar and
 * verifies the picocli wiring and mediator dispatch. Shared machinery
 * and skip rules live in `tests/support/jvm-cli-e2e.ts`.
 *
 * Spring's CLI has a discovery seam the REST shape does not: commands
 * are Spring beans built through picocli's `IFactory`, and `Main`'s
 * `@ComponentScan` spans two packages — this one and the domain's,
 * whose handlers carry no stereotype and are admitted by a
 * `@DomainHandler` include filter instead. A package missing from
 * that list leaves a jar that starts, prints picocli's usage, and
 * exits without ever reaching the mediator.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, it } from 'vitest';
import { E2E_TIMEOUT_MS, runJvmCliE2E, skipJvmCliE2E } from '../support/jvm-cli-e2e.js';

let cwd: string;
let gradleUserHome: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-spring-cli-'));
  gradleUserHome = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-spring-cli-gradle-'));
});

afterEach(async () => {
  await fs.remove(cwd);
  await fs.remove(gradleUserHome);
});

describe.skipIf(skipJvmCliE2E)('walking-skeleton Spring CLI e2e', () => {
  it(
    'generates a Spring CLI project that builds, whose tests pass, and that runs',
    () =>
      runJvmCliE2E(
        {
          stack: 'spring-cli',
          bootstrapId: 'walking-skeleton/spring-cli-bootstrap',
          runJar: ['application', 'cli', 'build', 'libs', 'cli-0.1.0-SNAPSHOT.jar'],
          argv: ['hello', '--name', 'E2E'],
          expectedStdout: 'Hello, E2E!',
        },
        cwd,
        gradleUserHome,
      ),
    E2E_TIMEOUT_MS,
  );
});
