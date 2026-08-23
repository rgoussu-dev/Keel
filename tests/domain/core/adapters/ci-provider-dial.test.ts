/**
 * The CI provider is one fact about a project — where the repository
 * is hosted — and two verticals need it: `ci` emits the pipeline,
 * `distribution` pushes the image to that host's registry. Sticky
 * memory is keyed per adapter, so a project taking both was asked
 * twice, and the second answer was then discarded by
 * `distributionProvider` (which prefers the `ci.*` tag, precisely so
 * the two can never emit for different hosts).
 *
 * Two properties, and they are separate. The **registry** must name
 * every adapter that declares the question, or one of them silently
 * goes back to asking; and the **borrow** must work in both
 * installation orders, since neither vertical requires the other.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeLogger } from '../../../../src/infrastructure/commons/fake-logger.js';
import { ejsTemplateSource } from '../../../../src/infrastructure/template/ejs-template-source.js';
import { spawnProcessRunner } from '../../../../src/infrastructure/process/spawn-process-runner.js';
import { installVertical } from '../../../../src/domain/core/install.js';
import { ciVertical } from '../../../../src/domain/core/verticals/ci.js';
import { distributionVertical } from '../../../../src/domain/core/verticals/distribution.js';
import { PROVIDER_ASKER_IDS } from '../../../../src/domain/core/adapters/ci-pipeline.js';
import { emptyManifestV2 } from '../../../../src/domain/contract/manifest.js';
import { FsTree } from '../../../../src/infrastructure/tree/fs-tree.js';
import type {
  Adapter,
  ManifestV2,
  Question,
  Vertical,
} from '../../../../src/domain/contract/composition.js';
import type { Prompt } from '../../../../src/domain/contract/ports/prompt.js';

let cwds: string[] = [];

beforeEach(() => {
  cwds = [];
});

afterEach(async () => {
  await Promise.all(cwds.map((c) => fs.remove(c)));
});

const JVM_TAGS = [
  'lang.java',
  'runtime.jvm',
  'pkg.gradle',
  'framework.quarkus',
  'arch.hexagonal',
  'arch.server-http',
  'deploy.container-image',
];

/** Answers `provider` with `reply`, counting how often it is asked. */
class CountingPrompt implements Prompt {
  providerAsks = 0;

  constructor(private readonly reply: string) {}

  ask(question: Question): Promise<string> {
    if (question.id !== 'provider') return Promise.resolve(question.default);
    this.providerAsks += 1;
    return Promise.resolve(this.reply);
  }
}

/**
 * Installs `vertical` interactively against `manifest`, into a tree
 * of its own. A fresh tree per call keeps this file's subject to the
 * answer travelling on the manifest; that the two verticals' GitLab
 * contributions also compose in one tree, in either order, is
 * `gitlab-pipeline-file.test.ts`.
 */
async function install(
  vertical: Vertical,
  manifest: ManifestV2,
  prompt: Prompt,
): Promise<{ manifest: ManifestV2; read: (p: string) => string }> {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-provider-dial-'));
  cwds.push(cwd);
  const tree = new FsTree(cwd);
  const result = await installVertical({
    vertical,
    manifest,
    tree,
    mode: 'interactive',
    prompt,
    logger: new FakeLogger(),
    cwd,
    templates: ejsTemplateSource,
    processes: spawnProcessRunner,
    now: () => '2026-08-17T12:00:00Z',
  });
  return { manifest: result.manifest, read: (p) => tree.read(p)?.toString() ?? '' };
}

function seed(): ManifestV2 {
  return { ...emptyManifestV2('2026-08-17T00:00:00Z', '0.0.0-test'), tags: JVM_TAGS };
}

/** Every adapter of both verticals that declares the provider question. */
function providerAskers(): readonly Adapter[] {
  return [...ciVertical.adapters, ...distributionVertical.adapters].filter((adapter) =>
    (adapter.questions ?? []).some((question) => question.id === 'provider'),
  );
}

describe('the CI provider dial — one question, two verticals', () => {
  it('names every adapter that asks it, and each borrows all the others', () => {
    const asking = providerAskers().map((adapter) => adapter.id);
    expect([...asking].sort()).toEqual([...PROVIDER_ASKER_IDS].sort());

    for (const adapter of providerAskers()) {
      expect([...(adapter.sharesAnswersWith ?? [])].sort()).toEqual(
        PROVIDER_ASKER_IDS.filter((id) => id !== adapter.id).sort(),
      );
    }
  });

  it('asks once when `ci` is installed first, and `distribution` reuses the answer', async () => {
    const prompt = new CountingPrompt('gitlab-ci');
    const ci = await install(ciVertical, seed(), prompt);
    expect(ci.read('.gitlab-ci.yml')).toContain('./gradlew build');

    const dist = await install(distributionVertical, ci.manifest, prompt);
    expect(prompt.providerAsks).toBe(1);
    expect(dist.read('.gitlab-ci.yml')).toContain('$CI_REGISTRY_IMAGE');
    expect(dist.read('.github/workflows/release-image.yml')).toBe('');
    expect(dist.manifest.answers['distribution/jvm-container']).toEqual({
      provider: 'gitlab-ci',
      deploy: 'compose',
    });
  });

  it('asks once when `distribution` is installed first, and `ci` reuses the answer', async () => {
    const prompt = new CountingPrompt('gitlab-ci');
    const dist = await install(distributionVertical, seed(), prompt);
    expect(dist.read('.gitlab-ci.yml')).toContain('$CI_REGISTRY_IMAGE');

    const ci = await install(ciVertical, dist.manifest, prompt);
    expect(prompt.providerAsks).toBe(1);
    // Borrowed, not defaulted: the default is github-actions.
    expect(ci.read('.gitlab-ci.yml')).toContain('./gradlew build');
    expect(ci.read('.github/workflows/ci.yml')).toBe('');
    expect(ci.manifest.answers['ci/jvm-pipeline']).toEqual({ provider: 'gitlab-ci' });
  });
});
