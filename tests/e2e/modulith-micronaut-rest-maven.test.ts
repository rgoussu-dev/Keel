/**
 * Grid cell: **Micronaut REST · Java · Maven**, `modulith` layout with
 * the peer bounded context.
 *
 * The first Micronaut project this repo has ever built with Maven, in
 * any layout or language — before item J the only suites passing
 * `buildSystem: 'maven'` were Quarkus and Spring, so
 * `jvm-build-modulith/maven/micronaut-*` shipped entirely unexecuted.
 *
 * Micronaut's Maven shape is also the most opinionated of the three,
 * and the modulith is where that bites: each module parents to
 * `micronaut-parent` rather than to the reactor root, so the reactor
 * aggregates modules that inherit their dependency management from
 * somewhere else entirely. Annotation processing is configured per
 * module on top of that, and Micronaut's discovery is what the peer
 * binding depends on — the Java assembly finds handlers through
 * `@Import(packages = …, annotated = @DomainHandler)`, which does not
 * recurse into subpackages, so a context missing from that list
 * contributes no bean, the mediator is short a handler, and the
 * application starts perfectly. `GuestbookWiringTest` dispatches a
 * `SignCommand` through the real container, which is what makes that
 * a red build.
 *
 * Skipped unless `mvn` is on PATH and `JAVA_HOME` is a JDK 25+ —
 * Maven has no equivalent of Gradle's toolchain provisioning, so an
 * older `JAVA_HOME` fails with `release version 25 not supported`,
 * which would read as a keel bug rather than an environment one.
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
import { E2E_TIMEOUT_MS, runJvmRestE2E, skipJvmMavenE2E } from '../support/jvm-rest-e2e.js';

let cwd: string;
let mavenRepo: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-mod-mnm-'));
  mavenRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-mod-mnm-repo-'));
});

afterEach(async () => {
  await fs.remove(cwd);
  await fs.remove(mavenRepo);
});

describe.skipIf(skipJvmMavenE2E)('walking-skeleton modulith e2e (Micronaut REST, Maven)', () => {
  it(
    'builds a two-context Micronaut modulith on Maven and serves /greet',
    () =>
      runJvmRestE2E(
        {
          stack: 'micronaut-rest',
          moduleLayout: 'modulith',
          buildSystem: 'maven',
          withPeerContext: true,
          bootstrapId: 'walking-skeleton/micronaut-rest-bootstrap',
          runJar: ['application', 'api', 'build', 'libs', 'application-api-0.1.0-SNAPSHOT-all.jar'],
          runJarMaven: ['application', 'api', 'target', 'application-api-0.1.0-SNAPSHOT.jar'],
          randomPortFlag: '-Dmicronaut.server.port=0',
          announceRe: /Server Running: https?:\/\/[^:\s]+:(\d+)/,
          healthLivePath: '/health/liveness',
          healthReadyPath: '/health/readiness',
          extraJvmFlags: ['-Dmicronaut.metrics.export.otlp.enabled=false'],
        },
        cwd,
        mavenRepo,
      ),
    E2E_TIMEOUT_MS,
  );
});
