/**
 * Tests for the composite (fullstack) install flow: monorepo and
 * polyrepo layouts, vcs hoisting, peer recording, peer-conditional
 * gateway adapters, and the brownfield `keel link` + `keel add
 * gateway` path. All deferred actions are recorded instead of run —
 * the real npm/gradle/git flows belong to the e2e suites.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addVerticalCommand,
  linkPeerCommand,
  newProjectCommand,
} from '../../../../src/domain/contract/commands.js';
import { projectScopeRoot } from '../../../../src/domain/contract/manifest.js';
import { peerRef } from '../../../../src/domain/core/handlers/new-project.js';
import type { RunActionsInputs } from '../../../../src/domain/core/actions.js';
import { fsManifestStore } from '../../../../src/infrastructure/manifest/fs-manifest-store.js';
import { FakePrompt } from '../../../../src/infrastructure/prompt/fake.js';
import { expectErr, expectOk, installMediator } from '../../../support/factory.js';

interface RecordedAction {
  readonly id: string;
  readonly cwd: string;
}

const recordActions = (): {
  ran: RecordedAction[];
  runDeferred: (inputs: RunActionsInputs) => Promise<void>;
} => {
  const ran: RecordedAction[] = [];
  return {
    ran,
    runDeferred: (inputs: RunActionsInputs): Promise<void> => {
      for (const a of inputs.actions) ran.push({ id: a.id, cwd: inputs.cwd });
      return Promise.resolve();
    },
  };
};

let cwd: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-fullstack-'));
});

afterEach(async () => {
  await fs.remove(cwd);
});

const newFullstack = (opts: {
  layout?: 'monorepo' | 'polyrepo';
  dryRun?: boolean;
  interactive?: boolean;
}) =>
  newProjectCommand({
    cwd,
    stack: 'fullstack',
    answers: {},
    interactive: opts.interactive ?? false,
    dryRun: opts.dryRun ?? false,
    ...(opts.layout !== undefined ? { layout: opts.layout } : {}),
  });

const read = (rel: string): string | null => {
  const file = path.join(cwd, rel);
  return fs.pathExistsSync(file) ? fs.readFileSync(file, 'utf8') : null;
};

describe('peerRef', () => {
  it('computes sibling refs at any nesting depth', () => {
    expect(peerRef('backend', 'frontend')).toBe('../frontend');
    expect(peerRef('apps/backend', 'apps/frontend')).toBe('../frontend');
    expect(peerRef('backend', 'apps/frontend')).toBe('../apps/frontend');
    expect(peerRef('apps/api/backend', 'web')).toBe('../../../web');
  });
});

describe('fullstack composite install (monorepo)', () => {
  it('scaffolds both services, root glue, and hoists vcs to the root', async () => {
    const { ran, runDeferred } = recordActions();
    const mediator = installMediator({ runDeferred });
    const report = expectOk(await mediator.dispatch(newFullstack({})));

    expect(report.subject).toBe('fullstack');
    expect(read('README.md')).toContain('keel fullstack product');
    expect(read('backend/settings.gradle.kts')).not.toBeNull();
    expect(read('frontend/package.json')).not.toBeNull();

    const gitRuns = ran.filter((a) => a.id === 'vcs/git-init');
    expect(gitRuns).toHaveLength(1);
    expect(gitRuns[0]?.cwd).toBe(cwd);
    expect(ran.find((a) => a.id === 'walking-skeleton/gradle-wrapper')?.cwd).toBe(
      path.join(cwd, 'backend'),
    );
    expect(ran.find((a) => a.id === 'walking-skeleton/npm-install')?.cwd).toBe(
      path.join(cwd, 'frontend'),
    );
  });

  it('records services on the root manifest and reciprocal peers on the services', async () => {
    const { runDeferred } = recordActions();
    const mediator = installMediator({ runDeferred });
    expectOk(await mediator.dispatch(newFullstack({})));

    const root = await fsManifestStore.read(projectScopeRoot(cwd));
    expect(root?.services).toEqual([
      { path: 'backend', stack: 'quarkus-rest' },
      { path: 'frontend', stack: 'web-components' },
    ]);
    expect(root?.verticals.map((v) => v.id)).toEqual(['vcs', 'fullstack']);

    const backend = await fsManifestStore.read(projectScopeRoot(path.join(cwd, 'backend')));
    expect(backend?.projects).toEqual(['peer.api.rest']);
    expect(backend?.peers).toEqual([{ ref: '../frontend', tags: ['peer.ui.spa'] }]);
    expect(backend?.verticals.map((v) => v.id)).toEqual([
      'walking-skeleton',
      'dev-env',
      'observability',
      'gateway',
    ]);

    const frontend = await fsManifestStore.read(projectScopeRoot(path.join(cwd, 'frontend')));
    expect(frontend?.projects).toEqual(['peer.ui.spa']);
    expect(frontend?.peers).toEqual([{ ref: '../backend', tags: ['peer.api.rest'] }]);
  });

  it('wires the frontend to the backend through the gateway seam', async () => {
    const { runDeferred } = recordActions();
    const mediator = installMediator({ runDeferred });
    expectOk(await mediator.dispatch(newFullstack({})));

    expect(read('frontend/infrastructure/gateway-rest/src/rest-greet-gateway.ts')).toContain(
      'createRestGreetGateway',
    );
    expect(read('frontend/domain/domain-api/src/ports/greet-gateway.ts')).toContain(
      'export interface GreetGateway',
    );
    expect(read('frontend/domain/domain-api/src/index.ts')).toContain(
      "export * from './ports/greet-gateway';",
    );
    expect(read('frontend/domain/domain-core/src/internal/greet-service.ts')).toContain(
      'GreetGateway',
    );
    expect(read('frontend/domain/domain-core/package.json')).toContain('"@acme/gateway-rest"');
    expect(read('frontend/application/web-app/package.json')).toContain('"@acme/gateway-rest"');
    expect(read('frontend/application/web-app/src/main.ts')).toContain('createRestGreetGateway');
    expect(read('frontend/application/web-app/vite.config.ts')).toContain("'/api'");

    expect(
      read('backend/application/rest/executable/src/main/resources/application.properties'),
    ).toContain('%dev.quarkus.http.cors.enabled=true');
    expect(read('backend/contract/greet.openapi.yaml')).toContain('openapi: 3.1.0');
  });

  it('containerises the pair with a Quarkus backend image', async () => {
    const { runDeferred } = recordActions();
    const mediator = installMediator({ runDeferred });
    expectOk(await mediator.dispatch(newFullstack({})));

    expect(read('compose.yaml')).toContain('build: ./backend');
    expect(read('backend/Dockerfile')).toContain('FROM gradle:jdk25 AS build');
    expect(read('frontend/Dockerfile')).toContain('FROM node:22-alpine AS build');
    expect(read('frontend/nginx.conf')).toContain('proxy_pass http://backend:8080/');
  });

  it('prefixes report changes and action descriptions with the service path', async () => {
    const { runDeferred } = recordActions();
    const mediator = installMediator({ runDeferred });
    const report = expectOk(await mediator.dispatch(newFullstack({})));

    expect(report.changes.some((c) => c.path === 'README.md')).toBe(true);
    expect(report.changes.some((c) => c.path.startsWith('backend/domain/'))).toBe(true);
    expect(report.changes.some((c) => c.path.startsWith('frontend/design-system/'))).toBe(true);
    expect(report.actions.some((a) => a.startsWith('backend: '))).toBe(true);
    expect(report.actions.some((a) => a.startsWith('frontend: npm install'))).toBe(true);
  });

  it('dry-run stages nothing on disk', async () => {
    const { ran, runDeferred } = recordActions();
    const mediator = installMediator({ runDeferred });
    const report = expectOk(await mediator.dispatch(newFullstack({ dryRun: true })));
    expect(report.committed).toBe(false);
    expect(report.changes.length).toBeGreaterThan(0);
    expect(read('README.md')).toBeNull();
    expect(read('backend/settings.gradle.kts')).toBeNull();
    expect(await fsManifestStore.read(projectScopeRoot(cwd))).toBeNull();
    expect(ran).toHaveLength(0);
  });

  it('refuses when a service directory is already initialised', async () => {
    const { runDeferred } = recordActions();
    const mediator = installMediator({ runDeferred });
    expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd: path.join(cwd, 'backend'),
          stack: 'quarkus-rest',
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    const error = expectErr(await mediator.dispatch(newFullstack({})));
    expect(error.code).toBe('keel.already-initialised');
  });

  it('rejects an invalid layout with a clear message', async () => {
    const mediator = installMediator(recordActions());
    const error = expectErr(
      await mediator.dispatch({
        ...newFullstack({}),
        layout: 'many-repos' as unknown as 'monorepo',
      }),
    );
    expect(error.code).toBe('keel.invalid-layout');
  });
});

describe('fullstack composite install (polyrepo)', () => {
  it('gives each service its own repo and skips the shared root entirely', async () => {
    const { ran, runDeferred } = recordActions();
    const mediator = installMediator({ runDeferred });
    expectOk(await mediator.dispatch(newFullstack({ layout: 'polyrepo' })));

    expect(read('README.md')).toBeNull();
    expect(read('compose.yaml')).toBeNull();
    expect(await fsManifestStore.read(projectScopeRoot(cwd))).toBeNull();

    const gitRuns = ran.filter((a) => a.id === 'vcs/git-init');
    expect(gitRuns.map((a) => a.cwd).sort()).toEqual([
      path.join(cwd, 'backend'),
      path.join(cwd, 'frontend'),
    ]);

    const backend = await fsManifestStore.read(projectScopeRoot(path.join(cwd, 'backend')));
    expect(backend?.verticals.map((v) => v.id)).toEqual([
      'vcs',
      'walking-skeleton',
      'dev-env',
      'observability',
      'gateway',
    ]);
    expect(backend?.peers).toEqual([{ ref: '../frontend', tags: ['peer.ui.spa'] }]);
  });

  it('prompts for the layout when interactive and none is given', async () => {
    const prompt = new FakePrompt({
      layout: 'polyrepo',
      remote: '',
      defaultBranch: 'main',
      basePackage: 'com.acme',
      projectName: 'walking-skeleton',
      npmScope: 'acme',
      stack: 'granular',
    });
    const { runDeferred } = recordActions();
    const mediator = installMediator({ runDeferred, prompt });
    expectOk(await mediator.dispatch(newFullstack({ interactive: true })));
    expect(prompt.asked).toContain('layout');
    expect(read('README.md')).toBeNull();
    expect(read('frontend/package.json')).not.toBeNull();
  });
});

describe('brownfield: keel link + keel add gateway', () => {
  it('links two standalone projects and installs each side of the seam', async () => {
    const { runDeferred } = recordActions();
    const mediator = installMediator({ runDeferred });
    const backendDir = path.join(cwd, 'api');
    const frontendDir = path.join(cwd, 'app');
    await fs.ensureDir(backendDir);
    await fs.ensureDir(frontendDir);

    expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd: backendDir,
          stack: 'quarkus-rest',
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd: frontendDir,
          stack: 'web-components',
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );

    const link = expectOk(
      await mediator.dispatch(linkPeerCommand({ cwd: frontendDir, ref: '../api' })),
    );
    expect(link.ref).toBe('../api');
    expect(link.projectedHere).toEqual(['peer.api.rest']);
    expect(link.projectedThere).toEqual(['peer.ui.spa']);

    expectOk(
      await mediator.dispatch(
        addVerticalCommand({
          cwd: frontendDir,
          vertical: 'gateway',
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    const gateway = path.join(frontendDir, 'infrastructure/gateway-rest/src/rest-greet-gateway.ts');
    expect(await fs.pathExists(gateway)).toBe(true);

    expectOk(
      await mediator.dispatch(
        addVerticalCommand({
          cwd: backendDir,
          vertical: 'gateway',
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    const properties = await fs.readFile(
      path.join(
        backendDir,
        'application/rest/executable/src/main/resources/application.properties',
      ),
      'utf8',
    );
    expect(properties).toContain('%dev.quarkus.http.cors.enabled=true');
  });

  it('installs nothing when the gateway vertical resolves without peers', async () => {
    const { runDeferred } = recordActions();
    const mediator = installMediator({ runDeferred });
    const appDir = path.join(cwd, 'solo');
    await fs.ensureDir(appDir);
    expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd: appDir,
          stack: 'web-components',
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    const report = expectOk(
      await mediator.dispatch(
        addVerticalCommand({
          cwd: appDir,
          vertical: 'gateway',
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    expect(report.changes).toHaveLength(0);
    expect(await fs.pathExists(path.join(appDir, 'infrastructure/gateway-rest'))).toBe(false);
  });

  it('link refuses an uninitialised peer', async () => {
    const { runDeferred } = recordActions();
    const mediator = installMediator({ runDeferred });
    const appDir = path.join(cwd, 'solo');
    await fs.ensureDir(appDir);
    expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd: appDir,
          stack: 'web-components',
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    const error = expectErr(
      await mediator.dispatch(linkPeerCommand({ cwd: appDir, ref: '../nowhere' })),
    );
    expect(error.code).toBe('keel.peer-not-initialised');
  });
});
