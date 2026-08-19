/**
 * Tests for the `ci` vertical. One adapter per stack family, so one
 * happy path per family asserting the emitted pipeline carries that
 * family's toolchain and commands — plus the tag promotion, the
 * build-system branch on the two families that have one (JVM
 * Gradle/Maven, TypeScript npm/pnpm), the provider dial (GitHub
 * Actions by default, GitLab CI by stored answer, never both files),
 * and the hard fail when no family tag matches (the `pipeline`
 * dimension goes uncovered).
 *
 * Every toolchain version the pipelines state is asserted **against
 * the pin registry itself**, so a workflow can never become a second
 * place a version lives; `tests/toolchain-pins.test.ts` guards the
 * same rule across the block, the dev container and CI at once.
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
import type { AnswerMap, ManifestV2 } from '../../../../src/domain/contract/composition.js';
import { pinValue } from '../../../support/version-pins.js';

let cwds: string[] = [];

beforeEach(() => {
  cwds = [];
});

afterEach(async () => {
  await Promise.all(cwds.map((c) => fs.remove(c)));
});

interface InstalledCi {
  readonly workflow: string;
  readonly gitlab: string;
  readonly manifest: ManifestV2;
}

async function installCi(tags: string[], answers: AnswerMap = {}): Promise<InstalledCi> {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-ci-'));
  cwds.push(cwd);
  const tree = new FsTree(cwd);
  const manifest = {
    ...emptyManifestV2('2026-08-17T00:00:00Z', '0.0.0-test'),
    tags,
    answers,
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
  return {
    workflow: tree.read('.github/workflows/ci.yml')?.toString() ?? '',
    gitlab: tree.read('.gitlab-ci.yml')?.toString() ?? '',
    manifest: result.manifest,
  };
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
    expect(workflow).toContain(`java-version: '${pinValue('jvm-jdk')}'`);
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
    await expect(installCi(['arch.hexagonal'])).rejects.toBeInstanceOf(ResolutionError);
  });

  it('hard-fails on a JVM manifest that lost its pkg.* tag', async () => {
    await expect(
      installCi(['lang.java', 'runtime.jvm', 'framework.quarkus', 'arch.hexagonal', 'arch.cli']),
    ).rejects.toThrow(/pkg.gradle|pkg.maven/);
  });
});

describe('ci vertical — the provider dial', () => {
  it('defaults to GitHub Actions and records the sticky answer', async () => {
    const { workflow, gitlab, manifest } = await installCi([
      'lang.go',
      'pkg.go-modules',
      'arch.hexagonal',
      'arch.cli',
    ]);
    expect(workflow).not.toBe('');
    expect(gitlab).toBe('');
    expect(manifest.answers['ci/go-pipeline']).toEqual({ provider: 'github-actions' });
  });

  it('emits the Gradle GitLab pipeline on a stored gitlab-ci answer, and only that file', async () => {
    const { workflow, gitlab, manifest } = await installCi(
      [
        'lang.java',
        'runtime.jvm',
        'pkg.gradle',
        'framework.quarkus',
        'arch.hexagonal',
        'arch.server-http',
      ],
      { 'ci/jvm-pipeline': { provider: 'gitlab-ci' } },
    );
    expect(workflow).toBe('');
    expect(gitlab).toContain(`image: eclipse-temurin:${pinValue('jvm-jdk')}-jdk`);
    expect(gitlab).toContain('GRADLE_USER_HOME');
    expect(gitlab).toContain('./gradlew build --no-daemon --stacktrace');
    expect(gitlab).not.toContain('mvnw');
    expect(manifest.tags).toContain('ci.gitlab-ci');
    expect(manifest.tags).not.toContain('ci.github-actions');
  });

  it('branches the GitLab pipeline on pkg.maven exactly as the workflow does', async () => {
    const { gitlab } = await installCi(
      ['lang.kotlin', 'runtime.jvm', 'pkg.maven', 'framework.spring', 'arch.hexagonal', 'arch.cli'],
      { 'ci/jvm-pipeline': { provider: 'gitlab-ci' } },
    );
    expect(gitlab).toContain('./mvnw --batch-mode verify');
    expect(gitlab).toContain('.m2/repository');
    expect(gitlab).not.toContain('gradlew');
  });

  it('emits the Go GitLab pipeline', async () => {
    const { gitlab } = await installCi(
      ['lang.go', 'pkg.go-modules', 'arch.hexagonal', 'arch.server-http'],
      { 'ci/go-pipeline': { provider: 'gitlab-ci' } },
    );
    expect(gitlab).toContain(`image: golang:${pinValue('go-toolchain')}`);
    expect(gitlab).toContain('go build ./...');
    expect(gitlab).toContain('go test ./...');
  });

  it('emits the Rust GitLab pipeline', async () => {
    const { gitlab } = await installCi(['lang.rust', 'pkg.cargo', 'arch.hexagonal', 'arch.cli'], {
      'ci/rust-pipeline': { provider: 'gitlab-ci' },
    });
    expect(gitlab).toContain('image: rust:latest');
    expect(gitlab).toContain('cargo build --workspace');
    expect(gitlab).toContain('cargo test --workspace');
  });

  it('emits the npm and pnpm GitLab pipelines per the recorded package manager', async () => {
    const npm = await installCi(
      ['lang.typescript', 'runtime.node', 'pkg.npm', 'arch.hexagonal', 'arch.server-http'],
      { 'ci/ts-pipeline': { provider: 'gitlab-ci' } },
    );
    expect(npm.gitlab).toContain(`image: node:${pinValue('node-active-lts')}`);
    expect(npm.gitlab).toContain('npm ci');
    expect(npm.gitlab).toContain('npm run lint --if-present');
    expect(npm.gitlab).not.toContain('pnpm');

    const pnpm = await installCi(
      [
        'lang.typescript',
        'runtime.browser',
        'pkg.pnpm',
        'framework.web-components',
        'arch.hexagonal',
        'arch.spa',
      ],
      { 'ci/ts-pipeline': { provider: 'gitlab-ci' } },
    );
    expect(pnpm.gitlab).toContain('corepack enable');
    expect(pnpm.gitlab).toContain('pnpm install --frozen-lockfile');
    expect(pnpm.gitlab).not.toContain('npm ci');
  });

  it('runs on push only — no merge-request pipeline rules', async () => {
    const { gitlab } = await installCi(
      ['lang.go', 'pkg.go-modules', 'arch.hexagonal', 'arch.cli'],
      { 'ci/go-pipeline': { provider: 'gitlab-ci' } },
    );
    expect(gitlab).not.toContain('merge_request');
  });

  it('rejects an unsupported provider answer loudly', async () => {
    await expect(
      installCi(['lang.go', 'pkg.go-modules', 'arch.hexagonal', 'arch.cli'], {
        'ci/go-pipeline': { provider: 'circleci' },
      }),
    ).rejects.toThrow(/unsupported provider 'circleci'/);
  });
});
