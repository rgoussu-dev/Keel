/**
 * End-to-end test for the `distribution` vertical against a Quarkus
 * CLI tag set. Asserts:
 *   - happy path: workflow files are emitted with the substituted
 *     matrix and the manifest gains `runtime.graalvm-native`;
 *   - sticky reuse: a stored answer is honoured silently on a second
 *     install;
 *   - REST routing: `arch.cli` removed → the native-binaries
 *     adapter filters out and the container family covers the
 *     dimensions instead (its own suite covers the happy paths).
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
import { distributionVertical } from '../../../../src/domain/core/verticals/distribution.js';
import { emptyManifestV2 } from '../../../../src/domain/contract/manifest.js';
import { FsTree } from '../../../../src/infrastructure/tree/fs-tree.js';

const baseTags = (...extra: string[]): string[] => [
  'lang.java',
  'runtime.jvm',
  'pkg.gradle',
  'framework.quarkus',
  'arch.hexagonal',
  ...extra,
];

const bootstrapAnswers = {
  'walking-skeleton/quarkus-cli-bootstrap': {
    basePackage: 'com.acme.cli',
    projectName: 'shipper',
  },
};

let cwds: string[] = [];

beforeEach(() => {
  cwds = [];
});

afterEach(async () => {
  await Promise.all(cwds.map((c) => fs.remove(c)));
});

describe('distribution vertical (Quarkus CLI native)', () => {
  it('emits release+native-build workflows and promotes runtime.graalvm-native', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-dist-'));
    cwds.push(cwd);
    const tree = new FsTree(cwd);
    const manifest = {
      ...emptyManifestV2('2026-04-26T00:00:00Z', '0.4.0-alpha'),
      tags: baseTags('arch.cli'),
      answers: bootstrapAnswers,
    };
    const result = await installVertical({
      vertical: distributionVertical,
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

    const release = tree.read('.github/workflows/release.yml')?.toString() ?? '';
    expect(release).toContain('name: release');
    expect(release).toContain('- target: linux-amd64');
    expect(release).toContain('runner: ubuntu-latest');
    expect(release).toContain('- target: linux-arm64');
    expect(release).toContain('runner: ubuntu-22.04-arm');
    expect(release).toContain('- target: darwin-arm64');
    expect(release).toContain('runner: macos-14');
    // The matrix field is `runner` (not `runs-on`) because GitHub
    // Actions' expression parser treats the hyphen in `matrix.runs-on`
    // as subtraction; the dispatch reads `${{ matrix.runner }}`.
    expect(release).toContain('runs-on: ${{ matrix.runner }}');
    expect(release).toContain('shipper-${{ matrix.target }}');

    const smoke = tree.read('.github/workflows/native-build.yml')?.toString() ?? '';
    expect(smoke).toContain('name: native-build');
    // First target in the default preset is linux-amd64; smoke uses it.
    expect(smoke).toContain('runs-on: ubuntu-latest');

    expect(result.applyResult.tagsAdded).toContain('runtime.graalvm-native');
    expect(result.manifest.tags).toContain('runtime.graalvm-native');
    expect(result.manifest.answers[distributionVertical.adapters[0]!.id]).toEqual({
      targets: 'linux-amd64,linux-arm64,darwin-arm64',
    });
  });

  it('reuses a stored target answer without prompting', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-dist-sticky-'));
    cwds.push(cwd);
    const tree = new FsTree(cwd);
    const manifest = {
      ...emptyManifestV2('2026-04-26T00:00:00Z', '0.4.0-alpha'),
      tags: baseTags('arch.cli'),
      answers: {
        ...bootstrapAnswers,
        'distribution/quarkus-cli-native': { targets: 'linux-amd64' },
      },
    };
    await installVertical({
      vertical: distributionVertical,
      manifest,
      tree,
      mode: 'interactive',
      prompt: rejectingPrompt,
      logger: new FakeLogger(),
      cwd,
      templates: ejsTemplateSource,
      processes: spawnProcessRunner,
      now: () => '2026-04-26T12:00:00Z',
    });
    const release = tree.read('.github/workflows/release.yml')?.toString() ?? '';
    expect(release).toContain('- target: linux-amd64');
    expect(release).not.toContain('linux-arm64');
    expect(release).not.toContain('darwin-arm64');
  });

  it('routes a REST project to the container family instead of hard-failing', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-dist-rest-'));
    cwds.push(cwd);
    const tree = new FsTree(cwd);
    const manifest = {
      ...emptyManifestV2('2026-04-26T00:00:00Z', '0.4.0-alpha'),
      // Quarkus + Gradle but no arch.cli — the native-binaries
      // adapter filters out and `jvm-container` covers the
      // dimensions instead. Without the containerization Dockerfile
      // it refuses with the fix in the message (see
      // distribution-container.test.ts for the covered paths).
      tags: baseTags('arch.server-http'),
      answers: bootstrapAnswers,
    };
    await expect(
      installVertical({
        vertical: distributionVertical,
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
    ).rejects.toThrow(/keel add containerization/);
  });

  it('errors if the bootstrap projectName is missing from the manifest', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-dist-missing-'));
    cwds.push(cwd);
    const tree = new FsTree(cwd);
    const manifest = {
      ...emptyManifestV2('2026-04-26T00:00:00Z', '0.4.0-alpha'),
      tags: baseTags('arch.cli'),
    };
    await expect(
      installVertical({
        vertical: distributionVertical,
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
    ).rejects.toThrow(/projectName not in manifest/);
  });
});
