/**
 * The drift guard between the task cases and the templates they are
 * written against — the `verify`-time half of the terminal-bench
 * rule.
 *
 * The full proof (setup → the oracle is red → `solve.sh` → the oracle
 * is green) needs each family's real build and runs as
 * `node evals/run.mjs --solvable --campaign tasks`, in the
 * `harness-evals` workflow and on a workstation. What runs here is
 * everything that does not need a toolchain, and it is what actually
 * rots: a case whose injected specification names a directory the
 * scaffold no longer has, or whose reference solution patches a file
 * that moved. Both break here, in `verify`, rather than in the
 * owner's live campaign.
 */

import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { describe, expect, it } from 'vitest';
import { DRIVERS } from '../../evals/drivers/index.mjs';
import { scriptedArgs as claudeArgs } from '../../evals/drivers/claude-code.mjs';
import { scriptedArgs as codexArgs } from '../../evals/drivers/codex.mjs';
import { loadCampaign } from '../../evals/lib/case-schema.mjs';
import { judge } from '../../evals/lib/oracle.mjs';
import { applyOverlay, OVERLAY_REMOVE } from '../../evals/lib/workspace.mjs';
import { buildGrownFixture, scaffoldSpecOf } from '../support/evals-fixture.js';

const EVALS = path.join(import.meta.dirname, '..', '..', 'evals');
const campaign = loadCampaign(
  path.join(EVALS, 'campaigns', 'tasks.yaml'),
  path.join(EVALS, 'cases'),
);

const hasBash = spawnSync('bash', ['--version'], { stdio: 'ignore' }).status === 0;

describe('the tasks campaign', () => {
  it('covers every stack family exactly once', () => {
    expect(campaign.resolved.map((c) => c.id).sort()).toEqual([
      'task/go-http',
      'task/quarkus-rest',
      'task/rust-http',
      'task/ts-http',
      'task/web-components',
    ]);
  });

  it('judges every case by a script — a task is graded by the project’s own build', () => {
    for (const caseSpec of campaign.resolved) {
      expect(caseSpec.oracle.script, caseSpec.id).toBe('check.sh');
      // A task changes files by definition, so the read-only probe
      // rule of lane A must not be on: it would fail every run.
      expect(caseSpec.oracle.clean_worktree, caseSpec.id).toBeUndefined();
      expect(caseSpec.setup_script, caseSpec.id).toBe('setup.sh');
    }
  });

  it('carries nothing agent-specific — every driver maps every case', () => {
    // The claim behind "agent-neutral by construction": a case is
    // prompt + oracle + budgets, and each driver turns that into its
    // own CLI. Both shipped drivers are exercised over every case, so
    // a case that grew an agent-shaped field fails here rather than
    // on the second driver's first campaign.
    const builders: Record<string, (spec: unknown) => readonly string[]> = {
      'claude-code': claudeArgs as (spec: unknown) => readonly string[],
      codex: codexArgs as (spec: unknown) => readonly string[],
    };
    expect(Object.keys(builders).sort()).toEqual(Object.keys(DRIVERS).sort());
    for (const caseSpec of campaign.resolved) {
      for (const [id, build] of Object.entries(builders)) {
        const args = build(caseSpec);
        expect(args.join(' '), `${id} / ${caseSpec.id}`).toContain(caseSpec.prompt.trim());
      }
    }
  });

  it('ships a reference solution and an executable script set for every case', async () => {
    for (const caseSpec of campaign.resolved) {
      for (const script of ['setup.sh', 'check.sh', 'solve.sh']) {
        const file = path.join(caseSpec.dir, script);
        expect(await fs.pathExists(file), `${caseSpec.id}/${script}`).toBe(true);
        if (!hasBash) continue;
        expect(
          spawnSync('bash', ['-n', file], { encoding: 'utf8' }).status,
          `${caseSpec.id}/${script} is not valid bash`,
        ).toBe(0);
      }
    }
  });

  for (const caseSpec of campaign.resolved) {
    describe(caseSpec.id, () => {
      it(
        'sets up against the tree the case actually grows, and starts red',
        { timeout: 120_000 },
        async () => {
          const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-eval-task-'));
          try {
            await buildGrownFixture(scaffoldSpecOf(caseSpec.scaffold), workspace);
            if (!hasBash) return;

            // The setup lands where the scaffold really is: a case
            // naming a directory the templates moved fails here.
            const setup = spawnSync('bash', [path.join(caseSpec.dir, 'setup.sh')], {
              cwd: workspace,
              encoding: 'utf8',
            });
            expect(setup.status, setup.stderr).toBe(0);

            // And the oracle is red before anything solves it. No
            // toolchain here, so the build inside `check.sh` fails
            // for want of one — which is still red, and the claim
            // this suite can make. `--solvable` makes the other.
            expect(judge(workspace, caseSpec).pass).toBe(false);
          } finally {
            await fs.remove(workspace);
          }
        },
      );
    });
  }
});

describe('a harness overlay', () => {
  it('replaces what it names, removes what its list names, and leaves the rest', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-eval-overlay-'));
    const overlay = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-eval-overlay-src-'));
    try {
      await fs.outputFile(path.join(workspace, 'AGENTS.md'), 'the emitted root\n');
      await fs.outputFile(path.join(workspace, 'domain/AGENTS.md'), 'the emitted layer doc\n');
      await fs.outputFile(path.join(workspace, 'domain/CLAUDE.md'), '@AGENTS.md\n');
      await fs.outputFile(path.join(workspace, 'domain/keep.txt'), 'untouched\n');

      await fs.outputFile(path.join(overlay, OVERLAY_REMOVE), '# a comment\n**/AGENTS.md\n');
      await fs.outputFile(path.join(overlay, 'AGENTS.md'), 'the variant root\n');
      applyOverlay(workspace, overlay);

      // The `**` pattern matches at depth one and deeper, so the
      // nested doc goes and the root stays — replaced, not removed.
      expect(await fs.readFile(path.join(workspace, 'AGENTS.md'), 'utf8')).toBe(
        'the variant root\n',
      );
      expect(await fs.pathExists(path.join(workspace, 'domain/AGENTS.md'))).toBe(false);
      expect(await fs.pathExists(path.join(workspace, 'domain/CLAUDE.md'))).toBe(true);
      expect(await fs.readFile(path.join(workspace, 'domain/keep.txt'), 'utf8')).toBe(
        'untouched\n',
      );
      // The removal list is instructions to the rig, never a file to
      // land in the workspace it describes.
      expect(await fs.pathExists(path.join(workspace, OVERLAY_REMOVE))).toBe(false);
    } finally {
      await Promise.all([fs.remove(workspace), fs.remove(overlay)]);
    }
  });

  it('refuses an overlay directory that is not there', () => {
    expect(() => applyOverlay(os.tmpdir(), path.join(os.tmpdir(), 'no-such-overlay'))).toThrow(
      /does not exist/,
    );
  });

  it('ships a documented example whose removal list keeps the root document', async () => {
    const list = await fs.readFile(
      path.join(EVALS, 'overlays', 'no-nested-docs', OVERLAY_REMOVE),
      'utf8',
    );
    const patterns = list
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '' && !l.startsWith('#'));
    expect(patterns).toEqual(['**/AGENTS.md', '**/CLAUDE.md']);
    expect(list, 'the confound it introduces is written down').toContain('root map');
  });
});
