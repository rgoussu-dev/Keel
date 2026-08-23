/**
 * Handler for `keel.dials` — which settings of a target's dials the
 * rules still allow, and the target those settings settle at.
 *
 * A pure read over the registries, like `keel.catalog`, and it is a
 * query for the same reason: the answer has to travel. What makes it
 * a *second* query rather than more fields on the catalog is what it
 * is a function of. The catalog is a function of the registry; this
 * is a function of the choices made so far. Folding it in would grow
 * `StackDescriptor` by a cross-product with every dial added, and
 * would turn a flat description of a preset into a table of
 * combinations.
 *
 * Folding it into `keel.preview` would be worse in a subtler way: a
 * preview of an illegal assembly *is* the refusal, so the menus that
 * would let a caller correct it would arrive only when they were not
 * needed. This answers regardless — see `../dials.ts`.
 */

import type { Action } from '../../kernel/action.js';
import type { Handler } from '../../kernel/handler.js';
import { ok, type Result } from '../../kernel/result.js';
import type { DialOptions, DialsQuery } from '../../contract/queries.js';
import type { Registry } from '../../contract/ports/registry.js';
import { dialOptionsFor } from '../dials.js';

/** The one port this query needs. */
export interface DialsDeps {
  /** What this run may install — keel's own pieces plus any plugin's. */
  readonly registry: Registry;
}

/** Executes {@link DialsQuery}s. */
export class DialsHandler implements Handler<DialsQuery> {
  constructor(private readonly deps: DialsDeps) {}

  supports(action: Action): action is DialsQuery {
    return action.kind === 'keel.dials';
  }

  handle(query: DialsQuery): Promise<Result<DialOptions>> {
    return Promise.resolve(ok(dialOptionsFor(this.deps.registry, query.target)));
  }
}
