/**
 * The Mediator implementation. Constructed from a collection of
 * handlers and builds its own registry by probing each handler's
 * `supports()` — no injected maps, no reflection, no annotation
 * scanning, per the binding spec (§2).
 *
 * It also **normalises a thrown `DomainError` into an `Err`**, which
 * is the one thing here that is not pure routing and is worth the
 * exception.
 *
 * The kernel's rule is that expected business failures travel as
 * `Err` and genuine bugs keep throwing. The install engine has one
 * refusal that took the other exit: `resolveVertical` hard-fails with
 * a `ResolutionError` when a project's shape cannot carry a vertical,
 * and it escapes `installVertical` from every caller. Each front end
 * then had to cope alone — the CLI printed it (its top-level catch
 * treats any throw as a message), and `keel ui` answered **500 with a
 * bare string**, because a crash is all an HTTP layer can read a
 * throw as. The page showed "POST /api/preview failed with 500" for
 * what is really "this Go CLI has no HTTP adapter to build an image
 * from".
 *
 * Fixing that per handler would mean the same try/catch in
 * `add-vertical`, `add-module` and both halves of `new-project`, and
 * a fifth copy the next time something calls the engine. Fixing it
 * here is one place, and it is the right place: `Result` is the
 * Mediator's contract with every primary adapter, so the seam that
 * promises it is the seam that should keep the promise. A refusal
 * that names itself with a code arrives as one; anything that is not
 * a `DomainError` is still a bug and still throws.
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

  async dispatch<A extends Action>(action: A): Promise<Result<ResultOf<A>>> {
    const handler = this.handlers.find((h) => h.supports(action));
    if (!handler) {
      return err(
        new DomainError(`no handler supports action '${action.kind}'`, 'kernel.no-handler'),
      );
    }
    try {
      return (await handler.handle(action)) as Result<ResultOf<A>>;
    } catch (thrown) {
      // A named refusal that took the throwing exit — put it back on
      // the rail every caller already handles. Anything else is a
      // bug, and a bug must not be dressed up as a refusal.
      if (thrown instanceof DomainError) return err(thrown);
      throw thrown;
    }
  }
}
