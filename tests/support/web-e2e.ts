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

/** Whether the suites for `pm` should skip themselves. */
export function skipWebE2E(pm: PackageManager): boolean {
  return optedOut || !onPath(pm) || (onCI && !optedIn);
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
  readonly stack: 'ts-cli' | 'ts-http' | 'web-components';
  readonly projectName: string;
  readonly buildSystem: PackageManager;
  readonly moduleLayout?: string;
  readonly withPeerContext?: boolean;
}

/** The bootstrap adapter each stack records its answers under. */
const BOOTSTRAP: Readonly<Record<WebProjectSpec['stack'], string>> = {
  'ts-cli': 'walking-skeleton/ts-cli-bootstrap',
  'ts-http': 'walking-skeleton/ts-http-bootstrap',
  'web-components': 'walking-skeleton/wc-spa-bootstrap',
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
          [BOOTSTRAP[spec.stack]]: { npmScope: 'acme', projectName: spec.projectName },
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
 *
 * `--virtual-time-budget` is what makes the render deterministic: it
 * advances the page's clock to the budget and dumps once nothing is
 * pending, rather than sleeping and hoping.
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
    return await new Promise<string>((resolve, reject) => {
      const browser = spawn(
        chromium ?? 'chromium',
        [
          '--headless',
          '--no-sandbox',
          '--disable-gpu',
          '--virtual-time-budget=5000',
          '--dump-dom',
          `http://127.0.0.1:${address.port}/`,
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
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
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
