/**
 * Grid cell: **Spring CLI · Java · Gradle**, `modulith` layout with
 * the peer bounded context.
 *
 * Spring's peer binding is the one with the explicit list: the
 * assembly's component scan names each bounded context, so a context
 * missing from it is never scanned, `SignHandler` is never
 * discovered, and the application starts perfectly over less
 * behaviour. That list lives in the assembly the layout resolved, and
 * until this cell the only assembly it had ever been written into was
 * `application/api`.
 *
 * The CLI assembly also boots differently — a `CommandLineRunner`
 * around picocli rather than a servlet container — so "the container
 * came up" is proved by the process exiting zero with the right line
 * on stdout, while `GuestbookWiringTest` proves the mediator actually
 * found both handlers.
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
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-mod-scli-'));
  gradleUserHome = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-mod-scli-gradle-'));
});

afterEach(async () => {
  await fs.remove(cwd);
  await fs.remove(gradleUserHome);
});

describe.skipIf(skipJvmCliE2E)('walking-skeleton modulith e2e (Spring CLI, Gradle)', () => {
  it(
    'builds a two-context Spring CLI modulith on Gradle and greets from the jar',
    () =>
      runJvmCliE2E(
        {
          stack: 'spring-cli',
          moduleLayout: 'modulith',
          withPeerContext: true,
          bootstrapId: 'walking-skeleton/spring-cli-bootstrap',
          runJar: ['application', 'cli', 'build', 'libs', 'application-cli-0.1.0-SNAPSHOT.jar'],
          argv: ['hello', '--name', 'E2E'],
          expectedStdout: 'Hello, E2E!',
        },
        cwd,
        gradleUserHome,
      ),
    E2E_TIMEOUT_MS,
  );
});
