/**
 * Dispatchable-action bases. Every business operation keel exposes is
 * named by a concrete `Command` or `Query` subtype in
 * `domain/contract`; nothing dispatches a bare `Action`.
 *
 * The `R` type parameter is phantom: it exists so `Mediator.dispatch`
 * and `Handler.handle` recover an action's result type at compile
 * time. `RESULT` is never assigned at runtime.
 */

declare const RESULT: unique symbol;

/** Base of everything the mediator can dispatch. */
export interface Action<R = unknown> {
  /** Discriminant naming the operation, e.g. `keel.new-project`. */
  readonly kind: string;
  /** Phantom carrier for the action's result type; never set. */
  readonly [RESULT]?: R;
}

/** An action that mutates state. */
export interface Command<R = unknown> extends Action<R> {
  readonly intent: 'command';
}

/** An action that only reads state. */
export interface Query<R = unknown> extends Action<R> {
  readonly intent: 'query';
}

/** Recovers the result type an action was declared with. */
export type ResultOf<A extends Action> = A extends Action<infer R> ? R : never;
