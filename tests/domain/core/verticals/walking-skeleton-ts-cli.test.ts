/**
 * Test for the `walking-skeleton` vertical against the TypeScript
 * Node CLI tag set (`ts-cli` stack) — the CLI twin of
 * `walking-skeleton-ts.test.ts`. Asserts the rendered workspace
 * shape under both module layouts, that the deployment unit swapped
 * (an `application/cli` assembly, no `application/rest`), that the
 * shared shell (domain packages, Clock port-fake, install action)
 * came along unchanged, and that the sticky answers are read from
 * the CLI bootstrap's own id.
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
import {
  MODULITH_LAYOUT_TAG,
  PEER_CONTEXT_TAG,
} from '../../../../src/domain/core/adapters/module-layout.js';
import { emptyManifestV2 } from '../../../../src/domain/contract/manifest.js';
import { FsTree } from '../../../../src/infrastructure/tree/fs-tree.js';
import type { InstallVerticalResult } from '../../../../src/domain/core/install.js';

const baseTags = (...extra: string[]): string[] => [
  'lang.typescript',
  'runtime.node',
  'pkg.npm',
  'arch.hexagonal',
  'arch.cli',
  ...extra,
];

const installWith = async (
  tags: string[],
  answers?: Record<string, Record<string, string>>,
): Promise<{ tree: FsTree; cwd: string; result: InstallVerticalResult }> => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-ts-cli-'));
  const tree = new FsTree(cwd);
  const manifest = {
    ...emptyManifestV2('2026-08-18T00:00:00Z', '0.5.0-alpha'),
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
    now: () => '2026-08-18T12:00:00Z',
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

describe('walking-skeleton vertical (TypeScript CLI, basic)', () => {
  it('renders the shared shell with the CLI deployment unit swapped in', async () => {
    const { tree, cwd } = await installWith(baseTags());
    cwds.push(cwd);

    const expected = [
      '.gitignore',
      'README.md',
      'package.json',
      'tsconfig.base.json',
      'domain/kernel/package.json',
      'domain/kernel/src/index.ts',
      'domain/contract/src/greet.ts',
      'domain/contract/src/clock.ts',
      'domain/core/src/internal/registry-mediator.ts',
      'domain/core/src/internal/greet-handler.ts',
      'domain/core/tests/greet.test.ts',
      'application/cli/package.json',
      'application/cli/tsconfig.json',
      'application/cli/src/cli.ts',
      'application/cli/src/main.ts',
      'application/cli/tests/cli.test.ts',
      'infrastructure/clock/package.json',
      'infrastructure/clock/tests/fake-clock.test.ts',
    ];
    for (const p of expected) {
      expect(tree.read(p), `missing ${p}`).not.toBeNull();
    }
    expect(tree.read('application/rest/package.json')).toBeNull();
    expect(tree.read('application/rest/src/server.ts')).toBeNull();
  });

  it('assembles the mediator and maps flags to the greet command', async () => {
    const { tree, cwd } = await installWith(baseTags());
    cwds.push(cwd);
    const main = tree.read('application/cli/src/main.ts')?.toString() ?? '';
    expect(main).toContain('const mediator = createRegistryMediator([createGreetHandler()]);');
    expect(main).toContain('process.exitCode = await runGreetCli(process.argv.slice(2)');
    const cli = tree.read('application/cli/src/cli.ts')?.toString() ?? '';
    expect(cli).toContain("from '@acme/domain-contract'");
    expect(cli).toContain('GREET_REJECTED');
    const manifest = tree.read('application/cli/package.json')?.toString() ?? '';
    expect(manifest).toContain('"@acme/application-cli"');
  });

  it('substitutes npmScope and projectName recorded under the CLI bootstrap id', async () => {
    const { tree, cwd } = await installWith(baseTags(), {
      'walking-skeleton/ts-cli-bootstrap': {
        npmScope: 'shipyard',
        projectName: 'harbourmaster',
      },
    });
    cwds.push(cwd);
    const root = tree.read('package.json')?.toString() ?? '';
    expect(root).toContain('"name": "harbourmaster"');
    const cli = tree.read('application/cli/src/cli.ts')?.toString() ?? '';
    expect(cli).toContain("from '@shipyard/domain-kernel'");
    const clock = tree.read('infrastructure/clock/package.json')?.toString() ?? '';
    expect(clock).toContain('"@shipyard/infrastructure-clock"');
  });

  it('patches the contract index to re-export the Clock port', async () => {
    const { tree, cwd } = await installWith(baseTags());
    cwds.push(cwd);
    const index = tree.read('domain/contract/src/index.ts')?.toString() ?? '';
    expect(index).toContain("export * from './greet.ts';");
    expect(index).toContain("export * from './clock.ts';");
  });

  it('emits a deferred npm install action', async () => {
    const { result, cwd } = await installWith(baseTags());
    cwds.push(cwd);
    const install = result.applyResult.actions.find((a) => a.id === 'walking-skeleton/npm-install');
    expect(install).toBeDefined();
  });

  it('rejects an invalid npmScope with a clear message', async () => {
    await expect(
      installWith(baseTags(), {
        'walking-skeleton/ts-cli-bootstrap': { npmScope: '@Bad Scope', projectName: 'demo' },
      }),
    ).rejects.toThrow(/invalid npmScope/);
  });
});

describe('walking-skeleton vertical (TypeScript CLI, pnpm)', () => {
  const pnpmTags = ['lang.typescript', 'runtime.node', 'pkg.pnpm', 'arch.hexagonal', 'arch.cli'];

  it('renders the pnpm workspace shape and the pnpm install action', async () => {
    const { tree, result, cwd } = await installWith(pnpmTags);
    cwds.push(cwd);
    const workspaceFile = tree.read('pnpm-workspace.yaml')?.toString() ?? '';
    expect(workspaceFile).toContain('domain/*');
    expect(workspaceFile).toContain('application/*');
    const cli = tree.read('application/cli/package.json')?.toString() ?? '';
    expect(cli).toContain('"@acme/domain-core": "workspace:*"');
    expect(
      result.applyResult.actions.find((a) => a.id === 'walking-skeleton/pnpm-install'),
    ).toBeDefined();
  });
});

describe('walking-skeleton vertical (TypeScript CLI, modulith)', () => {
  it('serves the modulith layout with the same CLI deployment unit', async () => {
    const { tree, cwd } = await installWith(baseTags(MODULITH_LAYOUT_TAG));
    cwds.push(cwd);

    const expected = [
      '.dependency-cruiser.cjs',
      'platform/kernel/src/registry-mediator.ts',
      'modules/greeting/src/index.ts',
      'modules/greeting/src/service.ts',
      'modules/greeting/src/domain/core/internal/greet-handler.ts',
      'modules/greeting/src/infra/clock/index.ts',
      'application/cli/src/cli.ts',
      'application/cli/src/main.ts',
      'application/cli/tests/cli.test.ts',
    ];
    for (const p of expected) {
      expect(tree.read(p), `missing ${p}`).not.toBeNull();
    }
    expect(tree.read('application/rest/src/server.ts')).toBeNull();
    expect(tree.read('domain/core/package.json')).toBeNull();

    const main = tree.read('application/cli/src/main.ts')?.toString() ?? '';
    expect(main).toContain("from '@acme/platform-kernel'");
    expect(main).toContain("from '@acme/greeting'");
    const manifest = tree.read('application/cli/package.json')?.toString() ?? '';
    expect(manifest).toContain('"@acme/application-cli"');
    expect(manifest).toContain('"@acme/greeting"');
    const root = tree.read('package.json')?.toString() ?? '';
    expect(root).toContain('"lint": "depcruise platform modules application"');
    expect(root).toContain('node application/cli/src/main.ts');
  });

  it('wires the peer context into the CLI assembly under --with-peer-context', async () => {
    const { tree, cwd } = await installWith(baseTags(MODULITH_LAYOUT_TAG, PEER_CONTEXT_TAG));
    cwds.push(cwd);

    expect(tree.read('modules/guestbook/src/index.ts')).not.toBeNull();
    expect(tree.read('application/cli/src/guestbook.ts')).not.toBeNull();
    expect(tree.read('application/cli/tests/guestbook-wiring.test.ts')).not.toBeNull();

    const main = tree.read('application/cli/src/main.ts')?.toString() ?? '';
    expect(main).toContain("import { createGuestbookHandler } from './guestbook.ts';");
    expect(main).toContain(
      'createRegistryMediator([createGreetHandler(), createGuestbookHandler()])',
    );

    const manifest = tree.read('application/cli/package.json')?.toString() ?? '';
    expect(manifest).toContain('"@acme/guestbook"');
  });
});

/**
 * A tag set carrying both `arch.cli` and `arch.server-http` resolves
 * both TS bootstrap adapters onto one shared workspace — the
 * `ts-shared-root.ts` mechanism. The regression this guards: before
 * it, both bootstraps called `renderTsWorkspaceShell` and rendered
 * their own whole-file root `package.json` and `README.md`, so the
 * second adapter's `files` write conflicted on both.
 */
describe('walking-skeleton vertical (TypeScript, composed cli + server-http)', () => {
  it('renders both deployment units onto one root package.json and README', async () => {
    const { tree, cwd } = await installWith(baseTags('arch.server-http'));
    cwds.push(cwd);

    expect(tree.read('application/cli/src/main.ts')).not.toBeNull();
    expect(tree.read('application/rest/src/main.ts')).not.toBeNull();

    const pkg = JSON.parse(tree.read('package.json')?.toString() ?? '{}') as {
      workspaces?: string[];
      scripts?: Record<string, string>;
    };
    expect(pkg.workspaces).toEqual(['domain/*', 'application/*', 'infrastructure/*']);
    expect(pkg.scripts?.['start:cli']).toBe('node application/cli/src/main.ts');
    expect(pkg.scripts?.['start:rest']).toBe('node application/rest/src/main.ts');
    expect(pkg.scripts?.['dev:rest']).toBe('node --watch application/rest/src/main.ts');

    const readme = tree.read('README.md')?.toString() ?? '';
    expect(readme).toContain('### cli');
    expect(readme).toContain('### rest');
  });
});
