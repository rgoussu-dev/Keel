/**
 * **Does this project's stack know how to emit a bounded context?** —
 * the one probe behind both context gates.
 *
 * keel grows bounded contexts by two doors, and both need the same
 * answer before they open:
 *
 * - `keel new --with-peer-context` asks it of a {@link Stack} it holds
 *   in hand, before anything is written;
 * - `keel add module <name>` asks it of a project already on disk,
 *   where there is no `Stack` at all — the manifest records tags, not
 *   the preset they came from.
 *
 * **Why a probe rather than a list of stack ids.** A context adapter
 * declares `covers: []`: it contributes a *context*, not a capability
 * dimension, so the resolver's uncovered-dimension hard-fail — which
 * catches every other "no adapter for this stack" — structurally
 * cannot fire for it. A family with no such adapter resolves cleanly
 * and emits nothing, and the user who asked for a second bounded
 * context is told nothing and gets one. That is the bug I.6 fixed for
 * the flag, and the reason this file exists rather than a second copy
 * of the same logic beside `add module`: a hard-coded stack list goes
 * stale in silence, and the symptom is again a door that does nothing.
 *
 * So both gates ask the adapter set directly, and the day a family
 * gains its adapter both doors open by themselves.
 */

import type { Adapter, Tag, Vertical } from '../../contract/composition.js';
import { matches } from '../predicate.js';

/**
 * Whether any adapter in `verticals` is selected by `tags` *because
 * of* `marker` — that is, whether the marker tag actually buys
 * anything here.
 *
 * The marker is added to the tag set before matching, so the caller
 * asks the hypothetical ("if I set this tag, would anything fire?")
 * rather than having to seed it first and inspect the wreckage after.
 * Requiring the marker in `predicate.requires` is what makes the
 * answer specific: an adapter that would have fired anyway is not
 * evidence that the marker is supported.
 */
export function emitsFor(
  verticals: readonly Vertical[],
  marker: Tag,
  tags: readonly Tag[],
): boolean {
  const tagSet = new Set<Tag>([...tags, marker]);
  return verticals.some((vertical) => vertical.adapters.some(fires(marker, tagSet)));
}

/** The adapter test `emitsFor` applies, named so both readings are one. */
function fires(marker: Tag, tagSet: ReadonlySet<Tag>): (adapter: Adapter) => boolean {
  return (adapter) =>
    (adapter.predicate.requires ?? []).includes(marker) && matches(adapter.predicate, tagSet);
}
