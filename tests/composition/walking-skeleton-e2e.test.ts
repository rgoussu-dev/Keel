/**
 * End-to-end test for the `walking-skeleton` vertical.
 *
 * Drives `newProject` against a real temp directory with the
 * `quarkus-cli` stack, then verifies the generated project actually
 * builds, its tests pass, and the CLI binary produced by the build
 * runs and prints what its picocli command says it should.
 *
 * Per the contributor brief: "the only part that would not be
 * exercised is the git/CI part; for those replace by a fake that
 * will do a no-op." Today the only CI-shaped side effect emitted by
 * the `quarkus-cli` stack is `vcs/git-init`; that action is replaced
 * with a no-op below. Every other deferred action (notably
 * `walking-skeleton/gradle-wrapper`) runs for real, since the wrapper
 * is the entrypoint to the build/test/run we want to exercise.
 *
 * Hermeticity: a fresh `GRADLE_USER_HOME` is used per test so the
 * scenario starts from a blank cache, mirroring a brand-new
 * developer machine. Network access to Maven Central + the Gradle
 * distribution mirror is required.
 *
 * Cost: first run downloads Gradle + the Quarkus BOM and is slow
 * (multiple minutes). Skip rules:
 *   - skipped automatically when `gradle` or `java` is missing from
 *     PATH;
 *   - skipped on CI by default — keel's CI is a Node project gate,
 *     not a Quarkus build farm, and the cold-cache download flakes
 *     enough that running it on every PR isn't worth the noise;
 *   - opt out locally with `KEEL_SKIP_E2E=1`;
 *   - opt in on CI (or anywhere) with `KEEL_RUN_E2E=1`.
 */

import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newProject } from '../../src/installer/new.js';
import { runActions, type RunActionsInputs } from '../../src/composition/actions.js';
import type { Action } from '../../src/composition/types.js';
import type { Prompt } from '../../src/composition/answers.js';

const E2E_TIMEOUT_MS = 20 * 60 * 1000;

const silent = {
  info: () => {},
  success: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

const noPrompt: Prompt = {
  ask: async () => {
    throw new Error('prompt should not be called in non-interactive mode');
  },
};

/**
 * Well-known flake modes from the Gradle distribution CDN that we
 * want to retry past — `Test of distribution url ... failed` (the
 * `gradle wrapper` task's HEAD probe) and `Server returned HTTP
 * response code: 5xx` (the wrapper's first-run download). Both surface
 * 5xx responses from release-assets.githubusercontent.com and are
 * unrelated to keel; without retry the test is unreliable on cold
 * caches.
 */
const TRANSIENT_PATTERNS = [
  /Test of distribution url .* failed/,
  /Server returned HTTP response code: 5\d\d/,
  /HEAD request to .* failed: response code \(5\d\d\)/,
];

const isTransient = (blob: string): boolean => TRANSIENT_PATTERNS.some((re) => re.test(blob));

/**
 * Rewrites the action list before handing it to the real runner:
 *   - actions in `stubbed` become no-ops (the "git/CI" fakes
 *     required by the brief);
 *   - actions in `retried` keep their behaviour but are wrapped in
 *     a retry loop that swallows the transient HTTP flakes from the
 *     Gradle distribution CDN.
 */
const rewriteActions =
  (config: { stubbed: ReadonlySet<string>; retried: ReadonlySet<string> }) =>
  (inputs: RunActionsInputs): Promise<void> => {
    const rewritten = inputs.actions.map((a): Action => {
      if (config.stubbed.has(a.id)) {
        return {
          id: a.id,
          description: `${a.description} [faked: no-op]`,
          run: () => Promise.resolve(),
        };
      }
      if (config.retried.has(a.id)) {
        return {
          id: a.id,
          description: a.description,
          run: (env) => withRetry(() => a.run(env)),
        };
      }
      return a;
    });
    return runActions({ ...inputs, actions: rewritten });
  };

const withRetry = async (fn: () => Promise<void>, attempts = 3): Promise<void> => {
  let last: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      await fn();
      return;
    } catch (err) {
      last = err;
      const blob = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
      if (!isTransient(blob)) throw err;
    }
  }
  throw last;
};

