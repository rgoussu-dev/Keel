/**
 * End-to-end test for the `walking-skeleton` vertical's frontend
 * realization.
 *
 * Dispatches `keel.new-project` against a real temp directory with
 * the `web-components` stack, then verifies the generated workspace
 * actually installs, typechecks, its tests pass, and `vite build`
 * produces the deployable static bundle.
 *
 * As in the Quarkus e2e, the only CI-shaped side effect
 * (`vcs/git-init`) is replaced with a no-op; the
 * `walking-skeleton/npm-install` action runs for real, since the
 * installed node_modules is the entrypoint to the
 * typecheck/test/build we want to exercise.
 *
 * Cost: `npm install` downloads TypeScript, Vite and Vitest from the
 * registry (network required; ~1 minute cold). Skip rules mirror the
 * Quarkus e2e:
 *   - skipped automatically when `npm` is missing from PATH;
 *   - skipped on CI by default; opt in with `KEEL_RUN_E2E=1`;
 *   - opt out locally with `KEEL_SKIP_E2E=1`.
 */

import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runActions, type RunActionsInputs } from '../../src/domain/core/actions.js';
import { newProjectCommand } from '../../src/domain/contract/commands.js';
import type { DeferredAction } from '../../src/domain/contract/composition.js';
import { expectOk, installMediator } from '../support/factory.js';

const E2E_TIMEOUT_MS = 10 * 60 * 1000;

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

