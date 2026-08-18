/**
 * The Go end-to-end harness, shared by every `tests/e2e/*go*` suite.
 *
 * Extracted for the reason `rust-e2e.ts` was: the modulith cells and
 * the peer-context suite need the same scaffolding, the same
 * hermetic toolchain environment and the same HTTP drive as the
 * `basic` suite, and three copies of a `goEnv()` whose one subtle
 * flag exists to fix a teardown failure is three places to get it
 * wrong.
 *
 * Skip rules, identical everywhere:
 *   - skipped automatically when `go` is missing from PATH;
 *   - skipped on CI by default; opt in with `KEEL_RUN_E2E=1`;
 *   - opt out locally with `KEEL_SKIP_E2E=1`.
 */

import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'fs-extra';
import { expect } from 'vitest';
import { runActions, type RunActionsInputs } from '../../src/domain/core/actions.js';
import {
  addModuleCommand,
  addVerticalCommand,
  newProjectCommand,
} from '../../src/domain/contract/commands.js';
import type { DeferredAction } from '../../src/domain/contract/composition.js';
import { expectOk, installMediator } from '../support/factory.js';

/** Generous: a cold Go build compiles the stdlib once. */
export const E2E_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Windows will only execute binaries carrying the .exe extension, so
 * both the `-o` target and the spawned path need the suffix there.
 */
export const EXE = process.platform === 'win32' ? '.exe' : '';

const onPath = (cmd: string): boolean => {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  return spawnSync(probe, [cmd], { stdio: 'ignore' }).status === 0;
};

const optedIn = process.env.KEEL_RUN_E2E === '1';
const optedOut = process.env.KEEL_SKIP_E2E === '1';
const onCI = process.env.CI === 'true';

/** Whether the Go e2e suites should skip themselves. */
export const skipGoE2E = optedOut || !onPath('go') || (onCI && !optedIn);

/** A temp directory, removed by the caller. */
export function mkTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

/**
 * The Go build and module cache, shared by **every** suite in a run
 * rather than one per file — which is a deliberate reversal, and the
 * measurement that forced it is worth keeping.
 *
 * A fresh `GOCACHE`/`GOPATH` per file looks like hermeticity and is
 * mostly a tax: both are content-addressed (`GOCACHE` by input hash,
 * `pkg/mod` by module@version), so nothing one suite writes can
 * change what another reads. What a per-file cache does buy is a cold
 * stdlib-and-dependencies compile *per file*, which is most of what
 * these suites spend.
 *
 * That was invisible while Go's modulith cases shared one file. When
 * `modulith-go-persistence` moved into its own — the standing
 * convention, a long case gets its own file — it went from 47.63s to
 * 100.03s on the runner and took the whole shard from 137.07s to
 * 159.37s. Splitting a file made the job *slower*, which is not how
 * that convention is supposed to work. Sharing the cache is what
 * makes it work: the cold compile happens once for the run instead of
 * once per file.
 *
 * Not removed between files, and not removed at all — it lives under
 * the OS temp directory at a fixed name, so the OS reclaims it and a
 * second local run starts warm.
 */
export async function sharedGoHome(): Promise<string> {
  const home = path.join(os.tmpdir(), 'keel-e2e-go-shared-home');
  await fs.ensureDir(home);
  return home;
}

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

/**
 * The Go environment every spawned toolchain call gets: a temp cache
 * and GOPATH for hermeticity, and `-modcacherw` so the module cache
 * they fill stays writable.
 *
 * That last flag is a teardown fix, not a build one. Go writes the
 * module cache read-only, so removing the temp GOPATH afterwards
 * fails with `EACCES: permission denied, rmdir …/pkg/mod/…` for any
 * user who is not root — invisible in a root container, fatal on a CI
 * runner, and it surfaces as a suite-level failure that says nothing
 * about cleanup.
 */
export function goEnv(goHome: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GOCACHE: path.join(goHome, 'cache'),
    GOPATH: path.join(goHome, 'path'),
    GOFLAGS: '-modcacherw',
  };
}

/** What to scaffold, and how. */
export interface GoProjectSpec {
  readonly stack: string;
  readonly projectName: string;
  readonly moduleLayout?: string;
  readonly withPeerContext?: boolean;
}

/**
 * Scaffolds a Go project into `cwd`.
 *
 * `vcs/git-init` is faked — a repository is not what these suites
 * check — while the bootstrap's deferred `go mod tidy` runs for real,
 * since verifying the module against the toolchain is part of what
 * the install promises.
 */
export async function scaffold(spec: GoProjectSpec, cwd: string): Promise<void> {
  const mediator = installMediator({
    keelVersion: '0.0.0-e2e',
    runDeferred: stubActions(new Set(['vcs/git-init'])),
  });
  expectOk(
    await mediator.dispatch(
      newProjectCommand({
        cwd,
        stack: spec.stack,
        answers: {
          'walking-skeleton/go-bootstrap': {
            modulePath: `example.com/${spec.projectName}`,
            projectName: spec.projectName,
          },
          'vcs/git-init': { remote: '', defaultBranch: 'main' },
        },
        interactive: false,
        dryRun: false,
        ...(spec.moduleLayout !== undefined ? { moduleLayout: spec.moduleLayout } : {}),
        ...(spec.withPeerContext === true ? { withPeerContext: true } : {}),
      }),
    ),
  );
  expect(await fs.pathExists(path.join(cwd, '.git'))).toBe(false);
}

