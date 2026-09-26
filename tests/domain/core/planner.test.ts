/**
 * The planner: whether a vertical can go on a scope, and in what order
 * a set of them installs, read from the declarations alone.
 *
 * **Scenario.** A fixture registry shaped the way a plugin's would be
 * — pieces written against the contract and nothing else, so what the
 * planner makes of them is what it makes of anyone's: a chain three
 * prerequisites deep, a provider whose promotion another vertical's
 * adapter excludes, two plugins supplying one capability, a vertical
 * that reads another, one whose adapters another's tag decides, a rule
 * a later vertical's tag breaks, one selected by peer tags alone, a
 * handful of stacks to be the nearest — and, apart, one placed at a
 * repository root, asked of a monorepo service.
 *
 * **Factory.** `registryOf`, the one door any piece comes in by.
 *
 * **Port.** The planner's pure functions.
 *
 * Then the shipped registry, recorded whole as a readiness golden —
 * the one reading the menus and both front doors share, so any change
 * to what a preset offers shows here as a diff to review.
 * Distribution's container adapters require the image containerization
 * builds, in their predicates: distribution reads `needs
 * containerization` on every HTTP stack, `iac` needs both in that
 * order, and on a composed Quarkus CLI + REST stack distribution alone
 * is `ready` — its native adapter. `KEEL_UPDATE_GOLDEN=1` rewrites it.
 */

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Adapter, Tag, Vertical } from '../../../src/domain/contract/composition.js';
import type { Readiness } from '../../../src/domain/contract/queries.js';
import type { Stack } from '../../../src/domain/contract/stack.js';
import {
  applies,
  defaultScope,
  plan,
  reachableAdapters,
  readiness,
  refreshProposals,
  seedFor,
  type PlanScope,
} from '../../../src/domain/core/planner.js';
import { pluginOrigin, registryOf, shippedRegistry } from '../../../src/domain/core/registry.js';
import { stackTagsFor } from '../../../src/domain/core/stacks.js';

/* ---- Scenario ---------------------------------------------------- */

/** One adapter covering `only`, matched by `requires` (and `excludes`). */
function adapter(
  vertical: string,
  requires: readonly Tag[],
  extra: Partial<Pick<Adapter, 'promotes' | 'predicate'>> & { readonly name?: string } = {},
): Adapter {
  const { name, ...rest } = extra;
  return {
    id: `${vertical}/${name ?? 'main'}`,
    vertical,
    covers: ['only'],
    predicate: { requires },
    contribute: () => ({}),
    ...rest,
  };
}

/** A one-dimension vertical over `adapters`, promoting their union. */
function vertical(
  id: string,
  adapters: readonly Adapter[],
  extra: Partial<
    Pick<Vertical, 'promotes' | 'reads' | 'dimensions' | 'conflicts' | 'placement'>
  > = {},
): Vertical {
  return { id, description: `the ${id} vertical`, dimensions: ['only'], adapters, ...extra };
}

/** A three-deep chain: image → release → deploy → monitor, and one past the bound. */
const image = vertical('acme-image', [adapter('acme-image', ['lang.acme'])], {
  // No adapter-level `promotes`: the union is what it is read as.
  promotes: ['acme.image'],
});
const release = vertical(
  'acme-release',
  [adapter('acme-release', ['acme.image'], { promotes: ['acme.release'] })],
  // Reads what needs it: the hard edge wins over the soft one.
  { promotes: ['acme.release'], reads: ['acme-deploy'] },
);
const deploy = vertical(
  'acme-deploy',
  [adapter('acme-deploy', ['acme.release'], { promotes: ['acme.deploy'] })],
  { promotes: ['acme.deploy'] },
);
const monitor = vertical(
  'acme-monitor',
  [adapter('acme-monitor', ['acme.deploy'], { promotes: ['acme.monitor'] })],
  { promotes: ['acme.monitor'] },
);
const audit = vertical('acme-audit', [adapter('acme-audit', ['acme.monitor'])]);

/** Two bundles, one of them fat — and a signer that will not sign a fat one. */
const bundleFat = vertical(
  'acme-bundle-fat',
  [adapter('acme-bundle-fat', ['lang.acme'], { promotes: ['acme.bundle', 'acme.fat'] })],
  { promotes: ['acme.bundle', 'acme.fat'] },
);
const bundleSlim = vertical(
  'acme-bundle-slim',
  [adapter('acme-bundle-slim', ['lang.acme'], { promotes: ['acme.bundle'] })],
  { promotes: ['acme.bundle'] },
);
const sign = vertical('acme-sign', [
  adapter('acme-sign', [], { predicate: { requires: ['acme.bundle'], excludes: ['acme.fat'] } }),
]);

/** Two plugins' caches, and a session store either one would serve. */
const redis = vertical('redis-cache', [adapter('redis-cache', ['lang.acme'])], {
  promotes: ['acme.cache'],
});
const memcached = vertical('memcached-cache', [adapter('memcached-cache', ['lang.acme'])], {
  promotes: ['acme.cache'],
});
const session = vertical('acme-session', [adapter('acme-session', ['acme.cache'])]);

/** A database, and a publisher whose output reads whether it is there. */
const database = vertical('acme-db', [adapter('acme-db', ['lang.acme'])]);
const publish = vertical('acme-publish', [adapter('acme-publish', ['lang.acme'])], {
  reads: ['acme-db', 'acme-not-installed'],
});

/**
 * A report that renders richer where the enricher has run — its
 * second adapter requires the enricher's tag — and an enricher that
 * reads whether a report is there: a hard edge one way, a soft one
 * the other.
 */
