import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadWrapperJar } from '../src/schematics/gradle-wrapper/download.js';
import { sha256 } from '../src/util/hash.js';

const FAKE_JAR = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(1024)]);
const FAKE_JAR_SHA = sha256(FAKE_JAR);

interface RouteMap {
  [url: string]: { ok: boolean; status?: number; body: Buffer | string };
}

/**
 * Test factory: a `fetch` stand-in that resolves URLs against a static
 * route map. Lets each scenario stage exactly the responses it needs
 * without standing up an HTTP server.
 */
function fakeFetch(routes: RouteMap): typeof fetch {
  return ((url: string | URL): Promise<Response> => {
    const key = url.toString();
    const route = routes[key];
    if (!route) {
      return Promise.resolve(new Response('not found', { status: 404 }));
    }
    const body = route.body;
    const init: ResponseInit = { status: route.ok ? 200 : (route.status ?? 500) };
    if (typeof body === 'string') return Promise.resolve(new Response(body, init));
    return Promise.resolve(new Response(new Uint8Array(body), init));
  }) as unknown as typeof fetch;
}

describe('downloadWrapperJar()', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns the jar buffer when checksum matches', async () => {
    global.fetch = fakeFetch({
      'https://services.gradle.org/distributions/gradle-9.4.1-wrapper.jar': {
        ok: true,
        body: FAKE_JAR,
      },
      'https://services.gradle.org/distributions/gradle-9.4.1-wrapper.jar.sha256': {
        ok: true,
        body: `${FAKE_JAR_SHA}\n`,
      },
    });

    const jar = await downloadWrapperJar('9.4.1');
    expect(jar.equals(FAKE_JAR)).toBe(true);
  });

  it('rejects when sha256 does not match', async () => {
    global.fetch = fakeFetch({
      'https://services.gradle.org/distributions/gradle-9.4.1-wrapper.jar': {
        ok: true,
        body: FAKE_JAR,
      },
      'https://services.gradle.org/distributions/gradle-9.4.1-wrapper.jar.sha256': {
        ok: true,
        body: `${'0'.repeat(64)}  gradle-9.4.1-wrapper.jar\n`,
      },
    });

    await expect(downloadWrapperJar('9.4.1')).rejects.toThrow(/sha256 mismatch/);
  });

  it('rejects on a malformed checksum sidecar', async () => {
    global.fetch = fakeFetch({
      'https://services.gradle.org/distributions/gradle-9.4.1-wrapper.jar': {
        ok: true,
        body: FAKE_JAR,
      },
      'https://services.gradle.org/distributions/gradle-9.4.1-wrapper.jar.sha256': {
        ok: true,
        body: 'not a checksum',
      },
    });

    await expect(downloadWrapperJar('9.4.1')).rejects.toThrow(/malformed sha256/);
  });

  it('rejects when the jar download itself fails', async () => {
    global.fetch = fakeFetch({
      'https://services.gradle.org/distributions/gradle-9.4.1-wrapper.jar': {
        ok: false,
        status: 404,
        body: 'not found',
      },
    });

    await expect(downloadWrapperJar('9.4.1')).rejects.toThrow(/download failed/);
  });
});
