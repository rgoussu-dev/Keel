/**
 * The `bounded-context` vertical — the context `keel add module <name>`
 * emits, and the gateway edge `--consumes <other>` adds to it.
 *
 * **Deliberately absent from the brownfield registry.** Every other
 * vertical is installable by id (`keel add persistence`), and this one
 * must not be: a bounded context is not a capability the project
 * either has or lacks, it is a thing with a *name*, and `keel add
 * bounded-context` has nowhere to put one. The registry's contract is
 * "verticals `keel add` can install by id"; this vertical is reached
 * only through `AddModuleHandler`, which has a name to give it.
 *
 * That is also why it is a vertical of its own rather than more
 * adapters inside `walking-skeleton`. Installing `walking-skeleton`
 * against a project that already has one would re-fire every
 * bootstrap adapter and conflict on every file it wrote; the shared
 * vertical is greenfield machinery. Here the adapters are all
 * additive by construction — they write one new context directory and
 * patch the assembly — so the set can be installed against a live
 * project without excluding half of itself.
 *
 * **No dimensions.** Like `gateway`, selection is purely by tag:
 * `modules.context` picks the shell for the project's language,
 * `modules.consumes` adds the gateway. With neither tag the vertical
 * installs nothing, which is what makes the coverage probe in
 * `context-support.ts` meaningful — an uncovered *dimension* would
 * hard-fail in the resolver, and a context contributes none, so the
 * front door has to ask the adapter set instead.
 */

import { rustContextAdapter } from '../adapters/rust-context.js';
import type { Vertical } from '../../contract/composition.js';

export const boundedContextVertical: Vertical = {
  id: 'bounded-context',
  description: 'One named bounded context under the modulith, and its optional consumer edge.',
  dimensions: [],
  adapters: [rustContextAdapter],
};
