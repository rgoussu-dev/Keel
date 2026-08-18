/**
 * The core's public surface: factory entry points only. The
 * implementations live under `internal/` and stay out of the
 * `exports` map, so deep imports die at module resolution.
 */

export { createRegistryMediator } from './internal/registry-mediator.ts';
export { createGreetHandler } from './internal/greet-handler.ts';
