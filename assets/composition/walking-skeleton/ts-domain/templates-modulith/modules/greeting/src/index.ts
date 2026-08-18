/**
 * The bounded context's facade — the one entry point a deployment
 * unit imports to reach it, and one of exactly two this package
 * publishes (the other is `./service`, for peer contexts).
 *
 * It exports the contract face and the factories that assemble the
 * core. What it deliberately does not export is anything under
 * `domain/core/internal/` beyond those factories: the `exports` map
 * makes `@scope/greeting/src/domain/core/internal/…` a resolution
 * error in tsc *and* in Node, which is what turns "only this context
 * builds its own handlers" into a failure rather than a review
 * comment. Widening the map is the one edit that undoes it.
 */

export * from './domain/contract/index.ts';
export { createGreetHandler } from './domain/core/internal/greet-handler.ts';
