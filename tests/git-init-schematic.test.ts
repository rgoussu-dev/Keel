import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { HomegrownEngine, cliPrompt } from '../src/engine/homegrown.js';
import { gitInitSchematic } from '../src/schematics/git-init/factory.js';
import { logger } from '../src/util/log.js';

/**
 * The tests shell out to real `git`; the dev environment always has it.
 * A temp dir outside any repository gives us a clean slate per case.
 */
describe('git-init schematic', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(path.join(tmpdir(), 'keel-gitinit-'));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('initialises a new repo on the requested default branch', async () => {
    const engine = new HomegrownEngine();
    engine.register(gitInitSchematic);

    await engine.run(
      'git-init',
      {},
      { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {}, dryRun: false },
    );

    expect(existsSync(path.join(workDir, '.git'))).toBe(true);
    const branch = spawnSync('git', ['symbolic-ref', '--short', 'HEAD'], {
      cwd: workDir,
      encoding: 'utf8',
    });
    expect(branch.stdout.trim()).toBe('main');
  });

  it('configures an origin remote when `remote` is provided', async () => {
    const engine = new HomegrownEngine();
    engine.register(gitInitSchematic);

    await engine.run(
      'git-init',
      { remote: 'git@github.com:example/demo.git' },
      { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {}, dryRun: false },
    );

    const remote = spawnSync('git', ['remote', 'get-url', 'origin'], {
      cwd: workDir,
      encoding: 'utf8',
    });
    expect(remote.status).toBe(0);
    expect(remote.stdout.trim()).toBe('git@github.com:example/demo.git');
  });

  it('leaves an existing repo alone when re-run at its root', async () => {
    spawnSync('git', ['init', '-b', 'main'], { cwd: workDir, stdio: 'ignore' });
    spawnSync('git', ['remote', 'add', 'origin', 'https://example.com/a.git'], {
      cwd: workDir,
      stdio: 'ignore',
    });

    const engine = new HomegrownEngine();
    engine.register(gitInitSchematic);

    await engine.run(
      'git-init',
      { remote: 'https://example.com/b.git' },
      { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {}, dryRun: false },
    );

    const remote = spawnSync('git', ['remote', 'get-url', 'origin'], {
      cwd: workDir,
      encoding: 'utf8',
    });
    expect(remote.stdout.trim()).toBe('https://example.com/a.git');
  });

  it('honours dry-run by leaving the working directory untouched', async () => {
    const engine = new HomegrownEngine();
    engine.register(gitInitSchematic);

    await engine.run(
      'git-init',
      { remote: 'https://example.com/dry.git' },
      { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {}, dryRun: false },
      { dryRun: true },
    );

    expect(existsSync(path.join(workDir, '.git'))).toBe(false);
  });

  it('refuses to nest inside an enclosing repo', async () => {
    spawnSync('git', ['init', '-b', 'main'], { cwd: workDir, stdio: 'ignore' });
    const nested = path.join(workDir, 'subdir');
    mkdirSync(nested, { recursive: true });

    const engine = new HomegrownEngine();
    engine.register(gitInitSchematic);

    await engine.run(
      'git-init',
      { remote: 'https://example.com/x.git' },
      { logger, cwd: nested, prompt: cliPrompt, invoke: async () => {}, dryRun: false },
    );

    expect(existsSync(path.join(nested, '.git'))).toBe(false);
    const remote = spawnSync('git', ['remote', 'get-url', 'origin'], {
      cwd: workDir,
      encoding: 'utf8',
    });
    expect(remote.status).not.toBe(0);
  });
});