const enrich = vertical('acme-enrich', [adapter('acme-enrich', ['lang.acme'])], {
  promotes: ['acme.enriched'],
  reads: ['acme-report'],
});
const report = vertical('acme-report', [
  adapter('acme-report', ['lang.acme'], { name: 'plain' }),
  adapter('acme-report', ['lang.acme', 'acme.enriched'], { name: 'enriched' }),
]);

/** A vertical whose own rule a tag another vertical promotes breaks. */
const strict = vertical('acme-strict', [adapter('acme-strict', ['lang.acme'])], {
  conflicts: [
    { id: 'acme-strict/not-loose', when: ['acme.loose'], reason: 'strict will not run loose' },
  ],
});
const loosen = vertical('acme-loosen', [adapter('acme-loosen', ['lang.acme'])], {
  promotes: ['acme.loose'],
});

/** Metrics for an HTTP service, in two languages. */
const metrics = vertical('acme-metrics', [
  adapter('acme-metrics', ['lang.acme', 'arch.server-http'], { name: 'acme' }),
  adapter('acme-metrics', ['lang.beta', 'arch.server-http'], { name: 'beta' }),
]);

/** Selected by a peer's tag alone, like `gateway`. */
const bridge = vertical('acme-bridge', [adapter('acme-bridge', ['lang.acme', 'peer.acme.api'])], {
  dimensions: [],
});

/** A vertical whose own rule the flat layout breaks. */
const modules = vertical('acme-modules', [adapter('acme-modules', ['lang.acme'])], {
  conflicts: [
    {
      id: 'acme-modules/needs-modulith',
      when: ['layout.basic'],
      reason: 'modules need the modulith',
    },
  ],
});

const stack = (id: string, tags: readonly Tag[], verticals: readonly Vertical[] = []): Stack => ({
  id,
  description: `the ${id} stack`,
  tags,
  verticals,
});

const ACME_TAGS: readonly Tag[] = ['lang.acme', 'framework.zeta', 'arch.hexagonal'];

const STACKS: readonly Stack[] = [
  stack('acme-cli', [...ACME_TAGS, 'arch.cli']),
  stack('acme-http', [...ACME_TAGS, 'arch.server-http']),
  stack('acme-cli-http', [...ACME_TAGS, 'arch.cli', 'arch.server-http']),
  stack('beta-http', ['lang.beta', 'arch.hexagonal', 'arch.server-http']),
  stack('gamma-http', ['lang.gamma', 'arch.hexagonal', 'arch.server-http']),
];

/* ---- Factory ----------------------------------------------------- */

const registry = registryOf([
  {
    origin: pluginOrigin('acme'),
    stacks: STACKS,
    verticals: [
      image,
      release,
      deploy,
      monitor,
      audit,
      bundleFat,
      bundleSlim,
      sign,
      redis,
      session,
      database,
      publish,
      enrich,
      report,
      strict,
      loosen,
      metrics,
      bridge,
      modules,
    ],
  },
  // A second plugin supplying the same capability as the first.
  { origin: pluginOrigin('other'), verticals: [memcached] },
]);

const on = (tags: readonly Tag[], installed: readonly string[] = []): PlanScope => ({
  tags,
  installed,
});

const ACME = on([...ACME_TAGS, 'arch.server-http']);

/* ---- Tests ------------------------------------------------------- */

