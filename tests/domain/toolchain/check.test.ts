/**
 * Tests for `keel toolchain check` — the engine's read path. The
 * standing property across every flow: check never touches anything
 * (no staged change, no commit, no install invocation). The verdict
 * folds three facts: manager presence, per-tool status as the
 * provider reports it, and whether the on-disk config still matches
 * a fresh render of the block.
 */

import { describe, expect, it } from 'vitest';
import { toolchainCheckQuery } from '../../../src/domain/toolchain/contract/commands.js';
import { ToolchainCheckHandler } from '../../../src/domain/toolchain/core/check.js';
import { miseProvider } from '../../../src/domain/toolchain/core/mise.js';
import { expectErr, expectOk } from '../../support/factory.js';
import { nvmProvider } from '../../../src/domain/toolchain/core/nvm.js';
import {
  CWD,
  GO_BLOCK,
  GO_MOD,
  JVM_BLOCK,
  MISE_ABSENT,
  PACKAGE_JSON,
  TS_PNPM_BLOCK,
  miseLs,
  scenario,
  type Scenario,
} from './scenario.js';

const query = toolchainCheckQuery({ cwd: CWD });

/** Seeds the on-disk config as a fresh render would write it. */
function seedConfig(s: Scenario): void {
  for (const config of miseProvider.render(JVM_BLOCK.needs, () => undefined)) {
    s.tree.seed(config.path, config.content);
  }
}

/** Check never stages, commits, or installs anything. */
function expectUntouched(s: Scenario): void {
  expect(s.tree.changes()).toEqual([]);
  expect(s.tree.committed).toBeNull();
  expect(s.processes.invocations.filter((p) => p.args[0] === 'install')).toHaveLength(0);
}

