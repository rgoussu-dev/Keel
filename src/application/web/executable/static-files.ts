/**
 * The static half of `keel ui`: the page itself, and the design
 * system it renders with.
 *
 * Two roots, because the two have different lifetimes. `assets/web/`
 * ships inside the keel package and is served under `/app/`; planks
 * arrives as an ordinary npm dependency and is served under
 * `/vendor/`, resolved from this module so it is found wherever the
 * package manager put it — a pnpm store, a hoisted `node_modules`, a
 * global install.
 *
 * **No bundler, on purpose.** planks ships one ESM file and three
 * stylesheets, the page is native custom elements, and browsers load
 * both directly. Adding a build step would put keel's own release on
 * a bundler for 28KB of dependency, and would mean the UI could be
 * stale relative to the source that ships beside it.
 *
 * Paths are resolved and then checked to be inside their root, so a
 * `..` in a URL cannot walk out of the asset directories — the one
 * traversal this server would otherwise be wide open to.
 */

import path from 'node:path';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { content, type UiHandler, type UiRequest, type UiResponse } from '../contract/http.js';

/** URL prefix the page's own files are served under. */
const APP_PREFIX = '/app/';

/** URL prefix the vendored design system is served under. */
const VENDOR_PREFIX = '/vendor/';

/**
 * The vendored files, by the name the page asks for. An allowlist
 * rather than a passthrough: the package's shipped directory also
 * holds type declarations and a CommonJS build, and a browser has no
 * use for either.
 */
const VENDOR_FILES: readonly string[] = ['planks.js', 'tokens.css', 'styles.css', 'structural.css'];

/**
 * The planks export the vendored directory is located through.
 *
 * Deliberately a **stylesheet** rather than the package's main entry,
 * and the reason is a bug this got wrong first. `createRequire`
 * resolves under the `require` condition, so `@rgoussu.dev/planks`
 * comes back as the CommonJS build — served to a browser expecting
 * the ESM one, which is a `.cjs` file with the same job and none of
 * the same syntax. `import.meta.resolve` would pick the right half,
 * but vitest's SSR transform leaves it undefined, so the assets would
 * 404 under test and work in production: the worse of the two ways
 * round.
 *
 * `./styles` is an unconditional string in the package's `exports`,
 * so every resolver agrees on it, and everything the page needs ships
 * beside it.
 */
const VENDOR_ANCHOR = '@rgoussu.dev/planks/styles';

const resolveFrom = createRequire(import.meta.url).resolve;

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

/** Builds the static handler. */
export function buildStatics(): UiHandler {
  const root = assetRoot();
  return async (request: UiRequest): Promise<UiResponse | null> => {
    if (request.method !== 'GET' && request.method !== 'HEAD') return null;
    if (request.path === '/' || request.path === '/index.html') {
      return serve(path.join(root, 'index.html'), root);
    }
    if (request.path.startsWith(APP_PREFIX)) {
      const relative = request.path.slice(APP_PREFIX.length);
      return serve(path.join(root, relative), root);
    }
    if (request.path.startsWith(VENDOR_PREFIX)) {
      return vendored(request.path.slice(VENDOR_PREFIX.length));
    }
    return null;
  };
}

/**
 * `assets/web/`, found relative to this module rather than to the
 * process — `keel ui` runs in the user's project, not in keel's.
 * Four levels up from `dist/application/web/executable/` (and from
 * `src/…` under the local runner) is the package root.
 */
function assetRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', '..', '..', '..', 'assets', 'web');
}

async function serve(file: string, root: string): Promise<UiResponse | null> {
  const resolved = path.resolve(file);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return read(resolved);
}

async function vendored(name: string): Promise<UiResponse | null> {
  if (!VENDOR_FILES.includes(name)) return null;
  let directory: string;
  try {
    directory = path.dirname(resolveFrom(VENDOR_ANCHOR));
  } catch {
    return null;
  }
  return serve(path.join(directory, name), directory);
}

async function read(file: string): Promise<UiResponse | null> {
  try {
    const body = await readFile(file, 'utf8');
    return content(body, CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream');
  } catch {
    return null;
  }
}
