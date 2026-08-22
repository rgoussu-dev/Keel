/**
 * `keel ui` over a real socket.
 *
 * Everything above the executable is a pure function and is tested as
 * one; this file is for what only a socket can show — that the
 * loopback bind, the token in the printed URL, the body reader, the
 * asset roots and the real engine come together into a server that
 * previews a project and then scaffolds it.
 *
 * The port is 0 throughout, so the suite never collides with a
 * `keel ui` the developer left running.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { uiServer } from '../../../src/application/web/executable/server.js';
import { TOKEN_HEADER } from '../../../src/application/web/contract/router.js';
import type { UiServer } from '../../../src/application/web/contract/server.js';
import type { RunActionsInputs } from '../../../src/domain/core/actions.js';
import { installMediator } from '../../support/factory.js';

/**
 * The install case commits for real, and its deferred actions would
 * shell out to `git` and `npm`. The plan still reports them, which is
 * what the assertion is about.
 */
const discardDeferred = (): ((inputs: RunActionsInputs) => Promise<void>) => {
  return (): Promise<void> => Promise.resolve();
};

let cwd: string;
let server: UiServer;
let origin: string;
let token: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-ui-server-'));
  server = await uiServer(installMediator({ runDeferred: discardDeferred() }))({
    host: '127.0.0.1',
    port: 0,
    cwd,
  });
  const url = new URL(server.url);
  origin = url.origin;
  token = url.searchParams.get('token') ?? '';
});

afterEach(async () => {
  await server.close();
  await fs.remove(cwd);
});

const get = (route: string, init: RequestInit = {}): Promise<Response> =>
  fetch(`${origin}${route}`, { ...init, headers: { [TOKEN_HEADER]: token, ...init.headers } });

const post = (route: string, body: unknown): Promise<Response> =>
  get(route, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const target = {
  kind: 'new-project',
  stack: 'ts-cli',
  buildSystem: 'npm',
  moduleLayout: 'basic',
};

describe('the keel ui server', () => {
  it('binds loopback and hands the token out in the URL', () => {
    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/\?token=/);
    expect(token.length).toBeGreaterThan(16);
  });

  it('serves the page and the vendored design system', async () => {
    const page = await fetch(`${origin}/`);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(await page.text()).toContain('<keel-app>');

    const planks = await fetch(`${origin}/vendor/planks.js`);
    expect(planks.status).toBe(200);
    expect(planks.headers.get('content-type')).toContain('text/javascript');
    const source = await planks.text();
    expect(source).toContain('stack-pk');
    // The ESM build, not the CommonJS one beside it. A resolver
    // running under the `require` condition hands back the `.cjs`
    // file, which a browser cannot execute and which no other
    // assertion here would notice.
    expect(source).toMatch(/\bexport\b/);
    expect(source).not.toContain('module.exports');

    for (const sheet of ['tokens.css', 'styles.css', 'structural.css']) {
      expect((await fetch(`${origin}/vendor/${sheet}`)).status).toBe(200);
    }
  });

  it('refuses to serve anything the vendor allowlist does not name', async () => {
    expect((await fetch(`${origin}/vendor/package.json`)).status).toBe(404);
  });

  it('answers the catalog and the project status', async () => {
    const catalog = (await (await get('/api/catalog')).json()) as {
      stacks: { id: string }[];
      verticals: { id: string }[];
    };
    expect(catalog.stacks.some((stack) => stack.id === 'ts-cli')).toBe(true);
    expect(catalog.verticals.length).toBeGreaterThan(0);

    const status = (await (await get(`/api/project?path=${encodeURIComponent(cwd)}`)).json()) as {
      initialised: boolean;
    };
    expect(status.initialised).toBe(false);
  });

  it('browses directories under the target picker', async () => {
    await fs.ensureDir(path.join(cwd, 'sub'));
    const listing = (await (await get(`/api/browse?path=${encodeURIComponent(cwd)}`)).json()) as {
      entries: { name: string }[];
      exists: boolean;
    };
    expect(listing.exists).toBe(true);
    expect(listing.entries.map((entry) => entry.name)).toEqual(['sub']);
  });

  it('previews, then installs from the very same body', async () => {
    const body = { cwd, target, answers: { 'vcs/git-init': { defaultBranch: 'trunk' } } };

    const preview = (await (await post('/api/preview', body)).json()) as {
      questions: { id: string; value: string }[];
      changes: { path: string }[];
      actions: string[];
    };
    expect(preview.questions.find((q) => q.id === 'defaultBranch')?.value).toBe('trunk');
    expect(preview.actions).toContain('git init -b trunk');
    expect(await fs.readdir(cwd)).toEqual([]);

    const report = (await (await post('/api/install', body)).json()) as {
      subject: string;
      committed: boolean;
      changes: { path: string }[];
    };
    expect(report).toMatchObject({ subject: 'ts-cli', committed: true });
    expect(report.changes.map((change) => change.path)).toEqual(
      preview.changes.map((change) => change.path),
    );
    expect(await fs.pathExists(path.join(cwd, 'package.json'))).toBe(true);
  });

  it('reports a domain refusal as 422 rather than a crash', async () => {
    const response = await post('/api/preview', {
      cwd,
      target: { kind: 'new-project', stack: 'no-such-stack' },
      answers: {},
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: 'keel.unknown-stack' } });
  });

  it('refuses an API request without the token', async () => {
    const response = await fetch(`${origin}/api/catalog`);
    expect(response.status).toBe(401);
  });

  it('refuses a body past the cap instead of buffering it', async () => {
    const response = await get('/api/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'x'.repeat(2 * 1024 * 1024),
    }).catch(() => null);
    // The server destroys the stream once the cap is passed, so the
    // client sees either the 413 or a reset connection; both are the
    // body not being read whole, which is what the cap is for.
    expect(response === null || response.status === 413).toBe(true);
  });

  it('cannot be walked out of its asset root', async () => {
    for (const escape of [
      '/app/../package.json',
      '/app/%2e%2e/package.json',
      '/app/..%2fpackage.json',
    ]) {
      const response = await fetch(`${origin}${escape}`);
      expect(response.status).not.toBe(200);
    }
  });

  it('sends no-store and the hardening headers on everything it serves', async () => {
    for (const route of ['/', '/api/catalog']) {
      const response = await get(route);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('x-frame-options')).toBe('DENY');
      expect(response.headers.get('access-control-allow-origin')).toBeNull();
    }
  });

  it('resolves `closed` once it is shut down', async () => {
    await server.close();
    await expect(server.closed).resolves.toBeUndefined();
    // `afterEach` closes again; closing twice must not throw.
  });
});
