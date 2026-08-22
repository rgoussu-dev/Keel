/**
 * Grid cell: **TypeScript CLI + HTTP · pnpm**, `basic` layout —
 * one workspace, two assembly points.
 *
 * `ts-cli-http` is what `arch.cli` + `arch.server-http` produces on
 * Node: a shared domain, `application/cli`, `application/rest`, and
 * one root `package.json`/`README.md` that both entrypoint bootstraps
 * write to. Before the shared-root upsert landed, the second
 * bootstrap to resolve threw `ContributionConflictError` on a path
 * the first had already created.
 *
 * The `basic` half is sampled rather than exhausted — PR #110 built
 * both package managers by hand before shipping the mechanism, so
 * what was missing was a standing check rather than a first look.
 * The sample takes **pnpm** deliberately: npm hoists every workspace
 * member into the root `node_modules` and hides a missing dependency
 * declaration, where pnpm's isolated store refuses it. If only one
 * `basic` cell runs, it should be the strict one.
 *
 * There is no build step — Node runs the emitted sources directly —
 * so the cell installs for real, runs the emitted checks, then runs
 * **both** assembly points off that one `node_modules`. Shared
 * machinery lives in `tests/support/ts-combo-e2e.ts`.
 */

import fs from 'fs-extra';
import { afterEach, beforeEach, describe, it } from 'vitest';
import { E2E_TIMEOUT_MS, mkTempDir, runTsComboE2E, skipWebE2E } from '../support/ts-combo-e2e.js';

const PM = 'pnpm' as const;

let cwd: string;

beforeEach(async () => {
  cwd = await mkTempDir('keel-e2e-combo-bas-ts-pnpm-');
});

afterEach(async () => {
  await fs.remove(cwd);
});

describe.skipIf(skipWebE2E(PM))(`ts-cli-http basic combo e2e (${PM})`, () => {
  it(
    'installs one workspace with both entrypoints, greets from the CLI and serves /greet',
    () => runTsComboE2E({ pm: PM, moduleLayout: 'basic' }, cwd),
    E2E_TIMEOUT_MS,
  );
});
