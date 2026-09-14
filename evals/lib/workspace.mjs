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
 * its path. An `overlay` directory, when given, is copied over the
 * finished tree before the baseline is pinned — the harness variant
 * of an A/B campaign. Deferred actions run for real — an agent-facing
 * workspace needs its installs and its git repo. A scaffold that
 * fails part-way takes its directory with it: the runner retries,
 * and a half-built tree with a `node_modules` in it, left behind
 * per failed attempt across a campaign, is how a runner's disk
 * fills.
 */
export function prepareWorkspace(caseSpec, keelRoot, overlay = null) {
  const keelBin = path.join(keelRoot, 'bin', 'keel.js');
  if (!fs.existsSync(path.join(keelRoot, 'dist', 'application', 'cli', 'executable', 'main.js'))) {
    throw new Error('dist/ missing — run `pnpm build` before a live campaign');
  }
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), `keel-eval-${caseSpec.id.replace(/[^a-z0-9]/g, '-')}-`),
  );
  try {
    run(process.execPath, [keelBin, ...newArgs(caseSpec.scaffold)], workspace);
    for (const step of caseSpec.scaffold.grow ?? []) {
      run(process.execPath, [keelBin, ...addArgs(step)], workspace);
    }
    if (caseSpec.setup_script !== undefined) {
      run('bash', [path.join(caseSpec.dir, caseSpec.setup_script)], workspace);
    }
    if (overlay !== null) applyOverlay(workspace, overlay);
    pinGitBaseline(workspace);
  } catch (err) {
    fs.rmSync(workspace, { recursive: true, force: true });
    throw err;
  }
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

/** The overlay's removal list: exact paths, or `**` name patterns, to delete. */
export const OVERLAY_REMOVE = '.keel-remove';

/**
 * Copies a harness overlay over a prepared workspace: every file
 * under `overlay`, at the same relative path, replacing what is
 * there — and, where the overlay carries a `.keel-remove` list,
 * deleting what it names first.
 *
 * This is the cheap half of the A/B protocol's variant axis — a
 * different `AGENTS.md`, an extra skill, a whole layer of the harness
 * taken away to measure what it was worth — applied **after** the
 * scaffold and **before** the git baseline, so the agent meets the
 * variant and the diff floor still starts at zero. The expensive half
 * is the other kind of variant: a different keel ref, built and run
 * as its own campaign, which the benchmark already records as
 * `keel.commit`.
 *
 * A file the overlay does not name is left exactly as keel emitted
 * it, which is what makes an overlay a diff of the harness rather
 * than a second copy of it.
 */
export function applyOverlay(workspace, overlay) {
  if (!fs.existsSync(overlay)) throw new Error(`overlay '${overlay}' does not exist`);
  const removals = path.join(overlay, OVERLAY_REMOVE);
  if (fs.existsSync(removals)) {
    for (const pattern of readRemovals(removals)) {
      for (const target of resolveRemoval(workspace, pattern)) {
        fs.rmSync(target, { recursive: true, force: true });
      }
    }
  }
  for (const from of filesUnder(overlay)) {
    if (path.relative(overlay, from) === OVERLAY_REMOVE) continue;
    const to = path.join(workspace, path.relative(overlay, from));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
}

/** Non-empty, non-comment lines of a removal list. */
function readRemovals(file) {
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}

/**
 * What one removal pattern names in a workspace: an exact
 * project-relative path, or — for a pattern of the form
 * `**` slash name — every entry with that name at depth one or
 * deeper. The depth floor is the point: the pattern for `AGENTS.md`
 * takes the per-directory documents and leaves the root one, which
 * is the ablation an author of that pattern means.
 */
function resolveRemoval(workspace, pattern) {
  const nested = /^\*\*\/(.+)$/.exec(pattern);
  if (nested === null) {
    const exact = path.join(workspace, pattern);
    return fs.existsSync(exact) ? [exact] : [];
  }
  const name = nested[1];
  const found = [];
  const walk = (dir, depth) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (depth > 0 && entry.name === name) found.push(full);
      else if (entry.isDirectory()) walk(full, depth + 1);
    }
  };
  walk(workspace, 0);
  return found;
}

/** Every file under a directory, recursively. */
function filesUnder(root) {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(full);
    }
  };
  walk(root);
  return files;
}
