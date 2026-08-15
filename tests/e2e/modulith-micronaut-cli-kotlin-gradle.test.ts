/**
 * Grid cell: **Micronaut CLI · Kotlin · Gradle**, `modulith` layout
 * with the peer bounded context.
 *
 * The by-hand handler list, in the CLI assembly. Micronaut's Kotlin
 * composition root cannot use `@Import(annotated = …)` — it is
 * Java-only, and annotation discovery would drag KSP into
 * `domain/core` — so it wires handlers explicitly as
 * `RegistryMediator(listOf(GreetHandler(), SignHandler(welcome)))`,
 * and the peer binding is a patch that rewrites that literal.
 *
 * This is that patch aimed at `application/cli` rather than
 * `application/api`: the same `MediatorFactory` file name under a
 * different assembly, resolved from the `arch.cli` tag. If the
 * resolution or the anchor were wrong the patch throws at scaffold
 * time; if the rewritten list resolves its peer eagerly it closes the
 * construction cycle instead, which only a container shows.
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
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-mod-mkcli-'));
  gradleUserHome = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-mod-mkcli-gradle-'));
});

afterEach(async () => {
  await fs.remove(cwd);
  await fs.remove(gradleUserHome);
});

describe.skipIf(skipJvmCliE2E)(
  'walking-skeleton modulith e2e (Micronaut CLI, Kotlin, Gradle)',
  () => {
    it(
      'builds a two-context Kotlin Micronaut CLI modulith on Gradle and greets from the jar',
      () =>
        runJvmCliE2E(
          {
            stack: 'micronaut-cli-kotlin',
            moduleLayout: 'modulith',
            withPeerContext: true,
            bootstrapId: 'walking-skeleton/micronaut-cli-kotlin-bootstrap',
            runJar: [
              'application',
              'cli',
              'build',
              'libs',
              'application-cli-0.1.0-SNAPSHOT-all.jar',
            ],
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
