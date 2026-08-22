/**
 * The `distribution` vertical — answers "how does this project ship?"
 *
 * Two shapes, selected by predicate over the same `build` /
 * `release-channel` dimensions:
 *
 *   - **CLI projects** (`quarkus-cli-native`): native binaries via
 *     GraalVM, cross-compiled in a CI matrix and attached to a
 *     release on tag push.
 *   - **Server-shaped projects** (the `*-container` family, one
 *     adapter per stack family): a CI-built container image pushed
 *     to a registry on tag push — GHCR under GitHub Actions, the
 *     GitLab Container Registry under GitLab CI, sharing the `ci`
 *     vertical's provider vocabulary — plus a deployment descriptor
 *     in the sticky flavor of your choice (compose or helm). The
 *     pipeline builds the Dockerfile the `containerization` vertical
 *     emitted; the SPA's is its assets image, deployed as an init
 *     container over a shared volume behind stock nginx.
 *
 * Brownfield-installable via `keel add distribution`; greenfield-
 * composable by listing it in a stack preset.
 */

import { goContainerAdapter } from '../adapters/go-container.js';
import { jvmContainerAdapter } from '../adapters/jvm-container.js';
import { quarkusCliNativeAdapter } from '../adapters/quarkus-cli-native.js';
import { rustContainerAdapter } from '../adapters/rust-container.js';
import { tsContainerAdapter } from '../adapters/ts-container.js';
import { wcContainerAdapter } from '../adapters/wc-container.js';
import { GRAALVM_NATIVE_TAG } from '../adapters/container-image.js';
import { DIST_CONTAINER_TAG } from '../adapters/distribution-container.js';
import type { Vertical } from '../../contract/composition.js';

export const distributionVertical: Vertical = {
  id: 'distribution',
  description: 'How this project ships.',
  dimensions: ['build', 'release-channel'],
  promotes: [DIST_CONTAINER_TAG, GRAALVM_NATIVE_TAG],
  adapters: [
    quarkusCliNativeAdapter,
    jvmContainerAdapter,
    goContainerAdapter,
    rustContainerAdapter,
    tsContainerAdapter,
    wcContainerAdapter,
  ],
};
