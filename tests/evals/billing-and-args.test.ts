/**
 * The billing posture and the live workspace arg mapping — both pure,
 * both load-bearing: a stray API key silently re-bills a subscription
 * campaign, and the CLI argv is how the live path replays the exact
 * scaffold the verify path built in process.
 */

import { describe, expect, it } from 'vitest';
import { agentEnv } from '../../evals/lib/env.mjs';
import { addArgs, newArgs } from '../../evals/lib/workspace.mjs';

describe('billing posture', () => {
  it('strips ANTHROPIC_API_KEY and ANTHROPIC_AUTH_TOKEN by default', () => {
    const env = agentEnv({ ANTHROPIC_API_KEY: 'sk-x', ANTHROPIC_AUTH_TOKEN: 't', PATH: '/bin' });
    expect(env).toEqual({ PATH: '/bin' });
  });

  it('keeps them only under the explicit KEEL_EVALS_API_BILLING=1 opt-in', () => {
    const env = agentEnv({ ANTHROPIC_API_KEY: 'sk-x', KEEL_EVALS_API_BILLING: '1' }) as Record<
      string,
      string
    >;
    expect(env['ANTHROPIC_API_KEY']).toBe('sk-x');
  });

  it('applies overrides after the base env', () => {
    expect(
      (agentEnv({ CODEX_HOME: '/home/op/.codex' }, { CODEX_HOME: '/tmp/iso' }) as Record<string, string>)['CODEX_HOME'],
    ).toBe('/tmp/iso');
  });
});

describe('scaffold → CLI argv', () => {
  it('maps a full scaffold block onto keel new flags', () => {
    expect(
      newArgs({
        stack: 'ts-http',
        build_system: 'npm',
        module_layout: 'modulith',
        answers: {
          'walking-skeleton/ts-http-bootstrap': { npmScope: 'acme', projectName: 'nav-eval' },
        },
      }),
    ).toEqual([
      'new',
      '--stack',
      'ts-http',
      '--yes',
      '--build-system',
      'npm',
      '--module-layout',
      'modulith',
      '--set',
      'walking-skeleton/ts-http-bootstrap:npmScope=acme',
      '--set',
      'walking-skeleton/ts-http-bootstrap:projectName=nav-eval',
    ]);
  });

  it('maps growth steps onto keel add', () => {
    expect(addArgs({ module: 'shipping', consumes: 'ordering' })).toEqual([
      'add',
      'module',
      'shipping',
      '--consumes',
      'ordering',
      '--yes',
    ]);
    expect(addArgs({ module: 'billing' })).toEqual(['add', 'module', 'billing', '--yes']);
    expect(addArgs({ vertical: 'persistence' })).toEqual(['add', 'persistence', '--yes']);
  });
});
