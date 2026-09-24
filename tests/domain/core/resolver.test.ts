import { describe, expect, it } from 'vitest';
import {
  ResolutionError,
  coverageGap,
  coversFor,
  resolveVertical,
} from '../../../src/domain/core/resolver.js';
import { uncoveredRefusal } from '../../../src/domain/core/refusals.js';
import { RefusalError } from '../../../src/domain/contract/refusal.js';
import type { Adapter, Contribution, Vertical } from '../../../src/domain/contract/composition.js';

/** What `resolveVertical` threw for `vertical` on `tags`. */
function refusedWith(vertical: Vertical, tags: readonly string[]): RefusalError {
  try {
    resolveVertical(vertical, tags);
  } catch (thrown) {
    expect(thrown).toBeInstanceOf(RefusalError);
    return thrown as RefusalError;
  }
  throw new Error(`expected '${vertical.id}' to be refused`);
}

const noContribution: Contribution = {};
const stub = (a: Partial<Adapter> & Pick<Adapter, 'id' | 'covers' | 'predicate'>): Adapter => ({
  vertical: 'test',
  contribute: () => noContribution,
  ...a,
});

describe('resolveVertical', () => {
  it('returns matching adapters in topo order', () => {
    const v: Vertical = {
      id: 'observability',
      description: '',
      dimensions: ['language-binding', 'deploy-target'],
      adapters: [
        stub({
          id: 'k8s',
          covers: ['deploy-target'],
          predicate: { requires: ['orchestrator.k8s'] },
        }),
        stub({
          id: 'quarkus',
          covers: ['language-binding'],
          predicate: { requires: ['framework.quarkus'] },
          after: ['k8s'],
        }),
        stub({
          id: 'spring',
          covers: ['language-binding'],
          predicate: { requires: ['framework.spring'] },
        }),
      ],
    };
    const tags = ['framework.quarkus', 'orchestrator.k8s'];
    const ordered = resolveVertical(v, tags);
    expect(ordered.map((a) => a.id)).toEqual(['k8s', 'quarkus']);
  });

  it('refuses a dimension left uncovered, as data and in words', () => {
    const v: Vertical = {
      id: 'observability',
      description: '',
      dimensions: ['language-binding', 'deploy-target'],
      adapters: [
        stub({
          id: 'fastify',
          covers: ['language-binding'],
          predicate: { requires: ['framework.fastify'] },
        }),
      ],
    };
    const refusal = refusedWith(v, ['framework.fastify']);
    expect(refusal.code).toBe('keel.uncoverable-vertical');
    // Nothing covers `deploy-target` at all, so nothing is missing
    // that anything could add: the gap is empty, and the project is
    // simply the wrong kind for this vertical.
    expect(refusal.refusal).toEqual({
      kind: 'unavailable',
      vertical: 'observability',
      missing: {},
      carriedBy: [],
    });
    expect(refusal.message).toBe("Observability has no adapter for this project's stack");
  });

  it('throws the gap coverageGap answers, sorted into what would change it', () => {
    // The throw is the last line of defence, which makes it the worst
    // place to report only a symptom — and the worst place to report
    // a *different* symptom than the front door already showed.
    const v: Vertical = {
      id: 'persistence',
      description: '',
      dimensions: ['engine'],
      adapters: [
        stub({
          id: 'quarkus-jdbc',
          covers: ['engine'],
          predicate: { requires: ['framework.quarkus', 'arch.server-http'] },
        }),
      ],
    };
    const gap = coverageGap(v, ['framework.quarkus']);
    expect(gap?.enablers).toEqual(['arch.server-http']);

    const refusal = refusedWith(v, ['framework.quarkus']);
    // The tag is the engine's view and travels in the refusal, under
    // the kind of change it asks for; the sentence says it the way
    // the finder offered it.
    expect(refusal.refusal).toMatchObject({ missing: { entrypoint: gap?.enablers } });
    expect(refusal.message).toBe(uncoveredRefusal(v, gap?.enablers ?? []).message);
    expect(refusal.message).toBe(
      'Persistence needs an entrypoint this project does not have: HTTP server — a REST endpoint',
    );
  });

  it('sorts a gap into entrypoints, linked projects and what the preset fixes', () => {
    const v: Vertical = {
      id: 'bridge',
      description: '',
      dimensions: ['seam'],
      adapters: [
        stub({
          id: 'spring-seam',
          covers: ['seam'],
          predicate: { requires: ['framework.spring', 'arch.server-http', 'peer.ui.spa'] },
        }),
      ],
    };
    expect(refusedWith(v, ['framework.quarkus']).refusal).toMatchObject({
      missing: {
        entrypoint: ['arch.server-http'],
        peer: ['peer.ui.spa'],
        identity: ['framework.spring'],
      },
    });
  });

  it('names the vertical that adds a missing capability when handed a registry', () => {
    const image: Vertical = {
      id: 'image',
      title: 'Container image',
      description: '',
      dimensions: [],
      adapters: [],
      promotes: ['deploy.container-image'],
    };
    const release: Vertical = {
      id: 'release',
      description: '',
      dimensions: ['artifact'],
      adapters: [
        stub({
          id: 'image-release',
          covers: ['artifact'],
          predicate: { requires: ['deploy.container-image'] },
        }),
      ],
    };
    const names = {
      vertical: (id: string) => (id === image.id ? image : null),
      verticals: () => [image],
    };
    expect(() => resolveVertical(release, [], names)).toThrow(
      'Release needs what Container image adds, which this project does not have yet',
    );
  });

  it('hard-fails on a cycle in `after`, as the adapter bug it is', () => {
    const v: Vertical = {
      id: 'cycle',
      description: '',
      dimensions: [],
      adapters: [
        stub({ id: 'a', covers: [], predicate: {}, after: ['b'] }),
        stub({ id: 'b', covers: [], predicate: {}, after: ['a'] }),
      ],
    };
    try {
      resolveVertical(v, []);
      expect.fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ResolutionError);
      expect(e).not.toBeInstanceOf(RefusalError);
      const err = e as ResolutionError;
      expect(err.code).toBe('keel.adapter-cycle');
      expect(err.adapters).toEqual(['a', 'b']);
    }
  });

  it('drops `after` references whose target was filtered out', () => {
    const v: Vertical = {
      id: 'partial',
      description: '',
      dimensions: ['x'],
      adapters: [
        stub({ id: 'first', covers: [], predicate: { requires: ['absent'] } }),
        stub({ id: 'second', covers: ['x'], predicate: {}, after: ['first'] }),
      ],
    };
    const ordered = resolveVertical(v, []);
    expect(ordered.map((a) => a.id)).toEqual(['second']);
  });

  it('honours excludes', () => {
    const v: Vertical = {
      id: 'excl',
      description: '',
      dimensions: ['x'],
      adapters: [
        stub({
          id: 'jvm-base',
          covers: ['x'],
          predicate: { requires: ['runtime.jvm'], excludes: ['framework.quarkus'] },
        }),
        stub({
          id: 'quarkus',
          covers: ['x'],
          predicate: { requires: ['framework.quarkus'] },
        }),
      ],
    };
    const onlyQuarkus = resolveVertical(v, ['runtime.jvm', 'framework.quarkus']);
    expect(onlyQuarkus.map((a) => a.id)).toEqual(['quarkus']);

    const plainJvm = resolveVertical(v, ['runtime.jvm']);
    expect(plainJvm.map((a) => a.id)).toEqual(['jvm-base']);
  });

  it('breaks topo ties by adapter id for determinism', () => {
    const v: Vertical = {
      id: 'parallel',
      description: '',
      dimensions: ['x'],
      adapters: [
        stub({ id: 'zeta', covers: ['x'], predicate: {} }),
        stub({ id: 'alpha', covers: ['x'], predicate: {} }),
        stub({ id: 'mid', covers: ['x'], predicate: {} }),
      ],
    };
    expect(resolveVertical(v, []).map((a) => a.id)).toEqual(['alpha', 'mid', 'zeta']);
  });
});

