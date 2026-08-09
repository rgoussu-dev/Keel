/**
 * End-to-end smoke test for the composition layer. Wires resolver →
 * answers → apply against a synthetic vertical, no filesystem I/O
 * beyond the temp tree.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installVertical } from '../../src/composition/install.js';
import { emptyManifestV2 } from '../../src/domain/contract/manifest.js';
import { InMemoryTree } from '../../src/engine/tree.js';
import type { Prompt } from '../../src/composition/answers.js';
import type { Vertical } from '../../src/domain/contract/composition.js';

const silent = {
  info: () => {},
  success: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

const failingPrompt: Prompt = {
  ask: async () => {
    throw new Error('prompt should not have been called');
  },
};

const scripted = (...replies: string[]): Prompt => {
  let i = 0;
  return {
    ask: async () => {
      const r = replies[i++];
      if (r === undefined) throw new Error('scripted prompt exhausted');
      return r;
    },
  };
};

/** A fake `distribution` vertical with two adapters. */
const distribution: Vertical = {
  id: 'distribution',
  description: 'how this project ships',
  dimensions: ['build', 'release'],
  adapters: [
    // Quarkus CLI native build, only when the matching tags are present.
    {
      id: 'distribution/quarkus-cli-native',
      vertical: 'distribution',
      covers: ['build'],
      predicate: { requires: ['framework.quarkus', 'arch.cli'] },
      questions: [
        {
          id: 'targets',
          prompt: 'native targets',
          doc: '',
          default: 'linux-amd64',
          memory: 'sticky',
          choices: [
            { value: 'linux-amd64', label: 'linux-amd64', doc: '' },
            { value: 'darwin-arm64', label: 'darwin-arm64', doc: '' },
          ],
        },
      ],
      after: ['ci/github-actions'],
      contribute: (ctx) => ({
        files: [
          {
            path: '.github/workflows/release.yml',
            content: `targets: ${ctx.answer('targets')}\n`,
          },
        ],
        patches: [
          { target: 'pom.xml', apply: (s) => s.replace('</project>', '<native/></project>') },
        ],
        agentic: { skills: ['skills/native-build-debug.md'] },
        tagsAdd: ['runtime.graalvm-native'],
      }),
    },
    // GitHub release channel, applies whenever ci.github-actions is present.
    {
      id: 'distribution/github-release',
      vertical: 'distribution',
      covers: ['release'],
      predicate: { requires: ['ci.github-actions'] },
      contribute: () => ({
        files: [{ path: 'pom.xml', content: '<project></project>' }],
      }),
    },
  ],
};

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-smoke-'));
});

afterEach(async () => {
  await fs.remove(tmp);
});

describe('installVertical end-to-end', () => {
  it('resolves, prompts for sticky answers, applies, updates manifest', async () => {
    const tree = new InMemoryTree(tmp);
    const manifest = {
      ...emptyManifestV2('2026-04-26T00:00:00Z', '0.4.0-alpha'),
      tags: ['lang.java', 'framework.quarkus', 'arch.cli', 'ci.github-actions'],
    };
    const result = await installVertical({
      vertical: distribution,
      manifest,
      tree,
      mode: 'interactive',
      prompt: scripted('darwin-arm64'),
      logger: silent,
      cwd: tmp,
      now: () => '2026-04-26T12:00:00Z',
    });

    // Tree contents: github-release ran first (no `after`), then
    // quarkus-cli-native (`after: ci/github-actions` is dangling and
    // ignored, so resolution falls back to id-sorted order). Both
    // files exist; pom.xml shows the patch applied.
    expect(tree.read('pom.xml')?.toString()).toBe('<project><native/></project>');
    expect(tree.read('.github/workflows/release.yml')?.toString()).toBe('targets: darwin-arm64\n');

    // Manifest updates: tagsAdd, vertical recorded, sticky answer
    // persisted, updatedAt bumped.
    expect(result.manifest.tags).toContain('runtime.graalvm-native');
    expect(result.manifest.verticals).toEqual([
      { id: 'distribution', installedAt: '2026-04-26T12:00:00Z' },
    ]);
    expect(result.manifest.answers).toEqual({
      'distribution/quarkus-cli-native': { targets: 'darwin-arm64' },
    });
    expect(result.manifest.updatedAt).toBe('2026-04-26T12:00:00Z');
  });

  it('reuses sticky answers from the manifest without prompting', async () => {
    const tree = new InMemoryTree(tmp);
    const manifest = {
      ...emptyManifestV2('2026-04-26T00:00:00Z', '0.4.0-alpha'),
      tags: ['lang.java', 'framework.quarkus', 'arch.cli', 'ci.github-actions'],
      answers: {
        'distribution/quarkus-cli-native': { targets: 'linux-amd64' },
      },
    };
    const result = await installVertical({
      vertical: distribution,
      manifest,
      tree,
      mode: 'interactive',
      prompt: failingPrompt,
      logger: silent,
      cwd: tmp,
      now: () => '2026-04-26T12:00:00Z',
    });
    expect(tree.read('.github/workflows/release.yml')?.toString()).toBe('targets: linux-amd64\n');
    expect(result.manifest.answers).toEqual({
      'distribution/quarkus-cli-native': { targets: 'linux-amd64' },
    });
  });

  it('hard-fails when a dimension is uncovered for the current tag set', async () => {
    const tree = new InMemoryTree(tmp);
    const manifest = {
      ...emptyManifestV2('2026-04-26T00:00:00Z', '0.4.0-alpha'),
      // Missing ci.github-actions, so the release adapter is filtered out.
      tags: ['lang.java', 'framework.quarkus', 'arch.cli'],
    };
    await expect(
      installVertical({
        vertical: distribution,
        manifest,
        tree,
        mode: 'non-interactive',
        prompt: failingPrompt,
        logger: silent,
        cwd: tmp,
        now: () => '2026-04-26T12:00:00Z',
      }),
    ).rejects.toThrow(/release/);
  });
});
