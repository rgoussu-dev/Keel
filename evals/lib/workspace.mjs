/**
 * Live workspace preparation: replays a case's `scaffold` block
 * through the packaged CLI (`bin/keel.js`) — the same commands the
 * verify suites dispatch in process, so the two trees cannot drift —
 * then pins a git baseline for the diff floor.
 *
 * Everything here is live-path only (spawns keel, git, installs); the
 * verify suites never import it. Its unit-testable pieces are the
 * pure arg builders, exported separately.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Where the probe contract lives inside a workspace. */
export const EVAL_DIR = '.keel-eval';

/** `keel new` argv for a scaffold block (without the binary). */
export function newArgs(scaffold) {
  return [
    'new',
    '--stack',
    scaffold.stack,
    '--yes',
    ...(scaffold.build_system !== undefined ? ['--build-system', scaffold.build_system] : []),
    ...(scaffold.module_layout !== undefined ? ['--module-layout', scaffold.module_layout] : []),
    ...setFlags(scaffold.answers),
  ];
}

/** `keel add` argv for one growth step (without the binary). */
export function addArgs(step) {
  return 'module' in step
    ? [
        'add',
        'module',
        step.module,
        ...(step.consumes !== undefined ? ['--consumes', step.consumes] : []),
        '--yes',
      ]
    : ['add', step.vertical, '--yes'];
}

function setFlags(answers) {
  const flags = [];
  for (const [adapterId, questions] of Object.entries(answers ?? {})) {
    for (const [questionId, value] of Object.entries(questions)) {
      flags.push('--set', `${adapterId}:${questionId}=${value}`);
    }
  }
  return flags;
}

function run(command, args, cwd, env = process.env) {
  const r = spawnSync(command, args, { cwd, encoding: 'utf8', env });
  if (r.status !== 0) {
    throw new Error(
      `\`${command} ${args.join(' ')}\` in ${cwd} exited ${r.status}:\n${r.stderr || r.stdout}`,
    );
  }
  return r.stdout;
}

/**
 * Builds the case's workspace in a fresh temp directory and returns
 * its path. Deferred actions run for real — an agent-facing
 * workspace needs its installs and its git repo.
 */
export function prepareWorkspace(caseSpec, keelRoot) {
  const keelBin = path.join(keelRoot, 'bin', 'keel.js');
  if (!fs.existsSync(path.join(keelRoot, 'dist', 'application', 'cli', 'executable', 'main.js'))) {
    throw new Error('dist/ missing — run `pnpm build` before a live campaign');
  }
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), `keel-eval-${caseSpec.id.replace(/[^a-z0-9]/g, '-')}-`),
  );
  run(process.execPath, [keelBin, ...newArgs(caseSpec.scaffold)], workspace);
  for (const step of caseSpec.scaffold.grow ?? []) {
    run(process.execPath, [keelBin, ...addArgs(step)], workspace);
  }
  if (caseSpec.setup_script !== undefined) {
    run('bash', [path.join(caseSpec.dir, caseSpec.setup_script)], workspace);
  }
  pinGitBaseline(workspace);
  return workspace;
}

/**
 * Pins the diff floor: ensures a repo, keeps the probe contract dir
 * out of every diff, commits everything as the "before" state.
 */
export function pinGitBaseline(workspace) {
  if (!fs.existsSync(path.join(workspace, '.git'))) run('git', ['init'], workspace);
  fs.mkdirSync(path.join(workspace, '.git', 'info'), { recursive: true });
  fs.appendFileSync(path.join(workspace, '.git', 'info', 'exclude'), `${EVAL_DIR}/\n`);
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'keel-evals',
    GIT_AUTHOR_EMAIL: 'evals@keel.invalid',
    GIT_COMMITTER_NAME: 'keel-evals',
    GIT_COMMITTER_EMAIL: 'evals@keel.invalid',
  };
  run('git', ['add', '-A'], workspace, env);
  const r = spawnSync('git', ['commit', '-m', 'eval baseline', '--allow-empty', '--no-verify'], {
    cwd: workspace,
    encoding: 'utf8',
    env,
  });
  if (r.status !== 0) throw new Error(`git baseline commit failed:\n${r.stderr || r.stdout}`);
}

/**
 * The universal diff floor: files changed / insertions / deletions
 * against the pinned baseline, untracked files included, the probe
 * contract dir excluded (via `.git/info/exclude`).
 */
export function diffStats(workspace) {
  run('git', ['add', '-A'], workspace);
  const numstat = spawnSync('git', ['diff', '--cached', '--numstat', 'HEAD'], {
    cwd: workspace,
    encoding: 'utf8',
  });
  let filesChanged = 0;
  let insertions = 0;
  let deletions = 0;
  for (const line of numstat.stdout.split('\n')) {
    if (line.trim() === '') continue;
    filesChanged += 1;
    const [ins, del] = line.split('\t');
    if (ins !== '-') insertions += Number(ins);
    if (del !== '-') deletions += Number(del);
  }
  return { filesChanged, insertions, deletions };
}
