/**
 * `containerization/wc-spa-image` adapter — a thin Dockerfile for
 * the web-components SPA. No build stage: the image copies the Vite
 * bundle the host build already produced (`application/web-app/dist`)
 * onto `nginx:alpine`, with a minimal config adding the history-API
 * fallback. Gateway concerns — proxying `/api` to a backend — belong
 * to whatever fronts the container (compose, an ingress), not to the
 * standalone image.
 *
 * The documented build command follows the package manager read from
 * the manifest tags (`npm run build` / `pnpm run build`).
 */

import type { Adapter } from '../../contract/composition.js';
import { CONTAINER_IMAGE_TAG } from './container-image.js';

export const WC_SPA_IMAGE_ID = 'containerization/wc-spa-image';

const TEMPLATE_ID = 'composition/containerization/wc-spa-image/templates';

export const wcSpaImageAdapter: Adapter = {
  id: WC_SPA_IMAGE_ID,
  vertical: 'containerization',
  covers: ['image'],
  predicate: { requires: ['framework.web-components', 'arch.spa'] },
  async contribute(ctx) {
    const pm = ctx.manifest.tags.includes('pkg.pnpm') ? 'pnpm' : 'npm';
    const files = await ctx.templates.render(TEMPLATE_ID, '', {
      buildCommand: `${pm} run build`,
    });
    return { files, tagsAdd: [CONTAINER_IMAGE_TAG] };
  },
};
