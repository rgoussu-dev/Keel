import { describe, expect, it } from 'vitest';
import {
  ResolutionError,
  coverageGap,
  coversFor,
  resolveVertical,
} from '../../../src/domain/core/resolver.js';
import type { Adapter, Contribution, Vertical } from '../../../src/domain/contract/composition.js';

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

  it('hard-fails when a dimension is uncovered', () => {
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
    expect(() => resolveVertical(v, ['framework.fastify'])).toThrow(ResolutionError);
    try {
      resolveVertical(v, ['framework.fastify']);
    } catch (e) {
      const err = e as ResolutionError;
      expect(err.kind).toBe('uncovered');
      // Nothing covers `deploy-target` at all, so there is nothing to
      // name as an enabler — the dimension really is empty.
      expect(err.detail).toEqual({
        kind: 'uncovered',
        dimensions: ['deploy-target'],
        enablers: [],
      });
    }
  });

  it('throws what coverageGap answers, so the two refusals cannot differ', () => {
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

    try {
      resolveVertical(v, ['framework.quarkus']);
      expect.fail('expected throw');
    } catch (e) {
      const err = e as ResolutionError;
      expect(err.message).toContain('would need arch.server-http');
      expect(err.detail).toEqual({
        kind: 'uncovered',
        dimensions: gap?.dimensions,
        enablers: gap?.enablers,
      });
    }
  });

  it('hard-fails on a cycle in `after`', () => {
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
      const err = e as ResolutionError;
      expect(err.kind).toBe('cycle');
      expect(err.detail).toEqual({ kind: 'cycle', adapters: ['a', 'b'] });
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
 * option that could only ever end in the `ResolutionError` above is
 * never on the list.
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
    expect(() => resolveVertical(vertical, ['arch.cli'])).toThrow(ResolutionError);
  });

  it('is true for a vertical declaring no dimensions at all', () => {
    expect(coversFor({ id: 'x', description: '', dimensions: [], adapters: [] }, [])).toBe(true);
  });
});

/**
 * The same question again, with the reason attached. What it is for
 * is refusals: `keel new --with` checks coverage at the front door,
 * and a refusal there has to name the vertical, the dimension it
 * could not cover, and what would have covered it.
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