describe('readiness', () => {
  it('reads a vertical the scope has as included, whatever it would take', () => {
    expect(readiness(registry, on(ACME.tags, ['acme-monitor']), 'acme-monitor')).toEqual({
      kind: 'included',
    });
  });

  it('reads one that installs alone as ready', () => {
    expect(readiness(registry, ACME, 'acme-image')).toEqual({ kind: 'ready' });
  });

  it('chains prerequisites three deep, in the order they install', () => {
    expect(readiness(registry, ACME, 'acme-monitor')).toEqual({
      kind: 'needs',
      prerequisites: ['acme-image', 'acme-release', 'acme-deploy'],
    });
  });

  it('stops at the bound: a fourth prerequisite makes a vertical unavailable', () => {
    expect(readiness(registry, ACME, 'acme-audit').kind).toBe('unavailable');
  });

  it('never picks a provider whose promotion the vertical excludes', () => {
    // The fat bundle comes first in the registry and supplies the
    // bundle too — and would leave the signer's only adapter ruled out.
    expect(readiness(registry, ACME, 'acme-sign')).toEqual({
      kind: 'needs',
      prerequisites: ['acme-bundle-slim'],
    });
  });

  it('reads a vertical whose adapters the scope excludes as unavailable, with nothing to add', () => {
    expect(readiness(registry, on([...ACME.tags, 'acme.bundle', 'acme.fat']), 'acme-sign')).toEqual(
      {
        kind: 'unavailable',
        // Nothing to add, and the nearest stack that carries it is this
        // one's preset without the fat bundle on it.
        gap: { entrypoint: [], peer: [], identity: [], rules: [], nearestStacks: ['acme-http'] },
      },
    );
  });

  it('reports every equally small closure when two plugins supply one capability', () => {
    expect(readiness(registry, ACME, 'acme-session')).toEqual({
      kind: 'needs',
      prerequisites: ['redis-cache'],
      alternatives: [['memcached-cache']],
    });
  });

  it('splits an entrypoint gap off, naming the nearest stacks that carry it', () => {
    expect(readiness(registry, on([...ACME_TAGS, 'arch.cli']), 'acme-metrics')).toEqual({
      kind: 'unavailable',
      gap: {
        entrypoint: ['arch.server-http'],
        peer: [],
        identity: [],
        rules: [],
        // Same language and framework, one entrypoint apart — not
        // acme-http, which drops the CLI as well.
        nearestStacks: ['acme-cli-http'],
      },
    });
  });

  it('calls a gap no install can close identity, and looks past the language for a carrier', () => {
    const gamma = on(['lang.gamma', 'arch.hexagonal', 'arch.server-http']);
    expect(readiness(registry, gamma, 'acme-metrics')).toEqual({
      kind: 'unavailable',
      gap: {
        entrypoint: [],
        peer: [],
        identity: ['lang.acme'],
        rules: [],
        nearestStacks: ['beta-http'],
      },
    });
  });

  it('names a stack of the same language and framework before a nearer one of another', () => {
    // By identity tags alone the Beta stack is nearer (five apart,
    // against six): it shares the CLI, the build and the layout.
    const served = vertical('acme-served', [adapter('acme-served', ['arch.server-http'])]);
    const kin = registryOf([
      {
        origin: pluginOrigin('kin'),
        stacks: [
          stack('beta-cli-http', [
            'lang.beta',
            'framework.eta',
            'arch.cli',
            'arch.server-http',
            'pkg.two',
            'layout.two',
          ]),
          stack('acme-http', [
            'lang.acme',
            'framework.zeta',
            'arch.server-http',
            'pkg.one',
            'layout.one',
          ]),
        ],
        verticals: [served],
      },
    ]);
    const here = on(['lang.acme', 'framework.zeta', 'arch.cli', 'pkg.two', 'layout.two']);
    expect(readiness(kin, here, 'acme-served')).toEqual({
      kind: 'unavailable',
      gap: {
        entrypoint: ['arch.server-http'],
        peer: [],
        identity: [],
        rules: [],
        nearestStacks: ['acme-http'],
      },
    });
  });

  it('traces a capability another vertical adds back to what that vertical lacks', () => {
    // The session store needs a cache; on a CLI in another language no
    // cache installs, and the reason is the language, not the cache.
    const gap = readiness(registry, on(['lang.gamma', 'arch.cli']), 'acme-session');
    expect(gap).toMatchObject({ kind: 'unavailable', gap: { identity: ['lang.acme'] } });
  });

  it('takes the adapter nearest by what no install adds, before counting every unmet tag', () => {
    // Two ways to ship: one for another language and build, one needing
    // the HTTP entrypoint and an image some vertical builds. Counted
    // plainly they tie, and the first listed would make the gap a
    // language; what an install can add is not what keeps it away.
    const imaging = vertical(
      'acme-imaging',
      [adapter('acme-imaging', ['arch.server-http'], { promotes: ['acme.image'] })],
      { promotes: ['acme.image'] },
    );
    const shipping = vertical('acme-shipping', [
      adapter('acme-shipping', ['lang.beta', 'pkg.two'], { name: 'native' }),
      adapter('acme-shipping', ['arch.server-http', 'acme.image'], { name: 'image' }),
    ]);
    const local = registryOf([
      {
        origin: pluginOrigin('ship'),
        stacks: [stack('acme-http', [...ACME_TAGS, 'arch.server-http'])],
        verticals: [imaging, shipping],
      },
    ]);
    expect(readiness(local, on([...ACME_TAGS, 'arch.cli']), 'acme-shipping')).toEqual({
      kind: 'unavailable',
      gap: {
        entrypoint: ['arch.server-http'],
        peer: [],
        identity: [],
        rules: [],
        nearestStacks: ['acme-http'],
      },
    });
  });

  it('prefers a missing entrypoint to a foreign framework when each is one tag away', () => {
    // A native adapter for another framework, and an image one needing
    // the HTTP entrypoint and an image some vertical builds. Each lacks
    // one tag no install adds, so that count ties; but the framework is
    // the project itself, while the entrypoint is what a sibling preset
    // has — the gap a user can do something about.
    const imaging = vertical(
      'acme-imaging',
      [adapter('acme-imaging', ['arch.server-http'], { promotes: ['acme.image'] })],
      { promotes: ['acme.image'] },
    );
    const shipping = vertical('acme-shipping', [
      adapter('acme-shipping', ['framework.other'], { name: 'native' }),
      adapter('acme-shipping', ['arch.server-http', 'acme.image'], { name: 'image' }),
    ]);
    const local = registryOf([
      {
        origin: pluginOrigin('ship'),
        stacks: [stack('acme-http', [...ACME_TAGS, 'arch.server-http'])],
        verticals: [imaging, shipping],
      },
    ]);
    expect(readiness(local, on([...ACME_TAGS, 'arch.cli']), 'acme-shipping')).toMatchObject({
      kind: 'unavailable',
      gap: { entrypoint: ['arch.server-http'], identity: [] },
    });
  });

  it('applies a vertical with no dimensions only where some adapter matches', () => {
    expect(applies(bridge, ACME.tags)).toBe(false);
    expect(readiness(registry, ACME, 'acme-bridge')).toMatchObject({
      kind: 'unavailable',
      gap: { entrypoint: [], peer: ['peer.acme.api'], identity: [] },
    });
    expect(readiness(registry, on([...ACME.tags, 'peer.acme.api']), 'acme-bridge')).toEqual({
      kind: 'ready',
    });
  });

  it('names the vertical s own rule the scope breaks', () => {
    expect(readiness(registry, on([...ACME.tags, 'layout.basic']), 'acme-modules')).toMatchObject({
      kind: 'unavailable',
      gap: { rules: ['acme-modules/needs-modulith'] },
    });
  });

  it('refuses an id the registry does not have, as the caller s bug', () => {
    expect(() => readiness(registry, ACME, 'nothing')).toThrow("no vertical 'nothing'");
  });
});

