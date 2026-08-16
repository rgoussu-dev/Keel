/**
 * The bounded context's facade — the DOM-less half of what it
 * publishes.
 *
 * Guestbook publishes no `./service`: it is the consumer in this
 * pair, and a seam exists to be reached, not to be had. The day
 * something needs to consume guestbook, that is when it earns one.
 *
 * The gateway factory is exported here for the same reason the
 * service factories are — the assembly is what wires contexts
 * together, and it may only reach this package through its aperture.
 * That is not a leak: what the factory returns is this context's own
 * `Welcome`, and what it takes is greeting's seam type, which the
 * assembly already holds.
 */

export * from './domain/contract/index';
export { createSign } from './domain/core/internal/sign-service';
export { createEntryStore, type EntryStore } from './domain/core/internal/entry-store';
export { createGreetingWelcome } from './infra/greeting-gateway/index';
export { entriesContext, signContext } from './context-keys';
