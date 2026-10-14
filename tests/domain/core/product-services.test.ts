/**
 * A product root's services as its glue reads them
 * (`domain/core/product-services.ts`, roadmap T.3b): each recorded
 * service resolved to its facets, handed to every adapter at the root
 * as `Ctx.services`, and a `ServiceProvision` naming a service by id or
 * by what it is.
 *
 * **Scenario.** A plugin registry of two stacks: an HTTP backend that
 * offers two build systems and two module layouts, and an SPA frontend
 * that offers no dial. A product root records one service on each, a
 * third on a stack the registry does not hold, and the backend's build
 * system as chosen, as defaulted (a manifest predating the choice) or
 * as an id the stack does not offer.
 *
 * **Factory.** `registryOf` over the stacks, a manifest built from
 * `emptyManifestV2`, and for the `Ctx` an install hands out, the
 * shipped fakes behind `installVertical`'s ports.
 *
 * **Port.** `serviceFacets`, `productServices`, `servesStack`, and the
 * `Ctx` that `makeCtx` and `installVertical` build.
 */

import { describe, expect, it } from 'vitest';
import type { Ctx, ServiceProvision, Vertical } from '../../../src/domain/contract/composition.js';
import {
  emptyManifestV2,
  type ManifestV2,
  type ServiceRef,
} from '../../../src/domain/contract/manifest.js';
import type { Stack } from '../../../src/domain/contract/stack.js';
import { applyContributions, makeCtx } from '../../../src/domain/core/apply.js';
import { installVertical, recordedContribution } from '../../../src/domain/core/install.js';
import {
  productServices,
  serviceFacets,
  servesStack,
} from '../../../src/domain/core/product-services.js';
import { pluginOrigin, registryOf } from '../../../src/domain/core/registry.js';
import { FakeLogger } from '../../../src/infrastructure/commons/fake-logger.js';
import { FakeProcessRunner } from '../../../src/infrastructure/process/fake.js';
import { rejectingPrompt } from '../../../src/infrastructure/prompt/fake.js';
import { FakeTemplateSource } from '../../../src/infrastructure/template/fake.js';
import { FakeTree } from '../../../src/infrastructure/tree/fake.js';

/* ---- Scenario ---------------------------------------------------- */

const API: Stack = {
  id: 'acme-api',
  description: 'an HTTP backend',
  tags: ['lang.acme', 'arch.server-http'],
  buildSystems: [
    { id: 'brew', tag: 'pkg.brew', label: 'Brew', doc: 'the default' },
    { id: 'kiln', tag: 'pkg.kiln', label: 'Kiln', doc: 'the other' },
  ],
  moduleLayouts: [
    { id: 'basic', tag: 'layout.basic', label: 'Basic', doc: 'the default' },
    { id: 'modulith', tag: 'layout.modulith', label: 'Modulith', doc: 'the other' },
  ],
  verticals: [],
};

const WEB: Stack = {
  id: 'acme-web',
  description: 'an SPA frontend',
  tags: ['framework.acme-ui', 'arch.spa'],
  verticals: [],
};

const SERVES_HTTP = { requires: ['arch.server-http'] };
const SERVES_ACME = { requires: ['lang.acme', 'arch.server-http'] };

const productRoot = (services: readonly ServiceRef[]): ManifestV2 => ({
  ...emptyManifestV2('2026-10-14T00:00:00Z', '0.0.0-test'),
  services,
});

const PRODUCT: readonly ServiceRef[] = [
  { path: 'backend', stack: 'acme-api', buildSystem: 'kiln' },
  { path: 'frontend', stack: 'acme-web' },
];

/* ---- Factory ----------------------------------------------------- */

const registry = registryOf([{ origin: pluginOrigin('acme'), stacks: [API, WEB] }]);

