/**
 * `fullstack/product-compose` adapter — the monorepo product's
 * container story: a root `compose.yaml` running the pair, with a
 * Dockerfile beside each deployment unit (per the house rule:
 * containerisation lives next to its unit).
 *
 *   - the backend image is chosen by the service's stack — a Gradle
 *     multi-stage build for `quarkus-rest` / `spring-rest` /
 *     `micronaut-rest`, a Go multi-stage build onto distroless for
 *     `go-http`;
 *   - the frontend image builds the Vite bundle and serves it from
 *     nginx, whose config proxies `/api` to the backend service —
 *     the same `/api` convention the dev proxy uses, so the bundle's
 *     default `VITE_API_BASE_URL` works unchanged in both worlds.
 *
 * Runs at the product root (the `fullstack` vertical), so it writes
 * into the service directories via path-prefixed contributions. A
 * backend stack without a Dockerfile template simply gets none —
 * compose then covers the services that have one.
 */

import type { Adapter, ContributionFile, Ctx } from '../../contract/composition.js';

export const PRODUCT_COMPOSE_ID = 'fullstack/product-compose';

const TEMPLATE_ROOT = 'composition/fullstack/product-compose';

const BACKEND_IMAGES: Readonly<Record<string, string>> = {
  'quarkus-rest': 'backend-quarkus',
  'spring-rest': 'backend-spring',
  'micronaut-rest': 'backend-micronaut',
  'go-http': 'backend-go',
};

const FRONTEND_IMAGES: Readonly<Record<string, string>> = {
  'web-components': 'frontend-spa',
};

export const productComposeAdapter: Adapter = {
  id: PRODUCT_COMPOSE_ID,
  vertical: 'fullstack',
  covers: ['product-compose'],
  predicate: {},
  async contribute(ctx: Ctx) {
    const services = ctx.manifest.services;
    const backend = services[0];
    const frontend = services[services.length - 1];
    if (!backend || !frontend) {
      throw new Error(`${PRODUCT_COMPOSE_ID}: product manifest declares no services`);
    }

    const files: ContributionFile[] = await ctx.templates.render(`${TEMPLATE_ROOT}/root`, '', {
      backend,
      frontend,
    });
    const backendImage = BACKEND_IMAGES[backend.stack];
    if (backendImage) {
      files.push(
        ...(await ctx.templates.render(`${TEMPLATE_ROOT}/${backendImage}`, backend.path, {})),
      );
    }
    const frontendImage = FRONTEND_IMAGES[frontend.stack];
    if (frontendImage) {
      files.push(
        ...(await ctx.templates.render(`${TEMPLATE_ROOT}/${frontendImage}`, frontend.path, {
          backendService: backend.path,
        })),
      );
    }
    return { files };
  },
};
