/**
 * End-to-end test for the `walking-skeleton` vertical's Micronaut REST
 * shape in Kotlin: scaffolds `micronaut-rest-kotlin`, builds it
 * (running the generated `@MicronautTest` suite against the Kotlin
 * sources), boots the fat jar, and verifies the `/greet` wire
 * contract. Shared machinery and skip rules live in
 * `tests/support/jvm-rest-e2e.ts`.
 *
 * The Java sibling is `walking-skeleton-micronaut.test.ts` and the
 * spec is deliberately identical to it bar the stack id, so anything
 * that differs here is a difference in the *emitted project*. Under
 * Micronaut that difference is the largest of the three frameworks:
 * the Kotlin executable is processed by KSP rather than by the Java
 * annotation processor, and its entry point compiles to
 * `ApplicationKt` — bean definitions that KSP fails to generate leave
 * a jar that packages cleanly and then cannot resolve a controller.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, it } from 'vitest';
import { E2E_TIMEOUT_MS, runJvmRestE2E, skipJvmRestE2E } from '../support/jvm-rest-e2e.js';

let cwd: string;
let gradleUserHome: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-micronaut-kt-'));
  gradleUserHome = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-micronaut-kt-gradle-'));
});

afterEach(async () => {
  await fs.remove(cwd);
  await fs.remove(gradleUserHome);
});

describe.skipIf(skipJvmRestE2E)('walking-skeleton Micronaut REST (Kotlin) e2e', () => {
  it(
    'generates a Kotlin Micronaut REST project that builds, whose tests pass, and that serves /greet',
    () =>
      runJvmRestE2E(
        {
          stack: 'micronaut-rest-kotlin',
          bootstrapId: 'walking-skeleton/micronaut-rest-kotlin-bootstrap',
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
          healthLivePath: '/health/liveness',
          healthReadyPath: '/health/readiness',
          extraJvmFlags: ['-Dmicronaut.metrics.export.otlp.enabled=false'],
        },
        cwd,
        gradleUserHome,
      ),
    E2E_TIMEOUT_MS,
  );
});
