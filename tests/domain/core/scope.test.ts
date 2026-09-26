/**
 * Where a directory sits in a product (`domain/core/scope.ts`), read
 * off the manifests through the `ManifestStore` port, and the plan
 * scope that follows from it.
 *
 * **Scenario.** Manifests held at chosen directories: a monorepo
 * product root listing `backend` and `frontend`, a service manifest
 * under one of them, for a plugin product a service two directories
 * down, a single project several directories above the one asked
 * about, and one in a home directory a walk up ends at. The root's
 * installed verticals are the shipped product's (`vcs`, `fullstack`),
 * so what the root gives a service is read from keel's own
 * declarations: `vcs`'s placement, and the product glue's
 * `providesInServices`.
 *
 * **Factory.** The shipped `FakeManifestStore`, and — for a manifest
 * that cannot be read — a store of the same port that throws for one
 * directory, the way the filesystem adapter throws on a broken file.
 *
 * **Port.** `scopeOf`, `enclosingProduct`, `projectAbove`,
 * `nearbyProjects`, `productAround`, `planScopeOf`, `siblingsOf`,
 * `provisionsFor` — and, before `keel new` has written a manifest,
 * `presetServiceScope` over the shipped `fullstack` preset's services.
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
  nearbyProjects,
  planScopeOf,
  presetServiceScope,
  presetServiceTags,
  productAround,
  projectAbove,
  provisionsFor,
  scopeOf,
  siblingsOf,
  type PresetService,
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
    expect(where.siblings).toEqual([]);
  });

  it('finds the product a listed service belongs to, and its other services', async () => {
    const manifests = await storeWith({ [ROOT]: productRoot(), [at('backend')]: backend });
    const deps = { registry: shippedRegistry, manifests };
    const where = await scopeOf(deps, at('backend'));
    expect(where.manifest).toEqual(backend);
    expect(where.services).toEqual([]);
    expect(where.product).toMatchObject({ root: ROOT, relative: 'backend', service: SERVICES[0] });
    // Read once, from the root's list: the front end holds no manifest
    // here, so a plan there reads its preset.
    expect(where.siblings).toEqual([
      { ref: SERVICES[1], directory: at('frontend'), manifest: null },
    ]);
    const [frontend] = siblingsOf(shippedRegistry, where);
    expect(frontend).toMatchObject({ path: 'frontend', stack: 'web-components' });
    expect(frontend?.scope?.member).toBeDefined();
    // From the front end, the backend, read from its own manifest.
    const other = await scopeOf(deps, at('frontend'));
    expect(other.siblings).toEqual([
      { ref: SERVICES[0], directory: at('backend'), manifest: backend },
    ]);
    // A directory the product lists no service in has none.
    expect((await scopeOf(deps, at('worker'))).siblings).toEqual([]);
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

describe('projectAbove', () => {
  it('walks up from the parent to the filesystem root by default, and no further than told', async () => {
    const manifests = await storeWith({ [ROOT]: backend });
    const deep = at('a', 'b', 'c', 'd');
    expect(await projectAbove({ manifests }, deep)).toEqual({ root: ROOT, manifest: backend });
    expect(await projectAbove({ manifests }, deep, { levels: 3 })).toBeNull();
    expect(await projectAbove({ manifests }, deep, { levels: 4 })).toMatchObject({ root: ROOT });
    // A directory's own manifest is not above it, and with none higher
    // up the walk ends at the root.
    expect(await projectAbove({ manifests }, ROOT)).toBeNull();
  });

  it('passes over a manifest above it that cannot be read, for the next one up', async () => {
    const store = await storeWith({ [ROOT]: productRoot(), [at('backend')]: backend });
    expect(
      await projectAbove({ manifests: unreadableAt(store, at('backend')) }, at('backend', 'tools')),
    ).toEqual({ root: ROOT, manifest: productRoot() });
  });

  it('stops at a manifest it cannot read when told to, as a project it cannot read', async () => {
    const store = await storeWith({ [ROOT]: productRoot(), [at('backend')]: backend });
    const above = await projectAbove(
      { manifests: unreadableAt(store, at('backend')) },
      at('backend', 'tools'),
      { unreadable: 'stop' },
    );
    expect(above).toEqual({ root: at('backend'), manifest: null });
  });

  it('ends at the home directory without reading it, or anything above it', async () => {
    // A 0.1.0-alpha global install's manifest, or a project above home.
    const manifests = await storeWith({ [ROOT]: backend, [at('home')]: backend });
    expect(
      await projectAbove({ manifests, home: at('home') }, at('home', 'code', 'app')),
    ).toBeNull();
    expect(await projectAbove({ manifests, home: at('home') }, at('elsewhere', 'app'))).toEqual({
      root: ROOT,
      manifest: backend,
    });
  });
});

describe('nearbyProjects', () => {
  const frontend = manifest({ tags: ['lang.typescript'], verticals: installed('agent-harness') });

  it("names a product root's services from as deep as it is asked, each with its manifest", async () => {
    const manifests = await storeWith({
      [ROOT]: productRoot(),
      [at('backend')]: backend,
      [at('frontend')]: frontend,
    });
    const nearby = await nearbyProjects(
      { registry: shippedRegistry, manifests },
      at('docs', 'notes'),
    );
    expect(nearby).toMatchObject({
      above: '../..',
      services: ['../../backend', '../../frontend'],
      below: [],
    });
    expect([...nearby.manifests]).toEqual([
      ['../..', productRoot()],
      ['../../backend', backend],
      ['../../frontend', frontend],
    ]);
  });

  it('names no listed service that holds no project, such as the one it is run in', async () => {
    const manifests = await storeWith({ [ROOT]: productRoot(), [at('backend')]: backend });
    const deps = { registry: shippedRegistry, manifests };
    const nearby = await nearbyProjects(deps, at('frontend'));
    expect(nearby).toMatchObject({ above: '..', services: ['../backend'] });
    expect(nearby.manifests.has('../frontend')).toBe(false);
    // Where no listed service holds one, the root alone is named.
    const bare = await nearbyProjects(
      { registry: shippedRegistry, manifests: await storeWith({ [ROOT]: productRoot() }) },
      at('frontend'),
    );
    expect(bare).not.toHaveProperty('services');
    expect([...bare.manifests.keys()]).toEqual(['..']);
  });

  it("names a polyrepo product's services below, and a single project above alone", async () => {
    const polyrepo = await nearbyProjects(
      {
        registry: shippedRegistry,
        manifests: await storeWith({ [at('backend')]: backend, [at('frontend')]: frontend }),
      },
      ROOT,
    );
    expect(polyrepo).toMatchObject({ above: null, below: ['backend', 'frontend'] });
    expect(polyrepo).not.toHaveProperty('services');
    expect([...polyrepo.manifests]).toEqual([
      ['backend', backend],
      ['frontend', frontend],
    ]);
    const single = await nearbyProjects(
      { registry: shippedRegistry, manifests: await storeWith({ [ROOT]: backend }) },
      at('src', 'main'),
    );
    expect(single).toMatchObject({ above: '../..', below: [] });
    expect(single).not.toHaveProperty('services');
    expect([...single.manifests]).toEqual([['../..', backend]]);
  });

  it('stops at a manifest above it that cannot be read, as a project it cannot read', async () => {
    const store = await storeWith({ [ROOT]: productRoot() });
    const nearby = await nearbyProjects(
      { registry: shippedRegistry, manifests: unreadableAt(store, ROOT) },
      at('notes'),
    );
    expect(nearby).toMatchObject({ above: '..', below: [] });
    expect([...nearby.manifests]).toEqual([['..', null]]);
  });
});

describe('productAround', () => {
  it('makes a directory part of a product root at any depth, and of no other project', () => {
    const product = { root: ROOT, manifest: productRoot() };
    expect(productAround(product, at('backend'))).toMatchObject({
      relative: 'backend',
      service: SERVICES[0],
    });
    expect(productAround(product, at('docs', 'notes'))).toMatchObject({
      root: ROOT,
      relative: 'docs/notes',
      service: null,
    });
    expect(productAround({ root: ROOT, manifest: backend }, at('tools'))).toBeNull();
    // Nor of one it cannot read, which cannot say it is a product root.
    expect(productAround({ root: ROOT, manifest: null }, at('backend'))).toBeNull();
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

describe('presetServiceScope', () => {
  const product = STACKS['fullstack'] as Stack;
  const quarkusRest = STACKS['quarkus-rest'] as Stack;
  const webComponents = STACKS['web-components'] as Stack;
  const gateway = shippedRegistry.vertical('gateway');
  const ci = shippedRegistry.vertical('ci');
  if (gateway === null || ci === null) throw new Error('the shipped registry lost a vertical');
  const backend: PresetService = {
    path: 'backend',
    stack: quarkusRest,
    extraVerticals: [gateway],
  };
  const services: readonly PresetService[] = [
    backend,
    { path: 'frontend', stack: webComponents, extraVerticals: [gateway] },
  ];

  it('reads a service on the build system chosen for it, with what its siblings project', () => {
    const tags = presetServiceTags(backend, 'pkg.maven', services);
    expect(tags).toContain('pkg.maven');
    expect(tags).not.toContain('pkg.gradle');
    expect(tags).toEqual(expect.arrayContaining([...(webComponents.projects ?? [])]));
  });

  it("has the product's extras for the service as there already, and its root's gifts under monorepo", () => {
    const tags = presetServiceTags(backend, 'pkg.gradle', services);
    const polyrepo = presetServiceScope(shippedRegistry, product, backend, tags, false);
    expect(polyrepo.installed).toContain('gateway');
    expect(polyrepo.member).toBeUndefined();
    const monorepo = presetServiceScope(shippedRegistry, product, backend, tags, true);
    expect(monorepo.member?.provided).toEqual(['vcs', 'containerization']);
  });

  it('leaves a placed extra of the product out of a monorepo service, as keel new does', () => {
    const piped: PresetService = { ...backend, extraVerticals: [gateway, ci] };
    const tags = presetServiceTags(piped, null, services);
    expect(presetServiceScope(shippedRegistry, product, piped, tags, false).installed).toContain(
      'ci',
    );
    expect(presetServiceScope(shippedRegistry, product, piped, tags, true).installed).not.toContain(
      'ci',
    );
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
