/**
 * Tests for the `fullstack-spring` and `fullstack-micronaut`
 * composite stacks — the gateway seam generalised to the two new JVM
 * backends: the same frontend adapters fire because both project
 * `peer.api.rest`, and each backend gets its own CORS accommodation
 * (a `WebMvcConfigurer` bean for Spring, a properties patch for
 * Micronaut) plus the shared wire contract and a Dockerfile.
 * Deferred actions are discarded, not run.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newProjectCommand } from '../../../../src/domain/contract/commands.js';
import type { RunActionsInputs } from '../../../../src/domain/core/actions.js';
import { expectOk, installMediator } from '../../../support/factory.js';

const discardDeferred = (): ((inputs: RunActionsInputs) => Promise<void>) => {
  return (): Promise<void> => Promise.resolve();
};

let cwd: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-fullstack-jvm-'));
});

afterEach(async () => {
  await fs.remove(cwd);
});

const read = (rel: string): string | null => {
  const file = path.join(cwd, rel);
  return fs.pathExistsSync(file) ? fs.readFileSync(file, 'utf8') : null;
};

const scaffold = async (stack: string): Promise<void> => {
  const mediator = installMediator({ runDeferred: discardDeferred() });
  expectOk(
    await mediator.dispatch(
      newProjectCommand({
        cwd,
        stack,
        answers: {},
        interactive: false,
        dryRun: false,
      }),
    ),
  );
};

describe('fullstack-spring composite install (monorepo)', () => {
  beforeEach(async () => {
    await scaffold('fullstack-spring');
  });

  it('scaffolds a Spring backend and a web-components frontend', () => {
    expect(
      read('backend/application/rest/executable/src/main/java/com/example/rest/Application.java'),
    ).not.toBeNull();
    expect(read('frontend/package.json')).not.toBeNull();
  });

  it('gives the backend a dev-profile Spring CORS accommodation for the SPA peer', () => {
    const cors = read(
      'backend/application/rest/executable/src/main/java/com/example/rest/CorsConfig.java',
    );
    expect(cors).toContain('implements WebMvcConfigurer');
    expect(cors).toContain('http://localhost:5173');
    expect(cors).toContain('@Profile("dev")');
  });

  it('pins the REST seam contract beside the backend', () => {
    expect(read('backend/contract/greet.openapi.yaml')).toContain('/greet');
  });

  it('containerises the product with a Spring boot-jar Dockerfile', () => {
    expect(read('compose.yaml')).toContain('backend');
    expect(read('backend/Dockerfile')).toContain('application-rest-executable-0.1.0-SNAPSHOT.jar');
  });
});

describe('fullstack-micronaut composite install (monorepo)', () => {
  beforeEach(async () => {
    await scaffold('fullstack-micronaut');
  });

  it('scaffolds a Micronaut backend and a web-components frontend', () => {
    expect(
      read('backend/application/rest/executable/src/main/java/com/example/rest/Application.java'),
    ).not.toBeNull();
    expect(read('frontend/package.json')).not.toBeNull();
  });

  it('scopes the Micronaut CORS accommodation to the dev environment', () => {
    const properties = read(
      'backend/application/rest/executable/src/main/resources/application-dev.properties',
    );
    expect(properties).toContain('micronaut.server.cors.enabled=true');
    expect(properties).toContain('http://localhost:5173');
    expect(
      read('backend/application/rest/executable/src/main/resources/application.properties'),
    ).not.toContain('micronaut.server.cors');
  });

  it('containerises the product with a Micronaut fat-jar Dockerfile', () => {
    expect(read('backend/Dockerfile')).toContain(
      'application-rest-executable-0.1.0-SNAPSHOT-all.jar',
    );
  });
});
