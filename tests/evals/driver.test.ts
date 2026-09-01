/**
 * The scripted spawn seam every real driver shares: a binary that
 * cannot start is a spawn error, not a completed run, and a timeout
 * kills the whole process group — agent CLIs fork subprocesses, and
 * killing only the direct child would leak them past the budget.
 */

import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { spawnScripted } from '../../evals/drivers/driver.mjs';

const hasBash = spawnSync('bash', ['--version'], { stdio: 'ignore' }).status === 0;

describe('spawnScripted', () => {
  it('marks a binary that cannot start as a spawn error, never a completion', async () => {
    const r = await spawnScripted({
      command: '/nonexistent/keel-eval-agent',
      args: [],
      cwd: process.cwd(),
      env: process.env,
      timeoutMs: 5_000,
    });
    expect(r.spawnError).toBe(true);
    expect(r.exitCode).toBeNull();
    expect(r.timedOut).toBe(false);
  });

  it.runIf(hasBash)(
    'kills the whole process group at the budget, grandchildren included',
    async () => {
      const r = await spawnScripted({
        command: 'bash',
        args: ['-c', 'sleep 30 & echo $!; wait'],
        cwd: process.cwd(),
        env: process.env,
        timeoutMs: 300,
      });
      expect(r.timedOut).toBe(true);
      expect(r.spawnError).toBe(false);
      const grandchild = Number.parseInt(r.stdout.trim(), 10);
      expect(Number.isInteger(grandchild)).toBe(true);
      await expect
        .poll(
          () => {
            try {
              process.kill(grandchild, 0);
              return false;
            } catch {
              return true;
            }
          },
          { timeout: 2_000 },
        )
        .toBe(true);
    },
  );
});
