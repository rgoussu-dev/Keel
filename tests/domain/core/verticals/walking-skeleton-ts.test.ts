/**
 * Test for the `walking-skeleton` vertical against the TypeScript
 * Node HTTP tag set (`ts-http` stack). Asserts the rendered
 * workspace shape, the mediator-driven greet slice, the Clock
 * port-fake package with its contract-index patch, the npm install
 * action, and the coverage hard-fails per dimension.
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
  'runtime.node',
  'pkg.npm',
  'arch.hexagonal',
  ...extra,
];

const installWith = async (
  tags: string[],
  answers?: Record<string, Record<string, string>>,
): Promise<{ tree: FsTree; cwd: string; result: InstallVerticalResult }> => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-ts-'));
  const tree = new FsTree(cwd);
  const manifest = {
    ...emptyManifestV2('2026-08-10T00:00:00Z', '0.5.0-alpha'),
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
    now: () => '2026-08-10T12:00:00Z',
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

describe('walking-skeleton vertical (TypeScript node:http)', () => {
  it('renders the minimum runnable hexagonal workspace with default answers', async () => {
    const { tree, cwd } = await installWith(baseTags('arch.server-http'));
    cwds.push(cwd);

    const expected = [
      '.gitignore',
      'README.md',
      'package.json',
      'tsconfig.base.json',
      'domain/kernel/package.json',
      'domain/kernel/tsconfig.json',
      'domain/kernel/src/index.ts',
      'domain/contract/package.json',
      'domain/contract/src/index.ts',
      'domain/contract/src/greet.ts',
      'domain/contract/src/clock.ts',
      'domain/core/package.json',
      'domain/core/src/index.ts',
      'domain/core/src/internal/registry-mediator.ts',
      'domain/core/src/internal/greet-handler.ts',
      'domain/core/tests/greet.test.ts',
      'application/rest/package.json',
      'application/rest/src/server.ts',
      'application/rest/src/main.ts',
      'application/rest/tests/server.test.ts',
      'infrastructure/clock/package.json',
      'infrastructure/clock/src/system-clock.ts',
      'infrastructure/clock/src/fake-clock.ts',
      'infrastructure/clock/tests/fake-clock.test.ts',
    ];
    for (const p of expected) {
      expect(tree.read(p), `missing ${p}`).not.toBeNull();
    }
  });

  it('does not drag JVM or browser adapters into the node tag set', async () => {
    const { tree, cwd } = await installWith(baseTags('arch.server-http'));
    cwds.push(cwd);
    expect(tree.read('build.gradle.kts')).toBeNull();
    expect(tree.read('pom.xml')).toBeNull();
    expect(tree.read('design-system/package.json')).toBeNull();
    expect(tree.read('application/web-app/package.json')).toBeNull();
  });

  it('wires the npm workspace and the workspace dependency protocol', async () => {
    const { tree, cwd } = await installWith(baseTags('arch.server-http'));
    cwds.push(cwd);
    const root = tree.read('package.json')?.toString() ?? '';
    expect(root).toContain('"workspaces"');
    expect(root).not.toContain('pnpm');
    expect(tree.read('pnpm-workspace.yaml')).toBeNull();
    const core = tree.read('domain/core/package.json')?.toString() ?? '';
    expect(core).toContain('"@acme/domain-kernel": "*"');
    expect(core).toContain('"@acme/domain-contract": "*"');
  });

  it('patches the contract index to re-export the Clock port', async () => {
    const { tree, cwd } = await installWith(baseTags('arch.server-http'));
    cwds.push(cwd);
    const index = tree.read('domain/contract/src/index.ts')?.toString() ?? '';
    expect(index).toContain("export * from './greet.ts';");
    expect(index).toContain("export * from './clock.ts';");
  });

  it('substitutes npmScope and projectName from sticky answers', async () => {
    const { tree, cwd } = await installWith(baseTags('arch.server-http'), {
      'walking-skeleton/ts-http-bootstrap': {
        npmScope: 'shipyard',
        projectName: 'harbourmaster',
      },
    });
    cwds.push(cwd);
    const root = tree.read('package.json')?.toString() ?? '';
    expect(root).toContain('"name": "harbourmaster"');
    const server = tree.read('application/rest/src/server.ts')?.toString() ?? '';
    expect(server).toContain("from '@shipyard/domain-kernel'");
    const readme = tree.read('README.md')?.toString() ?? '';
    expect(readme).toContain('# harbourmaster');
  });

  it('emits a deferred npm install action', async () => {
    const { result, cwd } = await installWith(baseTags('arch.server-http'));
    cwds.push(cwd);
    const installAction = result.applyResult.actions.find(
      (a) => a.id === 'walking-skeleton/npm-install',
    );
    expect(installAction).toBeDefined();
    expect(installAction?.description).toBe('npm install --no-fund --no-audit');
  });

  it('emits the binding spec at AGENTS.md with a CLAUDE.md pointer', async () => {
    const { tree, cwd } = await installWith(baseTags('arch.server-http'));
    cwds.push(cwd);
    const agentsMd = tree.read('AGENTS.md')?.toString() ?? '';
    expect(agentsMd).toContain('Universal engineering conventions (keel)');
    expect(tree.read('CLAUDE.md')?.toString()).toBe('@AGENTS.md\n');
  });

  it('hard-fails when arch.server-http is absent (no adapter covers entrypoint)', async () => {
    await expect(installWith(baseTags())).rejects.toBeInstanceOf(ResolutionError);
  });

  it('hard-fails when no pkg tag is present (no adapter covers build-tool)', async () => {
    await expect(
      installWith(['lang.typescript', 'runtime.node', 'arch.hexagonal', 'arch.server-http']),
    ).rejects.toBeInstanceOf(ResolutionError);
  });

  it('rejects an invalid npmScope with a clear message', async () => {
    await expect(
      installWith(baseTags('arch.server-http'), {
        'walking-skeleton/ts-http-bootstrap': { npmScope: '@Bad Scope', projectName: 'demo' },
      }),
    ).rejects.toThrow(/invalid npmScope/);
  });
});

describe('walking-skeleton vertical (TypeScript node:http, pnpm)', () => {
  const pnpmTags = [
    'lang.typescript',
    'runtime.node',
    'pkg.pnpm',
    'arch.hexagonal',
    'arch.server-http',
  ];

  it('renders the pnpm workspace shape with the workspace: protocol', async () => {
    const { tree, cwd } = await installWith(pnpmTags);
    cwds.push(cwd);

    const workspaceFile = tree.read('pnpm-workspace.yaml')?.toString() ?? '';
    expect(workspaceFile).toContain('domain/*');
    expect(workspaceFile).toContain('infrastructure/*');

    const root = tree.read('package.json')?.toString() ?? '';
    expect(root).toContain('"packageManager": "pnpm@');
    expect(root).not.toContain('"workspaces"');
    expect(root).toContain('pnpm -r --if-present run test');

    const core = tree.read('domain/core/package.json')?.toString() ?? '';
    expect(core).toContain('"@acme/domain-kernel": "workspace:*"');

    const clock = tree.read('infrastructure/clock/package.json')?.toString() ?? '';
    expect(clock).toContain('"@acme/domain-contract": "workspace:*"');
  });

  it('emits a deferred pnpm install action instead of the npm one', async () => {
    const { result, cwd } = await installWith(pnpmTags);
    cwds.push(cwd);
    const install = result.applyResult.actions.find(
      (a) => a.id === 'walking-skeleton/pnpm-install',
    );
    expect(install).toBeDefined();
    expect(install?.description).toBe('pnpm install');
    expect(
      result.applyResult.actions.find((a) => a.id === 'walking-skeleton/npm-install'),
    ).toBeUndefined();
  });
});
