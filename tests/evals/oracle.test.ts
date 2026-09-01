/**
 * The oracle judges workspace state only. These scenarios hold the
 * three mechanisms — answers matching, worktree cleanliness, script
 * exit — plus the failure listing a red run is diagnosed from.
 */

import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { judge, parseAnswers } from '../../evals/lib/oracle.mjs';

let workspace: string;
let caseDir: string;

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-eval-oracle-ws-'));
  caseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-eval-oracle-case-'));
});

afterEach(async () => {
  await fs.remove(workspace);
  await fs.remove(caseDir);
});

const probeCase = (oracle: Record<string, unknown>) => ({
  id: 'navigation/sample',
  dir: caseDir,
  oracle,
});

const writeAnswers = async (text: string): Promise<void> => {
  await fs.mkdirp(path.join(workspace, '.keel-eval'));
  await fs.writeFile(path.join(workspace, '.keel-eval', 'answers.txt'), text);
};

describe('parseAnswers', () => {
  it('reads key=value lines, ignoring blanks and comments', () => {
    expect(parseAnswers('# probe\nwiring=a/b.ts\n\ngateway = c/d.ts \n')).toEqual({
      wiring: 'a/b.ts',
      gateway: 'c/d.ts',
    });
  });
});

describe('answers grading', () => {
  const oracle = {
    answers_file: '.keel-eval/answers.txt',
    answers: { wiring: 'application/rest/src/shipping.ts' },
  };

  it('passes on an exact match', async () => {
    await writeAnswers('wiring=application/rest/src/shipping.ts\n');
    expect(judge(workspace, probeCase(oracle))).toEqual({ pass: true, failures: [] });
  });

  it('fails when the file was never written', () => {
    const verdict = judge(workspace, probeCase(oracle));
    expect(verdict.pass).toBe(false);
    expect(verdict.failures[0]).toMatch(/was not written/);
  });

  it('fails clearly when answers is set without answers_file, instead of throwing', () => {
    const verdict = judge(workspace, probeCase({ answers: oracle.answers }));
    expect(verdict.pass).toBe(false);
    expect(verdict.failures[0]).toMatch(/answers_file/);
  });

  it('names every wrong or missing answer, not just the first', async () => {
    await writeAnswers('wiring=wrong/path.ts\n');
    const verdict = judge(
      workspace,
      probeCase({
        answers_file: '.keel-eval/answers.txt',
        answers: { wiring: 'application/rest/src/shipping.ts', gateway: 'x/y.ts' },
      }),
    );
    expect(verdict.pass).toBe(false);
    expect(verdict.failures).toHaveLength(2);
    expect(verdict.failures[0]).toMatch(
      /expected 'application\/rest\/src\/shipping.ts', got 'wrong\/path.ts'/,
    );
    expect(verdict.failures[1]).toMatch(/'gateway' missing/);
  });
});

describe('clean worktree', () => {
  const git = (...args: string[]): void => {
    const r = spawnSync('git', args, {
      cwd: workspace,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 't',
        GIT_AUTHOR_EMAIL: 't@t.invalid',
        GIT_COMMITTER_NAME: 't',
        GIT_COMMITTER_EMAIL: 't@t.invalid',
      },
    });
    expect(r.status, r.stderr).toBe(0);
  };

  it('fails a probe that edited a tracked file, naming it', async () => {
    await fs.writeFile(path.join(workspace, 'README.md'), 'before');
    git('init');
    git('add', '-A');
    git('commit', '-m', 'baseline', '--no-verify');
    await fs.writeFile(path.join(workspace, 'README.md'), 'after');
    const verdict = judge(workspace, probeCase({ clean_worktree: true }));
    expect(verdict.pass).toBe(false);
    expect(verdict.failures[0]).toMatch(/worktree not clean: README.md/);
  });

  it('refuses to pass silently outside a git repository', () => {
    const verdict = judge(workspace, probeCase({ clean_worktree: true }));
    expect(verdict.pass).toBe(false);
    expect(verdict.failures[0]).toMatch(/needs a git repository/);
  });
});

describe('script oracle', () => {
  it('passes on exit 0, fails on non-zero with the script output', async () => {
    await fs.writeFile(path.join(caseDir, 'ok.sh'), 'test -f marker\n');
    await fs.writeFile(path.join(workspace, 'marker'), '');
    expect(judge(workspace, probeCase({ script: 'ok.sh' })).pass).toBe(true);

    await fs.writeFile(path.join(caseDir, 'no.sh'), 'echo missing thing >&2; exit 3\n');
    const verdict = judge(workspace, probeCase({ script: 'no.sh' }));
    expect(verdict.pass).toBe(false);
    expect(verdict.failures[0]).toMatch(/exited 3: missing thing/);
  });
});
