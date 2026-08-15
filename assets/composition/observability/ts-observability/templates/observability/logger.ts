import { currentContext } from './context.ts';

/**
 * Minimal structured logger: one JSON object per line on stdout,
 * automatically stamped with the request context (correlation id,
 * tenant id) — so every line of a request is correlated. Swap the
 * implementation for a full logging library later; keep call sites
 * on this facade.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

function emit(level: Level, message: string, fields: Record<string, unknown> = {}): void {
  const context = currentContext();
  const line: Record<string, unknown> = {
    time: new Date().toISOString(),
    level,
    message,
    ...(context === undefined
      ? {}
      : {
          correlationId: context.correlationId,
          ...(context.tenantId === undefined ? {} : { tenantId: context.tenantId }),
        }),
    ...fields,
  };
  process.stdout.write(`${JSON.stringify(line)}\n`);
}

/** The logging facade of the service. */
export const logger = {
  debug: (message: string, fields?: Record<string, unknown>): void =>
    emit('debug', message, fields),
  info: (message: string, fields?: Record<string, unknown>): void => emit('info', message, fields),
  warn: (message: string, fields?: Record<string, unknown>): void => emit('warn', message, fields),
  error: (message: string, fields?: Record<string, unknown>): void =>
    emit('error', message, fields),
};
