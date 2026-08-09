/**
 * Spawning adapter for the ProcessRunner port — runs external
 * commands synchronously via `child_process.spawnSync`.
 */

import { spawnSync } from 'node:child_process';
import type { ProcessResult, ProcessRunner } from '../../domain/contract/ports/process-runner.js';

/** Runs commands on the real system. */
export const spawnProcessRunner: ProcessRunner = {
  run(command, args, options): ProcessResult {
    const r = spawnSync(command, [...args], { cwd: options.cwd, encoding: 'utf8' });
    const base = {
      status: r.status,
      stdout: r.stdout ?? '',
      stderr: r.stderr ?? '',
    };
    if (r.error) {
      const code = (r.error as NodeJS.ErrnoException).code;
      return {
        ...base,
        startFailure: { message: r.error.message, ...(code !== undefined ? { code } : {}) },
      };
    }
    return base;
  },
};
