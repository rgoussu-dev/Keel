/**
 * The Maven twin of `add-module-jvm.test.ts`: three bounded contexts
 * added by `keel add module`, built with `./mvnw verify`.
 *
 * A separate file because a file is the unit of CI scheduling, and a
 * separate *case* because two of the things `keel add module` gets
 * right under Maven have no Gradle equivalent to inherit correctness
 * from:
 *
 *   - **The non-transitive scope is spelled `optional`**, not
 *     `implementation`. That is the whole seam wall, and the peer
 *     context's Maven half shipped without it once — no generated
 *     project could have caught it, because nothing in a
 *     one-context project consumes the seam.
 *   - **The assembly's dependency anchor is not `</dependencies>`.**
 *     A Quarkus pom opens with a `<dependencyManagement>` block that
 *     closes one of those first, so anchoring on the tag files the new
 *     modules under version management — where they pin versions and
 *     add nothing to the classpath. That failed only under a real
 *     Maven build, with `package … does not exist` in the assembly,
 *     and the same anchor is what this command reuses once per
 *     context.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  addModule,
  buildProject,
  compileFails,
  E2E_TIMEOUT_MS,
  scaffold,
  skipJvmMavenE2E,
  type JvmProjectSpec,
} from '../support/jvm-e2e.js';

const SPEC: JvmProjectSpec = {
  stack: 'quarkus-rest',
  bootstrapId: 'walking-skeleton/quarkus-rest-bootstrap',
  moduleLayout: 'modulith',
  buildSystem: 'maven',
  runJar: ['application', 'api', 'build', 'quarkus-app', 'quarkus-run.jar'],
  runJarMaven: ['application', 'api', 'target', 'quarkus-app', 'quarkus-run.jar'],
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
  mavenRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-add-module-mvn-repo-'));
});

afterAll(async () => {
  await fs.remove(mavenRepo);
});

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-add-module-mvn-'));
});

afterEach(async () => {
  await fs.remove(cwd);
});

const read = (rel: string): Promise<string> =>
  fs.readFile(path.join(cwd, rel.replace(/\//g, path.sep)), 'utf8');

/** greeting ← ordering ← shipping, plus a context consuming nothing. */
async function threeContexts(): Promise<void> {
  await scaffold(SPEC, cwd);
  await addModule('ordering', 'greeting', cwd);
  await addModule('shipping', 'ordering', cwd);
  await addModule('billing', null, cwd);
}

describe.skipIf(skipJvmMavenE2E)('jvm add-module maven e2e', () => {
  it(
    'builds three contexts and dispatches through every one of them',
    async () => {
      await threeContexts();

      // Every module of every context is a reactor module.
      const root = await read('pom.xml');
      for (const module of [
        'modules/ordering/user-side/service',
        'modules/shipping/infra/ordering-gateway',
        'modules/billing/domain/core',
      ]) {
        expect(root).toContain(`<module>${module}</module>`);
      }

      // The assembly's new dependencies landed on the classpath, not
      // under <dependencyManagement>. Reading the position rather than
      // the presence is the only way to tell those apart, and the
      // difference is invisible until something tries to compile
      // against them.
      const assembly = await read('application/api/pom.xml');
      expect(assembly.indexOf('<artifactId>ordering-domain-core</artifactId>')).toBeGreaterThan(
        assembly.indexOf('</dependencyManagement>'),
      );

      buildProject(SPEC, cwd, mavenRepo, []);
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'holds the seam wall between two added contexts, on `optional`',
    async () => {
      await threeContexts();

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
