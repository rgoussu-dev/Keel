/**
 * Tests for `keel toolchain install` — the engine's write path.
 * Every flow runs through the handler over the shipped fakes: the
 * manager dial (asked once, recorded, then followed), the rendered
 * native files, the delegation to the provider's own install, the
 * re-runnable no-op, the loud-but-graceful absent-manager path, and
 * the guard rails (no project, no block, no covering choice).
 */

import { describe, expect, it } from 'vitest';
import { toolchainInstallCommand } from '../../../src/domain/toolchain/contract/commands.js';
import { ToolchainInstallHandler } from '../../../src/domain/toolchain/core/install.js';
import { miseProvider } from '../../../src/domain/toolchain/core/mise.js';
import { nvmProvider } from '../../../src/domain/toolchain/core/nvm.js';
import { expectErr, expectOk } from '../../support/factory.js';
import {
  CWD,
  JVM_BLOCK,
  MISE_ABSENT,
  PACKAGE_JSON,
  TS_NPM_BLOCK,
  TS_PNPM_BLOCK,
  recordedBlock,
  scenario,
} from './scenario.js';

/** The default CLI shape: `keel toolchain install --yes`. */
const command = toolchainInstallCommand({ cwd: CWD, interactive: false });

/** `keel toolchain install`, with the dial free to ask. */
const asking = toolchainInstallCommand({ cwd: CWD, interactive: true });

const absentProbe = (command_: string) => ({
  command: command_,
  argsPrefix: ['--version'],
  result: { status: null, startFailure: { code: 'ENOENT', message: `spawn ${command_} ENOENT` } },
});

