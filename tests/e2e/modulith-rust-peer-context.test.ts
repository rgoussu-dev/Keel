/**
 * End-to-end test for the Rust peer context —
 * `--module-layout=modulith --with-peer-context`.
 *
 * Not a grid cell: it is the suite that proves the peer-context
 * adapter family is additive and, more to the point, that the seam is
 * **exercised** rather than merely present. With one context the
 * modulith's claim that contexts meet only at `user-side/service` is
 * asserted by nothing; `guestbook` is the consumer that asserts it.
 *
 * What it checks that a file-existence test would miss:
 *
 *   - the gateway's manifest declares the **seam** and not the peer's
 *     domain — the whole reason `user-side/service` is its own crate;
 *   - the wiring module is actually **declared** in the assembly, so
 *     the context is compiled and bound rather than emitted and
 *     orphaned (the JVM's failure mode: a vertical whose files render
 *     and build while nothing is wired);
 *   - the cross-context call really runs, by running it.
 */

import path from 'node:path';
import { spawnSync } from 'node:child_process';
import fs from 'fs-extra';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cargoRun, E2E_TIMEOUT_MS, mkTempDir, scaffold, skipRustE2E } from '../support/rust-e2e.js';

let cargoHome: string;
let cwd: string;

beforeAll(async () => {
  cargoHome = await mkTempDir('keel-e2e-rust-peer-home-');
});

afterAll(async () => {
  await fs.remove(cargoHome);
});

beforeEach(async () => {
  cwd = await mkTempDir('keel-e2e-rust-peer-');
});

afterEach(async () => {
  await fs.remove(cwd);
});

const read = (...rel: readonly string[]): Promise<string> =>
  fs.readFile(path.join(cwd, ...rel), 'utf8');

/**
 * The crate names in a manifest's `[dependencies]` table, sorted.
 *
 * Comment lines are skipped deliberately: the gateway's manifest
 * documents the edge it must *not* declare, and naming a crate in
 * prose is not depending on it.
 */
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

describe.skipIf(skipRustE2E)('rust peer-context e2e', () => {
  it(
    'scaffolds a second context that reaches the first only through its seam',
    async () => {
      const project = await scaffold(
        {
          stack: 'rust-cli',
          projectName: 'skel',
          moduleLayout: 'modulith',
          withPeerContext: true,
        },
        cwd,
        cargoHome,
      );

      // The edge that defines the seam: the gateway depends on
      // greeting's service crate and on nothing else of greeting's.
      //
      // Read the dependency *keys* rather than substring the file.
      // The manifest's comment explains why there is no
      // `greeting-domain-contract` entry, so a substring check
      // matches the prose that documents the rule and fails a
      // manifest that obeys it.
      const gateway = await read('modules', 'guestbook', 'infra', 'greeting-gateway', 'Cargo.toml');
      expect(dependencyKeys(gateway)).toEqual([
        'greeting-user-side-service',
        'guestbook-domain-contract',
        'platform-kernel',
      ]);

      // Emitted is not the same as wired. Rust will not compile a
      // module nobody declared, so this line is the difference
      // between a bound context and an orphaned directory.
      expect(await read('application', 'cli', 'src', 'main.rs')).toContain('mod guestbook;');

      // Everything compiles and every test — including the wiring
      // test that drives guestbook across the seam — passes.
      cargoRun(project, ['test', '--workspace']);

      // And the peer's own crates are real workspace members, not
      // files sitting outside the build.
      const root = await read('Cargo.toml');
      for (const member of [
        'modules/guestbook/domain/contract',
        'modules/guestbook/domain/core',
        'modules/guestbook/infra/greeting-gateway',
      ]) {
        expect(root).toContain(`"${member}",`);
      }
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'holds the seam wall: the gateway cannot name the peer’s domain',
    async () => {
      const project = await scaffold(
        {
          stack: 'rust-cli',
          projectName: 'skel',
          moduleLayout: 'modulith',
          withPeerContext: true,
        },
        cwd,
        cargoHome,
      );

      const lib = path.join(
        cwd,
        'modules/guestbook/infra/greeting-gateway/src/lib.rs'.replace(/\//g, path.sep),
      );
      const original = await fs.readFile(lib, 'utf8');
      await fs.writeFile(lib, `use greeting_domain_contract::GreetCommand;\n${original}`);

      const violation = spawnSync('cargo', ['check', '-p', 'guestbook-infra-greeting-gateway'], {
        cwd: project.root,
        env: { ...process.env, CARGO_HOME: cargoHome },
        encoding: 'utf8',
      });

      expect(violation.status).not.toBe(0);
      expect(violation.stderr).toContain('greeting_domain_contract');
    },
    E2E_TIMEOUT_MS,
  );
});