describe('plan', () => {
  it('closes a request over its prerequisites, saying which vertical each is for', () => {
    expect(plan(registry, ACME, ['acme-monitor'])).toEqual({
      kind: 'planned',
      order: [
        { id: 'acme-image', reason: { neededBy: ['acme-release'] } },
        { id: 'acme-release', reason: { neededBy: ['acme-deploy'] } },
        { id: 'acme-deploy', reason: { neededBy: ['acme-monitor'] } },
        { id: 'acme-monitor', reason: 'requested' },
      ],
      included: [],
    });
  });

  it('gives the same order however the request is spelled', () => {
    const ids = (requested: readonly string[]) => {
      const planned = plan(registry, ACME, requested);
      return planned.kind === 'planned' ? planned.order.map((step) => step.id) : planned;
    };
    const expected = ['acme-image', 'acme-release', 'acme-deploy', 'acme-monitor'];
    expect(ids(['acme-deploy', 'acme-image', 'acme-monitor', 'acme-release'])).toEqual(expected);
    expect(ids(['acme-monitor', 'acme-release', 'acme-deploy', 'acme-image'])).toEqual(expected);
  });

  it('orders what it adds as it orders the same set named whole', () => {
    // A prerequisite the request left out lands where its id puts it,
    // as it would named: planning what a plan settled on plans it again,
    // unchanged — `keel.dials` is a fixed point, and a manifest records
    // one order however the set was asked for.
    const order = (scope: PlanScope, requested: readonly string[]) => {
      const planned = plan(shippedRegistry, scope, [...requested].sort());
      return planned.kind === 'planned' ? planned.order.map((step) => step.id) : null;
    };
    const singles = shippedRegistry.stacks().filter((stack) => stack.services === undefined);
    const requests = [
      ...shippedRegistry.verticals().map((vertical) => [vertical.id]),
      ['ci', 'distribution', 'persistence'],
      ['ci', 'iac'],
    ];
    let settled = 0;
    for (const stack of singles) {
      const scope = defaultScope(stack);
      for (const requested of requests) {
        if (requested.some((id) => scope.installed.includes(id))) continue;
        const first = order(scope, requested);
        if (first === null || first.length === requested.length) continue;
        expect(order(scope, first), `${stack.id} ${requested.join(',')}`).toEqual(first);
        settled++;
      }
    }
    expect(settled).toBeGreaterThan(20);
  });

  it('installs a reader after what it reads, and ignores a read of something absent', () => {
    const order = (requested: readonly string[]) => {
      const planned = plan(registry, ACME, requested);
      return planned.kind === 'planned' ? planned.order.map((step) => step.id) : planned;
    };
    expect(order(['acme-publish', 'acme-db'])).toEqual(['acme-db', 'acme-publish']);
    expect(order(['acme-db', 'acme-publish'])).toEqual(['acme-db', 'acme-publish']);
    expect(order(['acme-publish'])).toEqual(['acme-publish']);
  });

  it('puts what decides a vertical s adapters before it, over a read the other way', () => {
    // Either order installs; only enricher-first runs the report's
    // enriched adapter. The edge wins over the enricher's read.
    const order = (requested: readonly string[]) => {
      const planned = plan(registry, ACME, requested);
      return planned.kind === 'planned' ? planned.order.map((step) => step.id) : planned;
    };
    expect(order(['acme-report', 'acme-enrich'])).toEqual(['acme-enrich', 'acme-report']);
    expect(order(['acme-enrich', 'acme-report'])).toEqual(['acme-enrich', 'acme-report']);
  });

  it('holds what a plan adds to the rules of what the scope has installed', () => {
    const guarded: PlanScope = {
      tags: ACME.tags,
      installed: ['acme-strict'],
      rules: strict.conflicts ?? [],
    };
    expect(readiness(registry, ACME, 'acme-loosen')).toEqual({ kind: 'ready' });
    const ready = readiness(registry, guarded, 'acme-loosen');
    expect(ready.kind).toBe('unavailable');
    expect(ready.kind === 'unavailable' ? ready.gap.rules : null).toEqual([
      'acme-strict/not-loose',
    ]);
    expect(plan(registry, guarded, ['acme-loosen'])).toMatchObject({
      kind: 'unavailable',
      vertical: 'acme-loosen',
    });
    // A rule the scope breaks already is the scope's to answer for, not
    // what comes next: the menu over a broken assembly still answers.
    const broken: PlanScope = { ...guarded, tags: [...ACME.tags, 'acme.loose'] };
    expect(readiness(registry, broken, 'acme-image')).toEqual({ kind: 'ready' });
  });

  it('takes back a step whose tags break a rule of a vertical placed before it', () => {
    expect(readiness(registry, ACME, 'acme-strict')).toEqual({ kind: 'ready' });
    expect(plan(registry, ACME, ['acme-strict', 'acme-loosen'])).toEqual({
      kind: 'incompatible',
      verticals: ['acme-strict', 'acme-loosen'],
    });
  });

  it('bounds the prerequisites per vertical, not per request', () => {
    // Three for the chain and one for the signer: four in all, and
    // no vertical needing more than three. What nothing ties together
    // goes in by id, added or named.
    expect(plan(registry, ACME, ['acme-monitor', 'acme-sign'])).toEqual({
      kind: 'planned',
      order: [
        { id: 'acme-bundle-slim', reason: { neededBy: ['acme-sign'] } },
        { id: 'acme-image', reason: { neededBy: ['acme-release'] } },
        { id: 'acme-sign', reason: 'requested' },
        { id: 'acme-release', reason: { neededBy: ['acme-deploy'] } },
        { id: 'acme-deploy', reason: { neededBy: ['acme-monitor'] } },
        { id: 'acme-monitor', reason: 'requested' },
      ],
      included: [],
    });
  });

  it('keeps a tie past the bound, unless the request settles it', () => {
    expect(plan(registry, ACME, ['acme-monitor', 'acme-sign', 'acme-session'])).toEqual({
      kind: 'tied',
      closures: [['redis-cache'], ['memcached-cache']],
    });
    const settled = plan(registry, ACME, [
      'acme-monitor',
      'acme-sign',
      'acme-session',
      'memcached-cache',
    ]);
    expect(settled.kind === 'planned' && settled.order.map((step) => step.id)).not.toContain(
      'redis-cache',
    );
    expect(settled).toMatchObject({ kind: 'planned' });
  });

  it('refuses a tie rather than choosing a plugin', () => {
    expect(plan(registry, ACME, ['acme-session'])).toEqual({
      kind: 'tied',
      closures: [['redis-cache'], ['memcached-cache']],
    });
  });

  it('plans the tie the user settled by naming a provider', () => {
    expect(plan(registry, ACME, ['acme-session', 'memcached-cache'])).toMatchObject({
      kind: 'planned',
      order: [{ id: 'memcached-cache' }, { id: 'acme-session' }],
    });
  });

  it('refuses two verticals no order installs together, though each plans alone', () => {
    // The signer can only go before the fat bundle, and the fat
    // bundle's tag then rules its adapter out after the fact.
    expect(plan(registry, ACME, ['acme-bundle-fat', 'acme-sign'])).toEqual({
      kind: 'incompatible',
      verticals: ['acme-bundle-fat', 'acme-sign'],
    });
  });

  it('names the first vertical nothing makes installable, with its gap', () => {
    const cli = on([...ACME_TAGS, 'arch.cli']);
    expect(plan(registry, cli, ['acme-image', 'acme-metrics'])).toMatchObject({
      kind: 'unavailable',
      vertical: 'acme-metrics',
      gap: { entrypoint: ['arch.server-http'] },
    });
  });

  it('leaves what the scope has out of the order, and plans an id named twice once', () => {
    expect(
      plan(registry, on([...ACME.tags, 'acme.image'], ['acme-image']), [
        'acme-image',
        'acme-release',
        'acme-release',
      ]),
    ).toEqual({
      kind: 'planned',
      order: [{ id: 'acme-release', reason: 'requested' }],
      included: ['acme-image'],
    });
  });

  it('names an id the registry does not have', () => {
    expect(plan(registry, ACME, ['acme-image', 'nothing'])).toEqual({
      kind: 'unknown',
      vertical: 'nothing',
    });
  });
});

