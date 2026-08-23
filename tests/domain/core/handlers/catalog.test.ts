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
import { dialOptionsFor } from '../../../../src/domain/core/dials.js';
import { STACKS } from '../../../../src/domain/core/stacks.js';
import { listVerticalIds, shippedRegistry } from '../../../../src/domain/core/registry.js';
import { expectOk, installMediator } from '../../../support/factory.js';

async function catalog(): Promise<Catalog> {
  return expectOk(await installMediator().dispatch(catalogQuery()));
}

type ShapeNode = Catalog['finder']['shapes'][number];
type LanguageNode = ShapeNode['languages'][number];
type FrameworkNode = LanguageNode['frameworks'][number];

/** The shape node under `id`, or a failure naming what is missing. */
async function shape(id: string): Promise<ShapeNode> {
  const { finder } = await catalog();
  const node = finder.shapes.find((candidate) => candidate.id === id);
  if (!node) throw new Error(`finder has no shape '${id}'`);
  return node;
}

/** The language node under a shape, or a failure naming what is missing. */
async function language(shapeId: string, id: string): Promise<LanguageNode> {
  const node = (await shape(shapeId)).languages.find((candidate) => candidate.id === id);
  if (!node) throw new Error(`finder has no language '${id}' under '${shapeId}'`);
  return node;
}

/** Every framework node of the tree, wherever it sits. */
const everyFramework = (finder: Catalog['finder']): readonly FrameworkNode[] =>
  finder.shapes.flatMap((node) => node.languages.flatMap((child) => child.frameworks));

const find = (stacks: readonly StackDescriptor[], id: string): StackDescriptor => {
  const stack = stacks.find((candidate) => candidate.id === id);
  if (!stack) throw new Error(`catalog has no stack '${id}'`);
  return stack;
};

