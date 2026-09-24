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
 * a later vertical's tag breaks, one selected by peer tags alone, and
 * a handful of stacks to be the nearest.
 *
 * **Factory.** `registryOf`, the one door any piece comes in by.
 *
 * **Port.** The planner's pure functions.
 *
 * Then the shipped registry, recorded whole as a readiness golden —
 * today's truth, before any surface reads the planner. Distribution
 * still refuses at the bottom of its install where no image exists,
 * so it reads `ready` on every HTTP stack and `iac` `needs` it alone;
 * the step that declares the image requirement flips those cells, and
 * the golden's diff is its review. `KEEL_UPDATE_GOLDEN=1` rewrites it.
 */

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Adapter, Tag, Vertical } from '../../../src/domain/contract/composition.js';
import type { Readiness } from '../../../src/domain/contract/queries.js';
import type { Stack } from '../../../src/domain/contract/stack.js';
import {
  applies,
  plan,
  readiness,
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
  extra: Partial<Pick<Vertical, 'promotes' | 'reads' | 'dimensions' | 'conflicts'>> = {},
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

  it('takes back a step whose tags break a rule of a vertical placed before it', () => {
    expect(readiness(registry, ACME, 'acme-strict')).toEqual({ kind: 'ready' });
    expect(plan(registry, ACME, ['acme-strict', 'acme-loosen'])).toEqual({
      kind: 'incompatible',
      verticals: ['acme-strict', 'acme-loosen'],
    });
  });

  it('bounds the prerequisites per vertical, not per request', () => {
    // Three for the chain and one for the signer: four in all, and
    // no vertical needing more than three.
    expect(plan(registry, ACME, ['acme-monitor', 'acme-sign'])).toEqual({
      kind: 'planned',
      order: [
        { id: 'acme-image', reason: { neededBy: ['acme-release'] } },
        { id: 'acme-bundle-slim', reason: { neededBy: ['acme-sign'] } },
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

  it('records today s truth for distribution on an HTTP stack', () => {
    expect(cells['quarkus-rest+distribution']).toBe('ready');
    expect(cells['quarkus-rest+iac']).toBe('needs distribution');
  });
});
