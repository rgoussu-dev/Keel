/**
 * End-to-end test for `keel add module` on a JVM modulith, under
 * Gradle.
 *
 * Not a grid cell — same status as `modulith-baseline`, whose stack it
 * shares. What it covers is the shape nothing else has ever built:
 * **three** bounded contexts, where the third reaches the second and
 * the second reaches the skeleton, plus a fourth consuming nothing.
 *
 * What only a real build settles here:
 *
 *   - **The container found every handler.** Each added context emits
 *     a `<Name>WiringTest` that dispatches its command through the
 *     real Mediator out of the real container. A handler the container
 *     never discovered costs nothing at compile time and the
 *     application starts perfectly, so this is the only thing that
 *     catches a `@ComponentScan` or `@Import` list that stopped
 *     growing — the exact failure mode `keel add module` invites,
 *     because it runs once per context and every such list must
 *     accumulate.
 *   - **No construction cycle.** `mediator → ShippingHandler →
 *     OrderingClient → OrderingService → mediator` is a real cycle
 *     that only a container closes. Every gateway takes its peer as a
 *     deferred handle for that reason, and only starting the container
 *     proves it worked.
 *   - **The seam wall holds between two *added* contexts.** The
 *     `--with-peer-context` suites prove it against the skeleton,
 *     whose seam module the bootstrap wrote; this proves it against
 *     one `keel add module` wrote.
 *
 * The Maven twin is `add-module-jvm-maven.test.ts`, a separate file
 * because a file is the unit of CI scheduling, and a separate *case*
 * because the non-transitive scope that holds this wall is spelled
 * differently there — `optional` rather than `implementation` — and
 * the peer context's Maven half once shipped without it.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addModule,
  buildProject,
  compileFails,
  E2E_TIMEOUT_MS,
  scaffold,
  skipJvmE2E,
  type JvmProjectSpec,
} from '../support/jvm-e2e.js';

const SPEC: JvmProjectSpec = {
  stack: 'quarkus-rest',
  bootstrapId: 'walking-skeleton/quarkus-rest-bootstrap',
  moduleLayout: 'modulith',
  runJar: ['application', 'api', 'build', 'quarkus-app', 'quarkus-run.jar'],
};

const PKG = 'com.acme.e2e';
const SRC = 'src/main/java/com/acme/e2e';
const GATEWAY = `modules/shipping/infra/ordering-gateway/${SRC}/shipping/infra/orderinggateway/OrderingGateway.java`;

let cwd: string;
let gradleUserHome: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-add-module-jvm-'));
  gradleUserHome = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-add-module-jvm-gradle-'));
});

afterEach(async () => {
  await fs.remove(cwd);
  await fs.remove(gradleUserHome);
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

describe.skipIf(skipJvmE2E)('jvm add-module e2e', () => {
  it(
    'builds three contexts and dispatches through every one of them',
    async () => {
      await threeContexts();

      // Every module of every context is a Gradle subproject, not a
      // directory sitting outside the build.
      const settings = await read('settings.gradle.kts');
      for (const project of [
        ':modules:ordering:user-side:service',
        ':modules:ordering:infra:greeting-gateway',
        ':modules:shipping:user-side:service',
        ':modules:shipping:infra:ordering-gateway',
        ':modules:billing:domain:core',
      ]) {
        expect(settings).toContain(`include("${project}")`);
      }

      // Each context binds in a class of its own, and the two
      // consumers both declare a client named after what they consume
      // — different types, and in shipping's case a name no other
      // context could have imported alongside.
      expect(await read(`application/api/${SRC}/application/api/ShippingWiring.java`)).toContain(
        `import ${PKG}.shipping.domain.contract.OrderingClient;`,
      );

      // The build compiles every module and runs every generated
      // test, the three wiring tests included — which is what proves
      // the container found each handler and that resolving a peer
      // does not close a construction cycle.
      buildProject(SPEC, cwd, gradleUserHome, []);
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'holds the seam wall between two added contexts',
    async () => {
      await threeContexts();

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
