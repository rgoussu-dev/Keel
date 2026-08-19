/**
 * Tests for the nvm provider record: the Node-only coverage, the
 * bare `.nvmrc`, the shell-function invocations, and the status
 * parser over `nvm ls`.
 */

import { describe, expect, it } from 'vitest';
import type { ProcessResult } from '../../../src/domain/contract/ports/process-runner.js';
import { nvmProvider } from '../../../src/domain/toolchain/core/nvm.js';

const absent = (): undefined => undefined;

const ran = (stdout: string, status = 0): ProcessResult => ({ status, stdout, stderr: '' });

describe('the nvm record', () => {
  it('covers node and npm — npm ships with every Node install — and nothing else', () => {
    expect([...nvmProvider.covers].sort()).toEqual(['node', 'npm']);
  });

  it('renders .nvmrc as a bare version: the format has no room for a header', () => {
    const [config] = nvmProvider.render(
      [{ tool: 'node', version: '22', source: 'node-active-lts' }],
      absent,
    );

    expect(config?.path).toBe('.nvmrc');
    expect(config?.content).toBe('22\n');
  });

  it('gives npm no line of its own — it arrives with the Node install', () => {
    const configs = nvmProvider.render(
      [
        { tool: 'node', version: '22' },
        { tool: 'npm', version: '10' },
      ],
      absent,
    );
    expect(configs).toHaveLength(1);
    expect(configs[0]?.content).toBe('22\n');
  });

  it('renders nothing when no Node need was assigned to it', () => {
    expect(nvmProvider.render([], absent)).toEqual([]);
  });

  it('reaches nvm through a login shell — it is a shell function, not a binary', () => {
    for (const invocation of [nvmProvider.probe, nvmProvider.status, ...nvmProvider.install([])]) {
      expect(invocation.command).toBe('bash');
      expect(invocation.args[0]).toBe('-lc');
      expect(invocation.args[1]).toContain('nvm.sh');
    }
    expect(nvmProvider.install([])[0]?.args[1]).toContain('nvm install');
  });

  it('reads the installed versions out of nvm ls, matching a major against its patch', () => {
    const listing = '        v20.11.0\n->      v22.11.0\ndefault -> 22 (-> v22.11.0)\n';

    expect(
      nvmProvider.parseStatus(ran(listing), [{ name: 'node', version: '22' }]).get('node'),
    ).toBe(true);
    expect(
      nvmProvider.parseStatus(ran(listing), [{ name: 'node', version: '24' }]).get('node'),
    ).toBe(false);
  });

  it("reports npm's status as node's — nvm installs the two together", () => {
    const statuses = nvmProvider.parseStatus(ran('->      v22.11.0\n'), [
      { name: 'node', version: '22' },
      { name: 'npm', version: '10' },
    ]);
    expect(statuses.get('npm')).toBe(true);
  });

  it('reports nothing satisfied when the shell could not list anything', () => {
    const statuses = nvmProvider.parseStatus(ran('', 127), [{ name: 'node', version: '22' }]);
    expect(statuses.get('node')).toBe(false);
  });
});