describe('keel toolchain check', () => {
  it('supports its query and nothing else', async () => {
    const { deps } = await scenario();
    const handler = new ToolchainCheckHandler(deps);
    expect(handler.supports(query)).toBe(true);
    expect(handler.supports({ kind: 'keel.toolchain-install' })).toBe(false);
  });

  it('reports satisfied when the config is current and every tool is installed', async () => {
    const s = await scenario({ scripts: [miseLs({ java: true, gradle: true })] });
    seedConfig(s);

    const report = expectOk(await new ToolchainCheckHandler(s.deps).handle(query));

    expect(report).toMatchObject({
      provider: 'mise',
      members: ['mise'],
      managerPresent: true,
      satisfied: true,
    });
    expect(report.configs).toEqual([{ path: 'mise.toml', upToDate: true }]);
    expect(report.tools.map((t) => [t.tool, t.status])).toEqual([
      ['gradle', 'satisfied'],
      ['jdk', 'satisfied'],
    ]);
    expectUntouched(s);
  });

  it('reports a missing tool — absent from mise ls, or listed but not installed', async () => {
    const s = await scenario({ scripts: [miseLs({ java: false })] });
    seedConfig(s);

    const report = expectOk(await new ToolchainCheckHandler(s.deps).handle(query));

    expect(report.satisfied).toBe(false);
    expect(report.tools.map((t) => [t.tool, t.status])).toEqual([
      ['gradle', 'missing'],
      ['jdk', 'missing'],
    ]);
    expectUntouched(s);
  });

  it('counts config drift against satisfaction even when every tool is installed', async () => {
    const s = await scenario({ scripts: [miseLs({ java: true, gradle: true })] });
    s.tree.seed('mise.toml', '[tools]\n# stale render\n');

    const report = expectOk(await new ToolchainCheckHandler(s.deps).handle(query));

    expect(report.configs).toEqual([{ path: 'mise.toml', upToDate: false }]);
    expect(report.satisfied).toBe(false);
    expect(report.tools.every((t) => t.status === 'satisfied')).toBe(true);
    expectUntouched(s);
  });

  it('treats a missing config file as drift', async () => {
    const s = await scenario({ scripts: [miseLs({ java: true, gradle: true })] });
    const report = expectOk(await new ToolchainCheckHandler(s.deps).handle(query));
    expect(report.configs.every((config) => config.upToDate)).toBe(false);
    expectUntouched(s);
  });

  it('reports every tool unknown when mise is absent, with the bootstrap path', async () => {
    const s = await scenario({ scripts: [MISE_ABSENT] });
    seedConfig(s);

    const report = expectOk(await new ToolchainCheckHandler(s.deps).handle(query));

    expect(report.managerPresent).toBe(false);
    expect(report.satisfied).toBe(false);
    expect(report.bootstrap).toContain('curl https://mise.run | sh');
    expect(report.tools.every((t) => t.status === 'unknown')).toBe(true);
    expectUntouched(s);
  });

  it('surfaces a failing status invocation as a domain error', async () => {
    const s = await scenario({
      scripts: [{ command: 'mise', argsPrefix: ['ls'], result: { status: 1, stderr: 'boom' } }],
    });
    const error = expectErr(await new ToolchainCheckHandler(s.deps).handle(query));
    expect(error.code).toBe('keel.toolchain-check-failed');
    expect(error.message).toContain('boom');
  });

  it('reads the recorded choice, and never asks or records one of its own', async () => {
    const s = await scenario({ block: { ...JVM_BLOCK, provider: 'asdf' } });

    const report = expectOk(await new ToolchainCheckHandler(s.deps).handle(query));

    expect(report.provider).toBe('asdf');
    expect(report.configs.map((config) => config.path)).toEqual(['.tool-versions']);
    expect(s.prompt.asked).toEqual([]);
    expect((await s.manifests.read('/project/.claude'))?.toolchain?.provider).toBe('asdf');
    expectUntouched(s);
  });

  it('falls back to the dial default when no choice is recorded yet', async () => {
    const s = await scenario({ scripts: [miseLs({ java: true, gradle: true })] });
    expect(expectOk(await new ToolchainCheckHandler(s.deps).handle(query)).provider).toBe('mise');
  });

  it('refuses a recorded choice the needs have outgrown', async () => {
    const s = await scenario({ block: { ...TS_PNPM_BLOCK, provider: 'nvm' } });
    const error = expectErr(await new ToolchainCheckHandler(s.deps).handle(query));
    expect(error.code).toBe('keel.toolchain-choice-unavailable');
  });

  it('refuses when nothing on the dial covers the needs whole', async () => {
    const s = await scenario();
    const narrowed = { providers: [nvmProvider], combinations: [] };
    const error = expectErr(await new ToolchainCheckHandler(s.deps, narrowed).handle(query));
    expect(error.code).toBe('keel.toolchain-uncovered-need');
  });

  it('reports per member on a combination: each tool by the one that satisfies it', async () => {
    const s = await scenario({
      block: { ...TS_PNPM_BLOCK, provider: 'nvm+corepack' },
      scripts: [
        { command: 'bash', argsPrefix: ['-lc'], result: { stdout: '->      v22.11.0\n' } },
        { command: 'pnpm', argsPrefix: ['--version'], result: { stdout: '10.33.0\n' } },
      ],
    });
    s.tree.seed('package.json', PACKAGE_JSON);
    s.tree.seed('.nvmrc', '22\n');

    const report = expectOk(await new ToolchainCheckHandler(s.deps).handle(query));

    expect(report.members).toEqual(['nvm', 'corepack']);
    expect(report.tools.map((t) => [t.tool, t.provider, t.status])).toEqual([
      ['node', 'nvm', 'satisfied'],
      ['pnpm', 'corepack', 'satisfied'],
    ]);
    // package.json still lacks the field, so that config reads stale.
    expect(report.configs).toEqual([
      { path: '.nvmrc', upToDate: true },
      { path: 'package.json', upToDate: false },
    ]);
    expect(report.satisfied).toBe(false);
    expectUntouched(s);
  });

  it("leaves an absent member's tools unknown while still reporting the present one's", async () => {
    const s = await scenario({
      block: { ...TS_PNPM_BLOCK, provider: 'nvm+corepack' },
      scripts: [
        { command: 'bash', argsPrefix: ['-lc'], result: { stdout: '->      v22.11.0\n' } },
        {
          command: 'corepack',
          argsPrefix: ['--version'],
          result: { status: null, startFailure: { message: 'spawn corepack ENOENT' } },
        },
      ],
    });
    s.tree.seed('package.json', PACKAGE_JSON);

    const report = expectOk(await new ToolchainCheckHandler(s.deps).handle(query));

    expect(report.managerPresent).toBe(false);
    expect(report.tools.map((t) => t.status)).toEqual(['satisfied', 'unknown']);
    expect(report.bootstrap).toContain('corepack is not available');
    expectUntouched(s);
  });

  it('surfaces unreadable status output as a domain error, not a guess', async () => {
    const s = await scenario({
      scripts: [{ command: 'mise', argsPrefix: ['ls'], result: { stdout: 'not json' } }],
    });
    const error = expectErr(await new ToolchainCheckHandler(s.deps).handle(query));
    expect(error.code).toBe('keel.toolchain-check-failed');
  });

  it('shares the front-door guards with install', async () => {
    const uninitialised = await scenario({ initialised: false });
    expect(expectErr(await new ToolchainCheckHandler(uninitialised.deps).handle(query)).code).toBe(
      'keel.not-initialised',
    );

    const undeclared = await scenario({ block: null });
    expect(expectErr(await new ToolchainCheckHandler(undeclared.deps).handle(query)).code).toBe(
      'keel.toolchain-not-declared',
    );
  });
});

