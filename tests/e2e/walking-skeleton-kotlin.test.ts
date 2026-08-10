/**
 * End-to-end test for the `walking-skeleton` vertical's Kotlin REST
 * shape, exercised through the Quarkus flavour: scaffolds
 * `quarkus-rest-kotlin`, builds it (running the generated
 * `@QuarkusTest` + RestAssured suite against the Kotlin sources),
 * boots the packaged application, and verifies the `/greet` wire
 * contract. Shared machinery and skip rules live in
 * `tests/support/jvm-rest-e2e.ts`.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, it } from 'vitest';
import { E2E_TIMEOUT_MS, runJvmRestE2E, skipJvmRestE2E } from '../support/jvm-rest-e2e.js';

let cwd: string;
let gradleUserHome: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-kotlin-'));
  gradleUserHome = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-kotlin-gradle-'));
});

afterEach(async () => {
  await fs.remove(cwd);
  await fs.remove(gradleUserHome);
});

describe.skipIf(skipJvmRestE2E)('walking-skeleton Kotlin (Quarkus REST) e2e', () => {
  it(
    'generates a Kotlin REST project that builds, whose tests pass, and that serves /greet',
    () =>
      runJvmRestE2E(
        {
          stack: 'quarkus-rest-kotlin',
          bootstrapId: 'walking-skeleton/quarkus-rest-kotlin-bootstrap',
          runJar: ['application', 'rest', 'executable', 'build', 'quarkus-app', 'quarkus-run.jar'],
          randomPortFlag: '-Dquarkus.http.port=0',
          announceRe: /Listening on: https?:\/\/[^:\s]+:(\d+)/,
        },
        cwd,
        gradleUserHome,
      ),
    E2E_TIMEOUT_MS,
  );
});
