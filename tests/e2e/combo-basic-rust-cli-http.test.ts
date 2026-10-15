/**
 * Grid cell: **Rust CLI + HTTP**, `basic` layout, at its default
 * setting — one package, two binaries (roadmap T.4c).
 *
 * `rust-cli-http` is what `arch.cli` + `arch.server-http` produces on
 * Rust: one domain, and one root `Cargo.toml` that both entrypoint
 * bootstraps patch, each adding its own `[[bin]]`. The CLI's binary
 * keeps the project's bare name and the server's takes `-http`, so
 * the two never collide in `target/`.
 *
 * It is `walking-skeleton-rust.test.ts` retargeted: the package tests
 * and builds once, then the CLI greets and the server answers the HTTP
 * contract and both health probes. A `basic` `rust-cli` or `rust-http`
 * project that `keel add entrypoint` grows is this cell byte for byte
 * (I10), so this suite covers it too. Shared scaffolding, skip rules
 * and cargo isolation live in `tests/support/rust-e2e.ts`. The server
 * pulls axum from crates.io, so the test needs network access.
 */

import path from 'node:path';
import fs from 'fs-extra';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
} from '../support/rust-e2e.js';
import { expectHooksWired, expectLayerDoc, expectLifecycleSkill } from '../support/harness-docs.js';

let cargoHome: string;
let cwd: string;

beforeAll(async () => {
  cargoHome = await mkTempDir('keel-e2e-combo-bas-rust-home-');
});

afterAll(async () => {
  await fs.remove(cargoHome);
});

beforeEach(async () => {
  cwd = await mkTempDir('keel-e2e-combo-bas-rust-');
});

afterEach(async () => {
  await fs.remove(cwd);
});

describe.skipIf(skipRustE2E)('rust-cli-http basic combo e2e', () => {
  it(
    'builds one package with both binaries, greets from the CLI and serves /greet',
    async () => {
      const project = await scaffold(
        { stack: 'rust-cli-http', projectName: 'skel' },
        cwd,
        cargoHome,
      );
      await expectLayerDoc(cwd, 'src/domain', ['Clock', 'trait Greeter']);
      await expectLifecycleSkill(cwd, 'basic');
      await expectHooksWired(cwd, ['pre-commit-format', 'diff-size']);

      const manifest = await fs.readFile(path.join(cwd, 'Cargo.toml'), 'utf8');
      expect(manifest).not.toContain('[workspace]');
      // Each entrypoint registers its binary once, the CLI's under the
      // project's bare name and the server's under `-http`.
      expect(manifest.match(/^\[\[bin\]\]$/gm)).toHaveLength(2);
      expect(manifest).toMatch(/^\[\[bin\]\]\nname = "skel"$/m);
      expect(manifest).toMatch(/^\[\[bin\]\]\nname = "skel-http"$/m);

      cargoRun(project, ['test']);
      cargoRun(project, ['build']);

      driveGreetCli(debugBin(project, 'skel'), project.root);

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
