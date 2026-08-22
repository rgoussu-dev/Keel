/**
 * The transport DTOs the local UI adapter is written against, and
 * the constructors for the handful of responses it returns.
 *
 * `node:http` is deliberately absent. The whole request path —
 * authorisation, routing, mapping a body to a command, mapping a
 * `Result` back — is a function from {@link UiRequest} to
 * {@link UiResponse}, so it is tested by calling it, with no socket
 * and no port. The executable owns the one adapter that turns a real
 * `IncomingMessage` into the first and a `ServerResponse` into the
 * second.
 *
 * Bodies are strings because everything this server sends is text:
 * JSON for the API, HTML/CSS/JS/SVG for the page. A binary asset
 * would need this to widen, and nothing here ships one.
 */

/** An inbound request, normalised. */
export interface UiRequest {
  /** Uppercase HTTP method. */
  readonly method: string;
  /** Path only — no query string, always starting with `/`. */
  readonly path: string;
  /** Decoded query parameters; a repeated key keeps its last value. */
  readonly query: Readonly<Record<string, string>>;
  /** Header names lowercased, as `node:http` already delivers them. */
  readonly headers: Readonly<Record<string, string>>;
  /** The raw body; empty string when there is none. */
  readonly body: string;
}

/** An outbound response. */
export interface UiResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

/**
 * A request handler. Returning `null` means "not mine" — the router
 * tries the next one, which is how the API and the static files
 * share one path space without either knowing the other's routes.
 */
export type UiHandler = (request: UiRequest) => Promise<UiResponse | null>;

/**
 * Headers every response carries.
 *
 * `no-store` because the page is served from a process that exists
 * for one session: a cached `app.js` from yesterday's `keel ui` is a
 * bug report about a bug that was fixed. The rest are the standard
 * hardening set — this server writes files to disk on request, so
 * being framed or sniffed is worth refusing outright.
 */
const BASE_HEADERS: Readonly<Record<string, string>> = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
};

/** A JSON response carrying `value`. */
export function json(value: unknown, status = 200): UiResponse {
  return respond(status, 'application/json; charset=utf-8', JSON.stringify(value));
}

/** A text-ish response with an explicit content type. */
export function content(body: string, contentType: string, status = 200): UiResponse {
  return respond(status, contentType, body);
}

/** The shape every API failure takes, so one client branch handles all of them. */
export interface ApiError {
  readonly error: { readonly code: string; readonly message: string };
}

/** A JSON error response carrying a stable code and a display message. */
export function failure(status: number, code: string, message: string): UiResponse {
  const payload: ApiError = { error: { code, message } };
  return json(payload, status);
}

function respond(status: number, contentType: string, body: string): UiResponse {
  return {
    status,
    headers: { ...BASE_HEADERS, 'content-type': contentType },
    body,
  };
}
