/**
 * `containerization/micronaut-rest-image` adapter — a thin
 * Dockerfile for a Micronaut REST service. No build stage: the image
 * copies the artifact the host build already produced.
 *
 * Flavors, via the shared sticky `flavor` question:
 *   - `jvm` (default) — the runnable jar onto eclipse-temurin: the
 *     shadow `-all` jar under Gradle, the shaded jar the
 *     `micronaut-parent` build produces under Maven;
 *   - `native` — the GraalVM binary onto Micronaut's own default
 *     native base (`cgr.dev/chainguard/wolfi-base`, which carries
 *     the glibc + zlib the binary links). Opting in touches no build
 *     file: the Micronaut Gradle plugin already ships
 *     `nativeCompile`, and the Maven pom's `<packaging>${packaging}`
 *     property exists precisely for `-Dpackaging=native-image`.
 *
 * The artifact root follows the build system read from the manifest
 * tags: `build/` under `pkg.gradle`, `target/` under `pkg.maven`.
 */

import type { Adapter } from '../../contract/composition.js';
import { FLAVOR_QUESTION, imageFlavor, imageTags, jvmBuildSystem } from './container-image.js';

export const MICRONAUT_REST_IMAGE_ID = 'containerization/micronaut-rest-image';

const TEMPLATE_ID = 'composition/containerization/micronaut-rest-image/templates';

const MODULE = 'application/rest/executable';

export const micronautRestImageAdapter: Adapter = {
  id: MICRONAUT_REST_IMAGE_ID,
  vertical: 'containerization',
  covers: ['image'],
  predicate: { requires: ['framework.micronaut', 'arch.server-http'] },
  questions: [FLAVOR_QUESTION],
  async contribute(ctx) {
    const build = jvmBuildSystem(ctx.manifest, MICRONAUT_REST_IMAGE_ID);
    const flavor = imageFlavor(ctx.answer('flavor'), MICRONAUT_REST_IMAGE_ID);
    const gradle = build === 'gradle';
    const artifactPath =
      flavor === 'native'
        ? gradle
          ? // The one file nativeCompile leaves in its output directory;
            // globbed because the binary is named after the Gradle
            // project (`executable`), not the module path.
            `${MODULE}/build/native/nativeCompile/*`
          : `${MODULE}/target/application-rest-executable`
        : gradle
          ? `${MODULE}/build/libs/application-rest-executable-0.1.0-SNAPSHOT-all.jar`
          : `${MODULE}/target/application-rest-executable-0.1.0-SNAPSHOT.jar`;
    const buildCommand =
      flavor === 'native'
        ? gradle
          ? './gradlew :application:rest:executable:nativeCompile'
          : './mvnw package -Dpackaging=native-image'
        : gradle
          ? './gradlew build'
          : './mvnw package';
    const files = await ctx.templates.render(TEMPLATE_ID, '', {
      flavor,
      artifactPath,
      buildCommand,
    });
    return { files, tagsAdd: imageTags(flavor) };
  },
};
