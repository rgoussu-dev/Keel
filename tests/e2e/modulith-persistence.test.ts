/**
 * Layers `keel add persistence` onto `quarkus-rest
 * --module-layout=modulith` and builds again.
 *
 * The vertical splits across three modules under this layout (context
 * contract, context infra, assembly), which is exactly the kind of
 * wiring only a compiler settles — an adapter emitted at the wrong
 * module's path still renders, and still produces a project that
 * builds while nothing is bound.
 *
 * Not a cell of the modulith grid but a vertical layered onto one —
 * sibling of `modulith-baseline.test.ts`; see that file for why the
 * layout's cases live in separate files. Shared machinery and skip
 * rules live in `tests/support/jvm-rest-e2e.ts`.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, it } from 'vitest';
import { E2E_TIMEOUT_MS, runJvmPersistenceE2E, skipJvmRestE2E } from '../support/jvm-rest-e2e.js';

let cwd: string;
let gradleUserHome: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-modulith-pers-'));
  gradleUserHome = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-modulith-pers-gradle-'));
});

afterEach(async () => {
  await fs.remove(cwd);
  await fs.remove(gradleUserHome);
});

describe.skipIf(skipJvmRestE2E)('walking-skeleton modulith e2e (persistence)', () => {
  it(
    'layers the persistence vertical onto the modulith and still builds',
    () =>
      runJvmPersistenceE2E(
        {
          stack: 'quarkus-rest',
          moduleLayout: 'modulith',
          bootstrapId: 'walking-skeleton/quarkus-rest-bootstrap',
          runJar: ['application', 'api', 'build', 'quarkus-app', 'quarkus-run.jar'],
          randomPortFlag: '-Dquarkus.http.port=0',
          announceRe: /Listening on: https?:\/\/[^:\s]+:(\d+)/,
          healthLivePath: '/q/health/live',
          healthReadyPath: '/q/health/ready',
        },
        cwd,
        gradleUserHome,
      ),
    E2E_TIMEOUT_MS,
  );
});
