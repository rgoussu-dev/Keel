/**
 * The business-operation handler contract. Handlers self-declare the
 * actions they support via {@link Handler.supports}; the mediator
 * implementation probes that predicate to route a dispatch — no
 * injected maps, no reflection, no annotation scanning.
 */

import type { Action, ResultOf } from './action.js';
import type { Result } from './result.js';

/**
 * Handles one family of actions. `supports` is a type guard so a
 * routed action arrives at `handle` already narrowed.
 */
export interface Handler<A extends Action = Action> {
  /** Reports whether this handler can handle the given action. */
  supports(action: Action): action is A;
  /** Executes the action and returns its outcome. */
  handle(action: A): Promise<Result<ResultOf<A>>>;
}
