/**
 * The web end-to-end harness, shared by the `ts-http` and
 * `web-components` suites.
 *
 * One module for both stacks because they share a runtime, a package
 * manager dial and a skip rule; what differs is what each suite
 * drives afterwards. Extracted for the reason `rust-e2e.ts` was: the
 * modulith cells and the peer-context suites need the same
 * scaffolding as the `basic` ones, and the Chromium render is twenty
 * lines nobody should own twice.
 *
 * Skip rules, identical everywhere:
 *   - skipped automatically when the package manager is missing from
 *     PATH;
 *   - skipped on CI by default; opt in with `KEEL_RUN_E2E=1`;
 *   - opt out locally with `KEEL_SKIP_E2E=1`.
 */

import path from 'node:path';
import os from 'node:os';
import { createServer } from 'node:http';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'fs-extra';
import { expect } from 'vitest';
import { runActions, type RunActionsInputs } from '../../src/domain/core/actions.js';
import { addModuleCommand, newProjectCommand } from '../../src/domain/contract/commands.js';
import type { DeferredAction } from '../../src/domain/contract/composition.js';
import { expectOk, installMediator } from '../support/factory.js';

/** Generous: a cold `npm install` dominates every one of these. */
export const E2E_TIMEOUT_MS = 10 * 60 * 1000;

/** The package managers the TypeScript stacks are scaffolded on. */
export type PackageManager = 'npm' | 'pnpm';

export function onPath(cmd: string): boolean {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  return spawnSync(probe, [cmd], { stdio: 'ignore' }).status === 0;
}

const optedIn = process.env.KEEL_RUN_E2E === '1';
const optedOut = process.env.KEEL_SKIP_E2E === '1';
const onCI = process.env.CI === 'true';

/**
 * The opt-in rule on its own, with no toolchain in it.
 *
 * Every suite here answers to the same two switches; only *which*
 * tools it additionally needs differs. A suite whose toolchain is
 * neither of the package managers — the `keel ui` one, which needs a
 * browser and nothing else — composes this with its own probe rather
 * than claiming an npm it never runs.
 */
export function skipE2E(): boolean {
  return optedOut || (onCI && !optedIn);
}

/** Whether the suites for `pm` should skip themselves. */
export function skipWebE2E(pm: PackageManager): boolean {
  return skipE2E() || !onPath(pm);
}

/** A temp directory, removed by the caller. */
export function mkTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
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

/** Runs a command in the project, throwing with both streams on failure. */
export function runStep(cwd: string, step: string, cmd: string, args: readonly string[]): void {
  const r = spawnSync(cmd, [...args], { cwd, encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(
      `${step} failed (exit ${r.status})\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`,
    );
  }
}

/**
 * Runs a command expecting it to **fail**, and returns its output.
 *
 * The negative case is what proves a wall. An emitted comment saying
 * "this import is forbidden" proves nothing until a tool agrees, and
 * on these stacks *which* tool agrees is the whole point: the
 * `exports` map is held by tsc, and the peer rule only by
 * dependency-cruiser.
 */
export function runFails(cwd: string, cmd: string, args: readonly string[]): string {
  const r = spawnSync(cmd, [...args], { cwd, encoding: 'utf8' });
  if (r.status === 0) {
    throw new Error(`${cmd} ${args.join(' ')} unexpectedly succeeded\nstdout:\n${r.stdout}`);
  }
  return `${r.stdout}${r.stderr}`;
}

/** What to scaffold, and how. */
export interface WebProjectSpec {
  readonly stack: 'ts-cli' | 'ts-http' | 'ts-cli-http' | 'web-components';
  readonly projectName: string;
  readonly buildSystem: PackageManager;
  readonly moduleLayout?: string;
  readonly withPeerContext?: boolean;
}

/**
 * The bootstrap adapters each stack records its answers under.
 *
 * A list, because `ts-cli-http` resolves two of them: both declare
 * `npmScope`/`projectName`, and `sharesAnswersWith` reconciles what
 * one of them was *asked* rather than what a non-interactive run was
 * handed. Answering both by id is deterministic whichever of the two
 * the resolver reaches first — and the cost of getting it wrong is
 * an assembly depending on a scope the context does not publish.
 */
const BOOTSTRAP: Readonly<Record<WebProjectSpec['stack'], readonly string[]>> = {
  'ts-cli': ['walking-skeleton/ts-cli-bootstrap'],
  'ts-http': ['walking-skeleton/ts-http-bootstrap'],
  'ts-cli-http': ['walking-skeleton/ts-cli-bootstrap', 'walking-skeleton/ts-http-bootstrap'],
  'web-components': ['walking-skeleton/wc-spa-bootstrap'],
};

/**
 * Scaffolds a TypeScript workspace into `cwd`.
 *
 * `vcs/git-init` is faked — a repository is not what these suites
 * check — while the workspace install runs for real, since a
 * `node_modules` the emitted manifests actually resolve is most of
 * what is being verified.
 */
export async function scaffold(spec: WebProjectSpec, cwd: string): Promise<void> {
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
          ...Object.fromEntries(
            BOOTSTRAP[spec.stack].map((id) => [
              id,
              { npmScope: 'acme', projectName: spec.projectName },
            ]),
          ),
          'vcs/git-init': { remote: '', defaultBranch: 'main' },
        },
        interactive: false,
        dryRun: false,
        buildSystem: spec.buildSystem,
        ...(spec.moduleLayout !== undefined ? { moduleLayout: spec.moduleLayout } : {}),
        ...(spec.withPeerContext === true ? { withPeerContext: true } : {}),
      }),
    ),
  );
  expect(await fs.pathExists(path.join(cwd, 'node_modules'))).toBe(true);
  expect(await fs.pathExists(path.join(cwd, '.git'))).toBe(false);
}

