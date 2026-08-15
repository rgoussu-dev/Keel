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
import { eolOf, withEol } from '../util.js';
import { TS_HTTP_BOOTSTRAP_ID } from './ts-http-bootstrap.js';
import { tsLayout } from './ts-module-layout.js';

export const TS_CORS_ID = 'gateway/ts-cors';

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

// The observability vertical rewires the same assembly point first
// (greenfield stacks run it before the gateway); in that shape the
// CORS decoration wraps the instrumented server instead.
const OBSERVED_CALL = 'const server = instrument(createGreetServer(mediator));';
const OBSERVED_CALL_WRAPPED = 'const server = withCors(instrument(createGreetServer(mediator)));';

const CORS_FN_SIGNATURE = 'function withCors(server: Server): Server {';

export const tsCorsAdapter: Adapter = {
  id: TS_CORS_ID,
  vertical: 'gateway',
  covers: [],
  predicate: { requires: ['lang.typescript', 'runtime.node', 'arch.server-http', 'peer.ui.spa'] },
  contribute(ctx) {
    // Both layouts assemble in application/rest, but which directory
    // that is stays the layout's answer to give.
    const layout = tsLayout(
      ctx.manifest.tags,
      ctx.manifest.answers[TS_HTTP_BOOTSTRAP_ID]?.npmScope ?? '',
    );
    const mainTarget = `${layout.restSrc}/main.ts`;
    return {
      patches: [
        {
          target: mainTarget,
          apply: (existing) => {
            const wrapped =
              existing.includes(SERVE_CALL_WRAPPED) || existing.includes(OBSERVED_CALL_WRAPPED);
            const decorated = existing.includes(CORS_FN_SIGNATURE);
            if (wrapped && decorated) return existing;
            if (wrapped || decorated) {
              throw new Error(
                `${TS_CORS_ID}: ${mainTarget} is partially CORS-decorated (${
                  wrapped
                    ? 'the listen call is wrapped but withCors is missing'
                    : 'withCors is present but the listen call is unwrapped'
                }); reconcile it manually`,
              );
            }
            const anchor = existing.includes(SERVE_CALL)
              ? ([SERVE_CALL, SERVE_CALL_WRAPPED] as const)
              : existing.includes(OBSERVED_CALL)
                ? ([OBSERVED_CALL, OBSERVED_CALL_WRAPPED] as const)
                : null;
            if (anchor === null) {
              throw new Error(
                `${TS_CORS_ID}: could not find the listen call in ${mainTarget} — the assembly point has diverged from the ts-http bootstrap; decorate the server with a CORS wrapper manually`,
              );
            }
            const eol = eolOf(existing);
            const body = existing.replace(anchor[0], anchor[1]);
            return `${IMPORT_LINE}${eol}${body.trimEnd()}${withEol(`\n${CORS_FN}`, eol)}`;
          },
        },
      ],
    };
  },
};
