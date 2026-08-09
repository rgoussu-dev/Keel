/**
 * `git-init` adapter — ensures the project is a git repository and
 * optionally registers an `origin` remote. Ports the legacy
 * `gitInitSchematic` (src/schematics/git-init/factory.ts) onto the
 * composition contract.
 *
 * Differences from the legacy schematic:
 *   - The dryRun flag is no longer this adapter's concern; the
 *     applier emits an DeferredAction and `runActions` honours the flag.
 *   - `remote` and `defaultBranch` become sticky-memory questions:
 *     answered once, recalled on subsequent runs.
 *   - The behaviour matrix is identical — fresh dir → init; root of
 *     existing repo → skip init, optionally add remote; nested under
 *     an enclosing repo → warn and do nothing.
 */

import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type {
  DeferredAction,
  Adapter,
  DeferredActionEnv,
} from '../../domain/contract/composition.js';

const DEFAULT_INITIAL_BRANCH = 'main';

/** The vertical id this adapter belongs to. */
export const GIT_INIT_VERTICAL = 'vcs';

export const gitInitAdapter: Adapter = {
  id: 'vcs/git-init',
  vertical: GIT_INIT_VERTICAL,
  covers: ['vcs'],
  predicate: {},
  questions: [
    {
      id: 'remote',
      prompt: 'origin remote URL (leave empty to skip)',
      doc: 'Sets `origin` to this URL once the repo exists. Leave blank to skip — you can add it later with `git remote add origin <url>`.',
      default: '',
      memory: 'sticky',
    },
    {
      id: 'defaultBranch',
      prompt: 'initial branch name',
      doc: 'Branch name passed to `git init -b`. Has no effect when the repo already exists.',
      default: DEFAULT_INITIAL_BRANCH,
      memory: 'sticky',
    },
  ],
  contribute(ctx) {
    const remote = ctx.answer('remote').trim();
    const defaultBranch = ctx.answer('defaultBranch').trim() || DEFAULT_INITIAL_BRANCH;

    const action: DeferredAction = {
      id: 'vcs/git-init',
      description: gitInitDescription(remote, defaultBranch, ctx.cwd),
      run: ({ cwd, logger }: DeferredActionEnv) => {
        runGitInit(path.resolve(cwd), defaultBranch, remote, logger);
        return Promise.resolve();
      },
    };
    return { actions: [action] };
  },
};

function gitInitDescription(remote: string, defaultBranch: string, cwd: string): string {
  const detection = detectGit(cwd);
  if (detection.inRepo && detection.toplevel === path.resolve(cwd)) {
    return remote
      ? `set origin to ${remote} (repo already initialised)`
      : 'verify git repo at project root';
  }
  if (detection.inRepo) {
    return `skip git init (cwd is inside enclosing repo at ${detection.toplevel})`;
  }
  return remote
    ? `git init -b ${defaultBranch} and set origin to ${remote}`
    : `git init -b ${defaultBranch}`;
}

function runGitInit(
  cwd: string,
  defaultBranch: string,
  remote: string,
  logger: DeferredActionEnv['logger'],
): void {
  const detection = detectGit(cwd);
  if (detection.inRepo && detection.toplevel !== cwd) {
    logger.warn(
      `git: cwd is inside an enclosing repo at ${detection.toplevel}; not initialising a nested repo or adding a remote`,
    );
    return;
  }

  if (!detection.inRepo) {
    logger.info(`git: initialising repo on branch "${defaultBranch}"`);
    runGit(cwd, ['init', '-b', defaultBranch]);
  } else {
    logger.info('git: repo already initialised at project root');
  }

  if (!remote) {
    logger.info('git: no remote configured. Add one later with `git remote add origin <url>`.');
    return;
  }

  if (hasRemote(cwd, 'origin')) {
    logger.info('git: origin remote already exists — not overwriting');
    return;
  }

  runGit(cwd, ['remote', 'add', 'origin', remote]);
  logger.success(`git: origin set to ${remote}`);
}

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
