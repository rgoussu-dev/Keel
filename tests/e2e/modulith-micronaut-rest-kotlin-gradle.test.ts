/**
 * Grid cell: **Micronaut REST · Kotlin · Gradle**, `modulith` layout
 * with the peer bounded context.
 *
 * The most divergent code in any peer-context adapter, and until this
 * suite the only one never compiled. Micronaut's *Java* assembly
 * discovers handlers through `@Import(packages = …, annotated =
 * @DomainHandler)`; its **Kotlin** assembly cannot, because `@Import`
 * is Java-only and annotation discovery would drag KSP into
 * `domain/core`. So the Kotlin composition root wires handlers **by
 * hand** — `RegistryMediator(listOf(GreetHandler(), SignHandler(welcome)))`
 * in a `MediatorFactory` — and the peer binding is a patch that
 * rewrites that literal list.
 *
 * That is a genuinely different failure mode from every other cell.
 * The patch throws at scaffold time if it cannot find the list, so
 * the interesting case is the one where it finds it and produces a
 * handler list that does not compile or does not resolve — a
 * `BeanProvider<GreetingService>` taken eagerly instead of lazily
 * closes the construction cycle mediator → SignHandler → Welcome →
 * GreetingService → mediator, which no file assertion can see and
 * only a container can.
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
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-mod-mk-'));
  gradleUserHome = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-mod-mk-gradle-'));
});

afterEach(async () => {
  await fs.remove(cwd);
  await fs.remove(gradleUserHome);
});

describe.skipIf(skipJvmRestE2E)(
  'walking-skeleton modulith e2e (Micronaut REST, Kotlin, Gradle)',
  () => {
    it(
      'builds a two-context Kotlin Micronaut modulith on Gradle and serves /greet',
      () =>
        runJvmRestE2E(
          {
            stack: 'micronaut-rest-kotlin',
            moduleLayout: 'modulith',
            withPeerContext: true,
            bootstrapId: 'walking-skeleton/micronaut-rest-kotlin-bootstrap',
            runJar: [
              'application',
              'api',
              'build',
              'libs',
              'application-api-0.1.0-SNAPSHOT-all.jar',
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
  },
);
