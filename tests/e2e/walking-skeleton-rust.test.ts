/**
 * End-to-end tests for the Rust walking skeleton under the `basic`
 * layout.
 *
 * Scaffolds the `rust-cli` and `rust-http` stacks into real temp
 * directories through the mediator, then verifies each generated
 * project actually tests and builds with the local Rust toolchain —
 * and that the produced binaries behave: the CLI prints its greeting,
 * the HTTP unit serves `/greet` for real.
 *
 * The modulith layout's cells are `modulith-rust-cli.test.ts` and
 * `modulith-rust-http.test.ts`; the shared scaffolding, skip rules
 * and cargo isolation live in `tests/support/rust-e2e.ts`.
 *
 * A fresh `CARGO_HOME` is shared across the tests in this file —
 * cold-fetching the registry index once is slow enough. The
 * `rust-cli` skeleton is dependency-free; `rust-http` pulls axum from
 * crates.io, so that test needs network access.
 */

import fs from 'fs-extra';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  cargoRun,
  debugBin,
  driveGreetCli,
  driveGreetContract,
  E2E_TIMEOUT_MS,
  mkTempDir,
  scaffold,
  skipRustE2E,
  withServer,
  type RustProject,
} from '../support/rust-e2e.js';
import { expectHooksWired, expectLayerDoc, expectLifecycleSkill } from '../support/harness-docs.js';

let cargoHome: string;
let cwd: string;

beforeAll(async () => {
  cargoHome = await mkTempDir('keel-e2e-rust-home-');
});

afterAll(async () => {
  await fs.remove(cargoHome);
});

beforeEach(async () => {
  cwd = await mkTempDir('keel-e2e-rust-');
});

afterEach(async () => {
  await fs.remove(cwd);
});

const buildProject = async (stack: string): Promise<RustProject> => {
  const project = await scaffold({ stack, projectName: 'skel' }, cwd, cargoHome);
  await expectLayerDoc(cwd, 'src/domain', ['Clock', 'trait Greeter']);
  await expectLifecycleSkill(cwd, 'basic');
  await expectHooksWired(cwd, ['pre-commit-format', 'diff-size']);
  cargoRun(project, ['test']);
  cargoRun(project, ['build']);
  return project;
};

describe.skipIf(skipRustE2E)('walking-skeleton Rust e2e', () => {
  it(
    'rust-cli: generates a project that tests, builds, and runs',
    async () => {
      const project = await buildProject('rust-cli');

      driveGreetCli(debugBin(project, 'skel'), project.root);
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'rust-http: generates a project that tests, builds, and serves /greet',
    async () => {
      const project = await buildProject('rust-http');

      await withServer(
        debugBin(project, 'skel-http'),
        {
          cwd: project.root,
          env: { ...process.env, PORT: '0', OTEL_SDK_DISABLED: 'true' },
        },
        driveGreetContract,
      );
    },
    E2E_TIMEOUT_MS,
  );
});
