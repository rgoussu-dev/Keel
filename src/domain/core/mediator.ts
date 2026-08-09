/**
 * The Mediator implementation. Constructed from a collection of
 * handlers and builds its own registry by probing each handler's
 * `supports()` — no injected maps, no reflection, no annotation
 * scanning, per the binding spec (§2).
 */

import type { Action, ResultOf } from '../kernel/action.js';
import type { Handler } from '../kernel/handler.js';
import type { Mediator } from '../kernel/mediator.js';
import { DomainError, err, type Result } from '../kernel/result.js';

/** Routes each dispatch to the first handler that supports it. */
export class RegistryMediator implements Mediator {
  private readonly handlers: readonly Handler[];

  constructor(handlers: Iterable<Handler>) {
    this.handlers = [...handlers];
  }

  dispatch<A extends Action>(action: A): Promise<Result<ResultOf<A>>> {
    const handler = this.handlers.find((h) => h.supports(action));
    if (!handler) {
      return Promise.resolve(
        err(new DomainError(`no handler supports action '${action.kind}'`, 'kernel.no-handler')),
      );
    }
    return handler.handle(action) as Promise<Result<ResultOf<A>>>;
  }
}