describe('placement in a monorepo service', () => {
  // A pipeline read only at a repository root, which ships the image
  // another vertical builds, and a deployer needing what it ships —
  // `distribution` between `containerization` and `iac`, as a plugin
  // would declare them.
  const pipeline = vertical(
    'acme-pipeline',
    [adapter('acme-pipeline', ['acme.image'], { promotes: ['acme.shipped'] })],
    {
      promotes: ['acme.shipped'],
      placement: { scope: 'repository', because: 'a provider reads it at the root only' },
    },
  );
  const deployer = vertical('acme-deployer', [adapter('acme-deployer', ['acme.shipped'])]);
  const placed = registryOf([
    { origin: pluginOrigin('acme'), verticals: [image, pipeline, deployer, database] },
  ]);
  /** A service of a monorepo product that gave it the image. */
  const member: PlanScope = {
    tags: ACME.tags,
    installed: ['acme-image'],
    member: { provided: ['acme-image'] },
  };

  it('reads a vertical whose place is a repository root as not for the service, naming it', () => {
    const unavailable = { kind: 'unavailable', vertical: 'acme-pipeline' };
    const gap = {
      entrypoint: [],
      peer: [],
      identity: [],
      rules: [],
      nearestStacks: [],
      repositoryOnly: ['acme-pipeline'],
    };
    expect(readiness(placed, member, 'acme-pipeline')).toEqual({ kind: 'unavailable', gap });
    expect(plan(placed, member, ['acme-db', 'acme-pipeline'])).toEqual({ ...unavailable, gap });
    // A repository of its own takes it, once it has the image.
    expect(readiness(placed, on(ACME.tags), 'acme-pipeline')).toEqual({
      kind: 'needs',
      prerequisites: ['acme-image'],
    });
  });

  it('reads one that needs it as unavailable for the same reason, not as a gap of tags', () => {
    // Planned as a repository of its own — without the image the
    // product gave it, which carries no tag here — it would come with
    // the pipeline: that, and only that, is what stops it.
    expect(readiness(placed, member, 'acme-deployer')).toEqual({
      kind: 'unavailable',
      gap: {
        entrypoint: [],
        peer: [],
        identity: [],
        rules: [],
        nearestStacks: [],
        repositoryOnly: ['acme-pipeline'],
      },
    });
    expect(readiness(placed, on(ACME.tags), 'acme-deployer')).toEqual({
      kind: 'needs',
      prerequisites: ['acme-image', 'acme-pipeline'],
    });
    // Nor is it brought in as a prerequisite where it would match: a
    // service whose image carries its tag still cannot take the
    // pipeline, so nothing makes the deployer installable there.
    const tagged: PlanScope = { ...member, tags: [...ACME.tags, 'acme.image'] };
    expect(readiness(placed, tagged, 'acme-deployer')).toMatchObject({
      kind: 'unavailable',
      gap: { repositoryOnly: ['acme-pipeline'] },
    });
    expect(plan(placed, tagged, ['acme-deployer'])).toMatchObject({ kind: 'unavailable' });
  });

  it('reads what the product gives as there already, and plans the rest as anywhere', () => {
    expect(readiness(placed, member, 'acme-image')).toEqual({ kind: 'included' });
    expect(readiness(placed, member, 'acme-db')).toEqual({ kind: 'ready' });
  });
});

