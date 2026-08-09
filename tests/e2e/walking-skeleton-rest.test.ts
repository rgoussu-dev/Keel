/**
 * End-to-end test for the `walking-skeleton` vertical's REST shape.
 *
 * Dispatches `keel.new-project` against a real temp directory with
 * the `quarkus-rest` stack, then verifies the generated project
 * builds (which runs its `@QuarkusTest` + RestAssured suite), boots
 * the packaged application, and answers `GET /greet` through the
 * mediator with the expected greeting.
 *
 * Mirrors `walking-skeleton.test.ts`: `vcs/git-init` is faked with a
 * no-op, the gradle-wrapper action runs for real with retry around
 * the Gradle distribution CDN's known transient failures, and the
 * same skip rules apply — skipped when `gradle`/`java` are missing
 * from PATH, skipped on CI unless `KEEL_RUN_E2E=1`, opt out anywhere
 * with `KEEL_SKIP_E2E=1`.
 */

import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runActions, type RunActionsInputs } from '../../src/domain/core/actions.js';
import { newProjectCommand } from '../../src/domain/contract/commands.js';
import type { DeferredAction } from '../../src/domain/contract/composition.js';
import { expectOk, installMediator } from '../support/factory.js';

const E2E_TIMEOUT_MS = 20 * 60 * 1000;
const APP_START_TIMEOUT_MS = 60 * 1000;

const TRANSIENT_PATTERNS = [
  /Test of distribution url .* failed/,
  /Server returned HTTP response code: 5\d\d/,
  /HEAD request to .* failed: response code \(5\d\d\)/,
];

const isTransient = (blob: string): boolean => TRANSIENT_PATTERNS.some((re) => re.test(blob));

const rewriteActions =
  (config: { stubbed: ReadonlySet<string>; retried: ReadonlySet<string> }) =>
  (inputs: RunActionsInputs): Promise<void> => {
    const rewritten = inputs.actions.map((a): DeferredAction => {
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

/**
 * Boots the packaged Quarkus app on a random port
 * (`-Dquarkus.http.port=0`) and resolves with the bound port once the
 * startup log announces it. Rejects if the process exits or the
 * announcement doesn't appear within the timeout.
 */
const startApp = (
  runJar: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<{ child: ChildProcess; port: number }> =>
  new Promise((resolve, reject) => {
    const child = spawn('java', ['-Dquarkus.http.port=0', '-jar', runJar], { cwd, env });
    let output = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`app did not announce its port within 60s; output so far:\n${output}`));
    }, APP_START_TIMEOUT_MS);
    const onData = (chunk: Buffer): void => {
      output += chunk.toString();
      const m = /Listening on: https?:\/\/[^:\s]+:(\d+)/.exec(output);
      if (m?.[1] !== undefined) {
        clearTimeout(timer);
        resolve({ child, port: Number(m[1]) });
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`app exited before announcing its port (exit ${code}):\n${output}`));
    });
  });

const stopApp = async (child: ChildProcess): Promise<void> => {
  if (child.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    child.once('exit', () => {
      resolve();
    });
    child.kill('SIGTERM');
    setTimeout(() => child.kill('SIGKILL'), 5000).unref();
  });
};

const optedIn = process.env.KEEL_RUN_E2E === '1';
const optedOut = process.env.KEEL_SKIP_E2E === '1';
const onCI = process.env.CI === 'true';
const toolingMissing = !onPath('gradle') || !onPath('java');
const skipE2E = optedOut || toolingMissing || (onCI && !optedIn);

let cwd: string;
let gradleUserHome: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-rest-'));
  gradleUserHome = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-rest-gradle-'));
});

afterEach(async () => {
  await fs.remove(cwd);
  await fs.remove(gradleUserHome);
});

describe.skipIf(skipE2E)('walking-skeleton REST e2e', () => {
  it(
    'generates a REST project that builds, whose tests pass, and that serves /greet',
    async () => {
      const mediator = installMediator({
        keelVersion: '0.0.0-e2e',
        runDeferred: rewriteActions({
          stubbed: new Set(['vcs/git-init']),
          retried: new Set(['walking-skeleton/gradle-wrapper']),
        }),
      });
      expectOk(
        await mediator.dispatch(
          newProjectCommand({
            cwd,
            stack: 'quarkus-rest',
            answers: {
              'walking-skeleton/quarkus-rest-bootstrap': {
                basePackage: 'com.acme.e2e',
                projectName: 'walking-skeleton-rest-e2e',
              },
              'vcs/git-init': { remote: '', defaultBranch: 'main' },
            },
            interactive: false,
            dryRun: false,
          }),
        ),
      );

      const gradlew = path.join(cwd, 'gradlew');
      expect(await fs.pathExists(gradlew)).toBe(true);
      expect(await fs.pathExists(path.join(cwd, '.git'))).toBe(false);

      // `build` runs the generated @QuarkusTest + RestAssured suite
      // transitively, so this single invocation proves both "builds"
      // and "tests pass".
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

      const runJar = path.join(
        cwd,
        'application',
        'rest',
        'executable',
        'build',
        'quarkus-app',
        'quarkus-run.jar',
      );
      expect(await fs.pathExists(runJar)).toBe(true);

      const { child, port } = await startApp(runJar, cwd, env);
      try {
        const ok = await fetch(`http://127.0.0.1:${port}/greet?name=E2E`);
        expect(ok.status).toBe(200);
        expect(await ok.json()).toEqual({ greeting: 'Hello, E2E!' });

        const rejected = await fetch(`http://127.0.0.1:${port}/greet?name=%20%20`);
        expect(rejected.status).toBe(400);
        expect(rejected.headers.get('content-type')).toContain('application/problem+json');
        const problem = (await rejected.json()) as Record<string, unknown>;
        expect(problem.title).toBe('Greeting rejected');
        expect(problem.status).toBe(400);
        expect(problem.detail).toBe('name must not be blank');
      } finally {
        await stopApp(child);
      }
    },
    E2E_TIMEOUT_MS,
  );
});
