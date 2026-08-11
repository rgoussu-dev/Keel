import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * The per-request correlation context, established by `instrument`
 * (see `http.ts`) before any handler runs and readable anywhere in
 * the request's async chain — the Node equivalent of an MDC.
 *
 * Extension point: to propagate another field (a user id, a request
 * source, …), add it here and parse it in `http.ts` — the tenant id
 * below is the worked example. Keep all header parsing there so the
 * rest of the application only ever reads this type.
 */
export interface RequestContext {
  readonly correlationId: string;
  /** Absent outside multi-tenant calls. */
  readonly tenantId?: string;
}

/** Header carrying the caller-supplied correlation id. */
export const CORRELATION_ID_HEADER = 'x-correlation-id';

/** Header carrying the tenant id in multi-tenant scenarios. */
export const TENANT_ID_HEADER = 'x-tenant-id';

const storage = new AsyncLocalStorage<RequestContext>();

/** Runs `fn` with `context` bound to the current async chain. */
export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

/** The context of the current async chain, if inside a request. */
export function currentContext(): RequestContext | undefined {
  return storage.getStore();
}
