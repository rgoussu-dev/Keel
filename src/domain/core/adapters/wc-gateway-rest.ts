/**
 * `gateway/wc-gateway-rest` adapter — gives the web-components
 * frontend a REST gateway to a sibling backend, selected by the peer
 * tag `peer.api.rest` (recorded by a composite `keel new` or by
 * `keel link`).
 *
 * Contributes:
 *   - the `GreetGateway` driven port in `domain-api` (re-exported
 *     from its index) — DOM-free, so the domain keeps compiling
 *     without the browser;
 *   - an `infrastructure/gateway-rest` workspace package: the fetch
 *     adapter (`createRestGreetGateway`) and its canonical fake on a
 *     `./fake` subpath export, so domain tests can depend on the
 *     fake without dragging `fetch` into their DOM-less programs;
 *   - a Vite dev-server proxy (`/api` → `http://localhost:8080`) and
 *     the `vite-env.d.ts` reference that types
 *     `import.meta.env.VITE_API_BASE_URL` (12-factor: config via env);
 *   - rewrites of the greet slice so the walking skeleton is
 *     end-to-end across services: `greet-service` now publishes what
 *     the gateway returns (with an offline fallback), `main.ts`
 *     constructs the gateway at the assembly point, and the domain
 *     test drives the slice through the fake.
 *
 * The rewrites replace whole files the wc bootstrap emitted; on the
 * greenfield composite path they were staged moments earlier in the
 * same install, and on the brownfield path (`keel link` + `keel add
 * gateway`) they overwrite the local-only greet slice by design —
 * that is what wiring a backend means for this walking skeleton.
 */

import type { Adapter, ContributionFile } from '../../contract/composition.js';
import { eolOf, withEol } from '../util.js';
import { tsWorkspaceVars } from './ts-workspace.js';
import { WC_SPA_BOOTSTRAP_ID } from './wc-spa-bootstrap.js';

export const WC_GATEWAY_REST_ID = 'gateway/wc-gateway-rest';

const TEMPLATE_ROOT = 'composition/gateway/wc-gateway-rest';

const API_INDEX_TARGET = 'domain/domain-api/src/index.ts';
const GATEWAY_EXPORT = "export * from './ports/greet-gateway';";

const WEB_APP_PKG_TARGET = 'application/web-app/package.json';
const CORE_PKG_TARGET = 'domain/domain-core/package.json';

export const wcGatewayRestAdapter: Adapter = {
  id: WC_GATEWAY_REST_ID,
  vertical: 'gateway',
  covers: [],
  predicate: { requires: ['framework.web-components', 'arch.spa', 'peer.api.rest'] },
  async contribute(ctx) {
    const npmScope = ctx.manifest.answers[WC_SPA_BOOTSTRAP_ID]?.npmScope;
    if (!npmScope) {
      throw new Error(
        `${WC_GATEWAY_REST_ID}: requires '${WC_SPA_BOOTSTRAP_ID}' to have run first; npmScope not in manifest`,
      );
    }
    const ws = tsWorkspaceVars(ctx.manifest.tags);
    const vars = { npmScope, ...ws };
    const files = await ctx.templates.render(`${TEMPLATE_ROOT}/files`, '', vars);
    const rewrites = await ctx.templates.render(`${TEMPLATE_ROOT}/rewrites`, '', vars);
    const gatewayPkg = `@${npmScope}/gateway-rest`;
    return {
      files,
      patches: [
        {
          target: API_INDEX_TARGET,
          apply: (existing) => {
            if (existing.includes(GATEWAY_EXPORT)) return existing;
            const eol = eolOf(existing);
            return `${existing.trimEnd()}${withEol(`\n${GATEWAY_EXPORT}\n`, eol)}`;
          },
        },
        {
          target: WEB_APP_PKG_TARGET,
          apply: (existing) =>
            addPackageDependency(existing, 'dependencies', gatewayPkg, ws.workspaceDep),
        },
        {
          target: CORE_PKG_TARGET,
          apply: (existing) =>
            addPackageDependency(existing, 'devDependencies', gatewayPkg, ws.workspaceDep),
        },
        ...rewrites.map((file: ContributionFile) => ({
          target: file.path,
          apply: () =>
            typeof file.content === 'string' ? file.content : file.content.toString('utf8'),
        })),
      ],
    };
  },
};

/**
 * Adds one dependency entry to a package manifest, preserving the
 * 2-space formatting the templates emit. Parsing instead of string
 * surgery keeps the patch correct under either workspace protocol
 * (`*` for npm, `workspace:*` for pnpm) and idempotent on re-runs.
 */
function addPackageDependency(
  existing: string,
  section: 'dependencies' | 'devDependencies',
  name: string,
  version: string,
): string {
  const pkg = JSON.parse(existing) as Record<string, unknown>;
  const deps = { ...((pkg[section] as Record<string, string> | undefined) ?? {}) };
  if (deps[name] !== undefined) return existing;
  deps[name] = version;
  pkg[section] = deps;
  return withEol(`${JSON.stringify(pkg, null, 2)}\n`, eolOf(existing));
}
