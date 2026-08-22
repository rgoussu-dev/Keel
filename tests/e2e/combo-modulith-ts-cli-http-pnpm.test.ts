/**
 * Grid cell: **TypeScript CLI + HTTP · pnpm**, `modulith` layout —
 * one workspace, two assembly points.
 *
 * `ts-cli-http` is what `arch.cli` + `arch.server-http` produces on
 * Node: a shared domain, `application/cli`, `application/rest`, and
 * one root `package.json`/`README.md` that both entrypoint bootstraps
 * write to. Before the shared-root upsert landed, the second
 * bootstrap to resolve threw `ContributionConflictError` on a path
 * the first had already created.
 *
 * `modulith` is the half of this grid issue #108 is actually about.
 * `ts-shared-root.ts` used to early-return the old whole-file
 * behaviour whenever `shell.suffix === '-modulith'`, so the composed
 * path simply did not exist here; it now branches into
 * `modulithReadmeSeed`/`modulithReadmeSection` and the modulith
 * `lint` script, and nothing had ever installed the result.
 *
 * `--with-peer-context` rides along: the modulith's central claim is
 * that a context is reachable only through the two entry points its
 * `exports` map publishes, and a second context is what makes that a
 * claim rather than a formality.
 *
 * On pnpm rather than npm, and the two are not duplicates of each
 * other: pnpm's isolated store refuses a package that borrows a
 * dependency it never declared, where npm's hoisting would resolve
 * it out of the root `node_modules` and say nothing.
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
  cwd = await mkTempDir('keel-e2e-combo-mod-ts-pnpm-');
});

afterEach(async () => {
  await fs.remove(cwd);
});

describe.skipIf(skipWebE2E(PM))(`ts-cli-http modulith combo e2e (${PM})`, () => {
  it(
    'installs one workspace with both entrypoints, greets from the CLI and serves /greet',
    () => runTsComboE2E({ pm: PM, moduleLayout: 'modulith' }, cwd),
    E2E_TIMEOUT_MS,
  );
});
