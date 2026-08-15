/**
 * The `modulith` layout **without** the peer bounded context:
 * scaffolds `quarkus-rest --module-layout=modulith`, builds it — which
 * compiles `platform/kernel`, the whole `modules/greeting` hexagon and
 * the `application/api` assembly, and runs every generated test
 * including the in-process service adapter's — then boots the packaged
 * assembly and verifies the same `/greet` wire contract the flat
 * layout serves.
 *
 * Not a cell of the modulith grid but the baseline underneath it. The
 * 24 grid cells all scaffold `--with-peer-context`, which is the
 * layout's fullest configuration; this is the only e2e proving the
 * peer-context family is genuinely additive — that with the flag
 * absent no adapter of it fires and a one-context modulith still
 * builds, wires and serves. Its sibling variant is
 * `modulith-persistence.test.ts`, the vertical layered on top.
 *
 * This is the layout's real proof: the shape is asserted by
 * `tests/domain/core/verticals/walking-skeleton-modulith.test.ts`,
 * but only a build says the carved-up module graph actually
 * compiles and wires. Shared machinery and skip rules live in
 * `tests/support/jvm-rest-e2e.ts`.
 *
 * The grid's cases are deliberately separate files rather than further
 * `it`s here. Vitest parallelises across files but runs the tests
 * inside one file in sequence, so a file is the unit of scheduling:
 * four JVM builds in one file is a single ~9-minute block that pins
 * the whole suite's wall clock no matter how the CI job is sharded.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, it } from 'vitest';
import { E2E_TIMEOUT_MS, runJvmRestE2E, skipJvmRestE2E } from '../support/jvm-rest-e2e.js';

let cwd: string;
let gradleUserHome: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-modulith-'));
  gradleUserHome = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-modulith-gradle-'));
});

afterEach(async () => {
  await fs.remove(cwd);
  await fs.remove(gradleUserHome);
});

describe.skipIf(skipJvmRestE2E)('walking-skeleton modulith e2e', () => {
  it(
    'generates a modulith project that builds, whose tests pass, and that serves /greet',
    () =>
      runJvmRestE2E(
        {
          stack: 'quarkus-rest',
          moduleLayout: 'modulith',
          bootstrapId: 'walking-skeleton/quarkus-rest-bootstrap',
          runJar: ['application', 'api', 'build', 'quarkus-app', 'quarkus-run.jar'],
          randomPortFlag: '-Dquarkus.http.port=0',
          announceRe: /Listening on: https?:\/\/[^:\s]+:(\d+)/,
          healthLivePath: '/q/health/live',
          healthReadyPath: '/q/health/ready',
          extraJvmFlags: ['-Dquarkus.otel.sdk.disabled=true'],
        },
        cwd,
        gradleUserHome,
      ),
    E2E_TIMEOUT_MS,
  );
});