/** A two-adapter vertical, one per dimension, keeping each `Ctx` its adapters are handed. */
function recording(seen: Ctx[]): Vertical {
  const adapter = (dimension: string) => ({
    id: `glue/${dimension}`,
    vertical: 'glue',
    covers: [dimension],
    predicate: {},
    contribute: (ctx: Ctx) => {
      seen.push(ctx);
      return {};
    },
  });
  return {
    id: 'glue',
    description: 'reads the services',
    dimensions: ['compose', 'images'],
    adapters: [adapter('compose'), adapter('images')],
  };
}

const ports = {
  logger: new FakeLogger(),
  cwd: '/product',
  templates: new FakeTemplateSource(),
  processes: new FakeProcessRunner(),
};

/* ---- Tests ------------------------------------------------------- */

describe('serviceFacets', () => {
  it('is the stack’s tags, the recorded build system and the default layout', () => {
    expect(serviceFacets(API, { buildSystem: 'kiln' })).toEqual([
      'lang.acme',
      'arch.server-http',
      'pkg.kiln',
      'layout.basic',
    ]);
  });

  it('takes the stack’s first build system where none is recorded', () => {
    expect(serviceFacets(API, {})).toContain('pkg.brew');
  });

  it('carries no build system for an id the stack does not offer', () => {
    expect(serviceFacets(API, { buildSystem: 'forge' })).toEqual([
      'lang.acme',
      'arch.server-http',
      'layout.basic',
    ]);
  });

  it('is the stack’s own tags alone on a stack that offers no dial', () => {
    expect(serviceFacets(WEB, {})).toEqual(WEB.tags);
  });
});

describe('productServices', () => {
  it('reads each recorded service, in order, with its facets', () => {
    expect(productServices(registry, productRoot(PRODUCT))).toEqual([
      {
        path: 'backend',
        stack: 'acme-api',
        tags: ['lang.acme', 'arch.server-http', 'pkg.kiln', 'layout.basic'],
      },
      { path: 'frontend', stack: 'acme-web', tags: ['framework.acme-ui', 'arch.spa'] },
    ]);
  });

  it('is empty on a manifest that records no service', () => {
    expect(productServices(registry, productRoot([]))).toEqual([]);
  });

  it('gives a service no facets where its stack is not registered', () => {
    const services = productServices(
      registry,
      productRoot([{ path: 'worker', stack: 'acme-worker' }]),
    );
    expect(services).toEqual([{ path: 'worker', stack: 'acme-worker', tags: [] }]);
  });

  it('gives every service no facets with no registry', () => {
    expect(productServices(undefined, productRoot(PRODUCT)).map((s) => s.tags)).toEqual([[], []]);
  });
});

describe('servesStack', () => {
  const provision = (fields: Omit<ServiceProvision, 'vertical'>): ServiceProvision => ({
    vertical: 'containerization',
    ...fields,
  });

  it('names a service by its stack id', () => {
    const byId = provision({ stacks: ['acme-api'] });
    expect(servesStack(byId, 'acme-api', API)).toBe(true);
    expect(servesStack(byId, 'acme-web', WEB)).toBe(false);
  });

  it('names a stack this keel does not register by its id alone', () => {
    expect(servesStack(provision({ stacks: ['acme-worker'] }), 'acme-worker', null)).toBe(true);
    expect(servesStack(provision({ serves: [SERVES_HTTP] }), 'acme-worker', null)).toBe(false);
    // Predicates the registry refuses from a plugin, read here anyway:
    // with no stack to read, not even one that requires nothing names it.
    expect(servesStack(provision({ serves: [{}] }), 'acme-worker', null)).toBe(false);
    expect(
      servesStack(provision({ serves: [{ excludes: ['arch.spa'] }] }), 'acme-worker', null),
    ).toBe(false);
  });

  it('names a service by its stack’s own tags', () => {
    const byTags = provision({ serves: [SERVES_ACME] });
    expect(servesStack(byTags, 'acme-api', API)).toBe(true);
    expect(servesStack(byTags, 'acme-web', WEB)).toBe(false);
  });

  it('never matches a dial the stack offers, but matches a build system it fixes', () => {
    const byBuild = provision({ serves: [{ requires: ['pkg.brew'] }] });
    expect(servesStack(byBuild, 'acme-api', API)).toBe(false);
    // A stack offering no build-system choice carries its one in its
    // own tags, as keel's `go-http` carries `pkg.go-modules`.
    const goHttp: Stack = {
      id: 'acme-go',
      description: 'a Go HTTP backend',
      tags: ['lang.go', 'pkg.go-modules', 'arch.server-http'],
      verticals: [],
    };
    const byModules = provision({ serves: [{ requires: ['pkg.go-modules'] }] });
    expect(servesStack(byModules, 'acme-go', goHttp)).toBe(true);
  });

  it('names a service either way when it declares both', () => {
    const both = provision({ stacks: ['acme-web'], serves: [SERVES_HTTP] });
    expect(servesStack(both, 'acme-api', API)).toBe(true);
    expect(servesStack(both, 'acme-web', WEB)).toBe(true);
  });

  it('names no service when it declares neither', () => {
    const neither = provision({});
    expect(servesStack(neither, 'acme-api', API)).toBe(false);
    expect(servesStack(neither, 'acme-web', WEB)).toBe(false);
  });
});

