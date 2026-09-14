// The injected specification: a farewell use case in the same shape
// the greeting already has — a driving port taking a command, a read
// model publishing the outcome, and a subscription that stops when it
// is told to.
import { describe, expect, it } from 'vitest';
import type { Farewell, FarewellReadModel, Valediction } from '@acme/domain-api';
import { createFarewell, createValedictionStore } from '@acme/domain-core';

interface Sut {
  readonly farewell: Farewell;
  readonly valedictions: FarewellReadModel;
}

const factory = (): Sut => {
  const store = createValedictionStore();
  return { farewell: createFarewell(store), valedictions: store };
};

describe('farewell', () => {
  it('publishes a valediction for the given name', () => {
    const { farewell, valedictions } = factory();
    farewell.execute({ name: 'Ada' });
    expect(valedictions.current()?.message).toBe('Goodbye, Ada!');
  });

  it('falls back to "world" for a blank name', () => {
    const { farewell, valedictions } = factory();
    farewell.execute({ name: '   ' });
    expect(valedictions.current()?.message).toBe('Goodbye, world!');
  });

  it('notifies subscribers until they unsubscribe', () => {
    const { farewell, valedictions } = factory();
    const seen: Valediction[] = [];
    const unsubscribe = valedictions.subscribe((valediction) => seen.push(valediction));

    farewell.execute({ name: 'Ada' });
    unsubscribe();
    farewell.execute({ name: 'Grace' });

    expect(seen.map((v) => v.message)).toEqual(['Goodbye, Ada!']);
  });
});
