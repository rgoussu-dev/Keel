/**
 * Grid cell: **Quarkus REST · Kotlin · Gradle**, `modulith` layout
 * with the peer bounded context.
 *
 * The first modulith ever built in Kotlin. The layout's Kotlin half
 * was shipped whole — a `templates-modulith/` tree per stack, a
 * `jvm-build-modulith/` variant per build system, a peer-context
 * adapter per (framework, language) — and none of it had been through
 * a compiler; only the `basic` layout had, and only in the flat
 * `application/rest/executable` shape.
 *
 * What this cell proves that its Java twin cannot: the peer binding
 * here is Kotlin source patched into a Kotlin composition root, so
 * the anchors it matches on (`STALE_SERVICE_DOC`, the producer it
 * appends after) have to survive KDoc spelling rather than Javadoc's.
 * A patch that fails to find its anchor throws at scaffold time; one
 * that finds it and produces uncompilable Kotlin fails only here.
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
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-mod-qk-'));
  gradleUserHome = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-mod-qk-gradle-'));
});

afterEach(async () => {
  await fs.remove(cwd);
  await fs.remove(gradleUserHome);
});

describe.skipIf(skipJvmRestE2E)(
  'walking-skeleton modulith e2e (Quarkus REST, Kotlin, Gradle)',
  () => {
    it(
      'builds a two-context Kotlin Quarkus modulith on Gradle and serves /greet',
      () =>
        runJvmRestE2E(
          {
            stack: 'quarkus-rest-kotlin',
            moduleLayout: 'modulith',
            withPeerContext: true,
            bootstrapId: 'walking-skeleton/quarkus-rest-kotlin-bootstrap',
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
  },
);
