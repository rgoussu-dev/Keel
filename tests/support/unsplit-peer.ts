/**
 * A registry whose Quarkus peer context is **one adapter again**, as it
 * was before roadmap R.3d split it into a shell and a wiring adapter per
 * entrypoint: the shell's contribution plus that of each wiring adapter
 * whose entrypoint the project's tags carry — the assemblies chosen
 * inside `contribute()`, not by a predicate.
 *
 * That is the shape `keel add entrypoint` refuses
 * (`keel.contexts-need-rewiring`): the one adapter matches before and
 * after the new entrypoint, so installing what newly matches would
 * leave the new assembly half-wired. Since R.3d no family keel ships is
 * one, so a test that holds what that refusal says — at the command
 * line, on a card, on the page — reaches it on a real preset through
 * this, rather than a plugin family's words.
 *
 * Every other piece is the shipped registry's, and the Quarkus Java
 * stacks carry the folded vertical, since a stack holds its verticals.
 */

import type { Adapter, Contribution, Vertical } from '../../src/domain/contract/composition.js';
import type { Registry } from '../../src/domain/contract/ports/registry.js';
import { QUARKUS_PEER_CONTEXT_ID } from '../../src/domain/core/adapters/quarkus-peer-context.js';
import { matches } from '../../src/domain/core/predicate.js';
import { shippedRegistry } from '../../src/domain/core/registry.js';

/** The shipped registry, with Quarkus' peer context unsplit (above). */
export function unsplitPeerRegistry(): Registry {
  const skeleton = shippedRegistry.vertical('walking-skeleton') as Vertical;
  const isWiring = (adapter: Adapter): boolean =>
    adapter.id === `${QUARKUS_PEER_CONTEXT_ID}-cli` ||
    adapter.id === `${QUARKUS_PEER_CONTEXT_ID}-rest`;
  const wiring = skeleton.adapters.filter(isWiring);
  const fold = (shell: Adapter): Adapter => ({
    ...shell,
    async contribute(ctx): Promise<Contribution> {
      const tags = new Set(ctx.manifest.tags);
      const parts = [
        await shell.contribute(ctx),
        ...(await Promise.all(
          wiring
            .filter((each) => matches(each.predicate, tags))
            .map((each) => each.contribute(ctx)),
        )),
      ];
      return {
        files: parts.flatMap((part) => part.files ?? []),
        patches: parts.flatMap((part) => part.patches ?? []),
      };
    },
  });
  const folded: Vertical = {
    ...skeleton,
    adapters: skeleton.adapters
      .filter((adapter) => !isWiring(adapter))
      .map((adapter) => (adapter.id === QUARKUS_PEER_CONTEXT_ID ? fold(adapter) : adapter)),
  };
  const swap = (vertical: Vertical): Vertical => (vertical.id === folded.id ? folded : vertical);
  const stacks = shippedRegistry
    .stacks()
    .map((stack) => ({ ...stack, verticals: stack.verticals.map(swap) }));
  return {
    stacks: () => stacks,
    stack: (id) => stacks.find((stack) => stack.id === shippedRegistry.stack(id)?.id) ?? null,
    verticals: () => shippedRegistry.verticals().map(swap),
    vertical: (id) => (id === folded.id ? folded : shippedRegistry.vertical(id)),
  };
}
