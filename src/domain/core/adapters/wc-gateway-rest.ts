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
    const files = await ctx.templates.render(`${TEMPLATE_ROOT}/files`, '', { npmScope });
    const rewrites = await ctx.templates.render(`${TEMPLATE_ROOT}/rewrites`, '', { npmScope });
    return {
      files,
      patches: [
        {
          target: API_INDEX_TARGET,
          apply: (existing) => {
            if (existing.includes(GATEWAY_EXPORT)) return existing;
            return `${existing.trimEnd()}\n${GATEWAY_EXPORT}\n`;
          },
        },
        {
          target: WEB_APP_PKG_TARGET,
          apply: (existing) => {
            if (existing.includes(`"@${npmScope}/gateway-rest"`)) return existing;
            return existing.replace(
              `"@${npmScope}/domain-core": "*"`,
              `"@${npmScope}/domain-core": "*",\n    "@${npmScope}/gateway-rest": "*"`,
            );
          },
        },
        {
          target: CORE_PKG_TARGET,
          apply: (existing) => {
            if (existing.includes(`"@${npmScope}/gateway-rest"`)) return existing;
            return existing.replace(
              `"dependencies": {\n    "@${npmScope}/domain-api": "*"\n  },`,
              `"dependencies": {\n    "@${npmScope}/domain-api": "*"\n  },\n  "devDependencies": {\n    "@${npmScope}/gateway-rest": "*"\n  },`,
            );
          },
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
