/**
 * Tests for the `ci` vertical. One adapter per stack family, so one
 * happy path per family asserting the emitted workflow carries that
 * family's toolchain and commands — plus the tag promotion, the
 * build-system branch on the two families that have one (JVM
 * Gradle/Maven, TypeScript npm/pnpm), and the hard fail when no
 * family tag matches (the `pipeline` dimension goes uncovered).
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
import { ciVertical } from '../../../../src/domain/core/verticals/ci.js';
import { getVertical } from '../../../../src/domain/core/verticals/index.js';
import { ResolutionError } from '../../../../src/domain/core/resolver.js';
import { emptyManifestV2 } from '../../../../src/domain/contract/manifest.js';
import { FsTree } from '../../../../src/infrastructure/tree/fs-tree.js';
import type { ManifestV2 } from '../../../../src/domain/contract/composition.js';

let cwds: string[] = [];

beforeEach(() => {
  cwds = [];
});

afterEach(async () => {
  await Promise.all(cwds.map((c) => fs.remove(c)));
});

async function installCi(tags: string[]): Promise<{ workflow: string; manifest: ManifestV2 }> {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-ci-'));
  cwds.push(cwd);
  const tree = new FsTree(cwd);
  const manifest = {
    ...emptyManifestV2('2026-08-17T00:00:00Z', '0.0.0-test'),
    tags,
  };
  const result = await installVertical({
    vertical: ciVertical,
    manifest,
    tree,
    mode: 'non-interactive',
    prompt: rejectingPrompt,
    logger: new FakeLogger(),
    cwd,
    templates: ejsTemplateSource,
    processes: spawnProcessRunner,
    now: () => '2026-08-17T12:00:00Z',
  });
  const workflow = tree.read('.github/workflows/ci.yml')?.toString() ?? '';
  return { workflow, manifest: result.manifest };
}

describe('ci vertical', () => {
  it('is registered for brownfield installs', () => {
    expect(getVertical('ci')?.id).toBe('ci');
  });

  it('emits the Gradle workflow for a JVM project on pkg.gradle', async () => {
    const { workflow, manifest } = await installCi([
      'lang.java',
      'runtime.jvm',
      'pkg.gradle',
      'framework.quarkus',
      'arch.hexagonal',
      'arch.server-http',
    ]);
    expect(workflow).toContain('name: ci');
    expect(workflow).toContain('on:\n  push:');
    expect(workflow).toContain("java-version: '25'");
    expect(workflow).toContain('cache: gradle');
    expect(workflow).toContain('./gradlew build --no-daemon --stacktrace');
    expect(workflow).not.toContain('mvnw');
    expect(manifest.tags).toContain('ci.github-actions');
  });

  it('emits the Maven workflow when pkg.maven is the recorded build system', async () => {
    const { workflow } = await installCi([
      'lang.kotlin',
      'runtime.jvm',
      'pkg.maven',
      'framework.spring',
      'arch.hexagonal',
      'arch.cli',
    ]);
    expect(workflow).toContain('cache: maven');
    expect(workflow).toContain('./mvnw --batch-mode verify');
    expect(workflow).not.toContain('gradlew');
  });

  it('emits the Go workflow pinned to the go.mod toolchain', async () => {
    const { workflow, manifest } = await installCi([
      'lang.go',
      'pkg.go-modules',
      'arch.hexagonal',
      'arch.server-http',
    ]);
    expect(workflow).toContain('actions/setup-go');
    expect(workflow).toContain('go-version-file: go.mod');
    expect(workflow).toContain('go build ./...');
    expect(workflow).toContain('go test ./...');
    expect(manifest.tags).toContain('ci.github-actions');
  });

  it('emits the Rust workflow on latest stable across the workspace', async () => {
    const { workflow } = await installCi(['lang.rust', 'pkg.cargo', 'arch.hexagonal', 'arch.cli']);
    expect(workflow).toContain('rustup update stable');
    expect(workflow).toContain('cargo build --workspace');
    expect(workflow).toContain('cargo test --workspace');
  });

  it('emits the npm workflow for a TypeScript workspace on pkg.npm', async () => {
    const { workflow } = await installCi([
      'lang.typescript',
      'runtime.node',
      'pkg.npm',
      'arch.hexagonal',
      'arch.server-http',
    ]);
    expect(workflow).toContain('cache: npm');
    expect(workflow).toContain('npm ci');
    expect(workflow).toContain('npm run typecheck');
    expect(workflow).toContain('npm run lint --if-present');
    expect(workflow).toContain('npm run build --if-present');
    expect(workflow).toContain('npm test');
    expect(workflow).not.toContain('pnpm');
  });

  it('emits the corepack-provisioned pnpm workflow on pkg.pnpm', async () => {
    const { workflow } = await installCi([
      'lang.typescript',
      'runtime.browser',
      'pkg.pnpm',
      'framework.web-components',
      'arch.hexagonal',
      'arch.spa',
    ]);
    expect(workflow).toContain('corepack enable');
    expect(workflow).toContain('cache: pnpm');
    expect(workflow).toContain('pnpm install --frozen-lockfile');
    expect(workflow).toContain('pnpm run --if-present build');
    expect(workflow).not.toContain('npm ci');
  });

  it('triggers on push only — the emitted binding spec forbids PR flows', async () => {
    const { workflow } = await installCi([
      'lang.go',
      'pkg.go-modules',
      'arch.hexagonal',
      'arch.cli',
    ]);
    expect(workflow).not.toContain('pull_request');
  });

  it('hard-fails when no stack family matches (pipeline goes uncovered)', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-ci-fail-'));
    cwds.push(cwd);
    const tree = new FsTree(cwd);
    const manifest = {
      ...emptyManifestV2('2026-08-17T00:00:00Z', '0.0.0-test'),
      tags: ['arch.hexagonal'],
    };
    await expect(
      installVertical({
        vertical: ciVertical,
        manifest,
        tree,
        mode: 'non-interactive',
        prompt: rejectingPrompt,
        logger: new FakeLogger(),
        cwd,
        templates: ejsTemplateSource,
        processes: spawnProcessRunner,
        now: () => '2026-08-17T12:00:00Z',
      }),
    ).rejects.toBeInstanceOf(ResolutionError);
  });

  it('hard-fails on a JVM manifest that lost its pkg.* tag', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-ci-nopkg-'));
    cwds.push(cwd);
    const tree = new FsTree(cwd);
    const manifest = {
      ...emptyManifestV2('2026-08-17T00:00:00Z', '0.0.0-test'),
      tags: ['lang.java', 'runtime.jvm', 'framework.quarkus', 'arch.hexagonal', 'arch.cli'],
    };
    await expect(
      installVertical({
        vertical: ciVertical,
        manifest,
        tree,
        mode: 'non-interactive',
        prompt: rejectingPrompt,
        logger: new FakeLogger(),
        cwd,
        templates: ejsTemplateSource,
        processes: spawnProcessRunner,
        now: () => '2026-08-17T12:00:00Z',
      }),
    ).rejects.toThrow(/pkg.gradle|pkg.maven/);
  });
});
