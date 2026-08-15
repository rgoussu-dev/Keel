/**
 * Grid cell: **Micronaut CLI · Java · Gradle**, `modulith` layout with
 * the peer bounded context.
 *
 * Micronaut's Java assembly discovers handlers through
 * `@Import(packages = …, annotated = @DomainHandler)`, which does not
 * recurse into subpackages: a bounded context missing from that list
 * contributes no bean definition, the mediator is short a handler,
 * and the application starts perfectly. The peer binding's job is to
 * widen that list in whichever assembly the layout resolved, and this
 * is the first cell where that assembly is `application/cli`.
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
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-mod-mncli-'));
  gradleUserHome = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-mod-mncli-gradle-'));
});

afterEach(async () => {
  await fs.remove(cwd);
  await fs.remove(gradleUserHome);
});

describe.skipIf(skipJvmCliE2E)('walking-skeleton modulith e2e (Micronaut CLI, Gradle)', () => {
  it(
    'builds a two-context Micronaut CLI modulith on Gradle and greets from the jar',
    () =>
      runJvmCliE2E(
        {
          stack: 'micronaut-cli',
          moduleLayout: 'modulith',
          withPeerContext: true,
          bootstrapId: 'walking-skeleton/micronaut-cli-bootstrap',
          runJar: ['application', 'cli', 'build', 'libs', 'application-cli-0.1.0-SNAPSHOT-all.jar'],
          argv: ['hello', '--name', 'E2E'],
          expectedStdout: 'Hello, E2E!',
        },
        cwd,
        gradleUserHome,
      ),
    E2E_TIMEOUT_MS,
  );
});
