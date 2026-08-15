/**
 * Grid cell: **Quarkus REST · Java · Gradle**, `modulith` layout with
 * the peer bounded context.
 *
 * The cell that looked covered and was not. `modulith-baseline.test.ts`
 * scaffolds this same stack, layout and build system — but *without*
 * `--with-peer-context`, so it exercises none of the peer family. And
 * the peer family is where every modulith defect has come from.
 *
 * What only this cell reaches is the intersection: Quarkus' peer
 * binding had only ever been compiled by Maven, and the Gradle peer
 * patches — `gradleIncludesPatch` appending three `include(…)` lines
 * to `settings.gradle.kts`, `assemblyDepsPatch` anchoring on the
 * `platform:kernel` dependency in the assembly's `build.gradle.kts` —
 * had only ever been compiled under Spring and Micronaut. Quarkus ×
 * Gradle × peer was the empty intersection of two covered rows, which
 * is exactly the shape of gap a grid exists to make visible.
 *
 * The CDI failure mode is the silent one: the assembly resolves the
 * peer through `Instance<GreetingService>` so the construction cycle
 * mediator → SignHandler → Welcome → GreetingService → mediator stays
 * open. Resolve it eagerly instead and the container dies at startup;
 * miss the bean archive marker and `SignHandler` is simply never
 * discovered and the application starts perfectly.
 * `GuestbookWiringTest` dispatches through the real container, which
 * is what separates those two from a green build.
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
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-mod-qj-'));
  gradleUserHome = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-mod-qj-gradle-'));
});

afterEach(async () => {
  await fs.remove(cwd);
  await fs.remove(gradleUserHome);
});

describe.skipIf(skipJvmRestE2E)('walking-skeleton modulith e2e (Quarkus REST, Gradle)', () => {
  it(
    'builds a two-context Quarkus modulith on Gradle and serves /greet',
    () =>
      runJvmRestE2E(
        {
          stack: 'quarkus-rest',
          moduleLayout: 'modulith',
          withPeerContext: true,
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
