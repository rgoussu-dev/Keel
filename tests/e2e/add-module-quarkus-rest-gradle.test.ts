/**
 * Grid cell: **Quarkus REST · Java · Gradle**, three bounded contexts
 * added by `keel add module`.
 *
 * One of the 24 cells of the add-module grid — 12 stacks × 2 build
 * systems, the same grid `modulith-<stack>-<build>.test.ts` populates
 * for `keel new`. The body every cell runs, and why the shape is four
 * contexts, lives in `tests/support/jvm-add-module-e2e.ts`.
 *
 * This cell carries one thing the other twenty-three do not: the
 * **Gradle seam wall**. The scope that holds it — `implementation`,
 * non-transitive, so a consumed context's domain never reaches its
 * consumer's classpath — is a property of the build system rather than
 * of the cell, and asserting it 12 times would be 12 copies of one
 * fact. It is asserted here for Gradle and in
 * `add-module-quarkus-rest-maven.test.ts` for Maven, where the scope
 * is spelled `optional` and the peer context's Maven half once shipped
 * without it.
 *
 * The `--with-peer-context` suites prove the same wall against the
 * *skeleton*, whose seam module the bootstrap wrote. This proves it
 * against one `keel add module` wrote, between two added contexts.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addThreeContexts, runJvmAddModuleE2E } from '../support/jvm-add-module-e2e.js';
import {
  compileFails,
  E2E_TIMEOUT_MS,
  skipJvmE2E,
  type JvmProjectSpec,
} from '../support/jvm-e2e.js';

const SPEC: JvmProjectSpec = {
  stack: 'quarkus-rest',
  bootstrapId: 'walking-skeleton/quarkus-rest-bootstrap',
  moduleLayout: 'modulith',
};

const PKG = 'com.acme.e2e';
const SRC = 'src/main/java/com/acme/e2e';
const GATEWAY = `modules/shipping/infra/ordering-gateway/${SRC}/shipping/infra/orderinggateway/OrderingGateway.java`;

let cwd: string;
let gradleUserHome: string;

/**
 * One Gradle home for the whole file, not one per case.
 *
 * It is a dependency cache, so sharing it is safe, and not sharing it
 * is expensive: each case here runs a real build over a fresh project,
 * and a per-case home makes the second one re-resolve and re-download
 * everything the first already had. Measured, that is 133.32s against
 * 25.92s — see `AGENTS.md §9`. The project tree stays per-case,
 * because each one scaffolds its own.
 */
beforeAll(async () => {
  gradleUserHome = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-am-quarkus-rest-gradle-h-'));
});

afterAll(async () => {
  await fs.remove(gradleUserHome);
});

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-am-quarkus-rest-gradle-'));
});

afterEach(async () => {
  await fs.remove(cwd);
});

const read = (rel: string): Promise<string> =>
  fs.readFile(path.join(cwd, rel.replace(/\//g, path.sep)), 'utf8');

describe.skipIf(skipJvmE2E)('add-module e2e (Quarkus REST, Java, Gradle)', () => {
  it(
    'builds three added contexts and dispatches through every one of them',
    () => runJvmAddModuleE2E(SPEC, cwd, gradleUserHome),
    E2E_TIMEOUT_MS,
  );

  it(
    'holds the seam wall between two added contexts, on `implementation`',
    async () => {
      await addThreeContexts(SPEC, cwd);

      // The edge that defines the seam. Read as declared projects
      // rather than as a substring: the build file's comment names the
      // module it must *not* declare, so a substring check matches the
      // prose documenting the rule and fails a file that obeys it.
      const build = await read('modules/shipping/infra/ordering-gateway/build.gradle.kts');
      const declared = [...build.matchAll(/^\s*(?:api|implementation)\(project\("(.*)"\)\)/gm)].map(
        (m) => m[1],
      );
      expect(declared).toEqual([
        ':modules:shipping:domain:contract',
        ':modules:ordering:user-side:service',
      ]);

      const gateway = path.join(cwd, GATEWAY.replace(/\//g, path.sep));
      const original = await fs.readFile(gateway, 'utf8');
      await fs.writeFile(
        gateway,
        original.replace(
          `package ${PKG}.shipping.infra.orderinggateway;`,
          `package ${PKG}.shipping.infra.orderinggateway;\n\nimport ${PKG}.ordering.domain.contract.OrderingCommand;`,
        ),
      );

      // ordering's seam declares its own contract `implementation`, so
      // that package is not on this module's compile classpath and the
      // import does not resolve.
      const failure = compileFails(SPEC, cwd, gradleUserHome, [
        ':modules:shipping:infra:ordering-gateway:compileJava',
      ]);
      expect(failure).toContain('package com.acme.e2e.ordering.domain.contract does not exist');
    },
    E2E_TIMEOUT_MS,
  );
});
