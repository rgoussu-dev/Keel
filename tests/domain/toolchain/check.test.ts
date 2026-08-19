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
import { CWD, JVM_BLOCK, MISE_ABSENT, miseLs, scenario, type Scenario } from './scenario.js';

const query = toolchainCheckQuery({ cwd: CWD });

/** Seeds the on-disk config as a fresh render would write it. */
function seedConfig(s: Scenario): void {
  const config = miseProvider.render(JVM_BLOCK.needs);
  s.tree.seed(config.path, config.content);
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
      configPath: 'mise.toml',
      configUpToDate: true,
      managerPresent: true,
      satisfied: true,
    });
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

    expect(report.configUpToDate).toBe(false);
    expect(report.satisfied).toBe(false);
    expect(report.tools.every((t) => t.status === 'satisfied')).toBe(true);
    expectUntouched(s);
  });

  it('treats a missing config file as drift', async () => {
    const s = await scenario({ scripts: [miseLs({ java: true, gradle: true })] });
    const report = expectOk(await new ToolchainCheckHandler(s.deps).handle(query));
    expect(report.configUpToDate).toBe(false);
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
