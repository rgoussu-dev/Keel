/**
 * Shared machinery for the JVM CLI walking-skeleton e2e tests.
 *
 * Each e2e scaffolds a stack into a temp dir, runs the generated
 * wrapper's build (which executes the generated framework test
 * suite), then runs the packaged jar once with a sample argv and
 * asserts on its stdout. That last step is the whole point: it is what
 * says the picocli wiring found the command, the container found the
 * handler, and the mediator dispatched to it — three seams that a
 * project can get wrong while still compiling and packaging cleanly.
 *
 * The framework-specific bits — stack id, where the build puts the
 * runnable jar, the argv, and the line the run must print — are
 * parameters. Everything up to the jar is shared with the REST suites
 * and lives in [`jvm-e2e.ts`](./jvm-e2e.ts), including both build
 * systems and the skip rules.
 */

import path from 'node:path';
import { spawnSync } from 'node:child_process';
import fs from 'fs-extra';
import { expect } from 'vitest';
import {
  buildProject,
  runnableJar,
  scaffold,
  skipJvmE2E,
  type JvmRunnableSpec,
  javaLauncher,
} from './jvm-e2e.js';

export { E2E_TIMEOUT_MS, skipJvmMavenE2E } from './jvm-e2e.js';

/** Whether the JVM CLI e2e tests should be skipped in this run. */
export const skipJvmCliE2E = skipJvmE2E;

/** Framework-specific parameters of one JVM CLI e2e run. */
export interface JvmCliE2ESpec extends JvmRunnableSpec {
  /** Arguments handed to the packaged jar. */
  readonly argv: readonly string[];
  /** Text the run must print on stdout. */
  readonly expectedStdout: string;
}

/**
 * Scaffolds `spec.stack` into `cwd`, builds it with the generated
 * wrapper (running the generated test suite transitively), then runs
 * the produced binary against `spec.argv` and asserts its stdout.
 *
 * `vcs/git-init` is the one deferred action faked out, per the
 * contributor brief — so the absence of a `.git` directory is a
 * sanity check that the fake took, and everything else (notably the
 * wrapper task) ran for real.
 */
export async function runJvmCliE2E(
  spec: JvmCliE2ESpec,
  cwd: string,
  depCache: string,
): Promise<void> {
  await scaffold(spec, cwd);
  expect(await fs.pathExists(path.join(cwd, '.git'))).toBe(false);

  const env = { ...process.env, GRADLE_USER_HOME: depCache };
  buildProject(spec, cwd, depCache, []);

  const runJar = runnableJar(spec, cwd);
  expect(await fs.pathExists(runJar), `missing ${runJar}`).toBe(true);

  const run = spawnSync(javaLauncher(), ['-jar', runJar, ...spec.argv], {
    cwd,
    env,
    encoding: 'utf8',
  });
  if (run.status !== 0) {
    throw new Error(
      `java -jar ${path.relative(cwd, runJar)} ${spec.argv.join(' ')} failed ` +
        `(exit ${run.status})\nstdout:\n${run.stdout}\nstderr:\n${run.stderr}`,
    );
  }
  expect(run.stdout).toContain(spec.expectedStdout);
}
