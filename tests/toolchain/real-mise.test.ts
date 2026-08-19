/**
 * The real-install suite for the provisioning engine (roadmap N.2):
 * a genuine `mise install` against a genuine mise on PATH, proving
 * the rendered `mise.toml`, the trust-then-install sequence, the
 * re-runnable no-op, and that `keel toolchain check` agrees with
 * what mise actually did.
 *
 * Opt-in and env-gated on `KEEL_RUN_TOOLCHAIN=1` — the
 * `tests/currency/` pattern, deliberately **never** in the PR
 * matrix: it reaches the network and mutates the runner's mise
 * state, neither of which belongs in a fast gate. It assumes mise is
 * already on PATH (opting in is asserting that); the first test says
 * so loudly rather than skipping silently. Run it with:
 *
 *   KEEL_RUN_TOOLCHAIN=1 pnpm vitest run tests/toolchain/
 *
 * The provisioned need is deliberately the cheapest one in the
 * vocabulary (pnpm, a single small download) with its version taken
 * from the pin registry — exactly what the `toolchain` vertical
 * would record.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { emptyManifestV2, projectScopeRoot } from '../../src/domain/contract/manifest.js';
import {
  toolchainCheckQuery,
  toolchainInstallCommand,
} from '../../src/domain/toolchain/contract/commands.js';
import { fsManifestStore } from '../../src/infrastructure/manifest/fs-manifest-store.js';
import { spawnProcessRunner } from '../../src/infrastructure/process/spawn-process-runner.js';
import { expectOk, installMediator } from '../support/factory.js';
import { loadRegistry } from '../support/version-pins.js';

const optedIn = process.env.KEEL_RUN_TOOLCHAIN === '1';

const pnpmPin = (): string => {
  const pin = loadRegistry().find((p) => p.id === 'ts-pnpm');
  if (!pin) throw new Error("test setup: no 'ts-pnpm' entry in the pin registry");
  return pin.value;
};

describe.skipIf(!optedIn)('real mise provisioning', () => {
  let cwd: string;

  beforeAll(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-toolchain-real-'));
    const manifest = {
      ...emptyManifestV2('2026-08-19T12:00:00Z', '0.0.0-test'),
      toolchain: {
        schemaVersion: 1 as const,
        needs: [{ tool: 'pnpm' as const, version: pnpmPin(), source: 'ts-pnpm' }],
      },
    };
    await fsManifestStore.write(projectScopeRoot(cwd), manifest);
  });

  afterAll(async () => {
    await fs.remove(cwd);
  });

  it('requires mise on PATH — opting in asserts the runner provides it', () => {
    const probe = spawnProcessRunner.run('mise', ['--version'], { cwd: os.tmpdir() });
    expect(
      probe.startFailure,
      'KEEL_RUN_TOOLCHAIN=1 assumes mise is installed: curl https://mise.run | sh',
    ).toBeUndefined();
    expect(probe.status).toBe(0);
  });

  it('installs the declared toolchain, is a re-runnable no-op, and check agrees', async () => {
    const mediator = installMediator();

    const install = expectOk(
      await mediator.dispatch(toolchainInstallCommand({ cwd, interactive: false })),
    );
    expect(install.provider).toBe('mise');
    expect(install.managerPresent).toBe(true);
    expect(install.installed).toBe(true);
    expect(install.configs).toEqual([{ path: 'mise.toml', changed: true }]);
    const rendered = await fs.readFile(path.join(cwd, 'mise.toml'), 'utf8');
    expect(rendered).toContain(`pnpm = "${pnpmPin()}"`);
    // The dial's default answer is sticky from the first run on.
    const recorded = await fsManifestStore.read(projectScopeRoot(cwd));
    expect(recorded?.toolchain?.provider).toBe('mise');

    const again = expectOk(
      await mediator.dispatch(toolchainInstallCommand({ cwd, interactive: false })),
    );
    expect(again.configs).toEqual([{ path: 'mise.toml', changed: false }]);
    expect(again.installed).toBe(true);

    const check = expectOk(await mediator.dispatch(toolchainCheckQuery({ cwd })));
    expect(check.managerPresent).toBe(true);
    expect(check.configs).toEqual([{ path: 'mise.toml', upToDate: true }]);
    expect(check.tools).toEqual([
      {
        tool: 'pnpm',
        version: pnpmPin(),
        provider: 'mise',
        spelledName: 'pnpm',
        spelledVersion: pnpmPin(),
        status: 'satisfied',
      },
    ]);
    expect(check.satisfied).toBe(true);
  }, 300_000);
});
