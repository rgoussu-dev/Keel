/**
 * Grid cell: **Quarkus REST · Kotlin · Gradle**, three bounded contexts
 * added by `keel add module`.
 *
 * One of the 24 cells of the add-module grid — 12 stacks × 2 build
 * systems, the same grid `modulith-<stack>-<build>.test.ts` populates
 * for `keel new`. Typology is a real axis rather than a duplicate of
 * its row: it picks the assembly the wiring class renders into and the
 * build file the new dependencies anchor in.
 *
 * The body every cell runs, and why the shape is four contexts, lives
 * in `tests/support/jvm-add-module-e2e.ts`. The seam-wall negatives
 * are deliberately not repeated here: the scope holding that wall is a
 * property of the build system, not of the cell, so each is asserted
 * once — in `add-module-quarkus-rest-gradle.test.ts` for
 * `implementation` and `add-module-quarkus-rest-maven.test.ts` for
 * `optional`.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, it } from 'vitest';
import { runJvmAddModuleE2E } from '../support/jvm-add-module-e2e.js';
import { E2E_TIMEOUT_MS, skipJvmE2E, type JvmProjectSpec } from '../support/jvm-e2e.js';

const SPEC: JvmProjectSpec = {
  stack: 'quarkus-rest-kotlin',
  bootstrapId: 'walking-skeleton/quarkus-rest-kotlin-bootstrap',
  moduleLayout: 'modulith',
};

let cwd: string;
let depCache: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-am-quarkus-rest-kotlin-gradle-'));
  depCache = await fs.mkdtemp(
    path.join(os.tmpdir(), 'keel-e2e-am-quarkus-rest-kotlin-gradle-cache-'),
  );
});

afterEach(async () => {
  await fs.remove(cwd);
  await fs.remove(depCache);
});

describe.skipIf(skipJvmE2E)('add-module e2e (Quarkus REST, Kotlin, Gradle)', () => {
  it(
    'builds three added contexts and dispatches through every one of them',
    () => runJvmAddModuleE2E(SPEC, cwd, depCache),
    E2E_TIMEOUT_MS,
  );
});