describe('keel toolchain check — the Go no-manager choice', () => {
  const scripts = [
    {
      command: 'go',
      argsPrefix: ['version'],
      result: { stdout: 'go version go1.24.3 linux/amd64\n' },
    },
    { command: 'go', argsPrefix: ['env'], result: { stdout: 'auto\ngo1.24.3\n' } },
  ];

  it('reports go.mod out of date when its directive and the block disagree', async () => {
    const s = await scenario({ block: { ...GO_BLOCK, provider: 'go-native' }, scripts });
    s.tree.seed('go.mod', 'module example.com/demo\n\ngo 1.24\ntoolchain go1.22.0\n');

    const report = expectOk(await new ToolchainCheckHandler(s.deps).handle(query));

    expect(report.tools.map((t) => t.status)).toEqual(['satisfied']);
    expect(report.configs).toEqual([{ path: 'go.mod', upToDate: false }]);
    expect(report.satisfied).toBe(false);
    expectUntouched(s);
  });

  it('is satisfied once the directive matches — and still writes nothing', async () => {
    const s = await scenario({ block: { ...GO_BLOCK, provider: 'go-native' }, scripts });
    s.tree.seed('go.mod', 'module example.com/demo\n\ngo 1.24\ntoolchain go1.24.0\n');

    const report = expectOk(await new ToolchainCheckHandler(s.deps).handle(query));

    expect(report.satisfied).toBe(true);
    expectUntouched(s);
  });

  it('leaves the need unknown when Go itself is absent, with the bootstrap guidance', async () => {
    const s = await scenario({
      block: { ...GO_BLOCK, provider: 'go-native' },
      scripts: [
        {
          command: 'go',
          argsPrefix: ['version'],
          result: { status: null, startFailure: { message: 'spawn go ENOENT' } },
        },
      ],
    });
    s.tree.seed('go.mod', GO_MOD);

    const report = expectOk(await new ToolchainCheckHandler(s.deps).handle(query));

    expect(report.managerPresent).toBe(false);
    expect(report.tools.map((t) => t.status)).toEqual(['unknown']);
    expect(report.bootstrap).toContain('Go is not installed');
    expectUntouched(s);
  });
});
