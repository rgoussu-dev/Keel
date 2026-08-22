/**
 * Grid cell: **Quarkus CLI + REST · Kotlin · Gradle**, `modulith` layout —
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
 * `modulith` is the half of this grid #108 is actually about: the
 * `basic` half shipped with the composable-entrypoint mechanism, and
 * this one needed `jvm-shared-root-modulith.ts` — a seed that is a
 * bounded context rather than a layer cake, an unconditional
 * `archiveBaseName` block, and a per-arch module list that grows
 * sideways as contexts are added. Nothing in that port had ever been
 * compiled by a real build before this file existed.
 *
 * `--with-peer-context` rides along, as it does on every
 * single-entrypoint modulith cell. It earns more here than there:
 * the peer-context adapter picks its target assembly by reading the
 * `arch.cli` tag, and a combo tag set is the only input where both
 * candidate assemblies exist, so the read is a real choice rather
 * than the only option.
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
  gradleUserHome = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-combo-mod-quk-gra-dep-'));
});

afterAll(async () => {
  await fs.remove(gradleUserHome);
});

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-combo-mod-quk-gra-'));
});

afterEach(async () => {
  await fs.remove(cwd);
});

describe.skipIf(skipJvmComboE2E)(
  'walking-skeleton modulith combo e2e (Quarkus CLI + REST, Kotlin, Gradle)',
  () => {
    it(
      'builds one hexagon with both entrypoints, greets from the CLI jar and serves /greet',
      () =>
        runJvmComboE2E(
          { stack: 'quarkus-cli-rest-kotlin', moduleLayout: 'modulith', buildSystem: 'gradle' },
          cwd,
          gradleUserHome,
        ),
      E2E_TIMEOUT_MS,
    );
  },
);