describe('keel.catalog', () => {
  it('lists every registered stack and vertical', async () => {
    const { stacks, verticals } = await catalog();
    expect(stacks.map((stack) => stack.id)).toEqual(Object.keys(STACKS).sort());
    expect(verticals.map((vertical) => vertical.id)).toEqual([...listVerticalIds(shippedRegistry)]);
  });

  it('names each vertical twice over: the id you type and the concept it bears', async () => {
    // A front end offering `iac` and `vcs` as a list of ids is asking
    // the user to already know keel's jargon. The title is what makes
    // the card readable; the id is still there because it is what
    // `keel add <id>` takes.
    const { verticals } = await catalog();
    const iac = verticals.find((vertical) => vertical.id === 'iac');
    expect(iac?.title).toBe('Infrastructure as code');
    expect(iac?.description).not.toBe('');
    for (const vertical of verticals) expect(vertical.title).not.toBe('');
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

  it('stays a flat description of a preset — legality is keel.dials’ answer', async () => {
    // The line this suite holds. A catalog reporting which layouts a
    // chosen build system still allows would have to grow a
    // cross-product with every dial added, and would stop being a
    // description of the preset. `peerContext` is the near miss worth
    // naming: it reads like legality and is not — it is the
    // capability probe ("does this family ship a peer-context adapter
    // at all?"), asked against the modulith regardless of the layout
    // the caller is on, so it stays true where `keel.dials` says the
    // context may not be switched on.
    const stack = find((await catalog()).stacks, 'quarkus-rest');
    expect(Object.keys(stack).sort()).toEqual([
      'buildSystems',
      'description',
      'id',
      'moduleLayouts',
      'peerContext',
      'services',
      'tags',
    ]);
    expect(stack.buildSystems.map((option) => option.id)).toEqual(['gradle', 'maven']);
    expect(stack.peerContext).toBe(true);

    const onBasic = dialOptionsFor(shippedRegistry, {
      kind: 'new-project',
      stack: 'quarkus-rest',
      moduleLayout: 'basic',
    });
    expect(onBasic.peerContext).toBe(false);
  });

  it('describes the same dials keel.dials offers when no rule narrows them', async () => {
    // With the registry as it ships, the two agree everywhere — which
    // is what makes the split cheap: the catalog is still the right
    // thing to render a control *from*, and the dials query only ever
    // takes values off it.
    for (const stack of (await catalog()).stacks) {
      const dials = dialOptionsFor(shippedRegistry, { kind: 'new-project', stack: stack.id });
      expect({ id: stack.id, builds: dials.buildSystems }).toEqual({
        id: stack.id,
        builds: stack.buildSystems,
      });
      expect({ id: stack.id, layouts: dials.moduleLayouts }).toEqual({
        id: stack.id,
        layouts: stack.moduleLayouts,
      });
    }
  });
});

/**
 * The finder — the drill-down reported as a tree so a form can render
 * four dependent controls without reading a capability tag.
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

  it('asks what is being built first, and offers all three answers', async () => {
    const { finder } = await catalog();
    expect(finder.shapes.map((node) => node.id)).toEqual(['fullstack', 'backend', 'frontend']);
    for (const node of finder.shapes) {
      expect(node.label).not.toBe('');
      expect(node.languages.length).toBeGreaterThan(0);
    }
  });

  it('reaches every preset, the two-service products included', async () => {
    const { finder, stacks } = await catalog();
    const reachable = new Set(
      everyFramework(finder).flatMap((node) =>
        node.combinations.map((combination) => combination.stack),
      ),
    );
    expect(stacks.map((stack) => stack.id).filter((id) => !reachable.has(id))).toEqual([]);
  });

  it('names a real stack at every leaf', async () => {
    const { finder, stacks } = await catalog();
    const known = new Set(stacks.map((stack) => stack.id));
    for (const node of everyFramework(finder)) {
      expect(node.combinations.length).toBeGreaterThan(0);
      for (const combination of node.combinations) expect(known).toContain(combination.stack);
    }
  });

  it('offers a checkbox only where every subset of it is a preset', async () => {
    const { finder } = await catalog();
    for (const node of everyFramework(finder)) {
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

  it('drops everything below the shape where the frontend reaches one preset', async () => {
    const frontend = await shape('frontend');
    expect(frontend.languages.map((node) => node.id)).toEqual(['typescript@browser']);
    const [only] = frontend.languages[0]?.frameworks ?? [];
    expect(frontend.languages[0]?.frameworks).toHaveLength(1);
    expect(only?.entrypointStep).toBeNull();
    expect(only?.combinations.map((combination) => combination.stack)).toEqual(['web-components']);
  });

  it('carries the framework menu only where the JVM has one', async () => {
    const java = await language('backend', 'java@jvm');
    expect(java.frameworks.map((node) => node.id)).toEqual(['micronaut', 'quarkus', 'spring']);
    const quarkus = java.frameworks.find((node) => node.id === 'quarkus');
    expect(quarkus?.combinations.map((combination) => combination.stack)).toEqual([
      'quarkus-cli',
      'quarkus-rest',
      'quarkus-cli-rest',
    ]);

    const go = await language('backend', 'go');
    expect(go.frameworks).toHaveLength(1);
    expect(go.frameworks[0]?.id).toBe('');
  });

  it('puts a product’s framework choice under its backend’s language', async () => {
    const java = await language('fullstack', 'java@jvm');
    expect(java.frameworks.map((node) => node.id)).toEqual(['micronaut', 'quarkus', 'spring']);
    expect(java.frameworks.flatMap((node) => node.combinations.map((c) => c.stack))).toEqual([
      'fullstack-micronaut',
      'fullstack',
      'fullstack-spring',
    ]);
    // One combination each, so a product never asks for entrypoints.
    for (const node of java.frameworks) expect(node.entrypointStep).toBeNull();
  });

  it('defaults the entrypoints towards the default preset’s own', async () => {
    const java = await language('backend', 'java@jvm');
    expect(java.frameworks.find((node) => node.id === 'quarkus')?.entrypointStep?.default).toBe(
      'cli',
    );
  });
});
