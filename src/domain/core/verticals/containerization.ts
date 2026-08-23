/**
 * The `containerization` vertical — answers "how does this project
 * run as a container image?"
 *
 * One dimension, `image`, covered per stack shape by predicate: the
 * JVM REST trio (with a sticky JVM-vs-native flavor question where
 * the scaffolded build can already produce a GraalVM binary — the
 * answer is recorded either way, as `runtime.graalvm-native` or
 * `runtime.jvm-image`, so it is the whole project's GraalVM dial and
 * not just this Dockerfile's), the Go and Rust HTTP binaries onto
 * distroless bases, the TypeScript HTTP sources onto node, and the
 * SPA bundle onto nginx.
 *
 * House rule, everywhere: the Dockerfile is thin. No build stage —
 * the image copies the artifact the host build already produced, and
 * documents the build command instead of running it. That keeps the
 * container definition a description of the runtime, not a second
 * build system.
 *
 * Brownfield-installable via `keel add containerization`; CLI-shaped
 * projects are out of scope (a CLI ships through the `distribution`
 * vertical, not a serving container), so `keel add containerization`
 * on one hard-fails with the uncovered `image` dimension.
 */

import { goHttpImageAdapter } from '../adapters/go-http-image.js';
import { micronautRestImageAdapter } from '../adapters/micronaut-rest-image.js';
import { quarkusRestImageAdapter } from '../adapters/quarkus-rest-image.js';
import { rustHttpImageAdapter } from '../adapters/rust-http-image.js';
import { tsHttpImageAdapter } from '../adapters/ts-http-image.js';
import { springRestImageAdapter } from '../adapters/spring-rest-image.js';
import { wcSpaImageAdapter } from '../adapters/wc-spa-image.js';
import {
  CONTAINER_IMAGE_TAG,
  GRAALVM_NATIVE_TAG,
  JVM_IMAGE_TAG,
} from '../adapters/container-image.js';
import type { Vertical } from '../../contract/composition.js';

export const containerizationVertical: Vertical = {
  id: 'containerization',
  description: 'How this project runs as a container image.',
  dimensions: ['image'],
  promotes: [CONTAINER_IMAGE_TAG, GRAALVM_NATIVE_TAG, JVM_IMAGE_TAG],
  adapters: [
    quarkusRestImageAdapter,
    springRestImageAdapter,
    micronautRestImageAdapter,
    goHttpImageAdapter,
    rustHttpImageAdapter,
    tsHttpImageAdapter,
    wcSpaImageAdapter,
  ],
};
