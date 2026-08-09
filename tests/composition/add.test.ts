/**
 * Integration test for `keel add` (the `addVertical` orchestrator).
 *
 * Drives the brownfield path against a real temp directory: runs
 * `keel new` first to seed a project, then layers `distribution` on
 * top via `keel add` and asserts the workflow files land, the
 * manifest gains the new vertical and tags, and basic safeguards
 * (duplicate, unknown id, missing project) fire.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newProject } from '../../src/installer/new.js';
import { addVertical } from '../../src/installer/add.js';
import { fsManifestStore } from '../../src/infrastructure/manifest/fs-manifest-store.js';
import { projectScopeRoot } from '../../src/domain/contract/manifest.js';
import { runActions, type RunActionsInputs } from '../../src/composition/actions.js';
import type { Prompt } from '../../src/composition/answers.js';

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

const runActionsExcept = (skip: readonly string[]) => {
  const blocked = new Set(skip);
  return (inputs: RunActionsInputs) =>
    runActions({ ...inputs, actions: inputs.actions.filter((a) => !blocked.has(a.id)) });
};

let cwd: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-add-'));
});

afterEach(async () => {
  await fs.remove(cwd);
});

const seedQuarkusCli = (): Promise<void> =>
  newProject({
    cwd,
    stack: 'quarkus-cli',
    answers: {
      'walking-skeleton/quarkus-cli-bootstrap': {
        basePackage: 'com.acme.cli',
        projectName: 'shipper',
      },
      'vcs/git-init': { remote: '', defaultBranch: 'main' },
    },
    interactive: false,
    dryRun: false,
    logger: silent,
    prompt: noPrompt,
    now: () => '2026-04-26T12:00:00Z',
    keelVersion: '0.4.0-alpha',
    runActions: runActionsExcept(['walking-skeleton/gradle-wrapper']),
  });

describe('addVertical (keel add)', () => {
  it('layers distribution onto an existing quarkus-cli project', async () => {
    await seedQuarkusCli();
    await addVertical({
      cwd,
      vertical: 'distribution',
      interactive: false,
      dryRun: false,
      logger: silent,
      prompt: noPrompt,
      now: () => '2026-04-27T08:00:00Z',
    });

    expect(await fs.pathExists(path.join(cwd, '.github/workflows/release.yml'))).toBe(true);
    expect(await fs.pathExists(path.join(cwd, '.github/workflows/native-build.yml'))).toBe(true);

    const manifest = await fsManifestStore.read(projectScopeRoot(cwd));
    expect(manifest).not.toBeNull();
    expect(manifest!.verticals.map((v) => v.id).sort()).toEqual([
      'distribution',
      'vcs',
      'walking-skeleton',
    ]);
    expect(manifest!.tags).toContain('runtime.graalvm-native');
    expect(manifest!.answers['distribution/quarkus-cli-native']).toEqual({
      targets: 'linux-amd64,linux-arm64,darwin-arm64',
    });
    expect(manifest!.updatedAt).toBe('2026-04-27T08:00:00Z');
  });

  it('refuses to install the same vertical twice', async () => {
    await seedQuarkusCli();
    await addVertical({
      cwd,
      vertical: 'distribution',
      interactive: false,
      dryRun: false,
      logger: silent,
      prompt: noPrompt,
      now: () => '2026-04-27T08:00:00Z',
    });
    await expect(
      addVertical({
        cwd,
        vertical: 'distribution',
        interactive: false,
        dryRun: false,
        logger: silent,
        prompt: noPrompt,
        now: () => '2026-04-27T08:00:00Z',
      }),
    ).rejects.toThrow(/already installed/);
  });

  it('rejects an unknown vertical id with available ones listed', async () => {
    await seedQuarkusCli();
    await expect(
      addVertical({
        cwd,
        vertical: 'nonsense-vertical',
        interactive: false,
        dryRun: false,
        logger: silent,
        prompt: noPrompt,
        now: () => '2026-04-27T08:00:00Z',
      }),
    ).rejects.toThrow(/unknown vertical 'nonsense-vertical'.*distribution/);
  });

  it('rejects when the project has no manifest', async () => {
    await expect(
      addVertical({
        cwd,
        vertical: 'distribution',
        interactive: false,
        dryRun: false,
        logger: silent,
        prompt: noPrompt,
        now: () => '2026-04-27T08:00:00Z',
      }),
    ).rejects.toThrow(/no project initialised/);
  });

  it('writes nothing under --dry-run', async () => {
    await seedQuarkusCli();
    await addVertical({
      cwd,
      vertical: 'distribution',
      interactive: false,
      dryRun: true,
      logger: silent,
      prompt: noPrompt,
      now: () => '2026-04-27T08:00:00Z',
    });
    expect(await fs.pathExists(path.join(cwd, '.github/workflows/release.yml'))).toBe(false);
    const manifest = await fsManifestStore.read(projectScopeRoot(cwd));
    expect(manifest!.verticals.map((v) => v.id).sort()).toEqual(['vcs', 'walking-skeleton']);
  });
});
