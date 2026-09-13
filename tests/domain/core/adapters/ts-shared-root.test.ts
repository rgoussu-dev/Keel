/**
 * The root `package.json` patch the TypeScript entrypoint bootstraps
 * share — specifically the path a root that already exists takes,
 * which the vertical suites never reach on a fresh scaffold: the
 * sibling entrypoint's scripts merge in, and on npm so does the
 * vitest override, without touching overrides the root already had.
 */

import { describe, expect, it } from 'vitest';
import { tsSharedRootPatches } from '../../../../src/domain/core/adapters/ts-shared-root.js';
import { tsLayout } from '../../../../src/domain/core/adapters/ts-module-layout.js';

const rootPatch = (pm: 'npm' | 'pnpm') => {
  const patch = tsSharedRootPatches({
    arch: 'rest',
    pm,
    projectName: 'api',
    npmScope: '@acme',
    layout: tsLayout(
      ['lang.typescript', 'runtime.node', 'arch.hexagonal', 'arch.server-http'],
      '@acme',
    ),
  }).find((p) => p.target === 'package.json');
  expect(patch).toBeDefined();
  return patch!;
};

const existing = `${JSON.stringify(
  {
    name: 'api',
    private: true,
    scripts: { 'start:cli': 'node application/cli/src/main.ts' },
    overrides: { lodash: '^4.17.21' },
  },
  null,
  2,
)}\n`;

describe('the TypeScript shared root patch on an existing package.json', () => {
  it('merges the entrypoint scripts and, on npm, the vitest override beside existing ones', () => {
    const merged = JSON.parse(rootPatch('npm').apply(existing)) as {
      scripts: Record<string, string>;
      overrides: Record<string, string>;
    };
    expect(merged.scripts).toMatchObject({
      'start:cli': 'node application/cli/src/main.ts',
      'start:rest': 'node application/rest/src/main.ts',
    });
    expect(merged.overrides['lodash']).toBe('^4.17.21');
    expect(merged.overrides['vitest']).toMatch(/^\^\d/);
    const seeded = JSON.parse(rootPatch('npm').seed!) as { overrides: Record<string, string> };
    expect(merged.overrides['vitest']).toBe(seeded.overrides['vitest']);
  });

  it('leaves overrides alone on pnpm, which resolves the tree without one', () => {
    const merged = JSON.parse(rootPatch('pnpm').apply(existing)) as {
      overrides: Record<string, string>;
    };
    expect(merged.overrides).toEqual({ lodash: '^4.17.21' });
  });

  it('is its own fixed point, so a reapply stages nothing', () => {
    const once = rootPatch('npm').apply(existing);
    expect(rootPatch('npm').apply(once)).toBe(once);
  });
});
