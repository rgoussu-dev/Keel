/**
 * Canonical fake for the ProcessRunner port: scripts results by
 * command prefix and records every invocation. Unscripted commands
 * succeed silently by default so tests only script what they assert.
 */

import type { ProcessResult, ProcessRunner } from '../../domain/contract/ports/process-runner.js';

/** One recorded `run` invocation. */
export interface RecordedProcess {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
}

/** A scripted response, matched on command and leading args. */
export interface ScriptedProcess {
  readonly command: string;
  /** Leading args to match; `['init']` matches `git init -b main`. */
  readonly argsPrefix?: readonly string[];
  readonly result: Partial<ProcessResult>;
}

const OK: ProcessResult = { status: 0, stdout: '', stderr: '' };

/** ProcessRunner fake with scripted results and an invocation log. */
export class FakeProcessRunner implements ProcessRunner {
  readonly invocations: RecordedProcess[] = [];

  constructor(private readonly scripts: readonly ScriptedProcess[] = []) {}

  run(command: string, args: readonly string[], options: { cwd: string }): ProcessResult {
    this.invocations.push({ command, args, cwd: options.cwd });
    const script = this.scripts.find(
      (s) => s.command === command && (s.argsPrefix ?? []).every((a, i) => args[i] === a),
    );
    return { ...OK, ...(script?.result ?? {}) };
  }

  /** Invocations of the given command, in order. */
  ran(command: string): readonly RecordedProcess[] {
    return this.invocations.filter((i) => i.command === command);
  }
}
