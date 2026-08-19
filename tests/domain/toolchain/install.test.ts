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
import { asdfProvider } from '../../../src/domain/toolchain/core/asdf.js';
import { miseProvider } from '../../../src/domain/toolchain/core/mise.js';
import { nvmProvider } from '../../../src/domain/toolchain/core/nvm.js';
import { expectErr, expectOk } from '../../support/factory.js';
import {
  CWD,
  GO_BLOCK,
  GO_MOD,
  JVM_BLOCK,
  MISE_ABSENT,
  PACKAGE_JSON,
  RUST_BLOCK,
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

describe('keel toolchain install — the ecosystem records', () => {
  const pinned = (provider: string) =>
    toolchainInstallCommand({ cwd: CWD, interactive: false, provider });

  it('renders .sdkmanrc and delegates to sdk env install on a JVM-only project', async () => {
    // `sdk list java`, whose identifiers are the only thing
    // `sdk env install` will take — a bare `25-tem` names nothing.
    const s = await scenario({
      scripts: [
        {
          command: 'bash',
          argsPrefix: ['-lc'],
          result: { stdout: ' Temurin | | 25.0.4 | tem | | 25.0.4-tem\n' },
        },
      ],
    });

    const report = expectOk(await new ToolchainInstallHandler(s.deps).handle(pinned('sdkman')));

    expect(report).toMatchObject({ provider: 'sdkman', managerPresent: true, installed: true });
    expect(report.configs).toEqual([{ path: '.sdkmanrc', changed: true }]);
    expect(s.tree.read('.sdkmanrc')?.toString()).toContain('java=25.0.4-tem');
    expect(report.unresolved).toEqual([]);
    expect(s.processes.ran('bash').at(-1)?.args[1]).toContain('sdk env install');
  });

  it('renders rust-toolchain.toml and installs the active toolchain', async () => {
    const s = await scenario({ block: RUST_BLOCK });

    const report = expectOk(await new ToolchainInstallHandler(s.deps).handle(pinned('rustup')));

    expect(report.configs).toEqual([{ path: 'rust-toolchain.toml', changed: true }]);
    expect(s.tree.read('rust-toolchain.toml')?.toString()).toContain('channel = "stable"');
    expect(report.tools).toEqual([
      {
        tool: 'rust',
        version: '1',
        provider: 'rustup',
        spelledName: 'rust',
        spelledVersion: 'stable',
      },
    ]);
    expect(s.processes.ran('rustup').map((p) => p.args.join(' '))).toEqual([
      '--version',
      'toolchain install',
    ]);
  });

  it("merges go.mod's toolchain directive and runs nothing — the no-manager answer", async () => {
    const s = await scenario({ block: GO_BLOCK });
    s.tree.seed('go.mod', GO_MOD);

    const report = expectOk(await new ToolchainInstallHandler(s.deps).handle(pinned('go-native')));

    expect(report).toMatchObject({ provider: 'go-native', managerPresent: true, installed: true });
    expect(report.configs).toEqual([{ path: 'go.mod', changed: true }]);
    expect(s.tree.read('go.mod')?.toString()).toBe(
      'module example.com/demo\n\ngo 1.24\ntoolchain go1.24.0\n',
    );
    // The probe is the only thing that ran: there is no manager to call.
    expect(s.processes.ran('go').map((p) => p.args.join(' '))).toEqual(['version']);
  });

  it('re-runs as a no-op once the directive already agrees', async () => {
    const s = await scenario({ block: { ...GO_BLOCK, provider: 'go-native' } });
    s.tree.seed('go.mod', 'module example.com/demo\n\ngo 1.24\ntoolchain go1.24.0\n');

    const report = expectOk(
      await new ToolchainInstallHandler(s.deps).handle(
        toolchainInstallCommand({ cwd: CWD, interactive: false }),
      ),
    );

    expect(report.configs).toEqual([{ path: 'go.mod', changed: false }]);
    expect(s.tree.changes()).toEqual([]);
  });
});

describe('keel toolchain install — resolving a prefix into a lockfile', () => {
  const chosen = toolchainInstallCommand({ cwd: CWD, interactive: false, provider: 'asdf' });

  /** `asdf latest java temurin-25`, answered. */
  const latest = {
    command: 'asdf',
    argsPrefix: ['latest'],
    result: { stdout: 'temurin-25.0.4+7\n' },
  };

  const toolVersions = (s: Awaited<ReturnType<typeof scenario>>): string =>
    s.tree.read('.tool-versions')?.toString() ?? '';

  it('asks asdf for the concrete version and writes that, not the block prefix', async () => {
    const s = await scenario({ scripts: [latest] });

    const report = expectOk(await new ToolchainInstallHandler(s.deps).handle(chosen));

    expect(toolVersions(s)).toContain('java temurin-25.0.4+7\n');
    expect(toolVersions(s)).not.toContain('java temurin-25\n');
    // The already-exact wrapper pin is never asked about.
    expect(toolVersions(s)).toContain('gradle 9.4.1\n');
    expect(s.processes.ran('asdf').map((p) => p.args.join(' '))).toContain(
      'latest java temurin-25',
    );
    expect(report.unresolved).toEqual([]);
    // The report names the version the file actually carries.
    expect(report.tools.find((tool) => tool.tool === 'jdk')?.spelledVersion).toBe(
      'temurin-25.0.4+7',
    );
  });

  it('stays put on a re-run: a resolved lockfile is never re-queried', async () => {
    const s = await scenario({ block: { ...JVM_BLOCK, provider: 'asdf' }, scripts: [latest] });
    s.tree.seed(
      '.tool-versions',
      asdfProvider.render(
        JVM_BLOCK.needs,
        () => undefined,
        new Map([['jdk', 'temurin-25.0.4+7']]),
      )[0]?.content ?? '',
    );

    const report = expectOk(await new ToolchainInstallHandler(s.deps).handle(chosen));

    expect(report.configs).toEqual([{ path: '.tool-versions', changed: false }]);
    expect(s.tree.changes()).toEqual([]);
    // Nothing was asked: were it, a newer patch upstream would call a
    // perfectly good lockfile stale on every run.
    expect(s.processes.ran('asdf').map((p) => p.args[0])).not.toContain('latest');
  });

  it('never regresses a resolved file to the prefix when asdf is absent', async () => {
    const s = await scenario({
      block: { ...JVM_BLOCK, provider: 'asdf' },
      scripts: [absentProbe('asdf')],
    });
    s.tree.seed('.tool-versions', 'gradle 9.4.1\njava temurin-25.0.4+7\n');

    const report = expectOk(await new ToolchainInstallHandler(s.deps).handle(chosen));

    expect(report.managerPresent).toBe(false);
    expect(toolVersions(s)).toContain('java temurin-25.0.4+7\n');
    expect(report.unresolved).toEqual([]);
  });

  it('renders the prefix and says so when there is nothing to resolve it from', async () => {
    const s = await scenario({
      block: { ...JVM_BLOCK, provider: 'asdf' },
      scripts: [absentProbe('asdf')],
    });

    const report = expectOk(await new ToolchainInstallHandler(s.deps).handle(chosen));

    // N.2's guarantee holds: the config lands regardless.
    expect(toolVersions(s)).toContain('java temurin-25\n');
    expect(report.unresolved).toEqual([{ tool: 'jdk', provider: 'asdf', spelled: 'temurin-25' }]);
  });

  it('leaves a provider that takes prefixes natively alone — mise runs no query', async () => {
    const s = await scenario();

    expectOk(await new ToolchainInstallHandler(s.deps).handle(command));

    expect(s.processes.ran('mise').map((p) => p.args[0])).toEqual([
      '--version',
      'trust',
      'install',
    ]);
  });
});
