/**
 * The root `package.json` patch the TypeScript entrypoint bootstraps
 * share — specifically the path a root that already exists takes,
 * which the vertical suites never reach on a fresh scaffold: the
 * sibling entrypoint's scripts merge in, and on npm so does the
 * vitest override, without touching overrides the root already had;
 * and each script an entrypoint adds goes in at its rank (`rank.ts`),
 * by name, so one arriving in a later run lands where the scaffold's
 * formatter sorts it in one run.
 */

import { describe, expect, it } from 'vitest';
import { tsSharedRootPatches } from '../../../../src/domain/core/adapters/ts-shared-root.js';
import { tsLayout } from '../../../../src/domain/core/adapters/ts-module-layout.js';
import { addPrettierToPackageJson } from '../../../../src/domain/core/adapters/web-format.js';
import { addEslintToPackageJson } from '../../../../src/domain/core/adapters/web-lint.js';

const TAGS = ['lang.typescript', 'runtime.node', 'arch.hexagonal', 'arch.server-http'];

const rootPatch = (pm: 'npm' | 'pnpm', arch: 'cli' | 'rest' = 'rest', tags = TAGS) => {
  const patch = tsSharedRootPatches({
    arch,
    pm,
    projectName: 'api',
    npmScope: '@acme',
    layout: tsLayout(tags, '@acme'),
    tags,
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

/**
 * A step of one run over the root `package.json`: an entrypoint, or
 * code-style's formatter and linter.
 */
type Step = 'cli' | 'rest' | 'code-style';

const MODULITH = [...TAGS, 'layout.modulith'];

describe('where the scripts an entrypoint adds go', () => {
  /** The root after `steps`, from the seed of the layout `tags` read as. */
  const after = (
    pm: 'npm' | 'pnpm',
    tags: readonly string[],
    steps: readonly Step[],
    seed?: string,
  ) =>
    steps.reduce(
      (text, step) =>
        step === 'code-style'
          ? addEslintToPackageJson(addPrettierToPackageJson(text))
          : rootPatch(pm, step, [...tags]).apply(text),
      seed ?? (rootPatch(pm, 'cli', [...tags]).seed as string),
    );
  const scripts = (text: string): readonly string[] =>
    Object.keys((JSON.parse(text) as { scripts: Record<string, string> }).scripts);

  it.each([
    ['pnpm', 'basic', TAGS],
    ['npm', 'modulith', MODULITH],
  ] as const)(
    'puts a later entrypoint where the formatter sorts one run (%s, %s)',
    (pm, _, tags) => {
      const oneRun = after(pm, tags, ['cli', 'rest', 'code-style']);
      expect(after(pm, tags, ['rest', 'code-style', 'cli'])).toBe(oneRun);
      expect(after(pm, tags, ['cli', 'code-style', 'rest'])).toBe(oneRun);
    },
  );

  it("sorts them among the seed's, and among the other entrypoint's, whichever arrives first", () => {
    expect(scripts(after('pnpm', TAGS, ['cli']))).toEqual(['start:cli', 'test', 'typecheck']);
    expect(scripts(after('pnpm', TAGS, ['rest']))).toEqual([
      'dev:rest',
      'start:rest',
      'test',
      'typecheck',
    ]);
    const both = ['dev:rest', 'start:cli', 'start:rest', 'test', 'typecheck'];
    expect(scripts(after('pnpm', TAGS, ['rest', 'cli']))).toEqual(both);
    expect(scripts(after('pnpm', TAGS, ['cli', 'rest']))).toEqual(both);
  });

  it('works on a CRLF root in its own line endings', () => {
    const crlf = (text: string): string => text.replace(/\n/g, '\r\n');
    const seed = crlf(rootPatch('pnpm', 'cli').seed as string);
    expect(after('pnpm', TAGS, ['rest', 'cli'], seed)).toBe(
      crlf(after('pnpm', TAGS, ['cli', 'rest'])),
    );
  });

  it('never moves a script already there, even one the user put out of order', () => {
    const own = `${JSON.stringify({ name: 'api', scripts: { typecheck: 'tsc', zz: 'z', test: 'vitest', 'start:cli': 'old' } }, null, 2)}\n`;
    const merged = JSON.parse(rootPatch('pnpm', 'cli').apply(own)) as {
      scripts: Record<string, string>;
    };
    expect(Object.entries(merged.scripts)).toEqual([
      ['typecheck', 'tsc'],
      ['zz', 'z'],
      ['test', 'vitest'],
      ['start:cli', 'node application/cli/src/main.ts'],
    ]);
    expect(scripts(rootPatch('pnpm', 'rest').apply(own))).toEqual([
      'dev:rest',
      'start:rest',
      'typecheck',
      'zz',
      'test',
      'start:cli',
    ]);
  });
});
