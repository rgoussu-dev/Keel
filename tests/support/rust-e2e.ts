/**
 * The machinery every Rust end-to-end test shares, whatever the stack
 * shape it goes on to drive.
 *
 * A Rust e2e is the same four steps every time: scaffold a stack into
 * a temp directory through the real mediator, run `cargo test` and
 * `cargo build` against an isolated `CARGO_HOME`, then — for the
 * server stacks — boot the binary on an OS-assigned port and drive it
 * over the wire. Only the last step differs per suite, and only in
 * *what* it asserts; finding the port the binary bound is identical
 * everywhere. {@link RustProjectSpec} is what the first three are
 * parameterised by.
 *
 * This mirrors what `jvm-e2e.ts` did for the JVM half in H.2. Before
 * it, `walking-skeleton-rust.test.ts` and `fullstack-rust.test.ts`
 * each carried their own `onPath`, skip rules, `CARGO_HOME`
 * isolation, action stubbing and port-sniffing block — the second
 * copy already having drifted (it fakes `npm-install` too, and its
 * `cargoRun` takes the project root as a parameter where the first
 * closes over a module-level `cwd`). A third and fourth copy were
 * about to be written for the modulith cells.
 *
 * **Hermeticity.** Every suite gets a fresh `CARGO_HOME` so a run
 * never reads or writes the developer's own `~/.cargo`. Cold-fetching
 * the registry index is slow enough that sharing one across the tests
 * *within* a file is worth it — see {@link mkTempDir}, which the
 * suites call from whichever lifecycle hook matches their sharing.
 *
 * **Skip rules**, matching the Go e2e:
 *   - skipped automatically when `cargo` is missing from PATH;
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
import { expectOk, installMediator } from './factory.js';

/**
 * How long a Rust e2e may take. The `rust-cli` skeleton is
 * dependency-free, but `rust-http` compiles axum and tokio from a
 * cold registry.
 */
export const E2E_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Windows will only execute binaries carrying the .exe extension, so
 * the spawned path needs the suffix there.
 */
export const EXE = process.platform === 'win32' ? '.exe' : '';

const onPath = (cmd: string): boolean => {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  return spawnSync(probe, [cmd], { stdio: 'ignore' }).status === 0;
};

const optedIn = process.env.KEEL_RUN_E2E === '1';
const optedOut = process.env.KEEL_SKIP_E2E === '1';
const onCI = process.env.CI === 'true';

/** Whether the Rust e2e tests should be skipped in this run. */
export const skipRustE2E = optedOut || !onPath('cargo') || (onCI && !optedIn);

/**
 * Rewrites the action list before handing it to the real runner,
 * turning `stubbed` ids into no-ops.
 *
 * `vcs/git-init` is faked because an e2e has no business making
 * repositories, and `walking-skeleton/rust-bootstrap` — the deferred
 * `cargo check` — because every suite here runs an explicit `cargo
 * test` and `cargo build`, which verify strictly more without
 * compiling the dependency graph twice.
 */
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

/** The deferred actions every Rust e2e fakes. */
const ALWAYS_STUBBED = ['vcs/git-init', 'walking-skeleton/rust-bootstrap'];

/** What it takes to scaffold one emitted Rust project. */
export interface RustProjectSpec {
  /** Stack preset to scaffold. */
  readonly stack: string;
  /** Value recorded as the bootstrap's `projectName` answer. */
  readonly projectName: string;
  /** Module layout to scaffold; the stack's default when omitted. */
  readonly moduleLayout?: string;
  /**
   * Deferred actions to no-op *beyond* {@link ALWAYS_STUBBED} — the
   * composite stacks also carry `walking-skeleton/npm-install` for
   * their frontend.
   */
  readonly alsoStubbed?: readonly string[];
  /**
   * Where the Rust project lands relative to the scaffold root, for
   * composite stacks that put the service in a subdirectory
   * (`fullstack-rust` → `backend`). The root itself when omitted.
   */
  readonly servicePath?: string;
  /** Also scaffold the peer bounded context (modulith only). */
  readonly withPeerContext?: boolean;
}

/**
 * A scaffolded project and the isolated cargo home its builds run
 * against — everything {@link cargoRun} needs, so a suite passes one
 * value rather than re-threading two.
 */