describe('an entrypoint the project could grow', () => {
  // What adding HTTP serves, what reads it, and what needs a link too:
  // an HTTP service's metrics, a dashboard over them, and a bridge that
  // wires a linked project into the server.
  const serve = vertical(
    'acme-serve',
    [adapter('acme-serve', ['lang.acme', 'arch.server-http'], { promotes: ['acme.served'] })],
    { promotes: ['acme.served'] },
  );
  const dash = vertical('acme-dash', [adapter('acme-dash', ['acme.served'])]);
  const wire = vertical('acme-wire', [
    adapter('acme-wire', ['lang.acme', 'arch.server-http', 'peer.acme.api']),
  ]);
  const flat = vertical('acme-flat', [adapter('acme-flat', ['lang.acme', 'arch.server-http'])], {
    conflicts: [
      {
        id: 'acme-flat/one-way-in',
        when: ['arch.cli', 'arch.server-http'],
        reason: 'flat takes one way in',
      },
    ],
  });
  // The bridge again, with the flat rule: the grown project lacks its
  // link and breaks the rule.
  const flatWire = vertical(
    'acme-flatwire',
    [adapter('acme-flatwire', ['lang.acme', 'arch.server-http', 'peer.acme.api'])],
    {
      conflicts: [
        {
          id: 'acme-flatwire/one-way-in',
          when: ['arch.cli', 'arch.server-http'],
          reason: 'flat takes one way in',
        },
      ],
    },
  );
  const layered = vertical(
    'acme-layered',
    [adapter('acme-layered', ['lang.acme', 'arch.server-http'])],
    {
      conflicts: [
        { id: 'acme-layered/no-flat', when: ['layout.basic'], reason: 'layered needs layers' },
      ],
    },
  );
  const local = registryOf([
    {
      origin: pluginOrigin('grow'),
      stacks: STACKS,
      verticals: [serve, dash, wire, flatWire, flat, layered, metrics],
    },
  ]);
  const CLI: readonly Tag[] = [...ACME_TAGS, 'arch.cli'];
  const HTTP: readonly Tag[] = [...CLI, 'arch.server-http'];
  /** The CLI project, and the same with HTTP grown — which installs `installed` too. */
  const growing = (installed: readonly string[] = []): PlanScope => ({
    ...on(CLI),
    grown: [{ entrypoint: 'arch.server-http', scope: on(HTTP, installed) }],
  });
  const gapOf = (scope: PlanScope, id: string, of = local) => {
    const ready = readiness(of, scope, id);
    if (ready.kind !== 'unavailable') throw new Error(`${id} is ${ready.kind}`);
    return ready.gap;
  };

  it('names the entrypoint whose addition lets it install, by the word the command takes', () => {
    expect(gapOf(growing(), 'acme-serve')).toEqual({
      entrypoint: ['arch.server-http'],
      peer: [],
      identity: [],
      rules: [],
      nearestStacks: ['acme-cli-http'],
      grow: { entrypoint: 'http', comes: false },
    });
  });

  it('says it comes with the entrypoint where growing installs it', () => {
    expect(gapOf(growing(['acme-serve']), 'acme-serve').grow).toEqual({
      entrypoint: 'http',
      comes: true,
    });
  });

  it('offers it where the vertical then needs another first, which its own add installs', () => {
    // Traced back, what stops the dashboard is the server its supplier needs.
    expect(gapOf(growing(), 'acme-dash')).toMatchObject({
      entrypoint: ['arch.server-http'],
      identity: [],
      grow: { entrypoint: 'http', comes: false },
    });
  });

  it('offers it beside a link, where the link is all the grown project still lacks', () => {
    expect(gapOf(growing(), 'acme-wire')).toMatchObject({
      entrypoint: ['arch.server-http'],
      peer: ['peer.acme.api'],
      grow: { entrypoint: 'http', comes: false },
    });
  });

  it('offers nothing where growing leaves it refused for another reason', () => {
    // The grown project breaks the vertical's own rule, which the CLI
    // project does not: the gap is the entrypoint alone, and no action.
    expect(gapOf(growing(), 'acme-flat')).toMatchObject({
      entrypoint: ['arch.server-http'],
      identity: [],
      rules: [],
    });
    expect(gapOf(growing(), 'acme-flat')).not.toHaveProperty('grow');
    expect(gapOf(on(HTTP), 'acme-flat')).toMatchObject({ rules: ['acme-flat/one-way-in'] });
  });

  it('offers nothing beside a link where the grown project would break a rule as well', () => {
    // Linking would not let it in: the link is not all it still lacks.
    expect(gapOf(growing(), 'acme-flatwire')).toMatchObject({
      entrypoint: ['arch.server-http'],
      peer: ['peer.acme.api'],
      rules: [],
    });
    expect(gapOf(growing(), 'acme-flatwire')).not.toHaveProperty('grow');
    expect(gapOf(on(HTTP), 'acme-flatwire')).toMatchObject({
      peer: ['peer.acme.api'],
      rules: ['acme-flatwire/one-way-in'],
    });
  });

  it('offers nothing where the grown project lacks a link the gap never named', () => {
    // On the CLI the plain adapter lacks the server alone; once grown,
    // what serving promotes excludes it, and the wired one lacks a link
    // — which a refusal naming no linked project would never mention.
    const shy = vertical('acme-shy', [
      adapter('acme-shy', [], {
        name: 'plain',
        predicate: { requires: ['lang.acme', 'arch.server-http'], excludes: ['acme.served'] },
      }),
      adapter('acme-shy', ['lang.acme', 'arch.server-http', 'peer.acme.api'], { name: 'wired' }),
    ]);
    const of = registryOf([
      { origin: pluginOrigin('shy'), stacks: STACKS, verticals: [serve, shy] },
    ]);
    const served = on([...HTTP, 'acme.served'], ['acme-serve']);
    const scope: PlanScope = {
      ...on(CLI),
      grown: [{ entrypoint: 'arch.server-http', scope: served }],
    };
    expect(gapOf(served, 'acme-shy', of)).toMatchObject({
      entrypoint: [],
      peer: ['peer.acme.api'],
      identity: [],
      rules: [],
    });
    expect(gapOf(scope, 'acme-shy', of)).toMatchObject({
      entrypoint: ['arch.server-http'],
      peer: [],
    });
    expect(gapOf(scope, 'acme-shy', of)).not.toHaveProperty('grow');
  });

  it('offers nothing but where the scope says the project can grow, and that entrypoint', () => {
    // Before `keel new` writes anything, a preset is chosen instead.
    expect(gapOf(on(CLI), 'acme-serve')).not.toHaveProperty('grow');
    const other: PlanScope = {
      ...on(CLI),
      grown: [{ entrypoint: 'arch.cli', scope: on(HTTP) }],
    };
    expect(gapOf(other, 'acme-serve')).not.toHaveProperty('grow');
  });

  it('offers nothing where the gap is not an entrypoint alone: another language, a rule, a link alone', () => {
    // Growing adds the entrypoint and changes nothing else, so a gap
    // naming more is never read again — even over a grown scope that
    // would take the vertical.
    const beta: PlanScope = {
      ...on(['lang.beta', 'arch.hexagonal', 'arch.cli']),
      grown: [{ entrypoint: 'arch.server-http', scope: on(HTTP) }],
    };
    expect(readiness(local, on(HTTP), 'acme-serve')).toEqual({ kind: 'ready' });
    expect(gapOf(beta, 'acme-serve')).toMatchObject({ identity: ['lang.acme'] });
    expect(gapOf(beta, 'acme-serve')).not.toHaveProperty('grow');
    const flatCli: PlanScope = {
      ...on([...CLI, 'layout.basic']),
      grown: [{ entrypoint: 'arch.server-http', scope: on(HTTP) }],
    };
    expect(readiness(local, on(HTTP), 'acme-layered')).toEqual({ kind: 'ready' });
    expect(gapOf(flatCli, 'acme-layered')).toMatchObject({
      entrypoint: ['arch.server-http'],
      rules: ['acme-layered/no-flat'],
    });
    expect(gapOf(flatCli, 'acme-layered')).not.toHaveProperty('grow');
    const http: PlanScope = { ...on(HTTP), grown: [] };
    expect(gapOf(http, 'acme-wire')).toMatchObject({ entrypoint: [], peer: ['peer.acme.api'] });
    expect(gapOf(http, 'acme-wire')).not.toHaveProperty('grow');
  });

  it('carries it on the plan a front door refuses with, too', () => {
    expect(plan(local, growing(), ['acme-serve'])).toMatchObject({
      kind: 'unavailable',
      vertical: 'acme-serve',
      gap: { grow: { entrypoint: 'http', comes: false } },
    });
  });
});

