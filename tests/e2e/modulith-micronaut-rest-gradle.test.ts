/**
 * Grid cell: **Micronaut REST · Java · Gradle**, `modulith` layout
 * with the peer bounded context.
 *
 * Micronaut's modulith had never been built — not in either language,
 * not under either build system — which made it the emptiest cell in
 * the grid and, given what lives there, the most expensive one to
 * leave empty. The typology axis is where the layout's wiring lives:
 * `platform/kernel`, the carved-up `modules/greeting` hexagon, the
 * `application/api` assembly, and the seam between two bounded
 * contexts. Every defect that axis has shipped was container wiring,
 * and container wiring is precisely the part that does not generalise
 * from Quarkus.
 *
 * Micronaut's own failure mode is a silent one. The Java assembly
 * discovers handlers through `@Import(packages = …, annotated =
 * @DomainHandler)`, which does not recurse into subpackages: a
 * bounded context missing from that list contributes no bean
 * definition, the mediator is short a handler, and the application
 * starts perfectly. The generated `GuestbookWiringTest` dispatches a
 * `SignCommand` through the real container, so the build is what turns
 * that into a red X.
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
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-modulith-mn-'));
  gradleUserHome = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-modulith-mn-gradle-'));
});

afterEach(async () => {
  await fs.remove(cwd);
  await fs.remove(gradleUserHome);
});

describe.skipIf(skipJvmRestE2E)('walking-skeleton modulith e2e (Micronaut, two contexts)', () => {
  it(
    'builds a two-context Micronaut modulith and serves /greet',
    () =>
      runJvmRestE2E(
        {
          stack: 'micronaut-rest',
          moduleLayout: 'modulith',
          withPeerContext: true,
          bootstrapId: 'walking-skeleton/micronaut-rest-bootstrap',
          runJar: ['application', 'api', 'build', 'libs', 'application-api-0.1.0-SNAPSHOT-all.jar'],
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