export interface RustProject {
  /** Absolute path of the Cargo workspace root. */
  readonly root: string;
  /** Absolute path of the isolated `CARGO_HOME`. */
  readonly cargoHome: string;
}

/**
 * Makes a temp directory with `prefix`, for a suite to hold as its
 * scaffold root or its `CARGO_HOME`. Which lifecycle hook a suite
 * calls this from is its own decision: a shared cargo home wants
 * `beforeAll`, a per-test scaffold root wants `beforeEach`.
 */
export function mkTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

/**
 * Scaffolds `spec.stack` into `cwd` through the real mediator and
 * returns the project paired with `cargoHome`, ready to build.
 *
 * Asserts the faked `git init` really was faked — a suite that
 * silently ran the real one would leave a repository behind and, more
 * to the point, would mean the stubbing seam had stopped working.
 */
export async function scaffold(
  spec: RustProjectSpec,
  cwd: string,
  cargoHome: string,
): Promise<RustProject> {
  const mediator = installMediator({
    keelVersion: '0.0.0-e2e',
    runDeferred: stubActions(new Set([...ALWAYS_STUBBED, ...(spec.alsoStubbed ?? [])])),
  });
  expectOk(
    await mediator.dispatch(
      newProjectCommand({
        cwd,
        stack: spec.stack,
        answers: {
          'walking-skeleton/rust-bootstrap': { projectName: spec.projectName },
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
  return {
    root: spec.servicePath === undefined ? cwd : path.join(cwd, spec.servicePath),
    cargoHome,
  };
}

/**
 * Layers `vertical` onto an already-scaffolded project through the
 * real mediator.
 *
 * The vertical's own deferred `cargo check` is faked for the same
 * reason the bootstrap's is: every suite here runs an explicit `cargo
 * test`, which verifies strictly more, and the real one would compile
 * the new dependency graph a second time against the developer's
 * `~/.cargo` rather than the isolated home.
 */
export async function addVertical(vertical: string, cwd: string): Promise<void> {
  const mediator = installMediator({
    keelVersion: '0.0.0-e2e',
    runDeferred: stubActions(new Set([`${vertical}/rust-${vertical}`])),
  });
  expectOk(
    await mediator.dispatch(
      addVerticalCommand({ cwd, vertical, answers: {}, interactive: false, dryRun: false }),
    ),
  );
}

/** Runs `cargo` in the project, failing loudly with its output. */
export function cargoRun(project: RustProject, args: readonly string[]): void {
  const r = spawnSync('cargo', args, {
    cwd: project.root,
    env: { ...process.env, CARGO_HOME: project.cargoHome },
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    throw new Error(
      `cargo ${args.join(' ')} failed (exit ${r.status})\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`,
    );
  }
}

/** Absolute path of a binary the debug build just produced. */
export function debugBin(project: RustProject, name: string): string {
  return path.join(project.root, 'target', 'debug', `${name}${EXE}`);
}

/** How long to wait for a booted binary to announce its port. */
const BOOT_TIMEOUT_MS = 15_000;

/**
 * Boots `bin` on an OS-assigned port, waits for it to announce the
 * address it bound, and hands `drive` the base URL — killing the
 * process however the body ends.
 *
 * Binding port 0 and reading back the real port is what lets several
 * e2e files run at once: vitest parallelises across files, and two
 * suites reaching for a fixed port means the loser dies on a bind
 * error that reads exactly like a keel defect. The trade is that the
 * port is only knowable from the process's own startup log, hence the
 * sniffing.
 *
 * A process that exits before announcing anything rejects with its
 * exit code *and* everything it managed to say, because "server
 * exited early (101)" on its own has sent more than one debugging
 * session looking in the wrong place.
 */
export async function withServer<T>(
  bin: string,
  options: { readonly cwd: string; readonly env: NodeJS.ProcessEnv },
  drive: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const server = spawn(bin, [], { cwd: options.cwd, env: options.env });
  try {
    const port = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('server never announced its port')),
        BOOT_TIMEOUT_MS,
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
    return await drive(`http://127.0.0.1:${port}`);
  } finally {
    server.removeAllListeners('exit');
    server.kill();
  }
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
