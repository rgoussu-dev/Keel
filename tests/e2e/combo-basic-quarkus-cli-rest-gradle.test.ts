/**
 * Grid cell: **Quarkus CLI + REST · Java · Gradle**, `basic` layout —
 * one hexagon, two deployment units.
 *
 * The combo grid is what `arch.cli` + `arch.server-http` on a single
 * tag set produces: a shared domain, a CLI assembly, a REST assembly,
 * and one set of root build files that both entrypoint bootstraps
 * write to. Before the shared-root upsert landed, the second
 * bootstrap to resolve threw `ContributionConflictError` on a path
 * the first had already created; every assertion here is downstream
 * of that fix, and none of it was reachable from a build until this
 * grid existed.
 *
 * The `basic` half of this grid is sampled rather than exhausted, and
 * this file is one of the six samples — one per combo stack, the
 * build system alternating so both appear against each framework and
 * against each language. PR #110 built all twelve `basic` cells by
 * hand before shipping the mechanism; what was missing was a standing
 * check, not a first look. The twelve `combo-modulith-*` cells
 * exercise the shared seed builders in `jvm-shared-root.ts` on every
 * run anyway — what is `basic`-only is the per-arch module list and
 * the README shape, and one build per stack pins those.
 *
 * The cell scaffolds, builds once — both assemblies are modules of
 * the same reactor — then runs the CLI jar for its greeting and boots
 * the REST jar for the `/greet` wire contract. Both drive steps are
 * the ones the single-entrypoint cells use, so this asserts the same
 * contracts rather than a paraphrase of them. Shared machinery lives
 * in `tests/support/jvm-combo-e2e.ts`.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
import { E2E_TIMEOUT_MS, runJvmComboE2E, skipJvmComboE2E } from '../support/jvm-combo-e2e.js';

let cwd: string;
let gradleUserHome: string;

// One dependency home per file, not per case: a second case here
// would otherwise re-resolve everything the first just downloaded.
// See `AGENTS.md` §9 for the measured cost of getting this wrong.
beforeAll(async () => {
  gradleUserHome = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-combo-bas-quj-gra-dep-'));
});

afterAll(async () => {
  await fs.remove(gradleUserHome);
});

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-combo-bas-quj-gra-'));
});

afterEach(async () => {
  await fs.remove(cwd);
});

describe.skipIf(skipJvmComboE2E)(
  'walking-skeleton basic combo e2e (Quarkus CLI + REST, Java, Gradle)',
  () => {
    it(
      'builds one hexagon with both entrypoints, greets from the CLI jar and serves /greet',
      () =>
        runJvmComboE2E(
          { stack: 'quarkus-cli-rest', moduleLayout: 'basic', buildSystem: 'gradle' },
          cwd,
          gradleUserHome,
        ),
      E2E_TIMEOUT_MS,
    );
  },
);
