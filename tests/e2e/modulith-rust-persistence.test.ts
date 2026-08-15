/**
 * End-to-end test for `keel add persistence` on `rust-http` under
 * `--module-layout=modulith`.
 *
 * Not a grid cell — it is a vertical layered onto one, the Rust
 * counterpart of `modulith-persistence` on the JVM side. What makes
 * it worth its own file is what it can catch that
 * `modulith-rust-http` cannot: the persistence slice is the only
 * thing keel emits that **mints a crate**, and a crate emitted at the
 * wrong depth, left out of the member list, or wired into nothing
 * still produces a workspace that compiles.
 *
 * So the assertions are about **binding**, not about files existing:
 *
 *   - `greetings::router` is merged into the assembly's router, which
 *     is the difference between routes that serve and routes that are
 *     compiled and unreachable — the JVM's failure mode, and the one
 *     an adapter at a wrong-but-valid path reproduces exactly;
 *   - the port lands in the contract crate and the adapter in the
 *     infra crate, because both render fine at either home;
 *   - `postgres` is in the **infra crate's** manifest and not in the
 *     workspace root's, since a driver on the root reaches every
 *     crate that names the domain.
 *
 * Manifests are read as dependency **keys**. I.4 had an assertion
 * fail against a correct manifest because a comment mentioned the
 * crate it was proving absent; a substring check cannot tell prose
 * from an edge.
 *
 * **No Docker, by design.** The emitted contract test probes for a
 * daemon and returns early without one, so this runs in the `rust`
 * shard with `tools: cargo` unchanged: `cargo test` compiles every
 * crate — which is what proves the wiring — and skips the single
 * Testcontainers case. The JVM's `modulith-persistence` makes the
 * same trade in a shard with no `docker` either, at the cost of a
 * task-exclusion list this needs no equivalent of.
 */

import path from 'node:path';
import fs from 'fs-extra';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  addVertical,
  cargoRun,
  E2E_TIMEOUT_MS,
  mkTempDir,
  scaffold,
  skipRustE2E,
} from '../support/rust-e2e.js';

let cargoHome: string;
let cwd: string;

beforeAll(async () => {
  cargoHome = await mkTempDir('keel-e2e-rust-modulith-persistence-home-');
});

afterAll(async () => {
  await fs.remove(cargoHome);
});

beforeEach(async () => {
  cwd = await mkTempDir('keel-e2e-rust-modulith-persistence-');
});

afterEach(async () => {
  await fs.remove(cwd);
});

const read = (...rel: readonly string[]): Promise<string> =>
  fs.readFile(path.join(cwd, ...rel), 'utf8');

const CONTRACT = ['modules', 'greeting', 'domain', 'contract'];
const INFRA = ['modules', 'greeting', 'infra', 'postgres'];

/**
 * The crate names in one table of a manifest, sorted.
 *
 * Reads keys rather than substrings for the reason the peer-context
 * suite does: a manifest may legitimately *mention* in a comment the
 * crate a test is proving it does not depend on.
 */
function dependencyKeys(
  manifest: string,
  table: '[dependencies]' | '[dev-dependencies]',
): string[] {
  const open = manifest.indexOf(table);
  if (open === -1) return [];
  const body = manifest.slice(open + table.length);
  const end = body.indexOf('\n[');
  return (end === -1 ? body : body.slice(0, end))
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .map((line) => /^\s*([A-Za-z0-9_.-]+)\s*=/.exec(line)?.[1])
    .filter((name): name is string => name !== undefined)
    .sort();
}

describe.skipIf(skipRustE2E)('rust-http modulith persistence e2e', () => {
  it(
    'lands the slice in the crates that own it, wires it, and builds',
    async () => {
      const project = await scaffold(
        { stack: 'rust-http', projectName: 'skel', moduleLayout: 'modulith' },
        cwd,
        cargoHome,
      );
      await addVertical('persistence', cwd);

      // The port belongs to the context's contract face; the adapter
      // and its fakes to a crate of their own. Both render happily at
      // the other's path, which is why the homes are asserted.
      expect(await fs.pathExists(path.join(cwd, ...CONTRACT, 'src', 'greeting_log.rs'))).toBe(true);
      expect(await fs.pathExists(path.join(cwd, ...CONTRACT, 'src', 'unit_of_work.rs'))).toBe(true);
      expect(await fs.pathExists(path.join(cwd, ...INFRA, 'src', 'postgres.rs'))).toBe(true);
      expect(await fs.pathExists(path.join(cwd, 'platform', 'kernel', 'src', 'clock_sys.rs'))).toBe(
        true,
      );

      // A crate outside the member list is a directory, not a build
      // unit — and nothing else in the run would notice.
      expect(await read('Cargo.toml')).toContain('"modules/greeting/infra/postgres",');

      // The driver rides the crate that calls it. On the workspace
      // root it would reach every crate naming the domain; the whole
      // point of minting a crate here is that it does not.
      const infra = await read(...INFRA, 'Cargo.toml');
      expect(dependencyKeys(infra, '[dependencies]')).toContain('postgres');
      expect(dependencyKeys(infra, '[dev-dependencies]')).toContain('testcontainers-modules');
      expect(dependencyKeys(await read('Cargo.toml'), '[dependencies]')).not.toContain('postgres');
      expect(dependencyKeys(await read(...CONTRACT, 'Cargo.toml'), '[dependencies]')).not.toContain(
        'postgres',
      );

      // Emitted is not wired. Routes compiled into a module nobody
      // merged serve nothing, and the build stays green either way.
      const main = await read('application', 'http', 'src', 'main.rs');
      expect(main).toContain('mod greetings;');
      expect(main).toContain('handler::router(greeter).merge(greetings::router(greetings))');

      // Compiles every crate — the proof the graph resolves — and runs
      // every test. The Testcontainers case skips itself without a
      // Docker daemon; the rest do not.
      cargoRun(project, ['test', '--workspace']);
      cargoRun(project, ['build']);
    },
    E2E_TIMEOUT_MS,
  );
});
