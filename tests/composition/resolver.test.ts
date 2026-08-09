import { describe, expect, it } from 'vitest';
import { ResolutionError, resolveVertical } from '../../src/domain/core/resolver.js';
import type { Adapter, Contribution, Vertical } from '../../src/domain/contract/composition.js';

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
      expect(err.detail).toEqual({ kind: 'uncovered', dimensions: ['deploy-target'] });
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
