import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { currentContext, type RequestContext } from '../src/observability/context.ts';
import { addReadinessCheck, instrument, markReady } from '../src/observability/http.ts';

/**
 * Drives the instrumented server over the wire: both probes answer
 * (readiness gated on markReady and on registered checks), the
 * correlation id round-trips, and the request context is visible
 * inside the handler's async chain. The OpenTelemetry API calls
 * no-op without a started SDK, so the test needs no collector.
 */

let server: Server;
let base: string;
let seenContext: RequestContext | undefined;

beforeAll(async () => {
  server = instrument(
    createServer((_request, response) => {
      seenContext = currentContext();
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: true }));
    }),
  );
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port bound');
  base = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe('health probes', () => {
  it('liveness is up from the start', async () => {
    const response = await fetch(`${base}/health/live`);
    expect(response.status).toBe(200);
  });

  it('readiness gates on markReady and registered checks', async () => {
    expect((await fetch(`${base}/health/ready`)).status).toBe(503);

    markReady();
    expect((await fetch(`${base}/health/ready`)).status).toBe(200);

    addReadinessCheck('db', () => false);
    const failing = await fetch(`${base}/health/ready`);
    expect(failing.status).toBe(503);
    expect(await failing.json()).toEqual({ status: 'down', failed: 'db' });

    addReadinessCheck('db', () => true);
    expect((await fetch(`${base}/health/ready`)).status).toBe(200);
  });
});

describe('request context', () => {
  it('echoes the supplied correlation id and binds the context', async () => {
    const response = await fetch(`${base}/anything`, {
      headers: { 'x-correlation-id': 'corr-123', 'x-tenant-id': 'tenant-9' },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('x-correlation-id')).toBe('corr-123');
    expect(seenContext).toEqual({ correlationId: 'corr-123', tenantId: 'tenant-9' });
  });

  it('mints a correlation id when absent', async () => {
    const response = await fetch(`${base}/anything`);
    expect(response.status).toBe(200);
    expect(response.headers.get('x-correlation-id')).not.toBe('');
    expect(response.headers.get('x-correlation-id')).not.toBeNull();
  });
});