/**
 * A headless Chromium on the box, if there is one. Playwright's
 * download layout is the usual place to find one in CI images; the
 * browser-backed cases skip when nothing turns up rather than
 * installing anything.
 */
export const chromium = ((): string | null => {
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers'].filter(
    (r): r is string => typeof r === 'string' && r.length > 0,
  );
  for (const root of roots) {
    if (!fs.pathExistsSync(root)) continue;
    for (const entry of fs.readdirSync(root)) {
      const candidate = path.join(root, entry, 'chrome-linux', 'chrome');
      if (fs.pathExistsSync(candidate)) return candidate;
    }
  }
  for (const onPathCandidate of ['chromium', 'chromium-browser', 'google-chrome']) {
    if (onPath(onPathCandidate)) return onPathCandidate;
  }
  return null;
})();

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.css': 'text/css',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};

/**
 * Headless Chromium, dumping the DOM of `url` once nothing is pending.
 *
 * `--virtual-time-budget` is what makes the render deterministic: it
 * advances the page's clock to the budget and dumps then, rather than
 * sleeping and hoping.
 */
async function dumpDom(url: string): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const browser = spawn(
      chromium ?? 'chromium',
      [
        '--headless',
        '--no-sandbox',
        '--disable-gpu',
        '--virtual-time-budget=5000',
        '--dump-dom',
        url,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let dom = '';
    let diagnostics = '';
    browser.stdout.on('data', (chunk: Buffer) => (dom += chunk.toString()));
    browser.stderr.on('data', (chunk: Buffer) => (diagnostics += chunk.toString()));
    browser.on('error', reject);
    browser.on('close', (code) =>
      code === 0
        ? resolve(dom)
        : reject(new Error(`chromium failed (exit ${code})\n${diagnostics}`)),
    );
  });
}

/**
 * Serves a built bundle and returns the DOM headless Chromium renders
 * from it.
 *
 * The server is twenty lines of `node:http` rather than `vite preview`
 * behind `npx`, and that is the fix for a real CI failure rather than
 * a preference. A built bundle is a directory of static files;
 * standing up a dev-server binary to hand them over added an `npx`
 * resolution, a fixed port to collide on, and a child process to wait
 * for — three ways for these tests to fail for reasons that have
 * nothing to do with the bundle, and one of them bit the first time it
 * ran on a runner, reporting only "never came up". Port 0 lets the OS
 * choose, so parallel suites cannot collide either.
 */
