/**
 * `containerization/quarkus-rest-image` adapter — a thin Dockerfile
 * for a Quarkus REST service. No build stage: the image copies the
 * artifact the host build already produced (per the vertical's house
 * rule), so the Dockerfile documents the build command instead of
 * running it.
 *
 * Flavors, via the shared sticky `flavor` question:
 *   - `jvm` (default) — the fast-jar layout (`quarkus-app/`) onto
 *     eclipse-temurin;
 *   - `native` — the GraalVM `*-runner` binary onto the Quarkus
 *     micro base. The build is parameterised from the command line
 *     (`-Dquarkus.native.enabled=true`), so opting in touches no
 *     build file — the same additive stance as
 *     `distribution/quarkus-cli-native`.
 *
 * The artifact root follows the build system read from the manifest
 * tags (`build/` under `pkg.gradle`, `target/` under `pkg.maven`), and
 * the module it sits in follows the module layout — the flat
 * layout's lone executable, or the modulith's `application/api`
 * assembly.
 */

import type { Adapter } from '../../contract/composition.js';
import { jvmLayout } from './jvm-module-layout.js';
import {
  FLAVOR_QUESTION,
  imageFlavor,
  imageTags,
  jvmBuildSystem,
  jvmRestArtifact,
} from './container-image.js';

export const QUARKUS_REST_IMAGE_ID = 'containerization/quarkus-rest-image';

const TEMPLATE_ID = 'composition/containerization/quarkus-rest-image/templates';

export const quarkusRestImageAdapter: Adapter = {
  id: QUARKUS_REST_IMAGE_ID,
  vertical: 'containerization',
  covers: ['image'],
  predicate: { requires: ['framework.quarkus', 'arch.server-http'] },
  questions: [FLAVOR_QUESTION],
  async contribute(ctx) {
    const build = jvmBuildSystem(ctx.manifest, QUARKUS_REST_IMAGE_ID);
    const flavor = imageFlavor(ctx.answer('flavor'), QUARKUS_REST_IMAGE_ID);
    const unit = jvmLayout(ctx.manifest.tags).restRuntime;
    const { artifactPath, buildCommand } = jvmRestArtifact('quarkus', build, flavor, unit);
    const files = await ctx.templates.render(TEMPLATE_ID, '', {
      flavor,
      artifactPath,
      buildCommand,
    });
    return { files, tagsAdd: imageTags(flavor) };
  },
};
