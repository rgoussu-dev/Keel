/**
 * The bounded context's facade — the one entry point this package
 * publishes, and everything outside comes through it.
 *
 * Guestbook publishes no `./service`: it is the consumer in this
 * pair, and a seam exists to be reached, not to be had. The day
 * something needs to consume guestbook, that is when it earns one.
 *
 * The gateway factory is exported here for the same reason the
 * handler factory is — the assembly is what wires contexts together,
 * and the assembly may only reach this package through its aperture.
 * Exporting it is not a leak: what it returns is this context's own
 * `Welcome`, and what it takes is greeting's seam type, which the
 * assembly already holds.
 */

export * from './domain/contract/index.ts';
export { createSignHandler } from './domain/core/internal/sign-handler.ts';
export { createGreetingWelcome } from './infra/greeting-gateway/index.ts';
