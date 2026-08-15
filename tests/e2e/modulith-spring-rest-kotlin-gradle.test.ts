/**
 * Grid cell: **Spring REST · Kotlin · Gradle**, `modulith` layout with
 * the peer bounded context.
 *
 * Spring's peer binding has a silent failure mode: the assembly's
 * component scan names each bounded context explicitly, so a context
 * missing from that list is never scanned, `SignHandler` is never
 * discovered, and the application starts perfectly over less
 * behaviour. The generated `GuestbookWiringTest` dispatches a
 * `SignCommand` through the real container, which is what turns that
 * into a red build.
 *
 * Kotlin adds a second silent mode on top, and it is the reason this
 * cell is not a translation of its Java twin: Spring's configuration
 * classes are subclassed at runtime, so a Kotlin `@Configuration`
 * needs `kotlin("plugin.spring")` to open it. Without the all-open
 * plugin the container fails on a final class — and the peer binding
 * appends a producer to exactly such a class, which is the part no
 * file assertion reaches.
 *
 * One of the 24 cells of the modulith grid (12 stacks × 2 build
 * systems), each of which gets a file of its own — see
 * `docs/roadmap.md` item J. Shared machinery and skip rules live in
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
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-mod-sk-'));
  gradleUserHome = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-mod-sk-gradle-'));
});

afterEach(async () => {
  await fs.remove(cwd);
  await fs.remove(gradleUserHome);
});

describe.skipIf(skipJvmRestE2E)(
  'walking-skeleton modulith e2e (Spring REST, Kotlin, Gradle)',
  () => {
    it(
      'builds a two-context Kotlin Spring modulith on Gradle and serves /greet',
      () =>
        runJvmRestE2E(
          {
            stack: 'spring-rest-kotlin',
            moduleLayout: 'modulith',
            withPeerContext: true,
            bootstrapId: 'walking-skeleton/spring-rest-kotlin-bootstrap',
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
  },
);
