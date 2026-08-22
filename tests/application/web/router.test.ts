/**
 * The three guards.
 *
 * This server writes files anywhere the user can write and listens on
 * a port every page in the user's browser can reach, so each of these
 * cases is a way in that has to stay shut. They are tested here
 * rather than over a socket because the guard is a pure function of a
 * request — asserting it needs a request, not a network.
 */

import { describe, expect, it } from 'vitest';
import { buildRouter, TOKEN_HEADER } from '../../../src/application/web/contract/router.js';
import {
  json,
  type UiRequest,
  type UiResponse,
} from '../../../src/application/web/contract/http.js';

const TOKEN = 'a-secret-token';
const HOSTS = ['127.0.0.1:7420', 'localhost:7420'];

const answered = (body: string) => (): Promise<UiResponse | null> =>
  Promise.resolve(json({ from: body }));
const silent = (): Promise<UiResponse | null> => Promise.resolve(null);

function route(request: Partial<UiRequest>): Promise<UiResponse> {
  return buildRouter({
    api: answered('api'),
    statics: answered('statics'),
    token: TOKEN,
    hosts: HOSTS,
  })({
    method: 'GET',
    path: '/api/catalog',
    query: {},
    headers: { host: HOSTS[0]!, [TOKEN_HEADER]: TOKEN },
    body: '',
    ...request,
  });
}

const bodyOf = (response: UiResponse): Record<string, unknown> =>
  JSON.parse(response.body) as Record<string, unknown>;

describe('the router guards', () => {
  it('serves an API request carrying the token from an expected host', async () => {
    const response = await route({});
    expect(response.status).toBe(200);
    expect(bodyOf(response)).toEqual({ from: 'api' });
  });

  it('refuses an API request with no token', async () => {
    const response = await route({ headers: { host: HOSTS[0]! } });
    expect(response.status).toBe(401);
  });

  it('refuses an API request whose token is wrong but the right length', async () => {
    const wrong = 'b'.repeat(TOKEN.length);
    const response = await route({ headers: { host: HOSTS[0]!, [TOKEN_HEADER]: wrong } });
    expect(response.status).toBe(401);
  });

  it('refuses any request for an unexpected Host — the DNS-rebinding door', async () => {
    const response = await route({
      path: '/',
      headers: { host: 'attacker.example:7420', [TOKEN_HEADER]: TOKEN },
    });
    expect(response.status).toBe(403);
    // Even the inert page: rebinding wants the origin, not the HTML.
    expect(response.body).toContain('unexpected Host');
  });

  it('refuses a request with no Host header at all', async () => {
    const response = await route({ headers: {} });
    expect(response.status).toBe(403);
  });

  it('refuses a cross-origin request even with a valid token', async () => {
    const response = await route({
      headers: { host: HOSTS[0]!, origin: 'https://evil.example', [TOKEN_HEADER]: TOKEN },
    });
    expect(response.status).toBe(403);
  });

  it('accepts the page’s own Origin', async () => {
    const response = await route({
      headers: { host: HOSTS[0]!, origin: `http://${HOSTS[0]!}`, [TOKEN_HEADER]: TOKEN },
    });
    expect(response.status).toBe(200);
  });

  it('answers every loopback spelling it was bound as', async () => {
    const response = await route({ headers: { host: HOSTS[1]!, [TOKEN_HEADER]: TOKEN } });
    expect(response.status).toBe(200);
  });

  it('serves the page without a token — the assets are inert', async () => {
    const response = await route({ path: '/', headers: { host: HOSTS[0]! } });
    expect(response.status).toBe(200);
    expect(bodyOf(response)).toEqual({ from: 'api' });
  });

  it('falls through to the statics when the API declines', async () => {
    const response = await buildRouter({
      api: silent,
      statics: answered('statics'),
      token: TOKEN,
      hosts: HOSTS,
    })({
      method: 'GET',
      path: '/app/app.css',
      query: {},
      headers: { host: HOSTS[0]! },
      body: '',
    });
    expect(bodyOf(response)).toEqual({ from: 'statics' });
  });

  it('404s when neither handler answers', async () => {
    const response = await buildRouter({
      api: silent,
      statics: silent,
      token: TOKEN,
      hosts: HOSTS,
    })({
      method: 'GET',
      path: '/nowhere',
      query: {},
      headers: { host: HOSTS[0]! },
      body: '',
    });
    expect(response.status).toBe(404);
  });

  it('never sends a CORS header — a cross-origin reply must not be readable', async () => {
    const response = await route({});
    expect(Object.keys(response.headers).map((name) => name.toLowerCase())).not.toContain(
      'access-control-allow-origin',
    );
  });
});
