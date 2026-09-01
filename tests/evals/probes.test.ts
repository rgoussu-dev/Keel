/**
 * Every shipped probe, proven solvable against the tree its case
 * actually grows — no agent involved. Per case: build the grown
 * fixture in process (same commands, same engine as the live CLI
 * path), check every expected answer names a file that exists, run
 * the reference `solve.sh`, and let the real oracle judge it.
 *
 * This is the drift guard between cases and templates: an adapter
 * that moves a wiring file breaks this suite in `verify`, not the
 * owner's live campaign.
 */

import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { describe, expect, it } from 'vitest';
import { loadCampaign } from '../../evals/lib/case-schema.mjs';
import { auditContext } from '../../evals/lib/context-audit.mjs';
import { judge } from '../../evals/lib/oracle.mjs';
import { pinGitBaseline } from '../../evals/lib/workspace.mjs';
import { buildGrownFixture, scaffoldSpecOf } from '../support/evals-fixture.js';

const EVALS = path.join(import.meta.dirname, '..', '..', 'evals');
const campaign = loadCampaign(
  path.join(EVALS, 'campaigns', 'baseline.yaml'),
  path.join(EVALS, 'cases'),
);

const hasBash = spawnSync('bash', ['--version'], { stdio: 'ignore' }).status === 0;

describe('baseline navigation probes', () => {
  for (const caseSpec of campaign.resolved) {
    describe(caseSpec.id, () => {
      it(
        'grows the fixture, and the reference solve.sh satisfies the oracle',
        { timeout: 120_000 },
        async () => {
          const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-eval-probe-'));
          try {
            await buildGrownFixture(scaffoldSpecOf(caseSpec.scaffold), workspace);

            for (const answer of Object.values(caseSpec.oracle.answers ?? {})) {
              expect(
                await fs.pathExists(path.join(workspace, answer)),
                `expected answer '${answer}' must exist in the grown tree`,
              ).toBe(true);
            }

            const audit = auditContext(workspace);
            expect(audit.files.map((f: { path: string }) => f.path)).toContain('AGENTS.md');
            expect(audit.totalLines).toBeGreaterThan(0);

            if (!hasBash) return;
            pinGitBaseline(workspace);
            const unsolved = judge(workspace, caseSpec);
            expect(unsolved.pass).toBe(false);

            const solve = spawnSync('bash', [path.join(caseSpec.dir, 'solve.sh')], {
              cwd: workspace,
              encoding: 'utf8',
            });
            expect(solve.status, solve.stderr).toBe(0);
            const verdict = judge(workspace, caseSpec);
            expect(verdict.failures).toEqual([]);
            expect(verdict.pass).toBe(true);
          } finally {
            await fs.remove(workspace);
          }
        },
      );
    });
  }
});
