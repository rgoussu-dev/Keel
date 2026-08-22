/**
 * `keel.catalog` — the read a form renders its top-level controls
 * from.
 *
 * What is worth asserting is the part that is *derived* rather than
 * copied. Ids and descriptions come straight off the registry and a
 * test of those would only restate `STACKS`. `peerContext` does not:
 * it is a probe over the adapter set, and it is the one field here
 * that can silently go wrong — a stack whose family has no
 * peer-context adapter would otherwise light up a control that
 * scaffolds nothing, which is the exact failure `context-support.ts`
 * exists to prevent.
 */

import { describe, expect, it } from 'vitest';
import { catalogQuery } from '../../../../src/domain/contract/queries.js';
import type { StackDescriptor } from '../../../../src/domain/contract/queries.js';
import { STACKS } from '../../../../src/domain/core/stacks.js';
import { listVerticalIds } from '../../../../src/domain/core/verticals/index.js';
import { expectOk, installMediator } from '../../../support/factory.js';

async function catalog(): Promise<{
  stacks: readonly StackDescriptor[];
  verticals: readonly { id: string; description: string; dimensions: readonly string[] }[];
}> {
  return expectOk(await installMediator().dispatch(catalogQuery()));
}

const find = (stacks: readonly StackDescriptor[], id: string): StackDescriptor => {
  const stack = stacks.find((candidate) => candidate.id === id);
  if (!stack) throw new Error(`catalog has no stack '${id}'`);
  return stack;
};

describe('keel.catalog', () => {
  it('lists every registered stack and vertical', async () => {
    const { stacks, verticals } = await catalog();
    expect(stacks.map((stack) => stack.id)).toEqual(Object.keys(STACKS).sort());
    expect(verticals.map((vertical) => vertical.id)).toEqual([...listVerticalIds()]);
  });

  it('reports a stack’s dials with the default first', async () => {
    const stack = find((await catalog()).stacks, 'quarkus-rest');
    expect(stack.buildSystems.map((option) => option.id)).toEqual(['gradle', 'maven']);
    expect(stack.moduleLayouts.map((option) => option.id)).toEqual(['basic', 'modulith']);
    expect(stack.services).toEqual([]);
    expect(stack.buildSystems[0]?.doc).not.toBe('');
  });

  it('reports a composite stack’s services, each with its own build systems', async () => {
    const stack = find((await catalog()).stacks, 'fullstack');
    expect(stack.services).toEqual([
      {
        path: 'backend',
        stack: 'quarkus-rest',
        buildSystems: [
          expect.objectContaining({ id: 'gradle' }),
          expect.objectContaining({ id: 'maven' }),
        ],
      },
      {
        path: 'frontend',
        stack: 'web-components',
        buildSystems: [
          expect.objectContaining({ id: 'npm' }),
          expect.objectContaining({ id: 'pnpm' }),
        ],
      },
    ]);
    // The product root has no dials of its own; each service does.
    expect(stack.buildSystems).toEqual([]);
    expect(stack.moduleLayouts).toEqual([]);
  });

  it('flags peer-context support by probing the adapters, not a list', async () => {
    const { stacks } = await catalog();
    // Every single-service stack offering the modulith really does
    // carry a peer-context adapter today, so the flag tracks the
    // layout dial exactly — and will stop doing so, correctly, the
    // day a family ships the modulith before its context adapter.
    for (const stack of stacks) {
      const eligible = stack.services.length === 0 && stack.moduleLayouts.length > 0;
      expect({ id: stack.id, peerContext: stack.peerContext }).toEqual({
        id: stack.id,
        peerContext: eligible,
      });
    }
  });

  it('never offers a peer context on a composite stack', async () => {
    const { stacks } = await catalog();
    for (const stack of stacks.filter((candidate) => candidate.services.length > 0)) {
      expect(stack.peerContext).toBe(false);
    }
  });
});
