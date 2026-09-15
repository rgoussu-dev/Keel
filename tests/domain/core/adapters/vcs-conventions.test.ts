/**
 * The two `vcs` convention adapters (#143), exercised the only way
 * that proves anything about them: by **running what they emit**.
 *
 * Both ship POSIX shell, deliberately — a scaffolded Go, Rust or JVM
 * project cannot assume Node, so commitlint and a Node cut script are
 * both out. A test that asserted the script's *text* would pass over
 * a script with a syntax error in it, so these spawn `sh` against the
 * staged files and check exit codes and results, the way git and a
 * release manager will.
 *
 * `sh` is assumed the way `tests/evals/probes.test.ts` assumes `bash`:
 * present wherever this suite meaningfully runs, and skipped rather
 * than failed where it is not.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, beforeAll } from 'vitest';
import { emptyManifestV2 } from '../../../../src/domain/contract/manifest.js';
import { runActions } from '../../../../src/domain/core/actions.js';
import { installVertical } from '../../../../src/domain/core/install.js';
import { vcsVertical } from '../../../../src/domain/core/verticals/vcs.js';
import {
  COMMIT_MSG_TARGET,
  HOOKS_DIR,
} from '../../../../src/domain/core/adapters/commit-conventions.js';
import {
  CHANGELOG_TARGET,
  CUT_SCRIPT_TARGET,
} from '../../../../src/domain/core/adapters/changelog.js';
import { FakeLogger } from '../../../../src/infrastructure/commons/fake-logger.js';
import { spawnProcessRunner } from '../../../../src/infrastructure/process/spawn-process-runner.js';
import { rejectingPrompt } from '../../../../src/infrastructure/prompt/fake.js';
import { ejsTemplateSource } from '../../../../src/infrastructure/template/ejs-template-source.js';
import { FsTree } from '../../../../src/infrastructure/tree/fs-tree.js';
import { changelogShapeViolations } from '../../../support/changelog-shape.js';

const hasSh = spawnSync('sh', ['-c', 'exit 0'], { stdio: 'ignore' }).status === 0;

/**
 * Stages the `vcs` vertical into a fresh directory and commits the
 * tree. `run` additionally runs the deferred actions against the real
 * `git` binary, which is the only way to see `core.hooksPath` land.
 */
async function stage(
  answers: Record<string, string>,
  run = false,
  prepare: (cwd: string) => void = () => {},
): Promise<string> {
  const cwd = mkdtempSync(path.join(tmpdir(), 'keel-vcs-'));
  prepare(cwd);
  const tree = new FsTree(cwd);
  const manifest = {
    ...emptyManifestV2('2026-09-15T00:00:00Z', '0.0.0-test'),
    answers: {
      'vcs/git-init': { remote: '', defaultBranch: 'main' },
      'vcs/commit-conventions': { commitHook: answers['commitHook'] ?? 'yes' },
      'vcs/changelog': { changelog: answers['changelog'] ?? 'yes' },
    },
  };
  const result = await installVertical({
    vertical: vcsVertical,
    manifest,
    tree,
    cwd,
    logger: new FakeLogger(),
    prompt: rejectingPrompt,
    templates: ejsTemplateSource,
    processes: spawnProcessRunner,
    mode: 'non-interactive',
    now: () => '2026-09-15T00:00:00Z',
  });
  await tree.commit();
  if (run) {
    await runActions({
      actions: result.applyResult.actions,
      cwd,
      logger: new FakeLogger(),
      processes: spawnProcessRunner,
      dryRun: false,
    });
  }
  return cwd;
}

/** The repository's local `core.hooksPath`, or `''` when it has none. */
function hooksPath(cwd: string): string {
  const read = spawnSync('git', ['config', '--local', 'core.hooksPath'], { cwd, encoding: 'utf8' });
  return read.status === 0 ? read.stdout.trim() : '';
}

/** Runs the staged commit-msg hook over a subject line. */
function commitMsg(cwd: string, subject: string): { status: number | null; stderr: string } {
  const file = path.join(cwd, 'msg.txt');
  writeFileSync(file, `${subject}\n`);
  const run = spawnSync('sh', [path.join(cwd, COMMIT_MSG_TARGET), file], { encoding: 'utf8' });
  return { status: run.status, stderr: run.stderr };
}

