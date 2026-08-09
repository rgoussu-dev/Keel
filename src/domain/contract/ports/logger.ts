/**
 * The Logger port — leveled progress output. The domain narrates
 * through this interface only; where the lines land (stderr, a test
 * recording, nothing) is the adapter's choice.
 */

/** Minimal leveled logger. */
export interface Logger {
  info(msg: string): void;
  success(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  debug(msg: string): void;
}
