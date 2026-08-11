/**
 * `containerization/rust-http-image` adapter — a thin Dockerfile for
 * the Rust HTTP deployment unit. No build stage: the image copies
 * the release binary the host build already produced
 * (`cargo build --release`, the `<project>-http` bin target the HTTP
 * bootstrap registers) onto the distroless cc base — glibc-dynamic,
 * matching a build on an ordinary glibc Linux host.
 *
 * Reads `projectName` from the Rust bootstrap's manifest answers to
 * name the binary, exactly as the entrypoint adapters do.
 */

import type { Adapter } from '../../contract/composition.js';
import { CONTAINER_IMAGE_TAG } from './container-image.js';
import { rustBootstrapAnswers } from './rust-bootstrap.js';

export const RUST_HTTP_IMAGE_ID = 'containerization/rust-http-image';

const TEMPLATE_ID = 'composition/containerization/rust-http-image/templates';

export const rustHttpImageAdapter: Adapter = {
  id: RUST_HTTP_IMAGE_ID,
  vertical: 'containerization',
  covers: ['image'],
  predicate: { requires: ['lang.rust', 'arch.server-http'] },
  async contribute(ctx) {
    const { projectName } = rustBootstrapAnswers(ctx.manifest, RUST_HTTP_IMAGE_ID);
    const files = await ctx.templates.render(TEMPLATE_ID, '', { projectName });
    return { files, tagsAdd: [CONTAINER_IMAGE_TAG] };
  },
};
