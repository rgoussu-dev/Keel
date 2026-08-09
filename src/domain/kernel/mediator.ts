/**
 * The dispatch port between primary adapters and the domain. A
 * primary adapter (the CLI today) maps its transport input to a
 * concrete `Command`/`Query` from `domain/contract`, dispatches it
 * here, and maps the `Result` back to its transport shape. The
 * implementation (`RegistryMediator`) lives in `domain/core`.
 */

import type { Action, ResultOf } from './action.js';
import type { Result } from './result.js';

/** Routes an action to the single handler that supports it. */
export interface Mediator {
  /**
   * Dispatches `action` to its handler and returns the handler's
   * outcome. An action no handler supports resolves to an `Err`
   * with code `kernel.no-handler`.
   */
  dispatch<A extends Action>(action: A): Promise<Result<ResultOf<A>>>;
}