describe('keel toolchain install', () => {
  it('supports its command and nothing else', async () => {
    const { deps } = await scenario();
    const handler = new ToolchainInstallHandler(deps);
    expect(handler.supports(command)).toBe(true);
    expect(handler.supports({ kind: 'keel.new-project' })).toBe(false);
  });

  it('renders the provider config and runs its idempotent install', async () => {
    const s = await scenario();

    const report = expectOk(await new ToolchainInstallHandler(s.deps).handle(command));

    expect(report).toMatchObject({
      provider: 'mise',
      members: ['mise'],
      managerPresent: true,
      installed: true,
    });
    expect(report.configs).toEqual([{ path: 'mise.toml', changed: true }]);
    expect(report.tools).toEqual([
      {
        tool: 'gradle',
        version: '9.4.1',
        provider: 'mise',
        spelledName: 'gradle',
        spelledVersion: '9.4.1',
      },
      {
        tool: 'jdk',
        version: '25',
        provider: 'mise',
        spelledName: 'java',
        spelledVersion: 'temurin-25',
      },
    ]);
    expect(s.tree.read('mise.toml')?.toString()).toBe(
      miseProvider.render(JVM_BLOCK.needs, () => undefined)[0]?.content,
    );
    expect(s.tree.committed).not.toBeNull();
    // Trust the rendered config, then delegate — after the probe.
    expect(s.processes.ran('mise').map((p) => p.args[0])).toEqual([
      '--version',
      'trust',
      'install',
    ]);
    expect(s.processes.ran('mise').every((p) => p.cwd === CWD)).toBe(true);
  });

  it('is a re-runnable no-op: the second run rewrites nothing and still delegates', async () => {
    const { deps, processes } = await scenario();
    const handler = new ToolchainInstallHandler(deps);

    expectOk(await handler.handle(command));
    const second = expectOk(await handler.handle(command));

    expect(second.configs).toEqual([{ path: 'mise.toml', changed: false }]);
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

  it('refuses when nothing on the dial covers the needs whole — never a half-install', async () => {
    const { deps, tree, processes } = await scenario();
    const narrowed = { providers: [nvmProvider], combinations: [] };

    const error = expectErr(await new ToolchainInstallHandler(deps, narrowed).handle(command));

    expect(error.code).toBe('keel.toolchain-uncovered-need');
    expect(error.message).toContain('gradle');
    expect(error.message).toContain('jdk');
    expect(tree.read('mise.toml')).toBeNull();
    expect(processes.invocations).toHaveLength(0);
  });
});

describe('keel toolchain install — the manager dial', () => {
  it('takes the default without asking when the run is non-interactive', async () => {
    const s = await scenario({ block: TS_PNPM_BLOCK });

    const report = expectOk(await new ToolchainInstallHandler(s.deps).handle(command));

    expect(report.provider).toBe('mise');
    expect(s.prompt.asked).toEqual([]);
  });

  it('asks once, then records the answer in the toolchain block', async () => {
    const s = await scenario({ block: TS_NPM_BLOCK, answers: { provider: 'nvm' } });

    const report = expectOk(await new ToolchainInstallHandler(s.deps).handle(asking));

    expect(report.provider).toBe('nvm');
    expect(report.choiceRecorded).toBe(true);
    expect(s.prompt.asked).toEqual(['provider']);
    expect((await recordedBlock(s))?.provider).toBe('nvm');
  });

  it('is sticky: a recorded choice is followed on later runs without asking', async () => {
    const s = await scenario({ block: TS_NPM_BLOCK, answers: { provider: 'nvm' } });
    const handler = new ToolchainInstallHandler(s.deps);

    expectOk(await handler.handle(asking));
    const second = expectOk(await handler.handle(asking));

    expect(second.provider).toBe('nvm');
    expect(second.choiceRecorded).toBe(false);
    expect(s.prompt.asked).toEqual(['provider']);
  });

  it('records the default too, so a --yes run is as sticky as an answered one', async () => {
    const s = await scenario();
    expectOk(await new ToolchainInstallHandler(s.deps).handle(command));
    expect((await recordedBlock(s))?.provider).toBe('mise');
  });

  it('leaves the declared needs untouched when it records the choice', async () => {
    const s = await scenario();
    expectOk(await new ToolchainInstallHandler(s.deps).handle(command));
    expect((await recordedBlock(s))?.needs).toEqual(JVM_BLOCK.needs);
  });

  it('takes an explicit request over the recorded choice, and re-records it', async () => {
    const s = await scenario({ block: TS_NPM_BLOCK, answers: { provider: 'nvm' } });
    const handler = new ToolchainInstallHandler(s.deps);
    expectOk(await handler.handle(asking));

    const report = expectOk(
      await handler.handle(
        toolchainInstallCommand({ cwd: CWD, interactive: false, provider: 'asdf' }),
      ),
    );

    expect(report.provider).toBe('asdf');
    expect(report.choiceRecorded).toBe(true);
    expect((await recordedBlock(s))?.provider).toBe('asdf');
  });

  it('refuses a requested choice that does not cover the needs, naming what does', async () => {
    const s = await scenario({ block: TS_PNPM_BLOCK });

    const error = expectErr(
      await new ToolchainInstallHandler(s.deps).handle(
        toolchainInstallCommand({ cwd: CWD, interactive: false, provider: 'nvm' }),
      ),
    );

    expect(error.code).toBe('keel.toolchain-choice-unavailable');
    expect(error.message).toContain('nvm+corepack');
    expect(s.tree.changes()).toEqual([]);
  });

  it('refuses a recorded choice the needs have outgrown, rather than half-installing', async () => {
    // nvm was chosen when the project was npm-tagged; pnpm arrived since.
    const s = await scenario({ block: { ...TS_PNPM_BLOCK, provider: 'nvm' } });

    const error = expectErr(await new ToolchainInstallHandler(s.deps).handle(command));

    expect(error.code).toBe('keel.toolchain-choice-unavailable');
    expect(error.message).toContain('the recorded provider');
  });
});

describe('keel toolchain install — a combination', () => {
  const chosen = toolchainInstallCommand({
    cwd: CWD,
    interactive: false,
    provider: 'nvm+corepack',
  });

  it("renders every member's native file and runs every member's install, in order", async () => {
    const s = await scenario({ block: TS_PNPM_BLOCK });
    s.tree.seed('package.json', PACKAGE_JSON);

    const report = expectOk(await new ToolchainInstallHandler(s.deps).handle(chosen));

    expect(report.members).toEqual(['nvm', 'corepack']);
    expect(report.configs).toEqual([
      { path: '.nvmrc', changed: true },
      { path: 'package.json', changed: true },
    ]);
    expect(s.tree.read('.nvmrc')?.toString()).toBe('22\n');
    expect(s.tree.read('package.json')?.toString()).toContain('"packageManager": "pnpm@10.33.0"');
    // Each need is spelled by the member that satisfies it.
    expect(report.tools.map((tool) => [tool.tool, tool.provider])).toEqual([
      ['node', 'nvm'],
      ['pnpm', 'corepack'],
    ]);
    expect(s.processes.ran('bash').at(-1)?.args[1]).toContain('nvm install');
    expect(s.processes.ran('corepack').map((p) => p.args[0])).toEqual([
      '--version',
      'enable',
      'install',
    ]);
  });

  it('runs nothing when one member is absent — half a combination is a half-install', async () => {
    const s = await scenario({ block: TS_PNPM_BLOCK, scripts: [absentProbe('corepack')] });
    s.tree.seed('package.json', PACKAGE_JSON);

    const report = expectOk(await new ToolchainInstallHandler(s.deps).handle(chosen));

    expect(report.managerPresent).toBe(false);
    expect(report.installed).toBe(false);
    expect(report.bootstrap).toContain('corepack is not available');
    expect(report.bootstrap).not.toContain('nvm is not installed');
    expect(s.processes.ran('corepack').map((p) => p.args[0])).toEqual(['--version']);
    expect(s.processes.ran('bash').filter((p) => p.args[1]?.includes('nvm install'))).toEqual([]);
    // The declaration still landed, as it does for a single provider.
    expect(s.tree.read('.nvmrc')?.toString()).toBe('22\n');
  });

  it('refuses when a member cannot render its file, before touching anything', async () => {
    const s = await scenario({ block: TS_PNPM_BLOCK });

    const error = expectErr(await new ToolchainInstallHandler(s.deps).handle(chosen));

    expect(error.code).toBe('keel.toolchain-render-failed');
    expect(error.message).toContain('package.json');
    expect(s.tree.changes()).toEqual([]);
  });
});