describe.skipIf(!hasSh)('vcs/commit-conventions', () => {
  let cwd: string;
  beforeAll(async () => {
    cwd = await stage({});
  });

  it('stages an executable hook in the tracked hooks directory', () => {
    expect((statSync(path.join(cwd, COMMIT_MSG_TARGET)).mode & 0o111) !== 0).toBe(true);
    expect(readFileSync(path.join(cwd, `${HOOKS_DIR}/README.md`), 'utf8')).toContain(
      `git config core.hooksPath ${HOOKS_DIR}`,
    );
  });

  it.each([
    'feat: add a thing',
    'fix(orders): reject an empty basket',
    'feat!: drop the v1 endpoint',
    'refactor(orders/pricing)!: split the calculator',
    'chore: bump a dependency',
  ])('accepts %s', (subject) => {
    expect(commitMsg(cwd, subject).status).toBe(0);
  });

  it.each([
    'add a thing',
    'Feat: add a thing',
    'feat add a thing',
    'feat:add a thing',
    'feat: ',
    'nope(orders): add a thing',
    'feat(Orders): add a thing',
  ])('refuses %s', (subject) => {
    expect(commitMsg(cwd, subject).status).toBe(1);
  });

  it('never lets an author-controlled subject reach the shell', () => {
    const { status, stderr } = commitMsg(cwd, 'oops $(echo pwned) `echo pwned` ${HOME}');
    expect(status).toBe(1);
    expect(stderr).toContain('oops $(echo pwned) `echo pwned` ${HOME}');
    expect(stderr).not.toContain('pwned\n');
  });

  it('tells the author the grammar, the types and two examples', () => {
    const { stderr } = commitMsg(cwd, 'add a thing');
    expect(stderr).toContain('<type>[(<scope>)][!]: <description>');
    expect(stderr).toContain('build chore ci docs feat fix perf refactor revert style test');
    expect(stderr).toContain('feat(orders): accept a partial shipment');
    expect(stderr).toContain('add a thing');
  });

  it.each(['Merge branch main into topic', 'Revert "feat: a thing"', 'fixup! feat: a thing'])(
    'never refuses git’s own wording: %s',
    (subject) => {
      expect(commitMsg(cwd, subject).status).toBe(0);
    },
  );

  it('points a fresh repository at the tracked hooks directory', async () => {
    const fresh = await stage({}, true);
    expect(hooksPath(fresh)).toBe(HOOKS_DIR);
    rmSync(fresh, { recursive: true, force: true });
  });

  it('leaves a repository that already points core.hooksPath elsewhere', async () => {
    const brownfield = await stage({}, true, (cwd) => {
      spawnSync('git', ['init', '-q', '-b', 'main', '.'], { cwd });
      spawnSync('git', ['config', 'core.hooksPath', '.my-hooks'], { cwd });
    });
    // The project's own arrangement stands; the script is staged either
    // way, so enabling it is one documented command away.
    expect(hooksPath(brownfield)).toBe('.my-hooks');
    expect(() => statSync(path.join(brownfield, COMMIT_MSG_TARGET))).not.toThrow();
    rmSync(brownfield, { recursive: true, force: true });
  });

  it('stages nothing when declined', async () => {
    const declined = await stage({ commitHook: 'no' });
    expect(() => statSync(path.join(declined, COMMIT_MSG_TARGET))).toThrow();
    // …and the other convention is unaffected.
    expect(() => statSync(path.join(declined, CHANGELOG_TARGET))).not.toThrow();
    rmSync(declined, { recursive: true, force: true });
  });
});

describe.skipIf(!hasSh)('vcs/changelog', () => {
  let cwd: string;
  beforeAll(async () => {
    cwd = await stage({});
  });

  it('emits keel’s own split-changelog shape, before any release', () => {
    expect(
      changelogShapeViolations({
        root: readFileSync(path.join(cwd, CHANGELOG_TARGET), 'utf8'),
        releases: [],
      }),
    ).toEqual([]);
  });

  it('cuts a release into a tree that still conforms', () => {
    const work = mkdtempSync(path.join(tmpdir(), 'keel-cut-'));
    mkdirSync(path.join(work, 'scripts'), { recursive: true });
    writeFileSync(
      path.join(work, CHANGELOG_TARGET),
      readFileSync(path.join(cwd, CHANGELOG_TARGET), 'utf8'),
    );
    writeFileSync(
      path.join(work, CUT_SCRIPT_TARGET),
      readFileSync(path.join(cwd, CUT_SCRIPT_TARGET), 'utf8'),
    );

    const cut = spawnSync('sh', [CUT_SCRIPT_TARGET, '1.0.0', '2026-09-15'], {
      cwd: work,
      encoding: 'utf8',
    });
    expect(cut.stderr + cut.stdout).toContain('cut docs/releases/CHANGELOG.1.0.0.md');
    expect(cut.status).toBe(0);

    const release = readFileSync(path.join(work, 'docs/releases/CHANGELOG.1.0.0.md'), 'utf8');
    expect(release).toContain('The walking skeleton.');
    expect(
      changelogShapeViolations(
        {
          root: readFileSync(path.join(work, CHANGELOG_TARGET), 'utf8'),
          releases: [{ name: 'CHANGELOG.1.0.0.md', text: release }],
        },
        { minimumReleases: 1 },
      ),
    ).toEqual([]);

    // A second cut of the same version is refused, and an empty
    // [Unreleased] has nothing to cut.
    const again = spawnSync('sh', [CUT_SCRIPT_TARGET, '1.0.0'], { cwd: work, encoding: 'utf8' });
    expect(again.status).toBe(1);
    expect(again.stderr).toContain('already exists');
    const empty = spawnSync('sh', [CUT_SCRIPT_TARGET, '1.1.0'], { cwd: work, encoding: 'utf8' });
    expect(empty.status).toBe(1);
    expect(empty.stderr).toContain('nothing to cut');

    rmSync(work, { recursive: true, force: true });
  });

  it('stages nothing when declined', async () => {
    const declined = await stage({ changelog: 'no' });
    expect(() => statSync(path.join(declined, CHANGELOG_TARGET))).toThrow();
    expect(() => statSync(path.join(declined, CUT_SCRIPT_TARGET))).toThrow();
    // …and the other convention is unaffected.
    expect(() => statSync(path.join(declined, COMMIT_MSG_TARGET))).not.toThrow();
    rmSync(declined, { recursive: true, force: true });
  });
});
