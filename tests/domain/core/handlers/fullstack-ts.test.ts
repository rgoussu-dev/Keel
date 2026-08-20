/**
 * Tests for the `fullstack-ts` composite stack — the proof that the
 * gateway seam is generic over backends: the same frontend adapters
 * fire against a TypeScript backend because `ts-http` projects
 * `peer.api.rest`, and the Node side gets its own CORS decoration
 * and the shared wire contract. Deferred actions are discarded, not
 * run.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newProjectCommand } from '../../../../src/domain/contract/commands.js';
import { projectScopeRoot } from '../../../../src/domain/contract/manifest.js';
import type { RunActionsInputs } from '../../../../src/domain/core/actions.js';
import { fsManifestStore } from '../../../../src/infrastructure/manifest/fs-manifest-store.js';
import { expectOk, installMediator } from '../../../support/factory.js';

const discardDeferred = (): ((inputs: RunActionsInputs) => Promise<void>) => {
  return (): Promise<void> => Promise.resolve();
};

let cwd: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-fullstack-ts-'));
});

afterEach(async () => {
  await fs.remove(cwd);
});

const read = (rel: string): string | null => {
  const file = path.join(cwd, rel);
  return fs.pathExistsSync(file) ? fs.readFileSync(file, 'utf8') : null;
};

describe('fullstack-ts composite install (monorepo)', () => {
  beforeEach(async () => {
    const mediator = installMediator({ runDeferred: discardDeferred() });
    expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'fullstack-ts',
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );
  });

  it('scaffolds a TypeScript backend and a web-components frontend with reciprocal peers', async () => {
    expect(read('backend/package.json')).not.toBeNull();
    expect(read('backend/application/rest/src/main.ts')).not.toBeNull();
    expect(read('frontend/package.json')).not.toBeNull();

    const backend = await fsManifestStore.read(projectScopeRoot(path.join(cwd, 'backend')));
    expect(backend?.tags).toContain('pkg.npm');
    expect(backend?.projects).toEqual(['peer.api.rest']);
    expect(backend?.peers).toEqual([{ ref: '../frontend', tags: ['peer.ui.spa'] }]);

    const frontend = await fsManifestStore.read(projectScopeRoot(path.join(cwd, 'frontend')));
    expect(frontend?.peers).toEqual([{ ref: '../backend', tags: ['peer.api.rest'] }]);
  });

  it('fires the same frontend gateway adapters as the quarkus pair', () => {
    expect(read('frontend/infrastructure/gateway-rest/src/rest-greet-gateway.ts')).toContain(
      'createRestGreetGateway',
    );
    expect(read('frontend/application/web-app/src/main.ts')).toContain('createRestGreetGateway');
    expect(read('frontend/application/web-app/vite.config.ts')).toContain("'/api'");
  });

  it('decorates the Node assembly point with CORS instead of the quarkus patch', () => {
    const main = read('backend/application/rest/src/main.ts') ?? '';
    expect(main).toContain('withCors(instrument(createGreetServer(mediator)))');
    expect(main).toContain('access-control-allow-origin');
    expect(main).toContain("import type { Server } from 'node:http';");
  });

  it('pins the wire contract on the backend', () => {
    const contract = read('backend/contract/greet.openapi.yaml') ?? '';
    expect(contract).toContain('openapi: 3.1.0');
    expect(contract).toContain('/greet');
    expect(read('frontend/contract/greet.openapi.yaml')).toBeNull();
  });

  it('writes a product README with the Node run order', () => {
    const readme = read('README.md') ?? '';
    expect(readme).toContain('npm run dev');
    expect(readme).toContain('contract/greet.openapi.yaml');
  });

  it('containerises the pair with a Node backend image', () => {
    expect(read('compose.yaml')).toContain('build: ./backend');
    expect(read('backend/Dockerfile')).toContain('FROM node:24-alpine');
    expect(read('backend/Dockerfile')).toContain('application/rest/src/main.ts');
    // The SPA ships as an assets image; a stock nginx (in the root
    // compose) serves the volume and proxies /api to the
    // env-configured backend URL.
    expect(read('frontend/Dockerfile')).toContain('FROM alpine:3');
    expect(read('frontend/Dockerfile')).not.toContain('FROM nginx');
    expect(read('frontend/nginx.conf')).toContain('proxy_pass ${BACKEND_URL}/');
  });
});