const runStep = (cwd: string, step: string, args: readonly string[]): void => {
  const r = spawnSync('npm', [...args], { cwd, encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(
      `${step} failed (exit ${r.status})\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`,
    );
  }
};

/**
 * A headless Chromium on the box, if there is one. Playwright's
 * download layout is the usual place to find one in CI images; the
 * browser-backed case skips when nothing turns up rather than
 * installing anything.
 */
const chromium = ((): string | null => {
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
 * behind `npx`, and that is the fix for a real CI failure rather than a
 * preference. A built bundle is a directory of static files; standing
 * up a dev-server binary to hand them over added an `npx` resolution,
 * a fixed port to collide on, and a child process to wait for — three
 * ways for this test to fail for reasons that have nothing to do with
 * the bundle, and it failed for one of them the first time it ran on a
 * runner, reporting only "never came up". Port 0 lets the OS choose,
 * so parallel suites cannot collide either.
 *
 * `--virtual-time-budget` is what makes the render deterministic: it
 * advances the page's clock to the budget and dumps once nothing is
 * pending, rather than sleeping and hoping.
 */
const renderInChromium = async (distDir: string): Promise<string> => {
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
};

const optedIn = process.env.KEEL_RUN_E2E === '1';
const optedOut = process.env.KEEL_SKIP_E2E === '1';
const onCI = process.env.CI === 'true';
const skipE2E = optedOut || !onPath('npm') || (onCI && !optedIn);

let cwd: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-wc-e2e-'));
});

afterEach(async () => {
  await fs.remove(cwd);
});

describe.skipIf(skipE2E)('web-components walking-skeleton e2e', () => {
  it(
    'generates a workspace that installs, typechecks, tests green, and builds',
    async () => {
      const mediator = installMediator({
        keelVersion: '0.0.0-e2e',
        runDeferred: stubActions(new Set(['vcs/git-init'])),
      });
      expectOk(
        await mediator.dispatch(
          newProjectCommand({
            cwd,
            stack: 'web-components',
            answers: {
              'walking-skeleton/wc-spa-bootstrap': {
                npmScope: 'acme',
                projectName: 'walking-skeleton-e2e',
              },
              'vcs/git-init': { remote: '', defaultBranch: 'main' },
            },
            interactive: false,
            dryRun: false,
          }),
        ),
      );

      // Sanity check: the install action ran (node_modules present),
      // git was stubbed out.
      expect(await fs.pathExists(path.join(cwd, 'node_modules'))).toBe(true);
      expect(await fs.pathExists(path.join(cwd, '.git'))).toBe(false);

      runStep(cwd, 'npm run typecheck', ['run', 'typecheck']);
      runStep(cwd, 'npm test', ['test']);
      runStep(cwd, 'npm run build', ['run', 'build']);

      const bundle = path.join(cwd, 'application', 'web-app', 'dist', 'index.html');
      expect(await fs.pathExists(bundle)).toBe(true);
      const html = await fs.readFile(bundle, 'utf8');
      expect(html).toContain('<acme-greeting>');
    },
    E2E_TIMEOUT_MS,
  );
});

/**
 * The modulith layout, end to end.
 *
 * Two of its claims need the real toolchain. The first is the usual
 * one: the carved workspace still installs, typechecks, tests and
 * builds, because the layout is supposed to be the only thing that
 * changed.
 *
 * The second is specific to the browser and is the reason the import
 * map exists at all. A package that defines custom elements must be
 * loaded **once** per page: two bundles each inlining a copy throw
 * `NotSupportedError` on the second registration, and that throw
 * aborts the rest of that bundle's registrations — so part of the page
 * silently stops upgrading, with nothing in the console anyone reads.
 * No emitted-file assertion can see that. So this asserts what the
 * bundler actually produced — the design system left the app chunk and
 * the bare specifier survived for the map to resolve — and then checks
 * the element registrations are where they belong.
 */
const scaffoldModulith = async (): Promise<void> => {
  const mediator = installMediator({
    keelVersion: '0.0.0-e2e',
    runDeferred: stubActions(new Set(['vcs/git-init'])),
  });
  expectOk(
    await mediator.dispatch(
      newProjectCommand({
        cwd,
        stack: 'web-components',
        answers: {
          'walking-skeleton/wc-spa-bootstrap': {
            npmScope: 'acme',
            projectName: 'walking-skeleton-e2e',
          },
          'vcs/git-init': { remote: '', defaultBranch: 'main' },
        },
        interactive: false,
        dryRun: false,
        moduleLayout: 'modulith',
      }),
    ),
  );
};

describe.skipIf(skipE2E)('web-components modulith e2e', () => {
  it(
    'builds a bundle that leaves the design system to the import map',
    async () => {
      await scaffoldModulith();

      runStep(cwd, 'npm run typecheck', ['run', 'typecheck']);
      runStep(cwd, 'npm test', ['test']);
      runStep(cwd, 'npm run lint', ['run', 'lint']);
      runStep(cwd, 'npm run build', ['run', 'build']);

      const dist = path.join(cwd, 'application', 'web-app', 'dist');
      const html = await fs.readFile(path.join(dist, 'index.html'), 'utf8');
      expect(html).toContain('<acme-greeting-view>');
      expect(html).toContain('"@acme/design-system": "/vendor/design-system.js"');

      // The map's target exists, and the design system is in it…
      const vendor = await fs.readFile(path.join(dist, 'vendor', 'design-system.js'), 'utf8');
      expect(vendor).toContain('acme-button');
      expect(await fs.pathExists(path.join(dist, 'vendor', 'design-system.css'))).toBe(true);

      // …and not in the app chunk, which keeps the bare specifier for
      // the browser to resolve. The app defines exactly its own one
      // element; every design-system registration is in the external.
      const chunks = await fs.readdir(path.join(dist, 'assets'));
      const app = await fs.readFile(
        path.join(dist, 'assets', chunks.find((f) => f.endsWith('.js')) ?? ''),
        'utf8',
      );
      expect(app).toContain('@acme/design-system');
      expect(app.match(/customElements\.define/g)).toHaveLength(1);
      expect(vendor.match(/customElements\.define/g)?.length ?? 0).toBeGreaterThan(1);
    },
    E2E_TIMEOUT_MS,
  );

  /**
   * The other half: a real browser, because "the page renders" is not
   * something a bundle inspection can claim. Headless Chromium loads
   * the built bundle from a static server and dumps the DOM after the
   * module graph has run; a page whose element never upgraded shows
   * an empty `<acme-greeting-view>` and fails here.
   *
   * Skipped when no Chromium is on the box — the bundle assertions
   * above still run.
   */
  it.skipIf(chromium === null)(
    'upgrades its elements in a real browser',
    async () => {
      await scaffoldModulith();
      runStep(cwd, 'npm run build', ['run', 'build']);
      const dom = await renderInChromium(path.join(cwd, 'application', 'web-app', 'dist'));
      // The context's element upgraded…
      expect(dom).toMatch(/<acme-greeting-view>[\s\S]*<form>/);
      // …and so did the design system's, through the import map.
      expect(dom).toContain('<acme-button type="submit"><button');
      expect(dom).toContain('<acme-greeting-card');
    },
    E2E_TIMEOUT_MS,
  );
});
