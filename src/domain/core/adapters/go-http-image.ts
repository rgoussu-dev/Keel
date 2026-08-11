/**
 * `containerization/go-http-image` adapter — a thin Dockerfile for
 * the Go HTTP deployment unit. No build stage: the image copies the
 * statically-linked binary the host build already produced
 * (`CGO_ENABLED=0`, the same binary the skeleton README builds into
 * `bin/`) onto the distroless static base — the runtime half of the
 * pattern `fullstack/product-compose` established.
 *
 * Reads `projectName` from the Go bootstrap's manifest answers to
 * name the binary, exactly as the entrypoint adapters do.
 */

import type { Adapter } from '../../contract/composition.js';
import { goBootstrapAnswers } from './go-bootstrap.js';
import { CONTAINER_IMAGE_TAG } from './container-image.js';

export const GO_HTTP_IMAGE_ID = 'containerization/go-http-image';

const TEMPLATE_ID = 'composition/containerization/go-http-image/templates';

export const goHttpImageAdapter: Adapter = {
  id: GO_HTTP_IMAGE_ID,
  vertical: 'containerization',
  covers: ['image'],
  predicate: { requires: ['lang.go', 'arch.server-http'] },
  async contribute(ctx) {
    const { projectName } = goBootstrapAnswers(ctx.manifest, GO_HTTP_IMAGE_ID);
    const files = await ctx.templates.render(TEMPLATE_ID, '', { projectName });
    return { files, tagsAdd: [CONTAINER_IMAGE_TAG] };
  },
};