describe('Ctx.services', () => {
  const manifest = productRoot(PRODUCT);

  it('is empty on a Ctx built with no services', () => {
    const ctx = makeCtx(recording([]).adapters[0]!, {}, { manifest, ...ports });
    expect(ctx.services).toEqual([]);
  });

  it('holds the product’s services on each adapter an install at its root runs', async () => {
    const seen: Ctx[] = [];
    await installVertical({
      ...ports,
      vertical: recording(seen),
      manifest,
      tree: new FakeTree(),
      mode: 'non-interactive',
      prompt: rejectingPrompt,
      now: () => 'now',
      registry,
    });
    const services = productServices(registry, manifest);
    expect(seen.map((ctx) => ctx.services)).toEqual([services, services]);
  });

  it('holds them on the replay a re-render runs at the root', async () => {
    const seen: Ctx[] = [];
    await installVertical({
      ...ports,
      vertical: recording(seen),
      manifest,
      tree: new FakeTree(),
      mode: 'non-interactive',
      prompt: rejectingPrompt,
      now: () => 'now',
      registry,
      patchesOnto: new Set(['compose.yaml']),
    });
    const services = productServices(registry, manifest);
    expect(seen.map((ctx) => ctx.services)).toEqual([services, services]);
  });

  it('holds them on the contribution converge re-reads at the root', async () => {
    const seen: Ctx[] = [];
    const adapter = recording(seen).adapters[0]!;
    await recordedContribution(adapter, manifest, {
      ...ports,
      prompt: rejectingPrompt,
      registry,
    });
    expect(seen.map((ctx) => ctx.services)).toEqual([productServices(registry, manifest)]);
  });

  it('holds what its caller resolved on each adapter the applier runs, and none unless given', async () => {
    const seen: Ctx[] = [];
    const services = productServices(registry, manifest);
    const apply = (given?: typeof services) =>
      applyContributions({
        ...ports,
        adapters: recording(seen).adapters,
        answers: {},
        manifest,
        tree: new FakeTree(),
        ...(given === undefined ? {} : { services: given }),
      });
    await apply(services);
    await apply();
    expect(seen.map((ctx) => ctx.services)).toEqual([services, services, [], []]);
  });

  it('is empty on an install anywhere but a product root', async () => {
    const seen: Ctx[] = [];
    await installVertical({
      ...ports,
      vertical: recording(seen),
      manifest: productRoot([]),
      tree: new FakeTree(),
      mode: 'non-interactive',
      prompt: rejectingPrompt,
      now: () => 'now',
      registry,
    });
    expect(seen.map((ctx) => ctx.services)).toEqual([[], []]);
  });
});
