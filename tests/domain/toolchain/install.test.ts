/**
 * Tests for `keel toolchain install` — the engine's write path.
 * Every flow runs through the handler over the shipped fakes: the
 * rendered native file, the delegation to `mise install`, the
 * re-runnable no-op, the loud-but-graceful absent-manager path, and
 * the guard rails (no project, no block, uncovered need).
 */

import { describe, expect, it } from 'vitest';
import { toolchainInstallCommand } from '../../../src/domain/toolchain/contract/commands.js';
import { ToolchainInstallHandler } from '../../../src/domain/toolchain/core/install.js';
import { miseProvider } from '../../../src/domain/toolchain/core/mise.js';
import { expectErr, expectOk } from '../../support/factory.js';
import { CWD, JVM_BLOCK, MISE_ABSENT, scenario } from './scenario.js';

const command = toolchainInstallCommand({ cwd: CWD });

describe('keel toolchain install', () => {
  it('supports its command and nothing else', async () => {
    const { deps } = await scenario();
    const handler = new ToolchainInstallHandler(deps);
    expect(handler.supports(command)).toBe(true);
    expect(handler.supports({ kind: 'keel.new-project' })).toBe(false);
  });

  it('renders the provider config and runs its idempotent install', async () => {
    const { deps, tree, processes } = await scenario();

    const report = expectOk(await new ToolchainInstallHandler(deps).handle(command));

    expect(report).toMatchObject({
      provider: 'mise',
      configPath: 'mise.toml',
      configChanged: true,
      managerPresent: true,
      installed: true,
    });
    expect(report.tools).toEqual([
      { tool: 'gradle', version: '9.4.1', spelledName: 'gradle', spelledVersion: '9.4.1' },
      { tool: 'jdk', version: '25', spelledName: 'java', spelledVersion: 'temurin-25' },
    ]);
    expect(tree.read('mise.toml')?.toString()).toBe(miseProvider.render(JVM_BLOCK.needs).content);
    expect(tree.committed).not.toBeNull();
    // Probe, then trust the rendered config, then delegate.
    expect(processes.ran('mise').map((p) => p.args[0])).toEqual(['--version', 'trust', 'install']);
    expect(processes.ran('mise').every((p) => p.cwd === CWD)).toBe(true);
  });

  it('is a re-runnable no-op: the second run rewrites nothing and still delegates', async () => {
    const { deps, processes } = await scenario();
    const handler = new ToolchainInstallHandler(deps);

    expectOk(await handler.handle(command));
    const second = expectOk(await handler.handle(command));

    expect(second.configChanged).toBe(false);
    expect(second.installed).toBe(true);
    // mise install is idempotent by construction, so it runs each time.
    expect(processes.ran('mise').filter((p) => p.args[0] === 'install')).toHaveLength(2);
  });

  it('still renders the config when mise is absent, loudly reporting the bootstrap path', async () => {
    const { deps, tree, processes } = await scenario({ scripts: [MISE_ABSENT] });

    const report = expectOk(await new ToolchainInstallHandler(deps).handle(command));

    expect(report.managerPresent).toBe(false);
    expect(report.installed).toBe(false);
    expect(report.bootstrap).toContain('curl https://mise.run | sh');
    expect(tree.read('mise.toml')).not.toBeNull();
    expect(processes.ran('mise').filter((p) => p.args[0] === 'install')).toHaveLength(0);
  });

  it('surfaces a failing mise install as a domain error carrying its stderr', async () => {
    const { deps } = await scenario({
      scripts: [
        { command: 'mise', argsPrefix: ['install'], result: { status: 1, stderr: 'boom\n' } },
      ],
    });

    const error = expectErr(await new ToolchainInstallHandler(deps).handle(command));

    expect(error.code).toBe('keel.toolchain-install-failed');
    expect(error.message).toContain('boom');
  });

  it('refuses when no project is initialised here', async () => {
    const { deps } = await scenario({ initialised: false });
    const error = expectErr(await new ToolchainInstallHandler(deps).handle(command));
    expect(error.code).toBe('keel.not-initialised');
  });

  it("refuses when the manifest declares no toolchain block, naming 'keel add toolchain'", async () => {
    const { deps } = await scenario({ block: null });
    const error = expectErr(await new ToolchainInstallHandler(deps).handle(command));
    expect(error.code).toBe('keel.toolchain-not-declared');
    expect(error.message).toContain('keel add toolchain');
  });

  it('refuses a need the provider does not cover — a partial choice is never offered', async () => {
    const { deps, tree, processes } = await scenario();
    const narrowed = { ...miseProvider, covers: ['node' as const] };

    const error = expectErr(await new ToolchainInstallHandler(deps, narrowed).handle(command));

    expect(error.code).toBe('keel.toolchain-uncovered-need');
    expect(error.message).toContain('gradle');
    expect(error.message).toContain('jdk');
    expect(tree.read('mise.toml')).toBeNull();
    expect(processes.invocations).toHaveLength(0);
  });
});
