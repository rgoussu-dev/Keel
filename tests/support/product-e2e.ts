/**
 * The product end-to-end harness, shared by every `tests/e2e/fullstack*`
 * suite, whatever family serves its backend.
 *
 * A product suite scaffolds one product as `keel new` leaves it on its
 * default dials — a monorepo, each service on its default build system
 * — and builds one of its two services with that service's toolchain.
 * On those dials the frontend is the same on every product, so
 * `fullstack.test.ts` builds it and fakes the backend's toolchain, and
 * the others build their backend and fake the frontend's install.
 * Which family's toolchain then runs, and how its server boots, stays
 * with that family's helper (`go-e2e.ts`, `rust-e2e.ts`, `web-e2e.ts`),
 * as do the skip rules.
 *
 * No suite builds an image or runs `compose`: that is deployment glue,
 * which an e2e suite does not vouch for. What a suite does check is
 * that each image `compose.yaml` builds has a `Dockerfile` to build it
 * from ({@link expectComposeBuildContexts}).
 */

import path from 'node:path';
import fs from 'fs-extra';
import { expect } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { runActions, type RunActionsInputs } from '../../src/domain/core/actions.js';
import { newProjectCommand, type PresetAnswers } from '../../src/domain/contract/commands.js';
import type { DeferredAction } from '../../src/domain/contract/composition.js';
import { e2eMediator } from './e2e-cell.js';
import { expectOk } from './factory.js';

/**
 * Deferred action ids to fake, by the scope that queues them: a
 * service's path in the product (`backend`, `frontend`), or `.` for the
 * product root.
 */
export type FakesByScope = Readonly<Record<string, readonly string[]>>;

/**
 * A deferred-action runner that turns the actions `fakes` names for a
 * scope into no-ops, and hands every other action to the real runner.
 *
 * Keyed by scope, not by id alone, because `keel new` runs each scope's
 * actions in turn — the product root's, then each service's, each from
 * its own directory — and two services can queue the same id: a
 * TypeScript backend and the frontend both install with
 * `walking-skeleton/npm-install`. Faking that id everywhere would fake
 * the install the suite builds on.
 */
export function stubInScopes(
  root: string,
  fakes: FakesByScope,
): (inputs: RunActionsInputs) => Promise<void> {
  return (inputs) => {
    const faked = new Set(fakes[path.relative(root, inputs.cwd) || '.'] ?? []);
    const actions = inputs.actions.map(
      (action): DeferredAction =>
        faked.has(action.id)
          ? {
              id: action.id,
              description: `${action.description} [faked: no-op]`,
              run: () => Promise.resolve(),
            }
          : action,
    );
    return runActions({ ...inputs, actions });
  };
}

/** What product to scaffold, and what of it to fake. */
export interface ProductSpec {
  /** The product preset, scaffolded on its default dials. */
  readonly stack: string;
  /**
   * The deferred actions to fake, by scope, beside the product root's
   * `vcs/git-init`, which is always faked. A suite fakes what it does
   * not build.
   */
  readonly fakes?: FakesByScope;
  /** Answers by adapter id, as `keel new --yes` would take them. */
  readonly answers?: PresetAnswers;
}

/** The two services of a scaffolded product, as absolute paths. */
export interface ScaffoldedProduct {
  readonly backend: string;
  readonly frontend: string;
}

/**
 * Scaffolds `spec.stack` into `cwd` through the real mediator, every
 * deferred action running for real but those `spec.fakes` names and
 * the root's `git init`, and returns its two services.
 *
 * Asserts the faked `git init` really was faked, as every e2e harness
 * here does, that the frontend landed, and that the backend carries
 * the contract the frontend's gateway encodes.
 */
export async function scaffoldProduct(spec: ProductSpec, cwd: string): Promise<ScaffoldedProduct> {
  const fakes = spec.fakes ?? {};
  const mediator = e2eMediator({
    keelVersion: '0.0.0-e2e',
    runDeferred: stubInScopes(cwd, { ...fakes, '.': ['vcs/git-init', ...(fakes['.'] ?? [])] }),
  });
  expectOk(
    await mediator.dispatch(
      newProjectCommand({
        cwd,
        stack: spec.stack,
        answers: spec.answers ?? {},
        interactive: false,
        dryRun: false,
      }),
    ),
  );
  expect(await fs.pathExists(path.join(cwd, '.git'))).toBe(false);
  const product = { backend: path.join(cwd, 'backend'), frontend: path.join(cwd, 'frontend') };
  expect(await fs.pathExists(path.join(product.frontend, 'package.json'))).toBe(true);
  expect(await fs.pathExists(path.join(product.backend, 'contract', 'greet.openapi.yaml'))).toBe(
    true,
  );
  return product;
}

/** A root `compose.yaml`, as far as {@link expectComposeBuildContexts} reads one. */
interface Compose {
  readonly services?: Readonly<
    Record<
      string,
      { readonly build?: string | { readonly context?: string; readonly dockerfile?: string } }
    >
  >;
}

/**
 * Asserts that every service the product root's `compose.yaml` builds
 * finds its `Dockerfile` under its build context, and that it builds at
 * least one.
 *
 * A suite builds a service with its own toolchain and never builds an
 * image, so a `compose.yaml` saying `build: ./backend` beside a backend
 * with no `Dockerfile` would pass it: that scaffolds and compiles, and
 * fails only at `docker compose up --build`.
 */
export async function expectComposeBuildContexts(root: string): Promise<void> {
  const compose = (parseYaml(await fs.readFile(path.join(root, 'compose.yaml'), 'utf8')) ??
    {}) as Compose;
  const built = Object.entries(compose.services ?? {}).flatMap(([service, { build }]) =>
    build === undefined ? [] : [{ service, build }],
  );
  expect(built.length, 'compose.yaml builds no service').toBeGreaterThan(0);
  for (const { service, build } of built) {
    const { context = '.', dockerfile = 'Dockerfile' } =
      typeof build === 'string' ? { context: build } : build;
    expect(
      await fs.pathExists(path.join(root, context, dockerfile)),
      `${service} builds ${context} with no ${dockerfile} there`,
    ).toBe(true);
  }
}

/**
 * Drives the wire a product's frontend gateway encodes against the
 * backend at `baseUrl`, whichever family serves it: a named and a
 * defaulted greeting, the RFC 9457 rejection, and the dev-only CORS
 * accommodation for the SPA's dev origin — the allowed origin on a
 * `GET`, and a `204` preflight echoing the headers it was asked for.
 */
export async function driveGatewayContract(baseUrl: string): Promise<void> {
  const named = await fetch(`${baseUrl}/greet?name=E2E`);
  expect(named.status).toBe(200);
  expect(await named.json()).toEqual({ greeting: 'Hello, E2E!' });
  expect(named.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');

  const defaulted = await fetch(`${baseUrl}/greet`);
  expect(defaulted.status).toBe(200);
  expect(await defaulted.json()).toEqual({ greeting: 'Hello, world!' });

  const rejected = await fetch(`${baseUrl}/greet?name=`);
  expect(rejected.status).toBe(400);
  expect(rejected.headers.get('content-type')).toBe('application/problem+json');

  const preflight = await fetch(`${baseUrl}/greet`, {
    method: 'OPTIONS',
    headers: { 'access-control-request-headers': 'x-requested-with' },
  });
  expect(preflight.status).toBe(204);
  expect(preflight.headers.get('access-control-allow-methods')).toBe('GET');
  expect(preflight.headers.get('access-control-allow-headers')).toBe('x-requested-with');
}
