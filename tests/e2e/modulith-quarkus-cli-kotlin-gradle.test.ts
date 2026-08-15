/**
 * Grid cell: **Quarkus CLI · Kotlin · Gradle**, `modulith` layout with
 * the peer bounded context.
 *
 * Kotlin and the CLI assembly at once. The peer binding patches a
 * Kotlin composition root in `application/cli`, which means both
 * halves of `sourceFile()` — the language's source root
 * (`src/main/kotlin`) and the assembly the layout resolved from the
 * `arch.cli` tag — have to be right at the same time for the patch to
 * land on a file that exists.
 *
 * One of the 24 cells of the modulith grid (12 stacks × 2 build
 * systems), each of which gets a file of its own — see
 * `docs/roadmap.md` item J. Shared machinery and skip rules live in
 * `tests/support/jvm-cli-e2e.ts`.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, it } from 'vitest';
import { E2E_TIMEOUT_MS, runJvmCliE2E, skipJvmCliE2E } from '../support/jvm-cli-e2e.js';

let cwd: string;
let gradleUserHome: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-mod-qkcli-'));
  gradleUserHome = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-mod-qkcli-gradle-'));
});

afterEach(async () => {
  await fs.remove(cwd);
  await fs.remove(gradleUserHome);
});

describe.skipIf(skipJvmCliE2E)(
  'walking-skeleton modulith e2e (Quarkus CLI, Kotlin, Gradle)',
  () => {
    it(
      'builds a two-context Kotlin Quarkus CLI modulith on Gradle and greets from the jar',
      () =>
        runJvmCliE2E(
          {
            stack: 'quarkus-cli-kotlin',
            moduleLayout: 'modulith',
            withPeerContext: true,
            bootstrapId: 'walking-skeleton/quarkus-cli-kotlin-bootstrap',
            runJar: ['application', 'cli', 'build', 'quarkus-app', 'quarkus-run.jar'],
            argv: ['hello', '--name', 'E2E'],
            expectedStdout: 'Hello, E2E!',
          },
          cwd,
          gradleUserHome,
        ),
      E2E_TIMEOUT_MS,
    );
  },
);
