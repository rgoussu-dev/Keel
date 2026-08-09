/**
 * End-to-end test for the `git-init` adapter — exercises the full
 * pipeline (resolve → answer → apply → runActions) against a real
 * `git` binary. Mirrors the legacy `git-init-schematic.test.ts`
 * coverage so behaviour parity is provable.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ejsTemplateSource } from '../../../src/infrastructure/template/ejs-template-source.js';
import { spawnProcessRunner } from '../../../src/infrastructure/process/spawn-process-runner.js';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gitInitAdapter, GIT_INIT_VERTICAL } from '../../../src/domain/core/adapters/git-init.js';
import { runActions } from '../../../src/domain/core/actions.js';
import { installVertical } from '../../../src/domain/core/install.js';
import { emptyManifestV2 } from '../../../src/domain/contract/manifest.js';
import { FsTree } from '../../../src/infrastructure/tree/fs-tree.js';
import type { Prompt } from '../../../src/domain/core/answers.js';
import type { Vertical } from '../../../src/domain/contract/composition.js';

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

/** Wraps the single adapter into a one-dimension vertical. */
const vcsVertical: Vertical = {
  id: GIT_INIT_VERTICAL,
  description: 'version control bootstrap',
  dimensions: ['vcs'],
  adapters: [gitInitAdapter],
};

const installAndRun = async (opts: {
  cwd: string;
  remote?: string;
  branch?: string;
  dryRun?: boolean;
}): Promise<void> => {
  const tree = new FsTree(opts.cwd);
  const manifest = {
    ...emptyManifestV2('2026-04-26T00:00:00Z', '0.4.0-alpha'),
    answers: {
      'vcs/git-init': {
        remote: opts.remote ?? '',
        defaultBranch: opts.branch ?? 'main',
      },
    },
  };
  const result = await installVertical({
    vertical: vcsVertical,
    manifest,
    tree,
    mode: 'non-interactive',
    prompt: noPrompt,
    logger: silent,
    cwd: opts.cwd,
    templates: ejsTemplateSource,
    processes: spawnProcessRunner,
    now: () => '2026-04-26T12:00:00Z',
  });
  await tree.commit();
  await runActions({
    actions: result.applyResult.actions,
    cwd: opts.cwd,
    logger: silent,
    processes: spawnProcessRunner,
    dryRun: opts.dryRun ?? false,
  });
};

describe('git-init adapter', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(path.join(tmpdir(), 'keel-gitinit-adapter-'));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('initialises a new repo on the requested default branch', async () => {
    await installAndRun({ cwd: workDir, branch: 'main' });
    expect(existsSync(path.join(workDir, '.git'))).toBe(true);
    const branch = spawnSync('git', ['symbolic-ref', '--short', 'HEAD'], {
      cwd: workDir,
      encoding: 'utf8',
    });
    expect(branch.stdout.trim()).toBe('main');
  });

  it('honours a custom default branch', async () => {
    await installAndRun({ cwd: workDir, branch: 'trunk' });
    const branch = spawnSync('git', ['symbolic-ref', '--short', 'HEAD'], {
      cwd: workDir,
      encoding: 'utf8',
    });
    expect(branch.stdout.trim()).toBe('trunk');
  });

  it('registers the supplied origin remote', async () => {
    await installAndRun({ cwd: workDir, remote: 'git@example.com:acme/keel.git' });
    const remote = spawnSync('git', ['remote', 'get-url', 'origin'], {
      cwd: workDir,
      encoding: 'utf8',
    });
    expect(remote.status).toBe(0);
    expect(remote.stdout.trim()).toBe('git@example.com:acme/keel.git');
  });

  it('does not re-init an existing repo and preserves its branch', async () => {
    spawnSync('git', ['init', '-b', 'develop'], { cwd: workDir });
    await installAndRun({ cwd: workDir, branch: 'main' }); // requested branch is ignored
    const branch = spawnSync('git', ['symbolic-ref', '--short', 'HEAD'], {
      cwd: workDir,
      encoding: 'utf8',
    });
    expect(branch.stdout.trim()).toBe('develop');
  });

  it('does not overwrite an existing origin remote', async () => {
    spawnSync('git', ['init', '-b', 'main'], { cwd: workDir });
    spawnSync('git', ['remote', 'add', 'origin', 'git@old.example.com:a/b.git'], { cwd: workDir });
    await installAndRun({ cwd: workDir, remote: 'git@new.example.com:a/b.git' });
    const remote = spawnSync('git', ['remote', 'get-url', 'origin'], {
      cwd: workDir,
      encoding: 'utf8',
    });
    expect(remote.stdout.trim()).toBe('git@old.example.com:a/b.git');
  });

  it('refuses to nest under an enclosing repo', async () => {
    spawnSync('git', ['init', '-b', 'main'], { cwd: workDir });
    const inner = path.join(workDir, 'inner');
    mkdirSync(inner);
    await installAndRun({ cwd: inner });
    expect(existsSync(path.join(inner, '.git'))).toBe(false);
  });

  it('skips side effects under dry-run', async () => {
    await installAndRun({ cwd: workDir, dryRun: true });
    expect(existsSync(path.join(workDir, '.git'))).toBe(false);
  });
});