const onPath = (cmd: string): boolean => {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  return spawnSync(probe, [cmd], { stdio: 'ignore' }).status === 0;
};

interface RunResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

const runWithRetry = (
  cmd: string,
  args: readonly string[],
  options: Parameters<typeof spawnSync>[2],
  attempts = 3,
): RunResult => {
  let last: RunResult = { status: null, stdout: '', stderr: '' };
  for (let i = 0; i < attempts; i += 1) {
    const r = spawnSync(cmd, args, options);
    last = { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
    if (last.status === 0) return last;
    if (!isTransient(`${last.stdout}\n${last.stderr}`)) return last;
  }
  return last;
};

const optedIn = process.env.KEEL_RUN_E2E === '1';
const optedOut = process.env.KEEL_SKIP_E2E === '1';
const onCI = process.env.CI === 'true';
const toolingMissing = !onPath('gradle') || !onPath('java');
const skipE2E = optedOut || toolingMissing || (onCI && !optedIn);

let cwd: string;
let gradleUserHome: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-'));
  gradleUserHome = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-gradle-'));
});

afterEach(async () => {
  await fs.remove(cwd);
  await fs.remove(gradleUserHome);
});

describe.skipIf(skipE2E)('walking-skeleton e2e', () => {
  it(
    'generates a project that builds, whose tests pass, and that runs',
    async () => {
      // 1. Generate. Fake the git side effect; everything else (the
      //    gradle wrapper task) runs for real.
      await newProject({
        cwd,
        stack: 'quarkus-cli',
        answers: {
          'walking-skeleton/quarkus-cli-bootstrap': {
            basePackage: 'com.acme.e2e',
            projectName: 'walking-skeleton-e2e',
          },
          'vcs/git-init': { remote: '', defaultBranch: 'main' },
        },
        interactive: false,
        dryRun: false,
        logger: silent,
        prompt: noPrompt,
        now: () => '2026-04-26T12:00:00Z',
        keelVersion: '0.0.0-e2e',
        runActions: rewriteActions({
          stubbed: new Set(['vcs/git-init']),
          retried: new Set(['walking-skeleton/gradle-wrapper']),
        }),
      });

      // Sanity check: wrapper landed and is executable, no .git dir
      // (git was stubbed out).
      const gradlew = path.join(cwd, 'gradlew');
      expect(await fs.pathExists(gradlew)).toBe(true);
      expect(await fs.pathExists(path.join(cwd, '.git'))).toBe(false);

      // 2. Build + test the generated project. `build` runs tests
      //    transitively, so this single invocation proves both
      //    "builds" and "tests pass". Retry on transient CDN flakes:
      //    the wrapper's first-run download targets a GitHub release
      //    asset that occasionally 5xx's, with no signal about keel
      //    itself.
      const env = { ...process.env, GRADLE_USER_HOME: gradleUserHome };
      const build = runWithRetry(gradlew, ['--no-daemon', '--stacktrace', 'build'], {
        cwd,
        env,
        encoding: 'utf8',
      });
      if (build.status !== 0) {
        throw new Error(
          `./gradlew build failed (exit ${build.status})\n` +
            `stdout:\n${build.stdout}\nstderr:\n${build.stderr}`,
        );
      }

      // 3. Run the produced CLI binary against a sample command and
      //    verify the picocli wiring + mediator dispatch produced the
      //    expected greeting on stdout.
      const runJar = path.join(
        cwd,
        'infrastructure',
        'cli',
        'build',
        'quarkus-app',
        'quarkus-run.jar',
      );
      expect(await fs.pathExists(runJar)).toBe(true);

      const run = spawnSync('java', ['-jar', runJar, 'hello', '--name', 'E2E'], {
        cwd,
        env,
        encoding: 'utf8',
      });
      if (run.status !== 0) {
        throw new Error(
          `java -jar quarkus-run.jar failed (exit ${run.status})\n` +
            `stdout:\n${run.stdout}\nstderr:\n${run.stderr}`,
        );
      }
      expect(run.stdout).toContain('Hello, E2E!');
    },
    E2E_TIMEOUT_MS,
  );
});
