/**
 * End-to-end test for the `walking-skeleton` vertical against a
 * web-components SPA tag set. Asserts the rendered tree shape
 * matches the minimum runnable workspace we promise; checks the
 * predicate split by removing `arch.spa` / `pkg.npm` and expecting a
 * hard fail.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rejectingPrompt } from '../../../../src/infrastructure/prompt/fake.js';
import { FakeLogger } from '../../../../src/infrastructure/commons/fake-logger.js';
import { ejsTemplateSource } from '../../../../src/infrastructure/template/ejs-template-source.js';
import { spawnProcessRunner } from '../../../../src/infrastructure/process/spawn-process-runner.js';
import { installVertical } from '../../../../src/domain/core/install.js';
import { walkingSkeletonVertical } from '../../../../src/domain/core/verticals/walking-skeleton.js';
import { ResolutionError } from '../../../../src/domain/core/resolver.js';
import { emptyManifestV2 } from '../../../../src/domain/contract/manifest.js';
import { FsTree } from '../../../../src/infrastructure/tree/fs-tree.js';
import type { InstallVerticalResult } from '../../../../src/domain/core/install.js';

const baseTags = (...extra: string[]): string[] => [
  'lang.typescript',
  'runtime.browser',
  'pkg.npm',
  'framework.web-components',
  'arch.hexagonal',
  ...extra,
];

const installWith = async (
  tags: string[],
  answers?: Record<string, Record<string, string>>,
): Promise<{ tree: FsTree; cwd: string; result: InstallVerticalResult }> => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-wc-'));
  const tree = new FsTree(cwd);
  const manifest = {
    ...emptyManifestV2('2026-08-09T00:00:00Z', '0.5.0-alpha'),
    tags,
    answers: answers ?? {},
  };
  const result = await installVertical({
    vertical: walkingSkeletonVertical,
    manifest,
    tree,
    mode: 'non-interactive',
    prompt: rejectingPrompt,
    logger: new FakeLogger(),
    cwd,
    templates: ejsTemplateSource,
    processes: spawnProcessRunner,
    now: () => '2026-08-09T12:00:00Z',
  });
  return { tree, cwd, result };
};

let cwds: string[] = [];

beforeEach(() => {
  cwds = [];
});

afterEach(async () => {
  await Promise.all(cwds.map((c) => fs.remove(c)));
});

describe('walking-skeleton vertical (web-components SPA)', () => {
  it('renders the minimum runnable hexagonal workspace with default answers', async () => {
    const { tree, cwd } = await installWith(baseTags('arch.spa'));
    cwds.push(cwd);

    const expected = [
      '.gitignore',
      'README.md',
      'package.json',
      'tsconfig.base.json',
      'domain/domain-api/package.json',
      'domain/domain-api/tsconfig.json',
      'domain/domain-api/src/index.ts',
      'domain/domain-api/src/greet.ts',
      'domain/domain-api/src/ports/clock.ts',
      'domain/domain-core/package.json',
      'domain/domain-core/tsconfig.json',
      'domain/domain-core/src/index.ts',
      'domain/domain-core/src/internal/greet-service.ts',
      'domain/domain-core/src/internal/greeting-store.ts',
      'domain/domain-core/tests/greet.test.ts',
      'application/web-app/package.json',
      'application/web-app/tsconfig.json',
      'application/web-app/index.html',
      'application/web-app/src/main.ts',
      'application/web-app/src/context.ts',
      'application/web-app/src/context-keys.ts',
      'application/web-app/src/components/greeting-view.ts',
      'infrastructure/commons/package.json',
      'infrastructure/commons/tsconfig.json',
      'infrastructure/commons/src/index.ts',
      'infrastructure/commons/src/system-clock.ts',
      'infrastructure/commons/src/fake-clock.ts',
      'infrastructure/commons/tests/fake-clock.test.ts',
    ];
    for (const p of expected) {
      expect(tree.read(p), `missing ${p}`).not.toBeNull();
    }
  });

  it('does not drag JVM adapters into a browser tag set', async () => {
    const { tree, cwd } = await installWith(baseTags('arch.spa'));
    cwds.push(cwd);
    expect(tree.read('build.gradle.kts')).toBeNull();
    expect(tree.read('settings.gradle.kts')).toBeNull();
  });

  it('substitutes npmScope and projectName from sticky answers', async () => {
    const { tree, cwd } = await installWith(baseTags('arch.spa'), {
      'walking-skeleton/wc-spa-bootstrap': {
        npmScope: 'shipyard',
        projectName: 'harbourmaster',
      },
    });
    cwds.push(cwd);

    const rootPkg = tree.read('package.json')?.toString() ?? '';
    expect(rootPkg).toContain('"name": "harbourmaster"');

    const apiPkg = tree.read('domain/domain-api/package.json')?.toString() ?? '';
    expect(apiPkg).toContain('"name": "@shipyard/domain-api"');

    const html = tree.read('application/web-app/index.html')?.toString() ?? '';
    expect(html).toContain('<title>harbourmaster</title>');
    expect(html).toContain('<shipyard-greeting></shipyard-greeting>');

    const main = tree.read('application/web-app/src/main.ts')?.toString() ?? '';
    expect(main).toContain("from '@shipyard/domain-core'");
    expect(main).toContain("customElements.define('shipyard-greeting', GreetingView);");
  });

  it('keeps the domain packages DOM-free by construction', async () => {
    const { tree, cwd } = await installWith(baseTags('arch.spa'));
    cwds.push(cwd);
    const apiTsconfig = tree.read('domain/domain-api/tsconfig.json')?.toString() ?? '';
    const coreTsconfig = tree.read('domain/domain-core/tsconfig.json')?.toString() ?? '';
    for (const config of [apiTsconfig, coreTsconfig]) {
      expect(config).toContain('"lib": ["ES2022"]');
      expect(config).not.toContain('DOM');
    }
    const appTsconfig = tree.read('application/web-app/tsconfig.json')?.toString() ?? '';
    expect(appTsconfig).toContain('"lib": ["ES2022", "DOM", "DOM.Iterable"]');
  });

  it('emits the sample Clock port with commons adapters, patching the domain-api index', async () => {
    const { tree, cwd } = await installWith(baseTags('arch.spa'), {
      'walking-skeleton/wc-spa-bootstrap': {
        npmScope: 'shipyard',
        projectName: 'harbourmaster',
      },
    });
    cwds.push(cwd);

    const port = tree.read('domain/domain-api/src/ports/clock.ts')?.toString();
    expect(port).toContain('export interface Clock');

    const index = tree.read('domain/domain-api/src/index.ts')?.toString() ?? '';
    expect(index).toContain("export * from './greet';");
    expect(index).toContain("export * from './ports/clock';");

    const fake = tree.read('infrastructure/commons/src/fake-clock.ts')?.toString() ?? '';
    expect(fake).toContain('export interface FakeClock extends Clock');
    expect(fake).toContain("from '@shipyard/domain-api'");
  });

  it('emits a deferred npm install action that runs after the bootstrap', async () => {
    const { result, cwd } = await installWith(baseTags('arch.spa'));
    cwds.push(cwd);
    const installAction = result.applyResult.actions.find(
      (a) => a.id === 'walking-skeleton/npm-install',
    );
    expect(installAction).toBeDefined();
    expect(installAction?.description).toBe('npm install --no-fund --no-audit');
  });

  it('emits the binding spec at AGENTS.md with a CLAUDE.md pointer', async () => {
    const { tree, cwd } = await installWith(baseTags('arch.spa'));
    cwds.push(cwd);
    const agentsMd = tree.read('AGENTS.md')?.toString() ?? '';
    expect(agentsMd).toContain('Universal engineering conventions (keel)');
    expect(tree.read('CLAUDE.md')?.toString()).toBe('@AGENTS.md\n');
  });

  it('hard-fails when arch.spa is absent (no adapter covers entrypoint)', async () => {
    await expect(installWith(baseTags())).rejects.toBeInstanceOf(ResolutionError);
  });

  it('hard-fails when pkg.npm is absent (no adapter covers build-tool)', async () => {
    await expect(
      installWith([
        'lang.typescript',
        'runtime.browser',
        'framework.web-components',
        'arch.hexagonal',
        'arch.spa',
      ]),
    ).rejects.toBeInstanceOf(ResolutionError);
  });

  it('rejects an invalid npmScope with a clear message', async () => {
    await expect(
      installWith(baseTags('arch.spa'), {
        'walking-skeleton/wc-spa-bootstrap': {
          npmScope: '@Not-A-Scope',
          projectName: 'harbourmaster',
        },
      }),
    ).rejects.toThrow(/invalid npmScope/);
  });

  it('rejects an invalid projectName with a clear message', async () => {
    await expect(
      installWith(baseTags('arch.spa'), {
        'walking-skeleton/wc-spa-bootstrap': {
          npmScope: 'shipyard',
          projectName: 'Has Spaces',
        },
      }),
    ).rejects.toThrow(/invalid projectName/);
  });
});
