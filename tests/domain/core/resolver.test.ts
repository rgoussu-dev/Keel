import { describe, expect, it } from 'vitest';
import { ResolutionError, coversFor, resolveVertical } from '../../../src/domain/core/resolver.js';
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
      // Nothing covers `deploy-target` at all, so there is no near
      // miss to report — the dimension really is empty.
      expect(err.detail).toEqual({ kind: 'uncovered', dimensions: ['deploy-target'], near: [] });
    }
  });

  it('names the adapter a predicate kept out, and the tag it wanted', () => {
    // The cause beside the symptom. An uncovered dimension is almost
    // never a missing adapter — it is one present and filtered — and
    // without this the user is told which hole exists and nothing
    // about what would fill it.
    const v: Vertical = {
      id: 'walking-skeleton',
      description: '',
      dimensions: ['entrypoint'],
      adapters: [
        stub({
          id: 'quarkus-cli-bootstrap',
          covers: ['entrypoint'],
          predicate: { requires: ['framework.quarkus'] },
        }),
        stub({
          id: 'legacy-bootstrap',
          covers: ['entrypoint'],
          predicate: { excludes: ['lang.java'] },
        }),
      ],
    };
    try {
      resolveVertical(v, ['lang.java']);
      expect.fail('expected throw');
    } catch (e) {
      const err = e as ResolutionError;
      expect(err.message).toContain("'quarkus-cli-bootstrap' needs 'framework.quarkus'");
      expect(err.message).toContain("'legacy-bootstrap' is ruled out by 'lang.java'");
      expect(err.detail).toMatchObject({
        near: [
          {
            adapter: 'quarkus-cli-bootstrap',
            dimension: 'entrypoint',
            kind: 'requires',
            pattern: 'framework.quarkus',
          },
          {
            adapter: 'legacy-bootstrap',
            dimension: 'entrypoint',
            kind: 'excludes',
            pattern: 'lang.java',
          },
        ],
      });
    }
  });

  it('caps the near misses in the message but keeps them all in the detail', () => {
    // A dimension covered by twenty adapters — the JVM bootstraps —
    // would otherwise print twenty near misses to say one thing.
    const v: Vertical = {
      id: 'many',
      description: '',
      dimensions: ['entrypoint'],
      adapters: ['a', 'b', 'c', 'd', 'e'].map((id) =>
        stub({ id, covers: ['entrypoint'], predicate: { requires: [`framework.${id}`] } }),
      ),
    };
    try {
      resolveVertical(v, ['lang.java']);
      expect.fail('expected throw');
    } catch (e) {
      const err = e as ResolutionError;
      expect(err.message).toContain('and 2 more');
      expect(err.detail).toMatchObject({ near: expect.any(Array) });
      expect((err.detail as { near: unknown[] }).near).toHaveLength(5);
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