describe('refreshProposals', () => {
  const tags = [...ACME_TAGS, 'arch.server-http'];

  it('proposes an installed vertical that reads one the run installed', () => {
    expect(
      refreshProposals(registry, ['acme-publish', 'acme-image'], ['acme-db'], tags, tags),
    ).toEqual([{ vertical: 'acme-publish', reads: ['acme-db'] }]);
  });

  it('proposes one whose adapters the tags the run leaves resolve differently', () => {
    expect(
      refreshProposals(registry, ['acme-report'], ['acme-enrich'], tags, [
        ...tags,
        'acme.enriched',
      ]),
    ).toEqual([
      {
        vertical: 'acme-report',
        reads: [],
        adapters: {
          before: ['acme-report/plain'],
          after: ['acme-report/plain', 'acme-report/enriched'],
        },
      },
    ]);
  });

  it('passes over the run itself, and an installed id the registry does not know', () => {
    expect(
      refreshProposals(
        registry,
        ['acme-enrich', 'product-glue', 'acme-image'],
        ['acme-enrich'],
        tags,
        [...tags, 'acme.enriched'],
      ),
    ).toEqual([]);
  });

  it('says both when both hold', () => {
    const reader = vertical(
      'acme-digest',
      [
        adapter('acme-digest', ['lang.acme'], { name: 'plain' }),
        adapter('acme-digest', ['lang.acme', 'acme.enriched'], { name: 'enriched' }),
      ],
      { reads: ['acme-enrich'] },
    );
    const withReader = registryOf([
      { origin: pluginOrigin('acme'), verticals: [enrich, report, reader] },
    ]);
    expect(
      refreshProposals(withReader, ['acme-digest'], ['acme-enrich'], tags, [
        ...tags,
        'acme.enriched',
      ]),
    ).toEqual([
      {
        vertical: 'acme-digest',
        reads: ['acme-enrich'],
        adapters: {
          before: ['acme-digest/plain'],
          after: ['acme-digest/plain', 'acme-digest/enriched'],
        },
      },
    ]);
  });
});

describe('reachableAdapters', () => {
  it('keeps what the scope or one of the run could satisfy, and drops what the scope rules out', () => {
    const ids = (verticals: readonly Vertical[], tags: readonly Tag[]) =>
      reachableAdapters(verticals, tags).map((a) => a.id);
    // The release requires the image the run itself adds.
    expect(ids([image, release, metrics], [...ACME_TAGS, 'arch.server-http'])).toEqual([
      'acme-image/main',
      'acme-release/main',
      'acme-metrics/acme',
    ]);
    // Nothing in the run adds the bundle, and a fat one is already there.
    expect(ids([sign], ACME_TAGS)).toEqual([]);
    expect(ids([bundleSlim, sign], [...ACME_TAGS, 'acme.fat'])).toEqual(['acme-bundle-slim/main']);
    expect(ids([bundleSlim, sign], ACME_TAGS)).toEqual(['acme-bundle-slim/main', 'acme-sign/main']);
  });
});

