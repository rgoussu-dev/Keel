import { sha256 } from '../../util/hash.js';

const BASE_URL = 'https://services.gradle.org/distributions';
const DOWNLOAD_TIMEOUT_MS = 30_000;

/**
 * Downloads the official `gradle-<version>-wrapper.jar` from
 * services.gradle.org and verifies it against the published `.sha256`
 * sidecar. Throws on network failure or checksum mismatch — the caller
 * should treat the error as fatal so an install never ships an
 * unverified wrapper jar.
 *
 * Exposed as a module export (rather than inlined in the schematic)
 * so tests can substitute a deterministic stub via `vi.spyOn`.
 */
export async function downloadWrapperJar(version: string): Promise<Buffer> {
  const jarUrl = `${BASE_URL}/gradle-${version}-wrapper.jar`;
  const sumUrl = `${jarUrl}.sha256`;

  const [jar, expected] = await Promise.all([fetchBuffer(jarUrl), fetchText(sumUrl)]);

  const expectedHash = expected.trim().split(/\s+/)[0] ?? '';
  if (!/^[0-9a-f]{64}$/.test(expectedHash)) {
    throw new Error(`gradle-wrapper: malformed sha256 sidecar at ${sumUrl}: "${expected.trim()}"`);
  }
  const actualHash = sha256(jar);
  if (expectedHash !== actualHash) {
    throw new Error(
      `gradle-wrapper: sha256 mismatch for ${jarUrl} — expected ${expectedHash}, got ${actualHash}`,
    );
  }
  return jar;
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await timedFetch(url);
  if (!res.ok)
    throw new Error(`gradle-wrapper download failed (${res.status} ${res.statusText}): ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function fetchText(url: string): Promise<string> {
  const res = await timedFetch(url);
  if (!res.ok)
    throw new Error(
      `gradle-wrapper checksum download failed (${res.status} ${res.statusText}): ${url}`,
    );
  return res.text();
}

async function timedFetch(url: string): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}
