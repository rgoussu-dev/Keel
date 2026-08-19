/**
 * Tests for the corepack provider record: the pnpm-only coverage,
 * and the one renderer that merges into a file the *project* owns —
 * `package.json`'s `packageManager` field — rather than rendering a
 * file of its own.
 */

import { describe, expect, it } from 'vitest';
import type { ProcessResult } from '../../../src/domain/contract/ports/process-runner.js';
import { corepackProvider } from '../../../src/domain/toolchain/core/corepack.js';

const PNPM = { tool: 'pnpm' as const, version: '10.33.0', source: 'ts-pnpm' };

/** A reader serving one `package.json`. */
const serving =
  (content: string) =>
  (filePath: string): string | undefined =>
    filePath === 'package.json' ? content : undefined;

const ran = (stdout: string, status = 0): ProcessResult => ({ status, stdout, stderr: '' });

describe('the corepack record', () => {
  it('covers pnpm alone — which is what makes it half of a combination', () => {
    expect([...corepackProvider.covers]).toEqual(['pnpm']);
  });

  it('rewrites an existing packageManager field in place, touching nothing else', () => {
    const existing =
      '{\n  "name": "demo",\n  "packageManager": "pnpm@9.0.0",\n  "private": true\n}\n';

    const [config] = corepackProvider.render([PNPM], serving(existing));

    expect(config?.path).toBe('package.json');
    expect(config?.content).toBe(
      '{\n  "name": "demo",\n  "packageManager": "pnpm@10.33.0",\n  "private": true\n}\n',
    );
  });

  it('adds the field when the project has none', () => {
    const [config] = corepackProvider.render([PNPM], serving('{\n  "name": "demo"\n}\n'));

    expect(config?.content).toBe('{\n  "packageManager": "pnpm@10.33.0",\n  "name": "demo"\n}\n');
    expect(JSON.parse(config?.content ?? '')).toMatchObject({ packageManager: 'pnpm@10.33.0' });
  });

  it('leaves an empty object valid JSON — no trailing comma', () => {
    const [config] = corepackProvider.render([PNPM], serving('{}\n'));
    expect(JSON.parse(config?.content ?? '')).toEqual({ packageManager: 'pnpm@10.33.0' });
  });

  it('is idempotent: rendering over its own output changes nothing', () => {
    const first = corepackProvider.render([PNPM], serving('{\n  "name": "demo"\n}\n'))[0];
    const second = corepackProvider.render([PNPM], serving(first?.content ?? ''))[0];
    expect(second?.content).toBe(first?.content);
  });

  it('refuses loudly when the project root has no package.json to declare in', () => {
    expect(() => corepackProvider.render([PNPM], () => undefined)).toThrow(/package\.json/);
  });

  it('renders nothing when no pnpm need was assigned to it', () => {
    expect(corepackProvider.render([], serving('{}'))).toEqual([]);
  });

  it('enables the shims, then caches the declared version', () => {
    expect(corepackProvider.install([PNPM]).map((step) => step.args.join(' '))).toEqual([
      'enable',
      'install',
    ]);
  });

  it('reads the shim itself: exit 0 and the exact version means satisfied', () => {
    const spelled = [{ name: 'pnpm', version: '10.33.0' }];
    expect(corepackProvider.parseStatus(ran('10.33.0\n'), spelled).get('pnpm')).toBe(true);
    expect(corepackProvider.parseStatus(ran('10.30.0\n'), spelled).get('pnpm')).toBe(false);
    // Not cached: corepack refuses rather than downloading, which is
    // exactly the read-only answer check needs.
    expect(corepackProvider.parseStatus(ran('', 1), spelled).get('pnpm')).toBe(false);
  });
});
