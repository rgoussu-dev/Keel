/**
 * Tests for the `fullstack-rust` composite stack — the third proof
 * that the gateway seam is generic over backends: the same frontend
 * adapters fire against a Rust backend because `rust-http` projects
 * `peer.api.rest`, and the Rust side gets its own CORS decoration and
 * the shared wire contract. Deferred actions are recorded, not run.
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

const recordDeferred = (): ((inputs: RunActionsInputs) => Promise<void>) => {
  return (): Promise<void> => Promise.resolve();
};

let cwd: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-fullstack-rust-'));
});

afterEach(async () => {
  await fs.remove(cwd);
});

const read = (rel: string): string | null => {
  const file = path.join(cwd, rel);
  return fs.pathExistsSync(file) ? fs.readFileSync(file, 'utf8') : null;
};

describe('fullstack-rust composite install (monorepo)', () => {
  beforeEach(async () => {
    const mediator = installMediator({ runDeferred: recordDeferred() });
    expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'fullstack-rust',
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );
  });

  it('scaffolds a Rust backend and a web-components frontend with reciprocal peers', async () => {
    expect(read('backend/Cargo.toml')).not.toBeNull();
    expect(read('backend/src/bin/http/main.rs')).not.toBeNull();
    expect(read('frontend/package.json')).not.toBeNull();

    const backend = await fsManifestStore.read(projectScopeRoot(path.join(cwd, 'backend')));
    expect(backend?.projects).toEqual(['peer.api.rest']);
    expect(backend?.peers).toEqual([{ ref: '../frontend', tags: ['peer.ui.spa'] }]);

    const frontend = await fsManifestStore.read(projectScopeRoot(path.join(cwd, 'frontend')));
    expect(frontend?.peers).toEqual([{ ref: '../backend', tags: ['peer.api.rest'] }]);
  });

  it('fires the same frontend gateway adapters as the quarkus and go pairs', () => {
    expect(read('frontend/infrastructure/gateway-rest/src/rest-greet-gateway.ts')).toContain(
      'createRestGreetGateway',
    );
    expect(read('frontend/application/web-app/src/main.ts')).toContain('createRestGreetGateway');
    expect(read('frontend/application/web-app/vite.config.ts')).toContain("'/api'");
  });

  it('decorates the Rust assembly point with CORS instead of the quarkus patch', () => {
    const main = read('backend/src/bin/http/main.rs') ?? '';
    expect(main).toContain('handler::router(greeter).layer(axum::middleware::from_fn(with_cors))');
    expect(main).toContain('ACCESS_CONTROL_ALLOW_ORIGIN');
    expect(main).toContain('http://localhost:5173');
    expect(read('backend/src/bin/http/handler.rs')).toContain('pub greeting: String');
  });

  it('pins the wire contract on the backend', () => {
    const contract = read('backend/contract/greet.openapi.yaml') ?? '';
    expect(contract).toContain('openapi: 3.1.0');
    expect(contract).toContain('/greet');
    expect(contract).toContain('greeting');
    expect(read('frontend/contract/greet.openapi.yaml')).toBeNull();
  });

  it('writes a product README with the Rust run order', () => {
    const readme = read('README.md') ?? '';
    expect(readme).toContain('cargo run');
    expect(readme).toContain('contract/greet.openapi.yaml');
  });

  it('containerises the pair with a Rust backend image', () => {
    expect(read('compose.yaml')).toContain('build: ./backend');
    expect(read('backend/Dockerfile')).toContain('FROM rust:1-alpine AS build');
    expect(read('frontend/Dockerfile')).toContain('FROM nginx:alpine');
    expect(read('frontend/nginx.conf')).toContain('proxy_pass http://backend:8080/');
  });
});
