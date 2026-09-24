/**
 * Where a directory sits in a product (`domain/core/scope.ts`), read
 * off the manifests through the `ManifestStore` port, and the plan
 * scope that follows from it.
 *
 * **Scenario.** Manifests held at chosen directories: a monorepo
 * product root listing `backend` and `frontend`, a service manifest
 * under one of them, and — for a plugin product — a service two
 * directories down. The root's installed verticals are the shipped
 * product's (`vcs`, `fullstack`), so what the root gives a service is
 * read from keel's own declarations: `vcs`'s placement, and the
 * product glue's `providesInServices`.
 *
 * **Factory.** The shipped `FakeManifestStore`, and — for a manifest
 * that cannot be read — a store of the same port that throws for one
 * directory, the way the filesystem adapter throws on a broken file.
 *
 * **Port.** `scopeOf`, `enclosingProduct`, `planScopeOf`,
 * `provisionsFor`.
 */

import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  emptyManifestV2,
  projectScopeRoot,
  type ManifestV2,
  type ServiceRef,
} from '../../../src/domain/contract/manifest.js';
import type { ManifestStore } from '../../../src/domain/contract/ports/manifest-store.js';
import type { Stack } from '../../../src/domain/contract/stack.js';
import { registryOf, shippedRegistry, shippedSource } from '../../../src/domain/core/registry.js';
import {
  enclosingProduct,
  planScopeOf,
  provisionsFor,
  scopeOf,
} from '../../../src/domain/core/scope.js';
import { STACKS } from '../../../src/domain/core/stacks.js';
import { FakeManifestStore } from '../../../src/infrastructure/manifest/fake.js';

/* ---- Scenario ---------------------------------------------------- */

const ROOT = path.join(path.sep, 'work', 'shop');

const manifest = (fields: Partial<ManifestV2> = {}): ManifestV2 => ({
  ...emptyManifestV2('2026-09-24T00:00:00Z', '0.0.0-test'),
  ...fields,
});

const installed = (...ids: string[]) =>
  ids.map((id) => ({ id, installedAt: '2026-09-24T00:00:00Z' }));

const SERVICES: readonly ServiceRef[] = [
  { path: 'backend', stack: 'quarkus-rest', buildSystem: 'gradle' },
  { path: 'frontend', stack: 'web-components', buildSystem: 'npm' },
];

const productRoot = (services: readonly ServiceRef[] = SERVICES) =>
  manifest({ services, verticals: installed('vcs', 'fullstack'), tags: ['agentic.harness'] });

const backend = manifest({
  tags: ['arch.server-http', 'framework.quarkus', 'lang.java', 'runtime.jvm'],
  verticals: installed('walking-skeleton', 'agent-harness'),
});

/* ---- Factory ----------------------------------------------------- */

async function storeWith(manifests: Readonly<Record<string, ManifestV2>>): Promise<ManifestStore> {
  const store = new FakeManifestStore();
  for (const [directory, stored] of Object.entries(manifests)) {
    await store.write(projectScopeRoot(directory), stored);
  }
  return store;
}

/** `store`, except that the manifest in `broken` cannot be read. */
function unreadableAt(store: ManifestStore, broken: string): ManifestStore {
  return {
    read: (scopeRoot) =>
      scopeRoot === projectScopeRoot(broken)
        ? Promise.reject(new SyntaxError('Unexpected token in JSON'))
        : store.read(scopeRoot),
    write: (scopeRoot, stored) => store.write(scopeRoot, stored),
  };
}

const at = (...segments: string[]) => path.join(ROOT, ...segments);

/* ---- Tests ------------------------------------------------------- */

