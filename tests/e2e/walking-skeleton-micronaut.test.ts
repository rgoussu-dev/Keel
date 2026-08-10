/**
 * End-to-end test for the `walking-skeleton` vertical's Micronaut
 * REST shape: scaffolds `micronaut-rest`, builds it (running the
 * generated `@MicronautTest` suite), boots the fat jar, and verifies
 * the `/greet` wire contract. Shared machinery and skip rules live
 * in `tests/support/jvm-rest-e2e.ts`.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, it } from 'vitest';
import { E2E_TIMEOUT_MS, runJvmRestE2E, skipJvmRestE2E } from '../support/jvm-rest-e2e.js';

let cwd: string;
let gradleUserHome: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-micronaut-'));
  gradleUserHome = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-micronaut-gradle-'));
});

afterEach(async () => {
  await fs.remove(cwd);
  await fs.remove(gradleUserHome);
});

describe.skipIf(skipJvmRestE2E)('walking-skeleton Micronaut REST e2e', () => {
  it(
    'generates a Micronaut REST project that builds, whose tests pass, and that serves /greet',
    () =>
      runJvmRestE2E(
        {
          stack: 'micronaut-rest',
          bootstrapId: 'walking-skeleton/micronaut-rest-bootstrap',
          runJar: [
            'application',
            'rest',
            'executable',
            'build',
            'libs',
            'application-rest-executable-0.1.0-SNAPSHOT-all.jar',
          ],
          randomPortFlag: '-Dmicronaut.server.port=0',
          announceRe: /Server Running: https?:\/\/[^:\s]+:(\d+)/,
        },
        cwd,
        gradleUserHome,
      ),
    E2E_TIMEOUT_MS,
  );
});
