/**
 * The kernel: dispatchable-action bases, the outcome envelope, the
 * handler contract, and the mediator port. Depends on nothing — not
 * even the Node type definitions.
 *
 * The `R` type parameter is phantom: it exists so `Mediator.dispatch`
 * and `Handler.handle` recover a command's result type at compile
 * time. `RESULT` is never assigned at runtime.
 */

declare const RESULT: unique symbol;

/** Base of everything the mediator can dispatch. */
export interface Command<R = unknown> {
  /** Discriminant naming the operation, e.g. `greet`. */
  readonly kind: string;
  /** Phantom carrier for the command's result type; never set. */
  readonly [RESULT]?: R;
}

/** Recovers the result type a command was declared with. */
export type ResultOf<C extends Command> = C extends Command<infer R> ? R : never;

/**
 * A named, expected domain failure. `code` is a stable
 * machine-readable identifier (`greet.rejected`); `message` is
 * user-facing prose the primary adapter may map to its transport.
 */
export class DomainError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

/** Successful outcome carrying the handler's result value. */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

/** Failed outcome carrying the domain error. */
export interface Err {
  readonly ok: false;
  readonly error: DomainError;
}

/** Discriminated success-or-failure union. */
export type Result<T> = Ok<T> | Err;

/** Wraps a value in a successful {@link Result}. */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/** Wraps a domain error in a failed {@link Result}. */
export function err(error: DomainError): Err {
  return { ok: false, error };
}

/**
 * Handles one family of commands. `supports` is a type guard so a
 * routed command arrives at `handle` already narrowed. Handlers
 * self-declare what they support; the mediator probes the predicate
 * — no injected maps, no reflection.
 */
export interface Handler<C extends Command = Command> {
  /** Reports whether this handler can handle the given command. */
  supports(command: Command): command is C;
  /** Executes the command and returns its outcome. */
  handle(command: C): Promise<Result<ResultOf<C>>>;
}

/** Routes a command to the single handler that supports it. */
export interface Mediator {
  /**
   * Dispatches `command` to its handler and returns the handler's
   * outcome. A command no handler supports resolves to an `Err`
   * with code `kernel.no-handler`.
   */
  dispatch<C extends Command>(command: C): Promise<Result<ResultOf<C>>>;
}
