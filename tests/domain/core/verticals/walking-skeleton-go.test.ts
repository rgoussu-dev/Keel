/**
 * End-to-end test for the `walking-skeleton` vertical against the Go
 * tag sets. Asserts the rendered tree follows the house Go hexagonal
 * reference (cmd/ units, internal/domain contract face over the
 * compiler-hidden core, internal/app adapters, internal/infra fakes),
 * that the CLI and HTTP entrypoints compose — separately and both at
 * once — and that the Quarkus adapters stay out of Go projects.
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
  'lang.go',
  'pkg.go-modules',
  'arch.hexagonal',
  ...extra,
];

const sharedFiles = [
  '.gitignore',
  'README.md',
  'go.mod',
  'internal/domain/greet.go',
  'internal/domain/greet_test.go',
  'internal/domain/internal/greet/greet.go',
  'internal/domain/clock.go',
  'internal/infra/clockfake/clock.go',
  'internal/infra/clockfake/clock_test.go',
];

const cliFiles = ['cmd/cli/main.go', 'internal/app/cli/app.go', 'internal/app/cli/app_test.go'];

const httpFiles = [
  'cmd/http/main.go',
  'internal/app/resthttp/handler.go',
  'internal/app/resthttp/handler_test.go',
];

const installWith = async (
  tags: string[],
  answers?: Record<string, Record<string, string>>,
): Promise<{ tree: FsTree; cwd: string; result: InstallVerticalResult }> => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-ws-go-'));
  const tree = new FsTree(cwd);
  const manifest = {
    ...emptyManifestV2('2026-04-26T00:00:00Z', '0.5.0-alpha'),
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
    now: () => '2026-04-26T12:00:00Z',
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

describe('walking-skeleton vertical (Go)', () => {
  it('renders the Go CLI skeleton with default answers, without the Quarkus adapters', async () => {
    const { tree, cwd } = await installWith(baseTags('arch.cli'));
    cwds.push(cwd);

    for (const p of [...sharedFiles, ...cliFiles]) {
      expect(tree.read(p), `missing ${p}`).not.toBeNull();
    }
    expect(tree.read('cmd/http/main.go')).toBeNull();
    expect(tree.read('build.gradle.kts')).toBeNull();
    expect(tree.read('settings.gradle.kts')).toBeNull();
  });

  it('renders the Go HTTP skeleton under arch.server-http', async () => {
    const { tree, cwd } = await installWith(baseTags('arch.server-http'));
    cwds.push(cwd);

    for (const p of [...sharedFiles, ...httpFiles]) {
      expect(tree.read(p), `missing ${p}`).not.toBeNull();
    }
    expect(tree.read('cmd/cli/main.go')).toBeNull();
  });

  it('ships both deployment units when both arch tags are present', async () => {
    const { tree, cwd } = await installWith(baseTags('arch.cli', 'arch.server-http'));
    cwds.push(cwd);

    for (const p of [...sharedFiles, ...cliFiles, ...httpFiles]) {
      expect(tree.read(p), `missing ${p}`).not.toBeNull();
    }
    const readme = tree.read('README.md')?.toString() ?? '';
    expect(readme).toContain('### cli');
    expect(readme).toContain('### http');
  });

  it('substitutes modulePath and projectName from sticky answers everywhere', async () => {
    const { tree, cwd } = await installWith(baseTags('arch.cli'), {
      'walking-skeleton/go-bootstrap': {
        modulePath: 'github.com/acme/shipper',
        projectName: 'shipper',
      },
    });
    cwds.push(cwd);

    expect(tree.read('go.mod')?.toString()).toContain('module github.com/acme/shipper');

    const contract = tree.read('internal/domain/greet.go')?.toString() ?? '';
    expect(contract).toContain('import "github.com/acme/shipper/internal/domain/internal/greet"');

    const main = tree.read('cmd/cli/main.go')?.toString() ?? '';
    expect(main).toContain('"github.com/acme/shipper/internal/app/cli"');
    expect(main).toContain('"github.com/acme/shipper/internal/domain"');

    const app = tree.read('internal/app/cli/app.go')?.toString() ?? '';
    expect(app).toContain('flag.NewFlagSet("shipper"');

    const readme = tree.read('README.md')?.toString() ?? '';
    expect(readme).toContain('# shipper');
    expect(readme).toContain('go build -o bin/shipper ./cmd/cli');
  });

  it('keeps the Clock port with its consumer and the fake under internal/infra', async () => {
    const { tree, cwd } = await installWith(baseTags('arch.cli'));
    cwds.push(cwd);

    const port = tree.read('internal/domain/clock.go')?.toString() ?? '';
    expect(port).toContain('type Clock interface');

    const fake = tree.read('internal/infra/clockfake/clock.go')?.toString() ?? '';
    expect(fake).toContain('package clockfake');
    expect(fake).toContain('func At(now time.Time) *Clock');
  });

  it('emits the binding spec at AGENTS.md with a CLAUDE.md pointer', async () => {
    const { tree, cwd } = await installWith(baseTags('arch.cli'));
    cwds.push(cwd);
    const agentsMd = tree.read('AGENTS.md')?.toString() ?? '';
    expect(agentsMd).toContain('Universal engineering conventions (keel)');
    expect(tree.read('CLAUDE.md')?.toString()).toBe('@AGENTS.md\n');
  });

  it('emits a deferred go mod tidy action from the bootstrap', async () => {
    const { result, cwd } = await installWith(baseTags('arch.cli'));
    cwds.push(cwd);
    const tidy = result.applyResult.actions.find((a) => a.id === 'walking-skeleton/go-bootstrap');
    expect(tidy).toBeDefined();
    expect(tidy?.description).toBe('go mod tidy');
  });

  it('hard-fails when no arch tag selects an entrypoint', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-ws-go-fail-'));
    cwds.push(cwd);
    const tree = new FsTree(cwd);
    const manifest = {
      ...emptyManifestV2('2026-04-26T00:00:00Z', '0.5.0-alpha'),
      tags: baseTags(),
    };
    await expect(
      installVertical({
        vertical: walkingSkeletonVertical,
        manifest,
        tree,
        mode: 'non-interactive',
        prompt: rejectingPrompt,
        logger: new FakeLogger(),
        cwd,
        templates: ejsTemplateSource,
        processes: spawnProcessRunner,
        now: () => '2026-04-26T12:00:00Z',
      }),
    ).rejects.toBeInstanceOf(ResolutionError);
  });
});
