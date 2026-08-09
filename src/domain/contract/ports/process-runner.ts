/**
 * The ProcessRunner port — how deferred actions (and the adapters
 * that describe them) reach external tools like `git` and `gradle`.
 * The spawning adapter lives in `infrastructure/process`; the shipped
 * fake scripts results and records invocations.
 */

/** Why a process failed to start at all (e.g. binary not on PATH). */
export interface ProcessStartFailure {
  /** OS-level error code when known, e.g. `ENOENT`. */
  readonly code?: string;
  readonly message: string;
}

/** Outcome of a finished (or failed-to-start) process. */
export interface ProcessResult {
  /** Exit status; `null` when the process did not run. */
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  /** Present when the process could not be started. */
  readonly startFailure?: ProcessStartFailure;
}

/** Runs an external command to completion. */
export interface ProcessRunner {
  run(command: string, args: readonly string[], options: { cwd: string }): ProcessResult;
}
