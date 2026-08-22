/**
 * Handler for `keel.catalog` — everything keel can install, with the
 * dials each option offers.
 *
 * A registry read and nothing more, but it is a query rather than an
 * exported function because of who asks. `keel new --list` gets its
 * two columns from `listStacks()` at wiring time, which is all a help
 * screen needs. A form needs the dials too — which build systems this
 * stack offers, which module layouts, whether a second bounded
 * context is on the table, and for a composite, the same again per
 * service — and it needs them over a transport. Going through the
 * mediator is what keeps that surface one thing rather than a growing
 * bag of accessors each primary adapter reaches for differently.
 *
 * `peerContext` is probed, not listed. `--with-peer-context` is
 * served by adapters declaring `covers: []`, so the resolver's
 * uncovered-dimension hard-fail cannot speak for them and a
 * hard-coded list of supporting stacks would go stale in silence —
 * the exact failure `context-support.ts` exists to prevent. Asking
 * {@link emitsFor} instead means a family that gains its adapter
 * lights the control up on its own.
 */

import type { Action } from '../../kernel/action.js';
import type { Handler } from '../../kernel/handler.js';
import { ok, type Result } from '../../kernel/result.js';
import type { Tag } from '../../contract/composition.js';
import type {
  Catalog,
  CatalogQuery,
  ChoiceDescriptor,
  ServiceDescriptor,
  StackDescriptor,
  VerticalDescriptor,
} from '../../contract/queries.js';
import { emitsFor } from '../adapters/context-support.js';
import { MODULITH_LAYOUT_TAG, PEER_CONTEXT_TAG } from '../adapters/module-layout.js';
import { getStack, listStackIds, type BuildSystemOption, type Stack } from '../stacks.js';
import { listVerticalIds, VERTICALS } from '../verticals/index.js';

/** Executes {@link CatalogQuery}s. */
export class CatalogHandler implements Handler<CatalogQuery> {
  supports(action: Action): action is CatalogQuery {
    return action.kind === 'keel.catalog';
  }

  handle(): Promise<Result<Catalog>> {
    return Promise.resolve(ok({ stacks: describeStacks(), verticals: describeVerticals() }));
  }
}

function describeStacks(): readonly StackDescriptor[] {
  return listStackIds().flatMap((id) => {
    const stack = getStack(id);
    return stack ? [describeStack(stack)] : [];
  });
}

function describeStack(stack: Stack): StackDescriptor {
  return {
    id: stack.id,
    description: stack.description,
    tags: [...stack.tags],
    buildSystems: (stack.buildSystems ?? []).map(describeBuildSystem),
    moduleLayouts: (stack.moduleLayouts ?? []).map((option) => ({
      id: option.id,
      label: option.label,
      doc: option.doc,
    })),
    services: describeServices(stack),
    peerContext: supportsPeerContext(stack),
  };
}

function describeServices(stack: Stack): readonly ServiceDescriptor[] {
  return (stack.services ?? []).flatMap((service) => {
    const serviceStack = getStack(service.stack);
    return [
      {
        path: service.path,
        stack: service.stack,
        buildSystems: (serviceStack?.buildSystems ?? []).map(describeBuildSystem),
      },
    ];
  });
}

function describeBuildSystem(option: BuildSystemOption): ChoiceDescriptor {
  return { id: option.id, label: option.label, doc: option.doc };
}

function describeVerticals(): readonly VerticalDescriptor[] {
  return listVerticalIds().flatMap((id) => {
    const vertical = VERTICALS[id];
    return vertical
      ? [{ id, description: vertical.description, dimensions: [...vertical.dimensions] }]
      : [];
  });
}

/**
 * Whether the stack's modulith carries a second bounded context —
 * asked of the adapter set on the tags `keel new` would seed, taking
 * the stack's default build system since no adapter's peer-context
 * predicate turns on one.
 */
function supportsPeerContext(stack: Stack): boolean {
  if (stack.services !== undefined) return false;
  if (stack.moduleLayouts === undefined) return false;
  const tags: readonly Tag[] = [
    ...stack.tags,
    ...(stack.buildSystems?.[0] ? [stack.buildSystems[0].tag] : []),
    MODULITH_LAYOUT_TAG,
  ];
  return emitsFor(stack.verticals, PEER_CONTEXT_TAG, tags);
}
