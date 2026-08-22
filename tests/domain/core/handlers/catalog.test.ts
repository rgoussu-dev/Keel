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
import type { Catalog, StackDescriptor } from '../../../../src/domain/contract/queries.js';
import { STACKS } from '../../../../src/domain/core/stacks.js';
import { listVerticalIds } from '../../../../src/domain/core/verticals/index.js';
import { expectOk, installMediator } from '../../../support/factory.js';

async function catalog(): Promise<Catalog> {
  return expectOk(await installMediator().dispatch(catalogQuery()));
}

/** The language node under `id`, or a failure naming what is missing. */
async function language(id: string): Promise<Catalog['finder']['languages'][number]> {
  const { finder } = await catalog();
  const node = finder.languages.find((candidate) => candidate.id === id);
  if (!node) throw new Error(`finder has no language '${id}'`);
  return node;
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

/**
 * The finder — the drill-down reported as a tree so a form can render
 * three dependent controls without reading a capability tag.
 *
 * The invariants worth pinning here are the ones a front end would
 * otherwise have to trust: that every preset it can reach really
 * exists, that a combination no preset covers is absent rather than
 * offered, and that the step it is told to render as a checkbox
 * really is safe to render as one. `stack-wizard.test.ts` proves
 * those over the grid; this proves the DTO carries them across
 * intact.
 */
describe('keel.catalog — the stack finder', () => {
  it('opens on the preset an omitted --stack resolves to', async () => {
    const { finder } = await catalog();
    expect(finder.defaultStack).toBe('quarkus-cli');
  });

  it('reaches every single-project preset, and no product', async () => {
    const { finder, stacks } = await catalog();
    const reachable = new Set(
      finder.languages.flatMap((node) =>
        node.combinations.flatMap((combination) =>
          combination.frameworks.map((framework) => framework.stack),
        ),
      ),
    );
    const single = stacks.filter((stack) => stack.services.length === 0).map((s) => s.id);
    const products = stacks.filter((stack) => stack.services.length > 0).map((s) => s.id);
    expect(single.filter((id) => !reachable.has(id))).toEqual([]);
    expect(products.filter((id) => reachable.has(id))).toEqual([]);
  });

  it('names a real stack at every leaf', async () => {
    const { finder, stacks } = await catalog();
    const known = new Set(stacks.map((stack) => stack.id));
    for (const node of finder.languages) {
      for (const combination of node.combinations) {
        expect(combination.frameworks.length).toBeGreaterThan(0);
        for (const framework of combination.frameworks) expect(known).toContain(framework.stack);
      }
    }
  });

  it('offers a checkbox only where every subset of it is a preset', async () => {
    const { finder } = await catalog();
    for (const node of finder.languages) {
      if (node.entrypointStep?.kind !== 'multi-select') continue;
      const reachable = new Set(
        node.combinations.map((combination) => [...combination.entrypoints].sort().join(',')),
      );
      const ids = node.entrypointStep.choices.map((choice) => choice.id);
      // Every non-empty subset a checkbox group could produce.
      for (let mask = 1; mask < 2 ** ids.length; mask += 1) {
        const subset = ids.filter((_, index) => (mask & (1 << index)) !== 0);
        expect(reachable).toContain([...subset].sort().join(','));
      }
    }
  });

  it('drops the entrypoint step where the language reaches one combination', async () => {
    const browser = await language('typescript@browser');
    expect(browser.entrypointStep).toBeNull();
    expect(browser.combinations).toHaveLength(1);
    expect(browser.combinations[0]?.frameworks.map((f) => f.stack)).toEqual(['web-components']);
  });

  it('carries the framework menu only where the JVM has one', async () => {
    const java = await language('java@jvm');
    const combined = java.combinations.find((c) => c.entrypoints.length === 2);
    expect(combined?.frameworks.map((framework) => framework.stack)).toEqual([
      'micronaut-cli-rest',
      'quarkus-cli-rest',
      'spring-cli-rest',
    ]);

    const go = await language('go');
    for (const combination of go.combinations) {
      expect(combination.frameworks).toHaveLength(1);
      expect(combination.frameworks[0]?.id).toBe('');
    }
  });

  it('defaults each language’s entrypoints towards the default preset’s own', async () => {
    const java = await language('java@jvm');
    expect(java.entrypointStep?.default).toBe('cli');
  });
});
