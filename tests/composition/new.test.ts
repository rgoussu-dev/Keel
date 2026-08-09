/**
 * Integration test for `keel new` (the `newProject` orchestrator).
 *
 * Drives the full flow against a real temp directory: stack lookup,
 * vertical install, tree commit, action execution (real `git init`),
 * and manifest persistence.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newProject } from '../../src/installer/new.js';
import { fsManifestStore } from '../../src/infrastructure/manifest/fs-manifest-store.js';
import { projectScopeRoot } from '../../src/domain/contract/manifest.js';
import { runActions, type RunActionsInputs } from '../../src/composition/actions.js';
import type { Prompt } from '../../src/composition/answers.js';

/**
 * Skips actions whose id is in `skip`; passes the rest through to the
 * real runner. Lets the integration test exercise `git-init` end-to-end
 * while sidestepping `gradle wrapper`, which would spawn Gradle.
 */
const runActionsExcept = (skip: readonly string[]) => {
  const blocked = new Set(skip);
  return (inputs: RunActionsInputs) =>
    runActions({ ...inputs, actions: inputs.actions.filter((a) => !blocked.has(a.id)) });
};

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

let cwd: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-new-'));
});

afterEach(async () => {
  await fs.remove(cwd);
});

describe('newProject (keel new)', () => {
  it('bootstraps a Quarkus CLI project end-to-end', async () => {
    await newProject({
      cwd,
      stack: 'quarkus-cli',
      answers: {
        'walking-skeleton/quarkus-cli-bootstrap': {
          basePackage: 'com.acme.cli',
          projectName: 'demo',
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

    // Tree-emitted files landed on disk.
    expect(await fs.pathExists(path.join(cwd, 'build.gradle.kts'))).toBe(true);
    expect(await fs.pathExists(path.join(cwd, 'settings.gradle.kts'))).toBe(true);
    expect(
      await fs.pathExists(
        path.join(cwd, 'infrastructure/cli/src/main/java/com/acme/cli/cli/Main.java'),
      ),
    ).toBe(true);
    expect(
      await fs.pathExists(
        path.join(cwd, 'domain/contract/src/main/java/com/acme/cli/contract/Mediator.java'),
      ),
    ).toBe(true);
    expect(
      await fs.pathExists(
        path.join(cwd, 'domain/core/src/main/java/com/acme/cli/core/greet/GreetHandler.java'),
      ),
    ).toBe(true);

    // Binding spec landed under .claude/.
    const claudeMd = await fs.readFile(path.join(cwd, '.claude/CLAUDE.md'), 'utf8');
    expect(claudeMd).toContain('Universal engineering conventions (keel)');

    // Action ran: git repo exists, branch is main.
    expect(await fs.pathExists(path.join(cwd, '.git'))).toBe(true);
    const branch = spawnSync('git', ['symbolic-ref', '--short', 'HEAD'], {
      cwd,
      encoding: 'utf8',
    });
    expect(branch.stdout.trim()).toBe('main');

    // Manifest was persisted with the stack's tags + verticals + answers.
    const manifest = await fsManifestStore.read(projectScopeRoot(cwd));
    expect(manifest).not.toBeNull();
    expect(manifest!.tags).toEqual(
      [
        'arch.cli',
        'arch.hexagonal',
        'framework.quarkus',
        'lang.java',
        'pkg.gradle',
        'runtime.jvm',
      ].sort(),
    );
    expect(manifest!.verticals.map((v) => v.id).sort()).toEqual(['vcs', 'walking-skeleton']);
    expect(manifest!.answers['walking-skeleton/quarkus-cli-bootstrap']).toEqual({
      basePackage: 'com.acme.cli',
      projectName: 'demo',
    });
  });

  it('writes nothing under --dry-run', async () => {
    await newProject({
      cwd,
      stack: 'quarkus-cli',
      answers: {
        'walking-skeleton/quarkus-cli-bootstrap': {
          basePackage: 'com.example',
          projectName: 'walking-skeleton',
        },
        'vcs/git-init': { remote: '', defaultBranch: 'main' },
      },
      interactive: false,
      dryRun: true,
      logger: silent,
      prompt: noPrompt,
      now: () => '2026-04-26T12:00:00Z',
      keelVersion: '0.4.0-alpha',
    });
    expect(await fs.pathExists(path.join(cwd, 'build.gradle.kts'))).toBe(false);
    expect(await fs.pathExists(path.join(cwd, '.git'))).toBe(false);
    expect(await fs.pathExists(path.join(projectScopeRoot(cwd), '.keel-manifest.json'))).toBe(
      false,
    );
  });

  it('refuses to run if a manifest already exists', async () => {
    await fs.ensureDir(projectScopeRoot(cwd));
    await fs.writeJson(path.join(projectScopeRoot(cwd), '.keel-manifest.json'), {
      version: 2,
      keelVersion: '0.4.0-alpha',
      installedAt: 'x',
      updatedAt: 'x',
      tags: [],
      verticals: [],
      versions: {},
      answers: {},
      entries: [],
    });
    await expect(
      newProject({
        cwd,
        stack: 'quarkus-cli',
        interactive: false,
        dryRun: false,
        logger: silent,
        prompt: noPrompt,
        now: () => '2026-04-26T12:00:00Z',
        keelVersion: '0.4.0-alpha',
      }),
    ).rejects.toThrow(/already initialised/);
  });

  it('rejects an unknown stack id', async () => {
    await expect(
      newProject({
        cwd,
        stack: 'imaginary-stack',
        interactive: false,
        dryRun: false,
        logger: silent,
        prompt: noPrompt,
        now: () => '2026-04-26T12:00:00Z',
        keelVersion: '0.4.0-alpha',
      }),
    ).rejects.toThrow(/unknown stack/);
  });
});
