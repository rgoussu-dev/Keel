/**
 * `containerization/wc-spa-image` adapter — the SPA's container
 * target is an **assets image**, not a server. No build stage: the
 * image carries the Vite bundle the host build already produced
 * (`application/web-app/dist`), and its entrypoint populates a
 * mounted volume — clear first, so stale files from the previous
 * release never survive, then copy, then template `env.js` from the
 * environment — and exits. Serving is nginx's job at deploy time: an
 * unmodified official `nginx` image serves the volume with the SPA's
 * history-API-fallback config mounted read-only (the emitted
 * `compose.yaml` is that shape, runnable as-is).
 *
 * Why: the bundle's lifecycle decouples from the server's. A
 * frontend release replaces the assets image and re-runs it; nginx
 * never rebuilds. And because `env.js` is written at deploy time,
 * one bundle serves every environment — per-environment config (the
 * API base URL) rides the environment, never a rebuild.
 *
 * Gateway concerns — proxying `/api` to a backend — still belong to
 * whatever fronts the serving container (compose, an ingress), not
 * to the image.
 *
 * The documented build command follows the package manager read from
 * the manifest tags (`npm run build` / `pnpm run build`).
 */

import type { Adapter } from '../../contract/composition.js';
import { CONTAINER_IMAGE_TAG } from './container-image.js';
import { wcLayout } from './wc-module-layout.js';
import { WC_SPA_BOOTSTRAP_ID } from './wc-spa-bootstrap.js';

export const WC_SPA_IMAGE_ID = 'containerization/wc-spa-image';

const TEMPLATE_ID = 'composition/containerization/wc-spa-image/templates';

export const wcSpaImageAdapter: Adapter = {
  id: WC_SPA_IMAGE_ID,
  vertical: 'containerization',
  covers: ['image'],
  predicate: { requires: ['framework.web-components', 'arch.spa'] },
  async contribute(ctx) {
    const pm = ctx.manifest.tags.includes('pkg.pnpm') ? 'pnpm' : 'npm';
    // Which directory holds the bundle is the module layout's answer,
    // not this adapter's — a Dockerfile that names it by hand builds
    // an image carrying an empty bundle.
    const layout = wcLayout(
      ctx.manifest.tags,
      ctx.manifest.answers[WC_SPA_BOOTSTRAP_ID]?.npmScope ?? '',
    );
    const files = await ctx.templates.render(TEMPLATE_ID, '', {
      buildCommand: `${pm} run build`,
      bundleDir: `${layout.appRoot}/dist`,
    });
    return { files, tagsAdd: [CONTAINER_IMAGE_TAG] };
  },
};
