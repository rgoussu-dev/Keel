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
 * only with a context's name to give it: by `AddModuleHandler`, and by
 * replays of the contexts a manifest records — the harness retrofit's,
 * of each, and `keel add entrypoint`'s, of each `keel add module` added,
 * wiring it into the new assembly and reading where its gateway goes.
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
 * `modules.context` picks the context's adapters for the project's
 * language — its shell and, on a family that splits them (Go's,
 * Rust's and TypeScript's), one wiring adapter per entrypoint the
 * project has —
 * `modules.consumes` adds the gateway. With neither tag the vertical
 * installs nothing, which is what makes the coverage probe in
 * `context-support.ts` meaningful — an uncovered *dimension* would
 * hard-fail in the resolver, and a context contributes none, so the
 * front door has to ask the adapter set instead.
 *
 * **One conflict, and it is the only refusal around `keel add module`
 * that is one.** A context has nowhere to live under the flat layout,
 * which is a statement about two capability tags and so a declaration
 * — read by the handler to refuse and by `canAddModule` to grey the
 * control out. Everything else `add module` refuses (a composite
 * product root, a name already taken, a `--consumes` target with no
 * seam, a family with no adapter) is manifest state or a capability
 * probe, and stays a check where it is.
 */

import { CONTEXT_NEEDS_MODULITH } from '../adapters/added-context.js';
import {
  goContextAdapter,
  goContextCliAdapter,
  goContextHttpAdapter,
} from '../adapters/go-context.js';
import {
  micronautContextAdapter,
  micronautContextKotlinAdapter,
} from '../adapters/micronaut-context.js';
import { quarkusContextAdapter, quarkusContextKotlinAdapter } from '../adapters/quarkus-context.js';
import {
  rustContextAdapter,
  rustContextCliAdapter,
  rustContextHttpAdapter,
} from '../adapters/rust-context.js';
import { springContextAdapter, springContextKotlinAdapter } from '../adapters/spring-context.js';
import {
  tsContextAdapter,
  tsContextCliAdapter,
  tsContextHttpAdapter,
} from '../adapters/ts-context.js';
import { wcContextAdapter } from '../adapters/wc-context.js';
import type { Vertical } from '../../contract/composition.js';

export const boundedContextVertical: Vertical = {
  id: 'bounded-context',
  title: 'Bounded context',
  description: 'One named bounded context under the modulith, and its optional consumer edge.',
  dimensions: [],
  adapters: [
    rustContextAdapter,
    rustContextCliAdapter,
    rustContextHttpAdapter,
    goContextAdapter,
    goContextCliAdapter,
    goContextHttpAdapter,
    tsContextAdapter,
    tsContextCliAdapter,
    tsContextHttpAdapter,
    wcContextAdapter,
    quarkusContextAdapter,
    quarkusContextKotlinAdapter,
    springContextAdapter,
    springContextKotlinAdapter,
    micronautContextAdapter,
    micronautContextKotlinAdapter,
  ],
  conflicts: [CONTEXT_NEEDS_MODULITH],
};