export async function renderInChromium(distDir: string): Promise<string> {
  const server = createServer((request, response) => {
    const requested = decodeURIComponent((request.url ?? '/').split('?')[0] ?? '/');
    const file = path.join(distDir, requested === '/' ? 'index.html' : requested);
    // Nothing outside the bundle, however the URL is spelled.
    if (!file.startsWith(distDir)) {
      response.writeHead(403).end();
      return;
    }
    fs.readFile(file)
      .then((body) => {
        const type = CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream';
        response.writeHead(200, { 'content-type': type });
        response.end(body);
      })
      .catch(() => response.writeHead(404).end());
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('no ephemeral port');
    // `spawn`, not `spawnSync`: the server answering Chromium's
    // requests lives in this process, and a synchronous spawn blocks
    // the event loop that would serve them — the page would load
    // nothing and the assertions would blame the bundle.
    return await dumpDom(`http://127.0.0.1:${address.port}/`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

/** An OS-assigned free TCP port, the same way `renderInChromium` picks one. */
async function findFreePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const probe = net.createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('no ephemeral port'));
        return;
      }
      probe.close(() => resolve(address.port));
    });
  });
}

/** A running dev server, and how to stop it. */
export interface DevServer {
  readonly baseUrl: string;
  stop(): Promise<void>;
}

/**
 * Finds `<name>`'s binary the way npm/pnpm/node's own resolver would:
 * walking up from `startDir` for the first `node_modules/.bin/<name>`.
 * pnpm symlinks it into every workspace package's own `node_modules`;
 * npm workspaces hoist it to the root's instead — so a package
 * directory alone isn't enough under npm, and the walk is what covers
 * both without needing to know which package manager scaffolded this
 * project.
 */
function resolveWorkspaceBin(startDir: string, name: string): string {
  let dir = startDir;
  for (;;) {
    const candidate = path.join(dir, 'node_modules', '.bin', name);
    if (fs.pathExistsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`${name}: no node_modules/.bin/${name} above ${startDir}`);
    dir = parent;
  }
}

/**
 * Starts the local Vite binary in `appCwd` (an app package directory,
 * e.g. `application/web-app` — not the workspace root, whose `dev`
 * script chains a prior build step this helper does not repeat) on a
 * free port, and waits until it answers before returning.
 *
 * Invokes `node_modules/.bin/vite` directly rather than `<pm> run dev
 * -- --port …`: pnpm forwards the `--` separator itself into the
 * script's argv instead of stripping it (npm strips it), and Vite's
 * cac-based CLI treats a literal `--` as "stop parsing flags" — so
 * `--port`/`--strictPort` silently never reached Vite through pnpm.
 * Calling the binary directly has no such intermediary to disagree
 * with.
 *
 * `--host 127.0.0.1` pins the bind address rather than leaving it to
 * Vite's own `localhost` default: `findFreePort()` below probes
 * `127.0.0.1` explicitly, and on a host where that and `localhost`
 * resolve to different loopback families (`::1` vs `127.0.0.1` —
 * observed on GitHub-hosted runners), a fetch to the probed address
 * would time out against a server bound to the other one.
 *
 * Polls the port rather than parsing Vite's startup banner, whose
 * wording is Vite's own and not a contract this suite should depend
 * on. `--strictPort` turns "the port I picked is already taken", which
 * would otherwise make Vite silently retry the next one, into a loud
 * failure instead — the whole point of picking the port ourselves.
 */
export async function startDevServer(appCwd: string): Promise<DevServer> {
  const port = await findFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const vite = resolveWorkspaceBin(appCwd, 'vite');
  const child = spawn(vite, ['--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: appCwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
  child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
  let exited: number | null = null;
  child.once('exit', (code) => (exited = code));

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (exited !== null) {
      throw new Error(`dev server exited early (code ${exited})\n${stdout}\n${stderr}`);
    }
    try {
      const response = await fetch(`${baseUrl}/`);
      if (response.ok) {
        return {
          baseUrl,
          stop: () =>
            new Promise<void>((resolve) => {
              // A grace period after exit, not just the exit event
              // itself: Vite's dependency optimizer can still be
              // flushing writes under `node_modules/.vite` for a
              // moment after the main process is gone, and the
              // caller's next step is usually removing this very
              // directory tree.
              child.once('exit', () => setTimeout(resolve, 250));
              child.kill();
            }),
        };
      }
    } catch {
      // Not accepting connections yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  child.kill();
  throw new Error(`dev server never answered on ${baseUrl}\n${stdout}\n${stderr}`);
}

/**
 * Adds a bounded context to the already-scaffolded project, exactly as
 * `keel add module <name>` does.
 *
 * Separate from the vertical helpers because a context is not a
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
