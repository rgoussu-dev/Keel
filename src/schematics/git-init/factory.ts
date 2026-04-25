import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { Context, Options, Schematic, Tree } from '../../engine/types.js';

const DEFAULT_INITIAL_BRANCH = 'main';

/**
 * Ensures the target directory is a git repository and, optionally, has a
 * named remote. Does not touch the filesystem tree — this schematic shells
 * out to `git`, so `git` must be installed.
 *
 * Behaviour:
 *   - If the cwd is not inside any git repo, runs `git init -b <branch>`.
 *   - If the cwd is the root of an existing repo, skips `git init` but may
 *     still add an `origin` remote when one was supplied.
 *   - If the cwd is inside an *enclosing* repo (git root above cwd), this
 *     schematic warns and does nothing: initialising a nested repo or
 *     mutating the enclosing repo's remotes would both be surprises.
 *
 * Parameters:
 *   - `remote` — URL to register as `origin`. Empty means "skip".
 *   - `defaultBranch` — initial branch name when creating a new repo.
 *     Defaults to `main`.
 *
 * Composition: invoked first by the walking-skeleton schematic so later
 * steps can assume a git repo exists; also runs standalone.
 */
export const gitInitSchematic: Schematic = {
  name: 'git-init',
  description: 'Ensure the project directory is a git repo; optionally set an origin remote.',
  parameters: [
    {
      name: 'remote',
      description: 'Origin remote URL (leave empty to skip).',
      required: false,
      prompt: {
        kind: 'input',
        name: 'remote',
        message: 'origin remote URL (leave empty to skip)',
        default: '',
      },
    },
    {
      name: 'defaultBranch',
      description: 'Initial branch name when creating a new repo.',
      required: false,
    },
  ],

  async run(_tree: Tree, options: Options, ctx: Context): Promise<void> {
    const cwd = path.resolve(ctx.cwd);
    const defaultBranch =
      String(options['defaultBranch'] ?? DEFAULT_INITIAL_BRANCH).trim() || DEFAULT_INITIAL_BRANCH;
    const remote = String(options['remote'] ?? '').trim();

    const detection = detectGit(cwd);

    if (detection.inRepo && detection.toplevel !== cwd) {
      ctx.logger.warn(
        `git: cwd is inside an enclosing repo at ${detection.toplevel}; not initialising a nested repo or adding a remote`,
      );
      return;
    }

    if (!detection.inRepo) {
      ctx.logger.info(`git: initialising repo on branch "${defaultBranch}"`);
      runGit(cwd, ['init', '-b', defaultBranch]);
    } else {
      ctx.logger.info('git: repo already initialised at project root');
    }

    if (!remote) {
      ctx.logger.warn(
        'git: no remote configured. Add one later with `git remote add origin <url>`.',
      );
      return;
    }

    if (hasRemote(cwd, 'origin')) {
      ctx.logger.info('git: origin remote already exists — not overwriting');
      return;
    }

    runGit(cwd, ['remote', 'add', 'origin', remote]);
    ctx.logger.success(`git: origin set to ${remote}`);
  },
};

interface GitDetection {
  inRepo: boolean;
  toplevel: string | null;
}

function detectGit(cwd: string): GitDetection {
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' });
  if (r.status !== 0) return { inRepo: false, toplevel: null };
  return { inRepo: true, toplevel: path.resolve(r.stdout.trim()) };
}

function hasRemote(cwd: string, name: string): boolean {
  const r = spawnSync('git', ['remote', 'get-url', name], { cwd, stdio: 'ignore' });
  return r.status === 0;
}

function runGit(cwd: string, args: string[]): void {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status === 0) return;
  throw new Error(`git ${args.join(' ')} failed: ${describeFailure(r)}`);
}

function describeFailure(r: ReturnType<typeof spawnSync>): string {
  if (r.error) return r.error.message;
  const stderr = (r.stderr ?? '').toString().trim();
  if (stderr) return stderr;
  if (r.status === null) return 'git did not run (is it installed and on PATH?)';
  return `exit ${r.status}`;
}
