/**
 * The outcome envelope every handler returns. Expected business
 * failures travel as `Err` carrying a `DomainError`; genuine bugs
 * keep throwing. Primary adapters map `Err` to their transport shape
 * (exit code + stderr for the CLI); domain code never knows about
 * transport.
 */

/**
 * A named, expected domain failure. `code` is a stable
 * machine-readable identifier (`keel.unknown-stack`); `message` is
 * user-facing prose the primary adapter may display verbatim.
 */
export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'DomainError';
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
