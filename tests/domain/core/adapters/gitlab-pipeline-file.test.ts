/**
 * GitLab gives a project **one** pipeline file, and two verticals
 * write into it: `ci` contributes the build gate every push has to
 * pass, `distribution` the tag-triggered release jobs. Neither may
 * assume it runs first — `keel add` takes them in either order — so
 * each owns a sentinel-delimited region rather than the file, the
 * same idiom `code-style` uses for `.editorconfig`.
 *
 * Three properties, and they are separate. The file must **compose**
 * in either order (it used to be a plain file write from `ci`, which
 * refused to overwrite what `distribution` had already created); it
 * must **read the same** either way, since the build gate carries the
 * top-level `image:`/`variables:` keys and belongs on top; and
 * re-rendering one vertical must **leave the other's jobs alone**,
 * which is what `--reapply` needs and a whole-file write never gave.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import YAML from 'yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeLogger } from '../../../../src/infrastructure/commons/fake-logger.js';
import { ejsTemplateSource } from '../../../../src/infrastructure/template/ejs-template-source.js';
import { spawnProcessRunner } from '../../../../src/infrastructure/process/spawn-process-runner.js';
import { rejectingPrompt } from '../../../../src/infrastructure/prompt/fake.js';
import { installVertical } from '../../../../src/domain/core/install.js';
import { ciVertical } from '../../../../src/domain/core/verticals/ci.js';
import { distributionVertical } from '../../../../src/domain/core/verticals/distribution.js';
import {
  CI_PIPELINE_SECTION,
  DISTRIBUTION_PIPELINE_SECTION,
  upsertPipelineSection,
} from '../../../../src/domain/core/adapters/ci-pipeline.js';
import { emptyManifestV2 } from '../../../../src/domain/contract/manifest.js';
import { FsTree } from '../../../../src/infrastructure/tree/fs-tree.js';
import type { ManifestV2, Vertical } from '../../../../src/domain/contract/composition.js';

const PIPELINE = '.gitlab-ci.yml';

/** A Gradle Quarkus REST service that has answered `gitlab-ci`. */
const TAGS = [
  'lang.java',
  'runtime.jvm',
  'pkg.gradle',
  'framework.quarkus',
  'arch.hexagonal',
  'arch.server-http',
  'deploy.container-image',
  'runtime.jvm-image',
];
const ANSWERS = {
  'ci/jvm-pipeline': { provider: 'gitlab-ci' },
  'distribution/jvm-container': { provider: 'gitlab-ci', deploy: 'compose' },
};

let cwds: string[] = [];

beforeEach(() => {
  cwds = [];
});

afterEach(async () => {
  await Promise.all(cwds.map((c) => fs.remove(c)));
});

const VERTICALS: Readonly<Record<string, Vertical>> = {
  ci: ciVertical,
  distribution: distributionVertical,
};

/**
 * Installs each named vertical into **one** tree, in order — the
 * whole point being that they share `.gitlab-ci.yml`. `reapply` names
 * a vertical to re-render once the others have landed.
 */
async function pipelineAfter(order: readonly string[], reapply?: string): Promise<string> {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-gitlab-pipeline-'));
  cwds.push(cwd);
  const tree = new FsTree(cwd);
  let manifest: ManifestV2 = {
    ...emptyManifestV2('2026-08-17T00:00:00Z', '0.0.0-test'),
    tags: TAGS,
    answers: ANSWERS,
  };
  const shared = {
    tree,
    mode: 'non-interactive' as const,
    prompt: rejectingPrompt,
    logger: new FakeLogger(),
    cwd,
    templates: ejsTemplateSource,
    processes: spawnProcessRunner,
    now: () => '2026-08-17T12:00:00Z',
  };
  for (const id of order) {
    const result = await installVertical({ ...shared, vertical: VERTICALS[id]!, manifest });
    manifest = result.manifest;
  }
  if (reapply !== undefined) {
    await installVertical({
      ...shared,
      vertical: VERTICALS[reapply]!,
      manifest,
      apply: 'reapply',
    });
  }
  return tree.read(PIPELINE)?.toString() ?? '';
}

describe('the shared `.gitlab-ci.yml`', () => {
  it('composes in either install order, and reads the same both ways', async () => {
    const ciFirst = await pipelineAfter(['ci', 'distribution']);
    const distributionFirst = await pipelineAfter(['distribution', 'ci']);

    expect(ciFirst).toBe(distributionFirst);
    // The build gate's top-level keys sit above the release jobs
    // whichever vertical created the file.
    expect(ciFirst.indexOf(CI_PIPELINE_SECTION.begin)).toBeLessThan(
      ciFirst.indexOf(DISTRIBUTION_PIPELINE_SECTION.begin),
    );
    const parsed = YAML.parse(ciFirst) as Record<string, unknown>;
    expect(parsed['image']).toBe('eclipse-temurin:25-jdk');
    expect(parsed).toHaveProperty('build');
    expect(parsed).toHaveProperty('release-artifact');
    expect(parsed).toHaveProperty('release-image');
  });

  it('re-renders one vertical without touching the other vertical’s jobs', async () => {
    const settled = await pipelineAfter(['ci', 'distribution']);

    // Both directions: a reapply of either is a no-op on a file the
    // other half also owns. As a whole-file write, `ci` here either
    // clobbered the release jobs or refused outright.
    expect(await pipelineAfter(['ci', 'distribution'], 'ci')).toBe(settled);
    expect(await pipelineAfter(['ci', 'distribution'], 'distribution')).toBe(settled);
  });

  it('leaves a hand-written pipeline’s own jobs alone', () => {
    const mine = 'stages:\n  - custom\n\nmy-job:\n  script:\n    - echo hi\n';
    const withCi = upsertPipelineSection(mine, 'build:\n  script:\n    - a', CI_PIPELINE_SECTION);
    const both = upsertPipelineSection(
      withCi,
      'release:\n  script:\n    - b',
      DISTRIBUTION_PIPELINE_SECTION,
    );

    expect(both).toContain('my-job:');
    expect(YAML.parse(both)).toHaveProperty('my-job');
    // The gate on top, the release jobs at the end, the user's own in
    // between — and re-rendering either region keeps all three.
    expect(both.indexOf('build:')).toBeLessThan(both.indexOf('my-job:'));
    expect(both.indexOf('my-job:')).toBeLessThan(both.indexOf('release:'));
    expect(upsertPipelineSection(both, 'build:\n  script:\n    - a', CI_PIPELINE_SECTION)).toBe(
      both,
    );
  });

  it('refuses a half-deleted sentinel pair rather than guessing', () => {
    const broken = `${CI_PIPELINE_SECTION.begin}\nbuild:\n  script:\n    - a\n`;
    expect(() => upsertPipelineSection(broken, 'build:', CI_PIPELINE_SECTION)).toThrow(
      /sentinels are broken/,
    );
  });
});
