/**
 * The request pipeline of `keel ui`: guards first, then the API,
 * then the static page, then 404.
 *
 * **The guards are the reason this file exists separately.** This
 * server writes files anywhere the user can write, and it listens on
 * a port every page in the user's browser can reach. Loopback is not
 * a boundary: `http://127.0.0.1:7420` is same-machine, not
 * same-origin, and a tab open on any website can send it requests.
 * Three checks close that, and each closes something the others do
 * not:
 *
 *   1. **A bearer token in a custom header.** The token is minted per
 *      run and handed to the page in the URL the CLI prints. A
 *      cross-origin request cannot read it, and asking for a custom
 *      header forces a preflight this server answers for nobody — so
 *      the drive-by `fetch` never reaches a route. Compared in
 *      constant time, since it is a secret.
 *   2. **A `Host` allowlist.** Answering only to the loopback names
 *      it was bound as defeats DNS rebinding, where an attacker's
 *      domain resolves to 127.0.0.1 and the browser then treats the
 *      server as same-origin — token and all.
 *   3. **An `Origin` allowlist.** A same-origin `fetch` from the page
 *      sends no `Origin`; a cross-origin one always does. Any
 *      `Origin` that is not this server is refused before routing.
 *
 * The static page is deliberately behind the host guard and *not*
 * behind the token: the browser navigates to it before any script of
 * ours runs, and the assets are inert. The token gates the routes
 * that act.
 */

import { failure, type UiHandler, type UiRequest, type UiResponse } from './http.js';

/** Error code returned when a request fails one of the guards. */
export const FORBIDDEN = 'keel.web.forbidden';

/** What the composition root wires into the router. */
export interface RouterDeps {
  /** The API handler; consulted first, and the only one behind the token. */
  readonly api: UiHandler;
  /** The static-asset handler serving the page itself. */
  readonly statics: UiHandler;
  /** Per-run secret the page must echo in `x-keel-token`. */
  readonly token: string;
  /**
   * `host:port` values this server answers to — every loopback
   * spelling of the address it actually bound.
   */
  readonly hosts: readonly string[];
}

/** The header the page carries its token in. */
export const TOKEN_HEADER = 'x-keel-token';

/** Builds the full request pipeline. */
export function buildRouter(deps: RouterDeps): (request: UiRequest) => Promise<UiResponse> {
  const hosts = new Set(deps.hosts);
  const origins = new Set(deps.hosts.map((host) => `http://${host}`));

  return async (request: UiRequest): Promise<UiResponse> => {
    const refusal = guard(request, hosts, origins, deps.token);
    if (refusal) return refusal;

    const answered = (await deps.api(request)) ?? (await deps.statics(request));
    return answered ?? failure(404, 'keel.web.not-found', `nothing at ${request.path}`);
  };
}

function guard(
  request: UiRequest,
  hosts: ReadonlySet<string>,
  origins: ReadonlySet<string>,
  token: string,
): UiResponse | null {
  const host = request.headers['host'];
  if (host === undefined || !hosts.has(host)) {
    return failure(403, FORBIDDEN, `unexpected Host header: ${host ?? '(absent)'}`);
  }
  const origin = request.headers['origin'];
  if (origin !== undefined && !origins.has(origin)) {
    return failure(403, FORBIDDEN, `cross-origin request refused: ${origin}`);
  }
  if (!request.path.startsWith('/api')) return null;
  if (!sameSecret(request.headers[TOKEN_HEADER], token)) {
    return failure(401, 'keel.web.unauthorized', `missing or invalid ${TOKEN_HEADER}`);
  }
  return null;
}

/**
 * Constant-time string comparison.
 *
 * `node:crypto.timingSafeEqual` would do it, but it lives in the
 * executable's world and this module is transport-shaped and
 * node-free; the loop is four lines and does the same job. Length is
 * compared first and leaks only the length, which for a fixed-size
 * generated token is not a secret.
 */
function sameSecret(supplied: string | undefined, expected: string): boolean {
  if (supplied === undefined || supplied.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < expected.length; i += 1) {
    difference |= supplied.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return difference === 0;
}
