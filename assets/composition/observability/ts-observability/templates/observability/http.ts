import { randomUUID } from 'node:crypto';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { metrics, SpanKind, trace } from '@opentelemetry/api';
import {
  CORRELATION_ID_HEADER,
  TENANT_ID_HEADER,
  runWithContext,
  type RequestContext,
} from './context.ts';

/**
 * Server decoration — cross-cutting concerns applied at the assembly
 * point, leaving the business handlers untouched. `instrument(server)`
 * swaps the server's request listeners for a wrapper that answers
 * the health probes, establishes the request context (correlation id
 * extracted or minted, echoed on the response), opens a server span
 * tagged with it, counts the request, and only then delegates to the
 * original listeners inside the bound context.
 *
 * Probes: liveness `GET /health/live` answers "is the process
 * alive?" and deliberately checks no dependencies — a liveness
 * failure means "restart me", and a dead shared dependency would
 * restart-storm the fleet. Readiness `GET /health/ready` answers
 * "route traffic to me?": down until `markReady()` after wiring, and
 * aggregating every `addReadinessCheck` so a failing dependency
 * drains the instance without restarting it.
 */

let ready = false;
const readinessChecks = new Map<string, () => boolean>();

/** Flip the readiness gate once the server is wired and listening. */
export function markReady(): void {
  ready = true;
}

/**
 * Registers a named dependency check — a datasource ping, a
 * downstream probe, a cache warm flag. Returning false fails
 * readiness (never liveness).
 */
export function addReadinessCheck(name: string, check: () => boolean): void {
  readinessChecks.set(name, check);
}

const tracer = trace.getTracer('observability');
const meter = metrics.getMeter('observability');
const requests = meter.createCounter('app.http.requests', {
  description: 'HTTP requests, by path',
  unit: '{request}',
});

/** Decorates `server` with probes, request context, and telemetry. */
export function instrument(server: Server): Server {
  const listeners = server.listeners('request') as Array<
    (request: IncomingMessage, response: ServerResponse) => void
  >;
  server.removeAllListeners('request');
  server.on('request', (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname === '/health/live' || url.pathname === '/health/ready') {
      health(url.pathname, response);
      return;
    }
    const context = contextFrom(request);
    response.setHeader(CORRELATION_ID_HEADER, context.correlationId);
    requests.add(1, { 'http.route': url.pathname });
    const span = tracer.startSpan(`${request.method ?? 'GET'} ${url.pathname}`, {
      kind: SpanKind.SERVER,
      attributes: {
        'http.route': url.pathname,
        'app.correlation_id': context.correlationId,
        ...(context.tenantId === undefined ? {} : { 'app.tenant_id': context.tenantId }),
      },
    });
    response.once('finish', () => {
      span.setAttribute('http.response.status_code', response.statusCode);
      span.end();
    });
    runWithContext(context, () => {
      for (const listener of listeners) listener.call(server, request, response);
    });
  });
  return server;
}

function contextFrom(request: IncomingMessage): RequestContext {
  const supplied = headerValue(request, CORRELATION_ID_HEADER);
  const tenantId = headerValue(request, TENANT_ID_HEADER);
  return {
    correlationId: supplied ?? randomUUID(),
    ...(tenantId === undefined ? {} : { tenantId }),
  };
}

function headerValue(request: IncomingMessage, name: string): string | undefined {
  const raw = request.headers[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === '' ? undefined : trimmed;
}

function health(pathname: string, response: ServerResponse): void {
  if (pathname === '/health/live') {
    respond(response, 200, { status: 'up' });
    return;
  }
  const failed = [...readinessChecks.entries()].find(([, check]) => !check())?.[0];
  if (!ready || failed !== undefined) {
    respond(response, 503, {
      status: 'down',
      ...(failed === undefined ? { reason: 'starting' } : { failed }),
    });
    return;
  }
  respond(response, 200, { status: 'up' });
}

function respond(response: ServerResponse, status: number, body: Record<string, string>): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}