/**
 * Layers a vertical onto the generated project, exactly as
 * `keel add <vertical>` does. The Go verticals' deferred `go mod
 * tidy` runs for real — fetching the modules the slice imports is
 * part of what the install promises.
 */
export async function addVertical(
  vertical: string,
  cwd: string,
  answers: Readonly<Record<string, Record<string, string>>> = {},
): Promise<void> {
  const mediator = installMediator({ keelVersion: '0.0.0-e2e' });
  expectOk(
    await mediator.dispatch(
      addVerticalCommand({ cwd, vertical, answers, interactive: false, dryRun: false }),
    ),
  );
}

/** Runs `go <args>` in the project, throwing with both streams on failure. */
export function goRun(cwd: string, goHome: string, args: readonly string[]): void {
  const r = spawnSync('go', args, { cwd, env: goEnv(goHome), encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(
      `go ${args.join(' ')} failed (exit ${r.status})\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`,
    );
  }
}

/**
 * Runs `go <args>` expecting it to **fail**, and returns its output.
 *
 * The negative case is the one that actually proves a wall: an
 * emitted file asserting "this import is forbidden" proves nothing
 * until a compiler agrees. A success here is the failure.
 */
export function goRunFails(cwd: string, goHome: string, args: readonly string[]): string {
  const r = spawnSync('go', args, { cwd, env: goEnv(goHome), encoding: 'utf8' });
  if (r.status === 0) {
    throw new Error(`go ${args.join(' ')} unexpectedly succeeded\nstdout:\n${r.stdout}`);
  }
  return `${r.stdout}${r.stderr}`;
}

/**
 * Boots a built HTTP unit on an OS-assigned port, hands its port to
 * `drive`, and kills it afterwards however that goes.
 */
export async function withHttpUnit(
  binary: string,
  cwd: string,
  drive: (port: string) => Promise<void>,
): Promise<void> {
  const server = spawn(binary, [], {
    cwd,
    env: { ...process.env, PORT: '0', OTEL_SDK_DISABLED: 'true' },
  });
  try {
    const port = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('server never announced its port')), 15_000);
      const settle = (outcome: () => void): void => {
        clearTimeout(timer);
        outcome();
      };
      let buffered = '';
      const sniff = (chunk: Buffer): void => {
        buffered += chunk.toString();
        const match = /listening on .*:(\d+)/.exec(buffered);
        if (match?.[1]) {
          const found = match[1];
          settle(() => resolve(found));
        }
      };
      server.stdout.on('data', sniff);
      server.stderr.on('data', sniff);
      server.on('error', (err) => settle(() => reject(err)));
      server.on('exit', (code) =>
        settle(() => reject(new Error(`server exited early (${code}): ${buffered}`))),
      );
    });
    await drive(port);
  } finally {
    server.removeAllListeners('exit');
    server.kill();
  }
}

/**
 * The wire contract every `go-http` project serves, whichever layout
 * it was carved on. That both layouts serve exactly this is the point
 * of the dial, so the assertions live here rather than in one suite.
 */
export async function driveGreetContract(port: string): Promise<void> {
  const ok = await fetch(`http://127.0.0.1:${port}/greet?name=E2E`);
  expect(ok.status).toBe(200);
  expect(await ok.json()).toEqual({ greeting: 'Hello, E2E!' });

  const defaulted = await fetch(`http://127.0.0.1:${port}/greet`);
  expect(defaulted.status).toBe(200);
  expect(await defaulted.json()).toEqual({ greeting: 'Hello, world!' });

  const rejected = await fetch(`http://127.0.0.1:${port}/greet?name=`);
  expect(rejected.status).toBe(400);
  expect(rejected.headers.get('content-type')).toBe('application/problem+json');

  // Observability seam: both probes answer, and the correlation id
  // round-trips (echoed when supplied, minted when absent).
  expect((await fetch(`http://127.0.0.1:${port}/health/live`)).status).toBe(200);
  expect((await fetch(`http://127.0.0.1:${port}/health/ready`)).status).toBe(200);
  const correlated = await fetch(`http://127.0.0.1:${port}/greet?name=E2E`, {
    headers: { 'X-Correlation-Id': 'corr-e2e' },
  });
  expect(correlated.headers.get('x-correlation-id')).toBe('corr-e2e');
  const minted = await fetch(`http://127.0.0.1:${port}/greet?name=E2E`);
  expect(minted.headers.get('x-correlation-id')).toBeTruthy();
}

/**
 * Adds a bounded context to the already-scaffolded project, exactly as
 * `keel add module <name>` does.
 *
 * Separate from {@link addVertical} because a context is not a
 * vertical the registry can name: it is a thing with a *name*, and the
 * command carries one. Suites call it more than once on purpose — the
 * shape that finds bugs is three contexts, where the consumed one is
 * no longer always the skeleton.
 */
export async function addModule(
  module: string,
  consumes: string | null,
  cwd: string,
): Promise<void> {
  const mediator = installMediator({ keelVersion: '0.0.0-e2e' });
  expectOk(
    await mediator.dispatch(
      addModuleCommand({
        cwd,
        module,
        ...(consumes === null ? {} : { consumes }),
        answers: {},
        interactive: false,
        dryRun: false,
      }),
    ),
  );
}