describe('scopeOf', () => {
  it('reads a product root with each service, and a service it cannot read as none', async () => {
    const store = await storeWith({ [ROOT]: productRoot(), [at('backend')]: backend });
    const where = await scopeOf(
      { registry: shippedRegistry, manifests: unreadableAt(store, at('frontend')) },
      ROOT,
    );
    expect(where.manifest?.services).toEqual(SERVICES);
    expect(where.product).toBeNull();
    expect(where.services).toEqual([
      { ref: SERVICES[0], directory: at('backend'), manifest: backend },
      { ref: SERVICES[1], directory: at('frontend'), manifest: null },
    ]);
  });

  it('finds the product a listed service belongs to', async () => {
    const manifests = await storeWith({ [ROOT]: productRoot(), [at('backend')]: backend });
    const where = await scopeOf({ registry: shippedRegistry, manifests }, at('backend'));
    expect(where.manifest).toEqual(backend);
    expect(where.services).toEqual([]);
    expect(where.product).toMatchObject({ root: ROOT, relative: 'backend', service: SERVICES[0] });
  });

  it('finds the product around a directory it lists no service in, as no service', async () => {
    const manifests = await storeWith({ [ROOT]: productRoot() });
    expect(
      await enclosingProduct({ registry: shippedRegistry, manifests }, at('worker')),
    ).toMatchObject({ root: ROOT, relative: 'worker', service: null });
  });

  it('stops at the nearest project, and looks no deeper than a product holds a service', async () => {
    const manifests = await storeWith({ [ROOT]: productRoot(), [at('backend')]: backend });
    const deps = { registry: shippedRegistry, manifests };
    // Inside a service is inside that project — no product's business.
    expect(await enclosingProduct(deps, at('backend', 'tools'))).toBeNull();
    // Two levels down, past any service keel's products declare.
    expect(await enclosingProduct(deps, at('apps', 'api'))).toBeNull();
    // And a directory beside a product with no root manifest — a
    // polyrepo product's — is in no product at all.
    expect(
      await enclosingProduct(
        { registry: shippedRegistry, manifests: await storeWith({}) },
        at('backend'),
      ),
    ).toBeNull();
  });

  it("reaches a plugin product's service as deep as the plugin declares it", async () => {
    const nested: readonly ServiceRef[] = [{ path: 'apps/api', stack: 'go-http' }];
    const fullstack = STACKS['fullstack'] as Stack;
    const registry = registryOf([
      shippedSource,
      {
        origin: "plugin 'acme'",
        stacks: [
          {
            ...fullstack,
            id: 'acme-product',
            services: [{ path: 'apps/api', stack: 'go-http' }],
          },
        ],
      },
    ]);
    const manifests = await storeWith({ [ROOT]: productRoot(nested) });
    expect(await enclosingProduct({ registry, manifests }, at('apps', 'api'))).toMatchObject({
      root: ROOT,
      relative: 'apps/api',
      service: nested[0],
    });
    // However the preset spelled the path, which the root records as
    // written.
    const spelled: readonly ServiceRef[] = [{ path: './apps/api/', stack: 'go-http' }];
    expect(
      await enclosingProduct(
        { registry, manifests: await storeWith({ [ROOT]: productRoot(spelled) }) },
        at('apps', 'api'),
      ),
    ).toMatchObject({ relative: 'apps/api', service: spelled[0] });
  });

  it('passes over a manifest above it that cannot be read', async () => {
    const store = await storeWith({ [ROOT]: productRoot() });
    const manifests = unreadableAt(store, ROOT);
    expect(await enclosingProduct({ registry: shippedRegistry, manifests }, at('backend'))).toBe(
      null,
    );
  });
});

describe('provisionsFor', () => {
  const root = { installed: ['vcs', 'fullstack'], tags: ['agentic.harness'] };

  it("gives a monorepo service the repository's version control and the image the root builds", () => {
    expect(
      provisionsFor(shippedRegistry, root, 'quarkus-rest').map(({ vertical, by }) => [
        vertical.id,
        by,
      ]),
    ).toEqual([
      ['vcs', 'repository'],
      ['containerization', 'product'],
    ]);
  });

  it('builds nothing for a stack the root does not list, and gives nothing the root lacks', () => {
    expect(
      provisionsFor(shippedRegistry, root, 'spring-rest-kotlin').map(({ vertical }) => vertical.id),
    ).toEqual(['vcs']);
    expect(
      provisionsFor(shippedRegistry, { installed: ['fullstack'], tags: [] }, 'go-http').map(
        ({ vertical }) => vertical.id,
      ),
    ).toEqual(['containerization']);
  });
});

describe('planScopeOf', () => {
  it('plans a monorepo service with what its product gives it, holding placement', async () => {
    const manifests = await storeWith({ [ROOT]: productRoot(), [at('backend')]: backend });
    const where = await scopeOf({ registry: shippedRegistry, manifests }, at('backend'));
    const scope = planScopeOf(shippedRegistry, where);
    expect(scope.installed).toEqual([
      'walking-skeleton',
      'agent-harness',
      'vcs',
      'containerization',
    ]);
    expect(scope.member).toEqual({ provided: ['vcs', 'containerization'] });
  });

  it('plans a project in no product as a repository of its own', async () => {
    const manifests = await storeWith({ [at('backend')]: backend });
    const where = await scopeOf({ registry: shippedRegistry, manifests }, at('backend'));
    const scope = planScopeOf(shippedRegistry, where);
    expect(scope.installed).toEqual(['walking-skeleton', 'agent-harness']);
    expect(scope).not.toHaveProperty('member');
  });
});