/**
 * The same coverage check, asked ahead of time. What it is for is
 * menus: `keel new`'s extra-verticals step prunes with it, so an
 * option that could only ever end in the refusal above is never on
 * the list.
 */
describe('coversFor', () => {
  const vertical: Vertical = {
    id: 'persistence',
    description: '',
    dimensions: ['datasource'],
    adapters: [
      stub({
        id: 'jdbc',
        covers: ['datasource'],
        predicate: { requires: ['arch.server-http'] },
      }),
    ],
  };

  it('is true exactly when resolveVertical would not refuse', () => {
    expect(coversFor(vertical, ['arch.server-http'])).toBe(true);
    expect(() => resolveVertical(vertical, ['arch.server-http'])).not.toThrow();
  });

  it('is false where a dimension goes uncovered, instead of throwing', () => {
    expect(coversFor(vertical, ['arch.cli'])).toBe(false);
    expect(() => resolveVertical(vertical, ['arch.cli'])).toThrow(RefusalError);
  });

  it('is true for a vertical declaring no dimensions at all', () => {
    expect(coversFor({ id: 'x', description: '', dimensions: [], adapters: [] }, [])).toBe(true);
  });
});

/**
 * The same question again, with the reason attached. What it is for
 * is refusals: `keel new --with` checks coverage at the front door,
 * and a refusal there is written from the dimension that went
 * uncovered and the tags that would have covered it — which stay
 * here, whole, even where the sentence built from them leaves them
 * out.
 */
