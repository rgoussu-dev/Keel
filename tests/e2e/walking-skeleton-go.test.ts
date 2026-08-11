/**
 * End-to-end tests for the Go walking skeleton.
 *
 * Dispatches `keel.new-project` against a real temp directory with
 * the `go-cli` and `go-http` stacks, then verifies each generated
 * project actually vets, tests, and builds with the local Go
 * toolchain — and that the produced binaries behave: the CLI prints
 * its greeting, the HTTP unit serves `/greet` for real.
 *
 * As in the Quarkus e2e, the git side effect is faked with a no-op;
 * the `go mod tidy` deferred action runs for real since verifying
 * the module against the toolchain is part of what we promise.
 *
 * Hermeticity: a fresh `GOCACHE`/`GOPATH` is shared across the tests
 * in this file (cold-compiling the stdlib once is slow enough). The
 * CLI skeleton is stdlib-only; `go-http` pulls the OpenTelemetry
 * modules through its observability vertical, so that test needs
 * network access for `go mod tidy`.
 *
 * Skip rules mirror the Quarkus e2e:
 *   - skipped automatically when `go` is missing from PATH;
 *   - skipped on CI by default; opt in with `KEEL_RUN_E2E=1`;
 *   - opt out locally with `KEEL_SKIP_E2E=1`.
 */

import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'fs-extra';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runActions, type RunActionsInputs } from '../../src/domain/core/actions.js';
import { newProjectCommand } from '../../src/domain/contract/commands.js';
import type { DeferredAction } from '../../src/domain/contract/composition.js';
import { expectOk, installMediator } from '../support/factory.js';

const E2E_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Windows will only execute binaries carrying the .exe extension, so
 * both the -o target and the spawned path need the suffix there.
 */
const EXE = process.platform === 'win32' ? '.exe' : '';

const stubActions =
  (stubbed: ReadonlySet<string>) =>
  (inputs: RunActionsInputs): Promise<void> => {
    const rewritten = inputs.actions.map((a): DeferredAction => {
      if (!stubbed.has(a.id)) return a;
      return {
        id: a.id,
        description: `${a.description} [faked: no-op]`,
        run: () => Promise.resolve(),
      };
    });
    return runActions({ ...inputs, actions: rewritten });
  };

const onPath = (cmd: string): boolean => {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  return spawnSync(probe, [cmd], { stdio: 'ignore' }).status === 0;
};

const optedIn = process.env.KEEL_RUN_E2E === '1';
const optedOut = process.env.KEEL_SKIP_E2E === '1';
const onCI = process.env.CI === 'true';
const skipE2E = optedOut || !onPath('go') || (onCI && !optedIn);

let goHome: string;
let cwd: string;

beforeAll(async () => {
  goHome = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-go-home-'));
});

afterAll(async () => {
  await fs.remove(goHome);
});

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-go-'));
});

afterEach(async () => {
  await fs.remove(cwd);
});

const goEnv = (): NodeJS.ProcessEnv => ({
  ...process.env,
  GOCACHE: path.join(goHome, 'cache'),
  GOPATH: path.join(goHome, 'path'),
});

const generate = async (stack: string, projectName: string): Promise<void> => {
  const mediator = installMediator({
    keelVersion: '0.0.0-e2e',
    runDeferred: stubActions(new Set(['vcs/git-init'])),
  });
  expectOk(
    await mediator.dispatch(
      newProjectCommand({
        cwd,
        stack,
        answers: {
          'walking-skeleton/go-bootstrap': {
            modulePath: `example.com/${projectName}`,
            projectName,
          },
          'vcs/git-init': { remote: '', defaultBranch: 'main' },
        },
        interactive: false,
        dryRun: false,
      }),
    ),
  );
  expect(await fs.pathExists(path.join(cwd, '.git'))).toBe(false);
};

const goRun = (args: readonly string[]): void => {
  const r = spawnSync('go', args, { cwd, env: goEnv(), encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(
      `go ${args.join(' ')} failed (exit ${r.status})\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`,
    );
  }
};

describe.skipIf(skipE2E)('walking-skeleton Go e2e', () => {
  it(
    'go-cli: generates a project that vets, tests, builds, and runs',
    async () => {
      await generate('go-cli', 'skel');

      goRun(['vet', './...']);
      goRun(['test', './...']);
      goRun(['build', '-o', `bin/skel${EXE}`, './cmd/cli']);

      const run = spawnSync(path.join(cwd, 'bin', `skel${EXE}`), ['--name', 'E2E'], {
        cwd,
        encoding: 'utf8',
      });
      expect(run.status).toBe(0);
      expect(run.stdout).toBe('Hello, E2E!\n');

      const rejected = spawnSync(path.join(cwd, 'bin', `skel${EXE}`), ['--name', '  '], {
        cwd,
        encoding: 'utf8',
      });
      expect(rejected.status).toBe(2);
      expect(rejected.stderr).toContain('name must not be empty');
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'go-http: generates a project that tests, builds, and serves /greet',
    async () => {
      await generate('go-http', 'skel');

      goRun(['test', './...']);
      goRun(['build', '-o', `bin/skel-http${EXE}`, './cmd/http']);

      // Boot the unit on an OS-assigned port and read the bound
      // address from its startup log.
      const server = spawn(path.join(cwd, 'bin', `skel-http${EXE}`), [], {
        cwd,
        env: { ...process.env, PORT: '0', OTEL_SDK_DISABLED: 'true' },
      });
      try {
        const port = await new Promise<string>((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error('server never announced its port')),
            15_000,
          );
          const settle = (outcome: () => void): void => {
            clearTimeout(timer);
            outcome();
          };
          let buffered = '';
          const sniff = (chunk: Buffer): void => {
            buffered += chunk.toString();
            const match = /listening on .*:(\d+)/.exec(buffered);
            if (match?.[1]) {
              const port = match[1];
              settle(() => resolve(port));
            }
          };
          server.stdout.on('data', sniff);
          server.stderr.on('data', sniff);
          server.on('error', (err) => settle(() => reject(err)));
          server.on('exit', (code) =>
            settle(() => reject(new Error(`server exited early (${code}): ${buffered}`))),
          );
        });

        const ok = await fetch(`http://127.0.0.1:${port}/greet?name=E2E`);
        expect(ok.status).toBe(200);
        expect(await ok.json()).toEqual({ greeting: 'Hello, E2E!' });

        const defaulted = await fetch(`http://127.0.0.1:${port}/greet`);
        expect(defaulted.status).toBe(200);
        expect(await defaulted.json()).toEqual({ greeting: 'Hello, world!' });

        const rejected = await fetch(`http://127.0.0.1:${port}/greet?name=`);
        expect(rejected.status).toBe(400);
        expect(rejected.headers.get('content-type')).toBe('application/problem+json');

        // Observability seam: both probes answer, and the correlation
        // id round-trips (echoed when supplied, minted when absent).
        expect((await fetch(`http://127.0.0.1:${port}/health/live`)).status).toBe(200);
        expect((await fetch(`http://127.0.0.1:${port}/health/ready`)).status).toBe(200);
        const correlated = await fetch(`http://127.0.0.1:${port}/greet?name=E2E`, {
          headers: { 'X-Correlation-Id': 'corr-e2e' },
        });
        expect(correlated.headers.get('x-correlation-id')).toBe('corr-e2e');
        const minted = await fetch(`http://127.0.0.1:${port}/greet?name=E2E`);
        expect(minted.headers.get('x-correlation-id')).toBeTruthy();
      } finally {
        server.removeAllListeners('exit');
        server.kill();
      }
    },
    E2E_TIMEOUT_MS,
  );
});
