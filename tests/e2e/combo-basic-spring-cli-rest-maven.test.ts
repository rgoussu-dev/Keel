/**
 * Grid cell: **Spring CLI + REST · Java · Maven**, `basic` layout —
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
 * Skipped unless `mvn` is on PATH and `JAVA_HOME` is a JDK 25+ —
 * Maven compiles with whatever JDK runs it, so an older one fails
 * with `release version 25 not supported`, which would read as a keel
 * bug rather than an environment one.
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
import { E2E_TIMEOUT_MS, runJvmComboE2E, skipJvmMavenE2E } from '../support/jvm-combo-e2e.js';

let cwd: string;
let mavenRepo: string;

// One dependency home per file, not per case: a second case here
// would otherwise re-resolve everything the first just downloaded.
// See `AGENTS.md` §9 for the measured cost of getting this wrong.
beforeAll(async () => {
  mavenRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-combo-bas-spj-mav-dep-'));
});

afterAll(async () => {
  await fs.remove(mavenRepo);
});

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-combo-bas-spj-mav-'));
});

afterEach(async () => {
  await fs.remove(cwd);
});

describe.skipIf(skipJvmMavenE2E)(
  'walking-skeleton basic combo e2e (Spring CLI + REST, Java, Maven)',
  () => {
    it(
      'builds one hexagon with both entrypoints, greets from the CLI jar and serves /greet',
      () =>
        runJvmComboE2E(
          { stack: 'spring-cli-rest', moduleLayout: 'basic', buildSystem: 'maven' },
          cwd,
          mavenRepo,
        ),
      E2E_TIMEOUT_MS,
    );
  },
);
