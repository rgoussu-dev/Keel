/**
 * The `modulith` layout under Spring on Gradle, with the peer bounded
 * context.
 *
 * Spring's modulith had only ever been built by Maven
 * (`walking-skeleton-modulith-maven.test.ts`). That is coverage of the
 * framework's wiring but not of its build: the two build systems
 * assemble the module graph differently — Gradle resolves subprojects
 * by coordinates and packs a flat `BOOT-INF/lib`, Maven by reactor
 * order — and the modulith is the layout where that difference has
 * teeth, because leaf project names repeat across it (`contract` under
 * both `domain/` and `user-side/api/`) and the emitted root build
 * derives per-path groups and archive names to keep them apart.
 *
 * The framework's silent failure mode is the same one the Maven case
 * documents: the assembly's component scan names each bounded context
 * explicitly, so a context missing from that list is never scanned,
 * `SignHandler` is never discovered, and the application starts
 * perfectly. The generated `GuestbookWiringTest` dispatches a
 * `SignCommand` through the real container, which is what makes that a
 * red build rather than a green one over less behaviour.
 *
 * Sibling of `walking-skeleton-modulith.test.ts`; see that file for
 * why the layout's cases live in separate files. Shared machinery and
 * skip rules live in `tests/support/jvm-rest-e2e.ts`.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, it } from 'vitest';
import { E2E_TIMEOUT_MS, runJvmRestE2E, skipJvmRestE2E } from '../support/jvm-rest-e2e.js';

let cwd: string;
let gradleUserHome: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-modulith-spring-'));
  gradleUserHome = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-modulith-spring-gradle-'));
});

afterEach(async () => {
  await fs.remove(cwd);
  await fs.remove(gradleUserHome);
});

describe.skipIf(skipJvmRestE2E)('walking-skeleton modulith e2e (Spring, two contexts)', () => {
  it(
    'builds a two-context Spring modulith on Gradle and serves /greet',
    () =>
      runJvmRestE2E(
        {
          stack: 'spring-rest',
          moduleLayout: 'modulith',
          withPeerContext: true,
          bootstrapId: 'walking-skeleton/spring-rest-bootstrap',
          runJar: ['application', 'api', 'build', 'libs', 'application-api-0.1.0-SNAPSHOT.jar'],
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
