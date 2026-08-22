/**
 * The client for the local API.
 *
 * It owns exactly one secret and one convention: the per-run token
 * the CLI put in the URL, and the `x-keel-token` header every request
 * carries it in. The token is read out of `location` once and the
 * address bar is rewritten immediately, so a copied link or a
 * screenshot of the tab does not hand it out.
 *
 * Every call resolves to `{ ok, value }` or `{ ok: false, error }`,
 * mirroring the `Result` the domain returns — the page renders a
 * refusal the same way whether it came from a handler or from the
 * network being gone.
 */

const TOKEN_HEADER = 'x-keel-token';

/** Reads the token from the URL and scrubs it from the address bar. */
function claimToken() {
  const url = new URL(window.location.href);
  const token = url.searchParams.get('token') ?? '';
  if (token !== '') {
    url.searchParams.delete('token');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  }
  return token;
}

const token = claimToken();

/** The catalog of stacks and verticals. */
export const catalog = () => send('GET', '/api/catalog');

/** What keel knows about `path`. */
export const project = (path) => send('GET', `/api/project?path=${encodeURIComponent(path)}`);

/** Subdirectories of `path`, for the target picker. */
export const browse = (path) =>
  send('GET', path ? `/api/browse?path=${encodeURIComponent(path)}` : '/api/browse');

/** What the install would ask and write — writes nothing. */
export const preview = (body) => send('POST', '/api/preview', body);

/** Runs the install for real. */
export const install = (body) => send('POST', '/api/install', body);

async function send(method, path, body) {
  let response;
  try {
    response = await fetch(path, {
      method,
      headers: {
        [TOKEN_HEADER]: token,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (cause) {
    return {
      ok: false,
      error: {
        code: 'keel.web.unreachable',
        message: `cannot reach the keel server — is 'keel ui' still running? (${String(cause)})`,
      },
    };
  }

  const payload = await readJson(response);
  if (!response.ok) {
    return {
      ok: false,
      error: payload?.error ?? {
        code: `keel.web.http-${response.status}`,
        message: `${method} ${path} failed with ${response.status}`,
      },
    };
  }
  return { ok: true, value: payload };
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