describe('coverageGap', () => {
  const persistence: Vertical = {
    id: 'persistence',
    description: '',
    dimensions: ['datasource'],
    adapters: [
      stub({
        id: 'quarkus',
        covers: ['datasource'],
        predicate: { requires: ['framework.quarkus', 'arch.server-http'] },
      }),
      stub({
        id: 'spring',
        covers: ['datasource'],
        predicate: { requires: ['framework.spring', 'arch.server-http'] },
      }),
    ],
  };

  it('is null exactly when coversFor is true', () => {
    const tags = ['framework.quarkus', 'arch.server-http'];
    expect(coverageGap(persistence, tags)).toBeNull();
    expect(coversFor(persistence, tags)).toBe(true);
  });

  it('names the vertical, the uncovered dimension, and the tags that would cover it', () => {
    const gap = coverageGap(persistence, ['framework.quarkus', 'arch.cli']);
    expect(gap).toEqual({
      verticalId: 'persistence',
      dimensions: ['datasource'],
      enablers: ['arch.server-http'],
    });
  });

  it('reports the nearest adapter only, not every stack shape keel supports', () => {
    // Nothing is pinned, so `spring` and `quarkus` are equidistant
    // — reporting both frameworks would read as "you need both".
    const gap = coverageGap(persistence, []);
    expect(gap?.enablers).toEqual(['arch.server-http', 'framework.quarkus']);
    // Which framework wins the tie is declaration order, and no
    // command changes a project's framework anyway: the refusal says
    // the stack has no adapter, and names neither.
    expect(uncoveredRefusal(persistence, gap?.enablers ?? []).message).toBe(
      "Persistence has no adapter for this project's stack",
    );
  });

  it('unions the enablers of every uncovered dimension', () => {
    const vertical: Vertical = {
      id: 'two',
      description: '',
      dimensions: ['image', 'pipeline'],
      adapters: [
        stub({ id: 'img', covers: ['image'], predicate: { requires: ['arch.server-http'] } }),
        stub({ id: 'pipe', covers: ['pipeline'], predicate: { requires: ['vcs.git'] } }),
      ],
    };
    const gap = coverageGap(vertical, []);
    expect(gap?.dimensions).toEqual(['image', 'pipeline']);
    expect(gap?.enablers).toEqual(['arch.server-http', 'vcs.git']);
  });

  it('ignores an adapter an `excludes` entry rules out — no tag un-matches one', () => {
    const vertical: Vertical = {
      id: 'excl',
      description: '',
      dimensions: ['x'],
      adapters: [
        stub({
          id: 'not-on-quarkus',
          covers: ['x'],
          predicate: { requires: ['runtime.jvm'], excludes: ['framework.quarkus'] },
        }),
        stub({ id: 'spring-only', covers: ['x'], predicate: { requires: ['framework.spring'] } }),
      ],
    };
    const gap = coverageGap(vertical, ['framework.quarkus']);
    expect(gap?.enablers).toEqual(['framework.spring']);
    // A framework swap is the engine's answer, not a remedy — the
    // refusal does not offer it.
    expect(uncoveredRefusal(vertical, gap?.enablers ?? []).message).toBe(
      "Excl has no adapter for this project's stack",
    );
  });

  it('reports no enablers for a dimension no adapter covers at all', () => {
    const vertical: Vertical = {
      id: 'orphan',
      description: '',
      dimensions: ['nobody-covers-this'],
      adapters: [stub({ id: 'other', covers: ['x'], predicate: {} })],
    };
    expect(coverageGap(vertical, [])).toEqual({
      verticalId: 'orphan',
      dimensions: ['nobody-covers-this'],
      enablers: [],
    });
  });
});