describe('seedFor', () => {
  it('replays the stack s own verticals, each through the adapters that match', () => {
    const seeded = stack('acme-seeded', ACME_TAGS, [image, release, bundleSlim, metrics]);
    // metrics promotes nothing; the release adapter matches only
    // because the image before it promoted its tag.
    expect([...seedFor(seeded, ACME_TAGS)].sort()).toEqual(
      [...ACME_TAGS, 'acme.bundle', 'acme.image', 'acme.release'].sort(),
    );
    const beta = stack('beta-seeded', ['lang.beta'], [image, release]);
    expect(seedFor(beta, beta.tags)).toEqual(['lang.beta']);
  });
});

/* ---- The shipped registry --------------------------------------- */

const GOLDEN = new URL('./planner-readiness.golden.json', import.meta.url);
const UPDATE = process.env['KEEL_UPDATE_GOLDEN'] === '1';

/** Every single-service preset × every registered vertical, on default dials. */
function shippedReadiness(): Readonly<Record<string, string>> {
  const cells: Record<string, string> = {};
  for (const preset of shippedRegistry.stacks()) {
    if (preset.services !== undefined) continue;
    const tags = stackTagsFor(
      preset,
      preset.buildSystems?.[0]?.tag ?? null,
      preset.moduleLayouts?.[0]?.tag ?? null,
    );
    const scope = on(
      seedFor(preset, tags),
      preset.verticals.map((own) => own.id),
    );
    for (const candidate of shippedRegistry.verticals()) {
      cells[`${preset.id}+${candidate.id}`] = verdict(
        readiness(shippedRegistry, scope, candidate.id),
      );
    }
  }
  return cells;
}

/** One readiness as a golden cell: what a reviewer reads in the diff. */
function verdict(ready: Readiness): string {
  switch (ready.kind) {
    case 'included':
    case 'ready':
      return ready.kind;
    case 'needs':
      return [
        `needs ${ready.prerequisites.join(' > ')}`,
        ...(ready.alternatives ?? []).map((set) => `or ${set.join(' > ')}`),
      ].join(' ');
    case 'unavailable': {
      const { gap } = ready;
      const parts = [
        ['entrypoint', gap.entrypoint],
        ['peer', gap.peer],
        ['identity', gap.identity],
        ['rules', gap.rules],
        ['nearest', gap.nearestStacks],
        ['comes with', gap.comesWith ?? []],
      ] as const;
      return [
        'unavailable',
        ...parts
          .filter(([, tags]) => tags.length > 0)
          .map(([k, tags]) => `${k} ${tags.join(', ')}`),
      ].join(' — ');
    }
  }
}

describe('the shipped registry', () => {
  const cells = shippedReadiness();

  it('reads as its golden records', () => {
    if (UPDATE) {
      fs.writeFileSync(GOLDEN, `${JSON.stringify(cells, null, 2)}\n`);
      return;
    }
    expect(cells).toEqual(JSON.parse(fs.readFileSync(GOLDEN, 'utf8')));
  });

  it('reads iac on a Quarkus CLI as unavailable, not as needing distribution', () => {
    // The union over distribution's adapters promotes the container
    // image iac is keyed on; the one adapter that matches here builds
    // native binaries, and says so in its own `promotes`.
    expect(cells['quarkus-cli+iac']).toBe(
      'unavailable — entrypoint arch.server-http — nearest quarkus-cli-rest',
    );
    expect(cells['quarkus-cli+distribution']).toBe('ready');
  });

  it('records which nearest stacks come with it: their preset installs it of its own', () => {
    expect(cells['quarkus-cli+observability']).toBe(
      'unavailable — entrypoint arch.server-http — nearest quarkus-cli-rest — comes with quarkus-cli-rest',
    );
    // Persistence is no preset's own: the nearest stack carries it only
    // as an extra.
    expect(cells['quarkus-cli+persistence']).toBe(
      'unavailable — entrypoint arch.server-http — nearest quarkus-cli-rest',
    );
  });

  it('reads the image distribution builds on as its prerequisite on an HTTP stack', () => {
    expect(cells['quarkus-rest+distribution']).toBe('needs containerization');
    expect(cells['quarkus-rest+iac']).toBe('needs containerization > distribution');
    expect(cells['web-components+distribution']).toBe('needs containerization');
  });

  it('reads distribution alone as ready on a composed Quarkus CLI + REST stack', () => {
    // Its native adapter covers both dimensions without an image, so
    // it needs nothing; iac is keyed on the image, so it still does.
    expect(cells['quarkus-cli-rest+distribution']).toBe('ready');
    expect(cells['quarkus-cli-rest+iac']).toBe('needs containerization > distribution');
  });

  it("reads a CLI stack's gap as its missing entrypoint, not as a foreign adapter", () => {
    // The Go image adapter misses the HTTP entrypoint and an image
    // containerization would build; the Quarkus native one misses a
    // framework and a build system no install adds. The first is
    // nearer, and the image traces back to the same entrypoint.
    expect(cells['go-cli+distribution']).toBe(
      'unavailable — entrypoint arch.server-http — nearest go-cli-http',
    );
    // A Spring CLI is one framework from the Quarkus native adapter and
    // one entrypoint from the JVM image one: the entrypoint is the gap.
    expect(cells['spring-cli+distribution']).toBe(
      'unavailable — entrypoint arch.server-http — nearest spring-cli-rest',
    );
  });
});
