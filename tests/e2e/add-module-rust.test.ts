/**
 * End-to-end test for `keel add module` on the Rust modulith.
 *
 * Not a grid cell — same status as `modulith-rust-peer-context`. What
 * it covers is the shape nothing else has ever built: **three**
 * bounded contexts, where the third reaches the second and the second
 * reaches the skeleton.
 *
 * Three is the number that matters, and two would have passed while
 * hiding the bug. With two contexts the consumed one is always
 * `greeting`, whose core takes no dependencies and whose seam
 * therefore self-assembles — `new_greeting_service()` with no
 * arguments. An added context's core may hold a gateway to a third, so
 * its seam can only be built by its own wiring module. That branch is
 * unreachable at two contexts and wrong-by-default at three, which is
 * exactly the class of defect a scaffolder ships without noticing.
 *
 * The negative is the one `modulith-rust-peer-context` already proves
 * for the skeleton, re-aimed at an *added* context: a gateway naming
 * the consumed context's domain crate gets `E0432: unresolved import`,
 * because the crate graph gives it the seam crate and nothing else.
 */

import path from 'node:path';
import { spawnSync } from 'node:child_process';
import fs from 'fs-extra';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  addModule,
  cargoRun,
  E2E_TIMEOUT_MS,
  mkTempDir,
  scaffold,
  skipRustE2E,
  type RustProject,
} from '../support/rust-e2e.js';

let cargoHome: string;
let cwd: string;

beforeAll(async () => {
  cargoHome = await mkTempDir('keel-e2e-rust-add-module-home-');
});

afterAll(async () => {
  await fs.remove(cargoHome);
});

beforeEach(async () => {
  cwd = await mkTempDir('keel-e2e-rust-add-module-');
});

afterEach(async () => {
  await fs.remove(cwd);
});

const read = (...rel: readonly string[]): Promise<string> =>
  fs.readFile(path.join(cwd, ...rel), 'utf8');

/** The crate names in a manifest's `[dependencies]` table, sorted. */
function dependencyKeys(manifest: string): readonly string[] {
  const table = manifest.slice(manifest.indexOf('[dependencies]'));
  return table
    .split('\n')
    .slice(1)
    .filter((line) => !line.trimStart().startsWith('#'))
    .map((line) => /^\s*([A-Za-z0-9_-]+)\s*=/.exec(line)?.[1])
    .filter((name): name is string => name !== undefined)
    .sort();
}

/** greeting ← ordering ← shipping, plus a context consuming nothing. */
async function threeContexts(): Promise<RustProject> {
  const project = await scaffold(
    { stack: 'rust-cli', projectName: 'skel', moduleLayout: 'modulith' },
    cwd,
    cargoHome,
  );
  await addModule('ordering', 'greeting', cwd);
  await addModule('shipping', 'ordering', cwd);
  await addModule('billing', null, cwd);
  return project;
}

describe.skipIf(skipRustE2E)('rust add-module e2e', () => {
  it(
    'builds three contexts, the third reaching the first through the second',
    async () => {
      const project = await threeContexts();

      // Every crate of every added context is a workspace member, not
      // a directory sitting outside the build.
      const root = await read('Cargo.toml');
      for (const member of [
        'modules/ordering/domain/contract',
        'modules/ordering/user-side/service',
        'modules/ordering/infra/greeting-gateway',
        'modules/shipping/user-side/service',
        'modules/shipping/infra/ordering-gateway',
        'modules/billing/user-side/service',
      ]) {
        expect(root).toContain(`"${member}",`);
      }

      // Rust will not compile a module nobody declared, so these lines
      // are the difference between a bound context and an orphaned
      // directory.
      const main = await read('application', 'cli', 'src', 'main.rs');
      expect(main).toContain('mod ordering;');
      expect(main).toContain('mod shipping;');
      expect(main).toContain('mod billing;');

      // The branch three contexts exists to reach: shipping consumes
      // an *added* context, whose seam cannot self-assemble, so it is
      // built by that context's own wiring module rather than
      // constructed here.
      const wiring = await read('application', 'cli', 'src', 'shipping.rs');
      expect(wiring).toContain('crate::ordering::wire_service()');
      // …and the skeleton's still is constructed directly, because its
      // core takes no dependencies.
      expect(await read('application', 'cli', 'src', 'ordering.rs')).toContain(
        'new_greeting_service()',
      );

      cargoRun(project, ['test', '--workspace']);
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'holds the seam wall between two added contexts',
    async () => {
      const project = await threeContexts();

      // The edge that defines the seam, read as dependency keys rather
      // than as a substring: the manifest's comment names the crate it
      // must *not* declare, so a substring check matches the prose
      // documenting the rule and fails a manifest that obeys it.
      const gateway = await read('modules', 'shipping', 'infra', 'ordering-gateway', 'Cargo.toml');
      expect(dependencyKeys(gateway)).toEqual([
        'ordering-user-side-service',
        'platform-kernel',
        'shipping-domain-contract',
      ]);

      const lib = path.join(
        cwd,
        'modules/shipping/infra/ordering-gateway/src/lib.rs'.replace(/\//g, path.sep),
      );
      const original = await fs.readFile(lib, 'utf8');
      await fs.writeFile(lib, `use ordering_domain_contract::OrderingCommand;\n${original}`);

      const violation = spawnSync('cargo', ['check', '-p', 'shipping-infra-ordering-gateway'], {
        cwd: project.root,
        env: { ...process.env, CARGO_HOME: cargoHome },
        encoding: 'utf8',
      });

      expect(violation.status).not.toBe(0);
      expect(violation.stderr).toContain('E0432');
      expect(violation.stderr).toContain('ordering_domain_contract');
    },
    E2E_TIMEOUT_MS,
  );
});
