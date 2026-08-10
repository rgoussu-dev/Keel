/**
 * `gateway/ts-cors` adapter — the TypeScript backend's side of the
 * service-to-service seam. When a sibling SPA is in scope
 * (`peer.ui.spa`), decorates the HTTP unit at the assembly point
 * (`main.ts`) with a CORS wrapper allowing the Vite dev server's
 * origin — cross-cutting as a decorator where the pieces are wired,
 * per the binding spec's stance. Dev-only at runtime: the wrapper is
 * a no-op under `NODE_ENV=production` (set by the production
 * container), so deployed services never serve the dev origin; SPA
 * production traffic arrives same-origin through the reverse proxy.
 */

import type { Adapter } from '../../contract/composition.js';

export const TS_CORS_ID = 'gateway/ts-cors';

const MAIN_TARGET = 'application/rest/src/main.ts';

const SERVE_CALL = 'createGreetServer(mediator).listen(port, () => {';
const SERVE_CALL_WRAPPED = 'withCors(createGreetServer(mediator)).listen(port, () => {';

const IMPORT_LINE = "import type { Server } from 'node:http';";

const CORS_FN = `
/**
 * Allows the sibling SPA's dev origin to call this API directly
 * during development. Dev-only: a no-op under NODE_ENV=production
 * (which the production container sets), where the SPA's traffic
 * arrives same-origin through its reverse proxy.
 */
function withCors(server: Server): Server {
  if (process.env.NODE_ENV === 'production') return server;
  const inner = server.listeners('request') as Array<(...args: unknown[]) => void>;
  server.removeAllListeners('request');
  server.on('request', (request, response) => {
    response.setHeader('access-control-allow-origin', 'http://localhost:5173');
    if (request.method === 'OPTIONS') {
      response.setHeader('access-control-allow-methods', 'GET');
      const requested = request.headers['access-control-request-headers'];
      if (requested !== undefined) response.setHeader('access-control-allow-headers', requested);
      response.writeHead(204).end();
      return;
    }
    for (const listener of inner) listener(request, response);
  });
  return server;
}
`;

const WRAP_MARKER = 'withCors(createGreetServer(mediator))';
const CORS_FN_SIGNATURE = 'function withCors(server: Server): Server {';

export const tsCorsAdapter: Adapter = {
  id: TS_CORS_ID,
  vertical: 'gateway',
  covers: [],
  predicate: { requires: ['lang.typescript', 'runtime.node', 'arch.server-http', 'peer.ui.spa'] },
  contribute() {
    return {
      patches: [
        {
          target: MAIN_TARGET,
          apply: (existing) => {
            const wrapped = existing.includes(WRAP_MARKER);
            const decorated = existing.includes(CORS_FN_SIGNATURE);
            if (wrapped && decorated) return existing;
            if (wrapped || decorated) {
              throw new Error(
                `${TS_CORS_ID}: ${MAIN_TARGET} is partially CORS-decorated (${
                  wrapped
                    ? 'the listen call is wrapped but withCors is missing'
                    : 'withCors is present but the listen call is unwrapped'
                }); reconcile it manually`,
              );
            }
            if (!existing.includes(SERVE_CALL)) {
              throw new Error(
                `${TS_CORS_ID}: could not find the listen call in ${MAIN_TARGET} — the assembly point has diverged from the ts-http bootstrap; decorate the server with a CORS wrapper manually`,
              );
            }
            const body = existing.replace(SERVE_CALL, SERVE_CALL_WRAPPED);
            return `${IMPORT_LINE}\n${body.trimEnd()}\n${CORS_FN}`;
          },
        },
      ],
    };
  },
};
