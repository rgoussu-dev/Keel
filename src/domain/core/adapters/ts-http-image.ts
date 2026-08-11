/**
 * `containerization/ts-http-image` adapter — a thin Dockerfile for
 * the TypeScript HTTP service. This stack has no build artifact at
 * all — Node runs the sources directly — so "copy the built
 * artifact" degenerates to copying the sources onto `node:22-alpine`
 * and linking the workspace packages, the same single-stage image
 * `fullstack/product-compose` ships for `ts-http` backends.
 *
 * The install command follows the package manager read from the
 * manifest tags: `npm ci` under `pkg.npm`, corepack-provisioned
 * `pnpm install` (pinned by the workspace's `packageManager` field)
 * under `pkg.pnpm`.
 */

import type { Adapter } from '../../contract/composition.js';
import { CONTAINER_IMAGE_TAG } from './container-image.js';

export const TS_HTTP_IMAGE_ID = 'containerization/ts-http-image';

const TEMPLATE_ID = 'composition/containerization/ts-http-image/templates';

export const tsHttpImageAdapter: Adapter = {
  id: TS_HTTP_IMAGE_ID,
  vertical: 'containerization',
  covers: ['image'],
  predicate: { requires: ['lang.typescript', 'runtime.node', 'arch.server-http'] },
  async contribute(ctx) {
    const pm = ctx.manifest.tags.includes('pkg.pnpm') ? 'pnpm' : 'npm';
    const files = await ctx.templates.render(TEMPLATE_ID, '', { pm });
    return { files, tagsAdd: [CONTAINER_IMAGE_TAG] };
  },
};
