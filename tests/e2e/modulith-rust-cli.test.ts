/**
 * End-to-end test for `rust-cli` under `--module-layout=modulith`.
 *
 * One of the two Rust modulith cells (the other is
 * `modulith-rust-http.test.ts`). Cargo is the only build system for
 * these stacks, so the Rust grid is 2 stacks × 2 layouts and these
 * are the two new cells.
 *
 * What it asserts beyond "it builds": that the emitted tree is a
 * **workspace** rather than a package, that the crate names came out
 * in all three of their spellings, that the binary kept the project's
 * own name despite moving into `application/cli`, and that the
 * dependency wall is real — `application-cli` must not be able to
 * name the greeting core.
 */

import path from 'node:path';
import { spawnSync } from 'node:child_process';
import fs from 'fs-extra';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  cargoRun,
  debugBin,
  E2E_TIMEOUT_MS,
  mkTempDir,
  scaffold,
  skipRustE2E,
} from '../support/rust-e2e.js';

let cargoHome: string;
let cwd: string;

beforeAll(async () => {
  cargoHome = await mkTempDir('keel-e2e-rust-modulith-cli-home-');
});

afterAll(async () => {
  await fs.remove(cargoHome);
});

beforeEach(async () => {
  cwd = await mkTempDir('keel-e2e-rust-modulith-cli-');
});

afterEach(async () => {
  await fs.remove(cwd);
});

const read = (rel: string): Promise<string> => fs.readFile(path.join(cwd, rel), 'utf8');

describe.skipIf(skipRustE2E)('rust-cli modulith e2e', () => {
  it(
    'scaffolds a workspace that tests, builds, and runs the CLI',
    async () => {
      const project = await scaffold(
        { stack: 'rust-cli', projectName: 'skel', moduleLayout: 'modulith' },
        cwd,
        cargoHome,
      );

      // The layout is a workspace of crates, not one package.
      const root = await read('Cargo.toml');
      expect(root).toContain('[workspace]');
      expect(root).not.toContain('[package]');
      for (const member of [
        'platform/kernel',
        'modules/greeting/domain/contract',
        'modules/greeting/domain/core',
        'modules/greeting/user-side/service',
        'application/cli',
      ]) {
        expect(root).toContain(`"${member}",`);
      }

      cargoRun(project, ['test', '--workspace']);
      cargoRun(project, ['build']);

      // The binary keeps the project's name even though the assembly
      // crate is `application-cli` — the dial must not rename it.
      const bin = debugBin(project, 'skel');
      const run = spawnSync(bin, ['--name', 'E2E'], { cwd: project.root, encoding: 'utf8' });
      expect(run.status).toBe(0);
      expect(run.stdout).toBe('Hello, E2E!\n');

      const rejected = spawnSync(bin, ['--name', '  '], { cwd: project.root, encoding: 'utf8' });
      expect(rejected.status).toBe(2);
      expect(rejected.stderr).toContain('name must not be empty');
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'walls the context core off from the assembly',
    async () => {
      const project = await scaffold(
        { stack: 'rust-cli', projectName: 'skel', moduleLayout: 'modulith' },
        cwd,
        cargoHome,
      );

      // Only the contract face depends on the core. Assert the edge
      // is absent from the manifest rather than trusting the docs.
      const assembly = await read('application/cli/Cargo.toml');
      expect(assembly).toContain('greeting-domain-contract');
      expect(assembly).not.toContain('greeting-domain-core');

      // And prove the wall holds rather than merely reading as if it
      // does: naming the core from the assembly must not compile.
      const main = path.join(cwd, 'application', 'cli', 'src', 'main.rs');
      const original = await fs.readFile(main, 'utf8');
      await fs.writeFile(main, `use greeting_domain_core::message;\n${original}`);
      const violation = spawnSync('cargo', ['check', '-p', 'application-cli'], {
        cwd: project.root,
        env: { ...process.env, CARGO_HOME: cargoHome },
        encoding: 'utf8',
      });
      expect(violation.status).not.toBe(0);
      expect(violation.stderr).toContain('greeting_domain_core');
    },
    E2E_TIMEOUT_MS,
  );
});
