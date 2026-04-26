/**
 * End-to-end test for the `walking-skeleton` vertical against a
 * Quarkus CLI tag set. Asserts the rendered tree shape matches the
 * minimum runnable project we promise; checks the predicate split
 * by removing `arch.cli` and expecting a hard fail.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installVertical } from '../../../src/composition/install.js';
import { walkingSkeletonVertical } from '../../../src/composition/verticals/walking-skeleton.js';
import { ResolutionError } from '../../../src/composition/resolver.js';
import { emptyManifestV2 } from '../../../src/manifest/schema-v2.js';
import { InMemoryTree } from '../../../src/engine/tree.js';
import type { Prompt } from '../../../src/composition/answers.js';

const silent = {
  info: () => {},
  success: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

const noPrompt: Prompt = {
  ask: async () => {
    throw new Error('prompt should not be called in non-interactive mode');
  },
};

const baseTags = (...extra: string[]): string[] => [
  'lang.java',
  'runtime.jvm',
  'pkg.gradle',
  'framework.quarkus',
  'arch.hexagonal',
  ...extra,
];

const installWith = async (
  tags: string[],
  answers?: Record<string, Record<string, string>>,
): Promise<{ tree: InMemoryTree; cwd: string }> => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-ws-'));
  const tree = new InMemoryTree(cwd);
  const manifest = {
    ...emptyManifestV2('2026-04-26T00:00:00Z', '0.4.0-alpha'),
    tags,
    answers: answers ?? {},
  };
  await installVertical({
    vertical: walkingSkeletonVertical,
    manifest,
    tree,
    mode: 'non-interactive',
    prompt: noPrompt,
    logger: silent,
    cwd,
    now: () => '2026-04-26T12:00:00Z',
  });
  return { tree, cwd };
};

let cwds: string[] = [];

beforeEach(() => {
  cwds = [];
});

afterEach(async () => {
  await Promise.all(cwds.map((c) => fs.remove(c)));
});

describe('walking-skeleton vertical (Quarkus CLI)', () => {
  it('renders the minimum runnable project shell with default answers', async () => {
    const { tree, cwd } = await installWith(baseTags('arch.cli'));
    cwds.push(cwd);

    const expected = [
      '.gitignore',
      'README.md',
      'build.gradle.kts',
      'gradle.properties',
      'settings.gradle.kts',
      'src/main/java/com/example/cli/HelloCommand.java',
      'src/main/java/com/example/cli/Main.java',
      'src/main/resources/application.properties',
      'src/test/java/com/example/cli/HelloCommandTest.java',
    ];
    for (const p of expected) {
      expect(tree.read(p), `missing ${p}`).not.toBeNull();
    }
  });

  it('substitutes basePackage and projectName from sticky answers', async () => {
    const { tree, cwd } = await installWith(baseTags('arch.cli'), {
      'walking-skeleton/quarkus-cli-bootstrap': {
        basePackage: 'com.acme.tooling',
        projectName: 'shipper',
      },
    });
    cwds.push(cwd);

    const settings = tree.read('settings.gradle.kts')?.toString() ?? '';
    expect(settings).toContain('rootProject.name = "shipper"');

    const main = tree.read('src/main/java/com/acme/tooling/cli/Main.java')?.toString() ?? '';
    expect(main).toContain('package com.acme.tooling.cli;');
    expect(main).toContain('public static final String NAME = "shipper";');

    const build = tree.read('build.gradle.kts')?.toString() ?? '';
    expect(build).toContain('group = "com.acme.tooling"');
  });

  it('hard-fails when arch.cli is absent (no adapter covers entrypoint)', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-ws-fail-'));
    cwds.push(cwd);
    const tree = new InMemoryTree(cwd);
    const manifest = {
      ...emptyManifestV2('2026-04-26T00:00:00Z', '0.4.0-alpha'),
      tags: baseTags('arch.server-http'),
    };
    await expect(
      installVertical({
        vertical: walkingSkeletonVertical,
        manifest,
        tree,
        mode: 'non-interactive',
        prompt: noPrompt,
        logger: silent,
        cwd,
        now: () => '2026-04-26T12:00:00Z',
      }),
    ).rejects.toBeInstanceOf(ResolutionError);
  });

  it('rejects an invalid basePackage with a clear message', async () => {
    await expect(
      installWith(baseTags('arch.cli'), {
        'walking-skeleton/quarkus-cli-bootstrap': {
          basePackage: 'Not A Package',
          projectName: 'shipper',
        },
      }),
    ).rejects.toThrow(/invalid basePackage/);
  });

  it('rejects an invalid projectName with a clear message', async () => {
    await expect(
      installWith(baseTags('arch.cli'), {
        'walking-skeleton/quarkus-cli-bootstrap': {
          basePackage: 'com.example',
          projectName: 'Has Spaces',
        },
      }),
    ).rejects.toThrow(/invalid projectName/);
  });
});
