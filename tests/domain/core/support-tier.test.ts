/**
 * `supportOf` (`src/domain/core/support-tier.ts`): how far a source of
 * facts vouches for one dial cell. `tests/support-tier.test.ts` holds
 * keel's own facts to the e2e suites and the CI matrix, and
 * `tests/support-tier.premises.test.ts` the two proofs' premises to
 * keel's scaffolds; this holds each rule on facts small enough to read.
 *
 * **Scenario.** The `acme` family: a CLI, whose cells the cases name
 * on Gradle or Maven, a REST backend projecting `peer.api.rest`, an SPA
 * projecting `peer.ui.spa`, and two products pairing the SPA with a
 * backend, the gateway given to both services — `acme-shop` over the
 * REST backend and `acme-mall` over a second one, `acme-rest-2`. Each
 * case hands in the rows it is about.
 *
 * **Factory.** {@link sourceOf}: a `SupportSource` over the family and
 * the rows a case names, as the composition root will hand keel's own.
 *
 * **Port.** `supportOf`, and `supportFactsOf` for the document's shape.
 */

import { describe, expect, it } from 'vitest';
import type { Vertical } from '../../../src/domain/contract/composition.js';
import type { Stack, StackService } from '../../../src/domain/contract/stack.js';
import type {
  DialCell,
  ProductCell,
  SingleCell,
} from '../../../src/domain/contract/support-tier.js';
import {
  SHIPPED_SUPPORT_FACTS,
  supportFactsOf,
  supportOf,
  type ProductFact,
  type SingleFact,
  type SupportSource,
} from '../../../src/domain/core/support-tier.js';
import supportDocument from '../../../src/domain/core/support-tier.json' with { type: 'json' };

/* ---- Scenario ---------------------------------------------------- */

const GATEWAY: Vertical = {
  id: 'gateway',
  description: 'the gateway',
  dimensions: [],
  adapters: [],
};

function stack(id: string, extra: Partial<Stack> = {}): Stack {
  return { id, description: `the ${id} stack`, tags: [], verticals: [], ...extra };
}

function service(path: string, of: string, extraVerticals = [GATEWAY]): StackService {
  return { path, stack: of, extraVerticals };
}

const FAMILY: readonly Stack[] = [
  stack('acme-cli'),
  stack('acme-rest', { projects: ['peer.api.rest'] }),
  stack('acme-rest-2', { projects: ['peer.api.rest'] }),
  stack('acme-spa', { projects: ['peer.ui.spa'] }),
  stack('acme-shop', {
    services: [service('backend', 'acme-rest'), service('frontend', 'acme-spa')],
  }),
  stack('acme-mall', {
    services: [service('backend', 'acme-rest-2'), service('frontend', 'acme-spa')],
  }),
];

/** `acme-cli` on Gradle, the basic layout, no peer context, the harness on. */
const CLI: SingleCell = {
  kind: 'single',
  stack: 'acme-cli',
  buildSystem: 'gradle',
  moduleLayout: 'basic',
  peerContext: false,
  agentHarness: true,
};

function row(suite: string, cell: SingleCell): SingleFact {
  const { kind: _kind, ...dials } = cell;
  return { suite, ...dials };
}

function shop(buildSystem = 'backend=gradle,frontend=npm', stackId = 'acme-shop'): ProductCell {
  return { kind: 'product', stack: stackId, layout: 'monorepo', buildSystem };
}

function built(suite: string, cell: ProductCell, builds: [string, ...string[]]): ProductFact {
  const { kind: _kind, ...dials } = cell;
  return { suite, ...dials, builds };
}

/* ---- Factory ----------------------------------------------------- */

function sourceOf(
  facts: { singles?: readonly SingleFact[]; products?: readonly ProductFact[] },
  stacks: readonly Stack[] = FAMILY,
): SupportSource {
  return {
    facts: { singles: [...(facts.singles ?? [])], products: [...(facts.products ?? [])] },
    stacks,
  };
}

/* ---- Port -------------------------------------------------------- */

