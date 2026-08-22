/**
 * The `keel ui` composition root: binds a loopback socket, mints the
 * per-run token, wires the router over the mediator the CLI already
 * built, and adapts `node:http` to the transport DTOs.
 *
 * Everything above this file is a pure function of a request. This is
 * the only place that knows about sockets, and the adapter is small
 * on purpose: read the body with a cap, normalise the request, call
 * the router, write the response.
 *
 * The URL it reports carries the token in the query string. That is
 * how the page gets it — the browser navigates once, the script reads
 * it out of `location`, replaces the address so it does not linger in
 * history, and sends it as a header thereafter. It is the shape
 * Jupyter uses, for the same reason: there is no login to put in
 * front of a server that exists for one session.
 */

import http from 'node:http';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Mediator } from '../../../domain/kernel/mediator.js';
import { buildApi } from '../contract/api.js';
import { buildRouter } from '../contract/router.js';
import type { UiRequest, UiResponse } from '../contract/http.js';
import type { ServeUi, UiServer, UiServerOptions } from '../contract/server.js';
import { fsDirectoryReader } from './directories.js';
import { buildStatics } from './static-files.js';

/**
 * Body cap. Every legitimate request here is a target plus an answer
 * map — kilobytes at the very most — so a megabyte is generous, and
 * refusing past it keeps a stray upload from being buffered whole.
 */
const MAX_BODY_BYTES = 1024 * 1024;

/** Builds the {@link ServeUi} the CLI is wired with. */
export function uiServer(mediator: Mediator): ServeUi {
  return async (options: UiServerOptions): Promise<UiServer> => {
    const token = randomBytes(24).toString('base64url');
    const api = buildApi({ mediator, directories: fsDirectoryReader(options.cwd) });
    const statics = buildStatics();

    const server = http.createServer();
    const address = await listen(server, options);
    const hosts = loopbackHosts(address.port);
    const route = buildRouter({ api, statics, token, hosts });

    server.on('request', (incoming, outgoing) => {
      void handle(route, incoming, outgoing);
    });

    const closed = new Promise<void>((resolve) => server.once('close', () => resolve()));
    return {
      url: `http://${displayHost(options.host, address)}/?token=${token}`,
      closed,
      // Idempotent: `keel ui` closes on SIGINT and again on SIGTERM,
      // and node's `close` reports "Server is not running" the second
      // time. Already stopped is the outcome the caller asked for.
      close: async () => {
        if (!server.listening) return closed;
        // Idle keep-alive sockets would otherwise hold `close` open
        // until they time out; the page's own connection is exactly
        // such a socket.
        server.close();
        server.closeAllConnections();
        return closed;
      },
    };
  };
}

function listen(server: http.Server, options: UiServerOptions): Promise<AddressInfo> {
  return new Promise<AddressInfo>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, () => {
      server.removeListener('error', reject);
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('keel ui: server bound to a non-IP address'));
        return;
      }
      resolve(address);
    });
  });
}

async function handle(
  route: (request: UiRequest) => Promise<UiResponse>,
  incoming: http.IncomingMessage,
  outgoing: http.ServerResponse,
): Promise<void> {
  try {
    const body = await readBody(incoming);
    if (body === null) {
      outgoing.writeHead(413, { 'content-type': 'text/plain; charset=utf-8' });
      outgoing.end('request body too large');
      return;
    }
    const response = await route(normalise(incoming, body));
    outgoing.writeHead(response.status, response.headers);
    outgoing.end(incoming.method === 'HEAD' ? undefined : response.body);
  } catch (error) {
    outgoing.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    outgoing.end(error instanceof Error ? error.message : String(error));
  }
}

function normalise(incoming: http.IncomingMessage, body: string): UiRequest {
  const url = new URL(incoming.url ?? '/', 'http://placeholder.invalid');
  const query: Record<string, string> = {};
  for (const [key, value] of url.searchParams) query[key] = value;
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(incoming.headers)) {
    if (typeof value === 'string') headers[key] = value;
    else if (Array.isArray(value)) headers[key] = value.join(', ');
  }
  return {
    method: (incoming.method ?? 'GET').toUpperCase(),
    path: url.pathname,
    query,
    headers,
    body,
  };
}

/** Reads the body, or null once it exceeds {@link MAX_BODY_BYTES}. */
function readBody(incoming: http.IncomingMessage): Promise<string | null> {
  return new Promise<string | null>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    incoming.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        incoming.destroy();
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    incoming.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    incoming.on('error', reject);
  });
}

/**
 * The `Host` values the guard accepts: every loopback spelling of the
 * bound port. A browser sends whichever the user typed, and `keel ui`
 * prints one of them — but a bookmarked `localhost` should not 403
 * against a server that printed `127.0.0.1`.
 */
function loopbackHosts(port: number): readonly string[] {
  return [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`];
}

/** The host to print, bracketing IPv6 so the URL is well-formed. */
function displayHost(requested: string, address: AddressInfo): string {
  const host = requested === '::1' || address.family === 'IPv6' ? `[${requested}]` : requested;
  return `${host}:${address.port}`;
}
