/**
 * Grid cell: **Quarkus CLI · Java · Gradle**, `modulith` layout with
 * the peer bounded context.
 *
 * The first CLI modulith ever built, in any framework, language or
 * build system — twelve cells of the grid share that, and this is the
 * one that opens them.
 *
 * The CLI assembly is not the REST one with a different main class.
 * It is `application/cli` rather than `application/api`, and the
 * peer-context adapter picks between them at scaffold time by reading
 * the `arch.cli` tag (`assembly = cli ? layout.cliRuntime :
 * layout.restRuntime`). Every patch that family applies is aimed at
 * whatever that resolution returned — the `include(…)` lines, the
 * assembly's peer dependencies, the composition-root binding, and the
 * directory `GuestbookWiringTest` renders into. The REST cells prove
 * one branch of that conditional; nothing proved the other.
 *
 * Coverage here is as strong as a REST cell's, which was worth
 * checking rather than assuming: the wiring test lands in the CLI
 * assembly too, and it injects `Mediator` and dispatches a
 * `SignCommand` — nothing about it is REST-shaped — so the build
 * proves container discovery and peer binding, not merely that the
 * project compiles and packages. Running the jar then proves the
 * picocli wiring on top of that.
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
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-mod-qcli-'));
  gradleUserHome = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-mod-qcli-gradle-'));
});

afterEach(async () => {
  await fs.remove(cwd);
  await fs.remove(gradleUserHome);
});

describe.skipIf(skipJvmCliE2E)('walking-skeleton modulith e2e (Quarkus CLI, Gradle)', () => {
  it(
    'builds a two-context Quarkus CLI modulith on Gradle and greets from the jar',
    () =>
      runJvmCliE2E(
        {
          stack: 'quarkus-cli',
          moduleLayout: 'modulith',
          withPeerContext: true,
          bootstrapId: 'walking-skeleton/quarkus-cli-bootstrap',
          runJar: ['application', 'cli', 'build', 'quarkus-app', 'quarkus-run.jar'],
          argv: ['hello', '--name', 'E2E'],
          expectedStdout: 'Hello, E2E!',
        },
        cwd,
        gradleUserHome,
      ),
    E2E_TIMEOUT_MS,
  );
});