describe('supportOf, on a single-service cell', () => {
  it('is first-class by the suite whose row names the cell', () => {
    const source = sourceOf({ singles: [row('acme-skeleton', CLI)] });

    expect(supportOf(CLI, source)).toEqual({
      tier: 'first-class',
      proof: { by: 'suite', suite: 'acme-skeleton' },
      unbuilt: [],
    });
  });

  it('is best-effort, proven by nothing, where no row names it', () => {
    expect(supportOf(CLI, sourceOf({}))).toEqual({ tier: 'best-effort', proof: null, unbuilt: [] });
  });

  it.each<[string, SingleCell, Partial<SingleCell>]>([
    ['another stack', CLI, { stack: 'acme-rest' }],
    ['another build system', CLI, { buildSystem: 'maven' }],
    ['another module layout', CLI, { moduleLayout: 'modulith' }],
    // Each case moves one dial off the row, the peer context alone.
    ['the peer context', { ...CLI, moduleLayout: 'modulith' }, { peerContext: true }],
    [
      'no peer context',
      { ...CLI, moduleLayout: 'modulith', peerContext: true },
      { peerContext: false },
    ],
  ])('reads every dial: %s is another cell', (_, proven, moved) => {
    const source = sourceOf({ singles: [row('acme-skeleton', proven)] });

    expect(supportOf(proven, source)?.tier).toBe('first-class');
    expect(supportOf({ ...proven, ...moved }, source)?.tier).toBe('best-effort');
    expect(supportOf({ ...proven, ...moved, agentHarness: false }, source)?.tier).toBe(
      'best-effort',
    );
  });

  it('reads a cell without the harness as its twin with it (P1)', () => {
    const source = sourceOf({ singles: [row('acme-skeleton', CLI)] });

    expect(supportOf({ ...CLI, agentHarness: false }, source)).toEqual({
      tier: 'first-class',
      proof: { by: 'harness-twin', suite: 'acme-skeleton' },
      unbuilt: [],
    });
  });

  it('reads no twin the other way: a row without the harness proves only its own cell', () => {
    const source = sourceOf({ singles: [row('acme-bare', { ...CLI, agentHarness: false })] });

    expect(supportOf({ ...CLI, agentHarness: false }, source)?.proof).toEqual({
      by: 'suite',
      suite: 'acme-bare',
    });
    expect(supportOf(CLI, source)?.tier).toBe('best-effort');
  });

  it('reads the facts first: a row naming the cell wins over its twin', () => {
    const source = sourceOf({
      singles: [row('acme-skeleton', CLI), row('acme-bare', { ...CLI, agentHarness: false })],
    });

    expect(supportOf({ ...CLI, agentHarness: false }, source)?.proof).toEqual({
      by: 'suite',
      suite: 'acme-bare',
    });
  });
});

