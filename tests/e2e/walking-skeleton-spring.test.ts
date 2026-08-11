/**
 * End-to-end test for the `walking-skeleton` vertical's Spring REST
 * shape: scaffolds `spring-rest`, builds it (running the generated
 * random-port `@SpringBootTest` suite), boots the boot jar, and
 * verifies the `/greet` wire contract. Shared machinery and skip
 * rules live in `tests/support/jvm-rest-e2e.ts`.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, it } from 'vitest';
import { E2E_TIMEOUT_MS, runJvmRestE2E, skipJvmRestE2E } from '../support/jvm-rest-e2e.js';

let cwd: string;
let gradleUserHome: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-spring-'));
  gradleUserHome = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-spring-gradle-'));
});

afterEach(async () => {
  await fs.remove(cwd);
  await fs.remove(gradleUserHome);
});

describe.skipIf(skipJvmRestE2E)('walking-skeleton Spring REST e2e', () => {
  it(
    'generates a Spring REST project that builds, whose tests pass, and that serves /greet',
    () =>
      runJvmRestE2E(
        {
          stack: 'spring-rest',
          bootstrapId: 'walking-skeleton/spring-rest-bootstrap',
          runJar: [
            'application',
            'rest',
            'executable',
            'build',
            'libs',
            'application-rest-executable-0.1.0-SNAPSHOT.jar',
          ],
          randomPortFlag: '-Dserver.port=0',
          announceRe: /Tomcat started on port(?:\(s\))?:? (\d+)/,
          healthLivePath: '/actuator/health/liveness',
          healthReadyPath: '/actuator/health/readiness',
          extraJvmFlags: [
            '-Dmanagement.tracing.enabled=false',
            '-Dmanagement.otlp.tracing.export.enabled=false',
            '-Dmanagement.otlp.metrics.export.enabled=false',
          ],
        },
        cwd,
        gradleUserHome,
      ),
    E2E_TIMEOUT_MS,
  );
});
