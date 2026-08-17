/**
 * Grid cell: **Quarkus REST · Java · Maven**, three bounded contexts
 * added by `keel add module`.
 *
 * One of the 24 cells of the add-module grid — 12 stacks × 2 build
 * systems, the same grid `modulith-<stack>-<build>.test.ts` populates
 * for `keel new`. The body every cell runs lives in
 * `tests/support/jvm-add-module-e2e.ts`, and it already carries the
 * one Maven-wide assertion that a *position* rather than a presence
 * can settle: the assembly's new dependencies must land on the
 * classpath, not under `<dependencyManagement>`, because a Quarkus pom
 * opens with a block closing a `</dependencies>` of its own and
 * anchoring on that tag files them where they pin versions and add
 * nothing.
 *
 * This cell carries the **Maven seam wall** on top of it. The
 * non-transitive scope is spelled `optional` here, not
 * `implementation`, and it is the whole wall: the peer context's Maven
 * half shipped without it once, and no generated project could have
 * caught that, because nothing in a one-context project consumes the
 * seam. Asserted once per build system rather than once per cell —
 * Gradle's is in `add-module-quarkus-rest-gradle.test.ts`.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addThreeContexts, runJvmAddModuleE2E } from '../support/jvm-add-module-e2e.js';
import {
  compileFails,
  E2E_TIMEOUT_MS,
  skipJvmMavenE2E,
  type JvmProjectSpec,
} from '../support/jvm-e2e.js';

const SPEC: JvmProjectSpec = {
  stack: 'quarkus-rest',
  bootstrapId: 'walking-skeleton/quarkus-rest-bootstrap',
  moduleLayout: 'modulith',
  buildSystem: 'maven',
};

const PKG = 'com.acme.e2e';
const SRC = 'src/main/java/com/acme/e2e';
const GATEWAY = `modules/shipping/infra/ordering-gateway/${SRC}/shipping/infra/orderinggateway/OrderingGateway.java`;

let cwd: string;
let mavenRepo: string;

/**
 * One local repository for the whole file, for the reason its Gradle
 * twin shares one Gradle home: it is a dependency cache, and a
 * per-case repository makes the second case re-resolve every artifact
 * the first already fetched.
 */
beforeAll(async () => {
  mavenRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-am-quarkus-rest-maven-repo-'));
});

afterAll(async () => {
  await fs.remove(mavenRepo);
});

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-am-quarkus-rest-maven-'));
});

afterEach(async () => {
  await fs.remove(cwd);
});

const read = (rel: string): Promise<string> =>
  fs.readFile(path.join(cwd, rel.replace(/\//g, path.sep)), 'utf8');

describe.skipIf(skipJvmMavenE2E)('add-module e2e (Quarkus REST, Java, Maven)', () => {
  it(
    'builds three added contexts and dispatches through every one of them',
    () => runJvmAddModuleE2E(SPEC, cwd, mavenRepo),
    E2E_TIMEOUT_MS,
  );

  it(
    'holds the seam wall between two added contexts, on `optional`',
    async () => {
      await addThreeContexts(SPEC, cwd);

      // The scope that *is* the wall. `optional` is Maven's
      // non-transitive dependency, and without it the consumed
      // context's whole domain arrives on every consumer's classpath.
      expect(await read('modules/ordering/user-side/service/pom.xml')).toMatch(
        /<artifactId>ordering-domain-contract<\/artifactId>[\s\S]*?<optional>true<\/optional>/,
      );

      const gateway = path.join(cwd, GATEWAY.replace(/\//g, path.sep));
      const original = await fs.readFile(gateway, 'utf8');
      await fs.writeFile(
        gateway,
        original.replace(
          `package ${PKG}.shipping.infra.orderinggateway;`,
          `package ${PKG}.shipping.infra.orderinggateway;\n\nimport ${PKG}.ordering.domain.contract.OrderingCommand;`,
        ),
      );

      const failure = compileFails(SPEC, cwd, mavenRepo, [
        '-pl',
        'modules/shipping/infra/ordering-gateway',
        '-am',
        'compile',
      ]);
      expect(failure).toContain('package com.acme.e2e.ordering.domain.contract does not exist');
    },
    E2E_TIMEOUT_MS,
  );
});