describe('supportOf, on a product cell', () => {
  it('is first-class where every service is built: on it, or as a service with its key (P2)', () => {
    const source = sourceOf({
      products: [
        built('acme-mall-e2e', shop('backend=gradle,frontend=npm', 'acme-mall'), ['frontend']),
        built('acme-shop-e2e', shop(), ['backend']),
      ],
    });

    expect(supportOf(shop(), source)).toEqual({
      tier: 'first-class',
      proof: { by: 'services', suites: { backend: 'acme-shop-e2e', frontend: 'acme-mall-e2e' } },
      unbuilt: [],
    });
  });

  it('names its own row’s suite before another product’s with the same service', () => {
    // The facts come first, then P2: an earlier row building the same
    // frontend on another product is only the proof where none is own.
    const source = sourceOf({
      products: [
        built('acme-mall-e2e', shop('backend=gradle,frontend=npm', 'acme-mall'), ['frontend']),
        built('acme-shop-e2e', shop(), ['backend', 'frontend']),
      ],
    });

    expect(supportOf(shop(), source)?.proof).toEqual({
      by: 'services',
      suites: { backend: 'acme-shop-e2e', frontend: 'acme-shop-e2e' },
    });
  });

  it('is best-effort where a service is built nowhere, and names it', () => {
    const source = sourceOf({ products: [built('acme-shop-e2e', shop(), ['backend'])] });

    expect(supportOf(shop(), source)).toEqual({
      tier: 'best-effort',
      proof: { by: 'services', suites: { backend: 'acme-shop-e2e' } },
      unbuilt: ['frontend'],
    });
  });

  it('is proven by nothing where no service is built', () => {
    expect(supportOf(shop(), sourceOf({}))).toEqual({
      tier: 'best-effort',
      proof: null,
      unbuilt: ['backend', 'frontend'],
    });
  });

  it.each<[string, ProductCell, readonly Stack[]]>([
    ['its build system', shop('backend=gradle,frontend=pnpm'), FAMILY],
    ['the repository layout', { ...shop(), layout: 'polyrepo' }, FAMILY],
    [
      'the extras the product gives it',
      shop(),
      FAMILY.map((s) =>
        s.id === 'acme-shop'
          ? {
              ...s,
              services: [service('backend', 'acme-rest'), service('frontend', 'acme-spa', [])],
            }
          : s,
      ),
    ],
    [
      'its own stack',
      shop(),
      [
        ...FAMILY.map((s) =>
          s.id === 'acme-shop'
            ? {
                ...s,
                services: [service('backend', 'acme-rest'), service('frontend', 'acme-spa-2')],
              }
            : s,
        ),
        stack('acme-spa-2', { projects: ['peer.ui.spa'] }),
      ],
    ],
    [
      "its siblings' projects",
      shop(),
      FAMILY.map((s) => (s.id === 'acme-rest' ? { ...s, projects: ['peer.api.grpc'] } : s)),
    ],
  ])('reads a service by its key: %s moves it', (_, cell, stacks) => {
    const mall = shop('backend=gradle,frontend=npm', 'acme-mall');
    const source = sourceOf({ products: [built('acme-mall-e2e', mall, ['frontend'])] }, stacks);

    expect(supportOf(cell, source)?.unbuilt).toContain('frontend');
  });

  it('reads build systems pair by pair, in any order', () => {
    const source = sourceOf({
      products: [built('acme-shop-e2e', shop('frontend=npm,backend=gradle'), ['backend'])],
    });

    expect(supportOf(shop(), source)?.proof).toEqual({
      by: 'services',
      suites: { backend: 'acme-shop-e2e' },
    });
  });
});

describe('supportOf, where it vouches for nothing', () => {
  it.each<[string, DialCell, readonly Stack[]]>([
    ['a stack the source does not vouch for', { ...CLI, stack: 'plugin-cli' }, FAMILY],
    ['a single-service cell of a product', { ...CLI, stack: 'acme-shop' }, FAMILY],
    ['a product cell of a single-service stack', shop('backend=gradle', 'acme-cli'), FAMILY],
    [
      'a product whose service is built from a stack it does not vouch for',
      shop(),
      FAMILY.filter((s) => s.id !== 'acme-rest'),
    ],
  ])('has no tier for %s', (_, cell, stacks) => {
    const source = sourceOf({ singles: [row('acme-skeleton', CLI)] }, stacks);

    expect(supportOf(cell, source)).toBeNull();
  });
});

describe('supportFactsOf', () => {
  it('reads the shipped document, its header dropped', () => {
    expect(supportFactsOf(supportDocument)).toEqual(SHIPPED_SUPPORT_FACTS);
    expect(Object.keys(SHIPPED_SUPPORT_FACTS)).toEqual(['singles', 'products']);
  });

  it.each<[string, unknown]>([
    [
      'a row that leaves a dial unsaid',
      { singles: [{ suite: 's', stack: 'acme-cli' }], products: [] },
    ],
    [
      'a dial it does not know',
      { singles: [{ ...row('s', CLI), buildsystem: 'maven' }], products: [] },
    ],
    [
      'a product row that builds nothing',
      { singles: [], products: [{ ...built('s', shop(), ['backend']), builds: [] }] },
    ],
  ])('refuses %s', (_, document) => {
    expect(() => supportFactsOf(document)).toThrow();
  });
});
