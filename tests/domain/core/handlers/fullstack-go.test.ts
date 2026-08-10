/**
 * Tests for the `fullstack-go` composite stack — the proof that the
 * gateway seam is generic over backends: the same frontend adapters
 * fire against a Go backend because `go-http` projects
 * `peer.api.rest`, and the Go side gets its own CORS decoration and
 * the shared wire contract. Deferred actions are discarded, not run.
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
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-fullstack-go-'));
});

afterEach(async () => {
  await fs.remove(cwd);
});

const read = (rel: string): string | null => {
  const file = path.join(cwd, rel);
  return fs.pathExistsSync(file) ? fs.readFileSync(file, 'utf8') : null;
};

describe('fullstack-go composite install (monorepo)', () => {
  beforeEach(async () => {
    const mediator = installMediator({ runDeferred: discardDeferred() });
    expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'fullstack-go',
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );
  });

  it('scaffolds a Go backend and a web-components frontend with reciprocal peers', async () => {
    expect(read('backend/go.mod')).not.toBeNull();
    expect(read('backend/cmd/http/main.go')).not.toBeNull();
    expect(read('frontend/package.json')).not.toBeNull();

    const backend = await fsManifestStore.read(projectScopeRoot(path.join(cwd, 'backend')));
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

  it('decorates the Go assembly point with CORS instead of the quarkus patch', () => {
    const main = read('backend/cmd/http/main.go') ?? '';
    expect(main).toContain('withCORS(resthttp.NewHandler(greeter))');
    expect(main).toContain('Access-Control-Allow-Origin');
    expect(read('backend/internal/app/resthttp/handler.go')).toContain('json:"greeting"');
  });

  it('pins the wire contract on the backend', () => {
    const contract = read('backend/contract/greet.openapi.yaml') ?? '';
    expect(contract).toContain('openapi: 3.1.0');
    expect(contract).toContain('/greet');
    expect(contract).toContain('greeting');
    expect(contract).toContain('minLength: 1');
    expect(contract).toContain('default: world');
    expect(read('frontend/contract/greet.openapi.yaml')).toBeNull();
  });

  it('writes a product README with the Go run order', () => {
    const readme = read('README.md') ?? '';
    expect(readme).toContain('go run ./cmd/http');
    expect(readme).toContain('contract/greet.openapi.yaml');
  });

  it('containerises the pair with a Go backend image', () => {
    expect(read('compose.yaml')).toContain('build: ./backend');
    expect(read('backend/Dockerfile')).toContain('FROM golang:1-alpine AS build');
    expect(read('frontend/Dockerfile')).toContain('FROM nginx:alpine');
    expect(read('frontend/nginx.conf')).toContain('proxy_pass http://backend:8080/');
  });
});
