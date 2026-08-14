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
import { gradleProject, jvmLayout } from './jvm-module-layout.js';
import { FLAVOR_QUESTION, imageFlavor, imageTags, jvmBuildSystem } from './container-image.js';

export const MICRONAUT_REST_IMAGE_ID = 'containerization/micronaut-rest-image';

const TEMPLATE_ID = 'composition/containerization/micronaut-rest-image/templates';

/**
 * The runnable module follows the project's module layout: the flat
 * layout's lone executable, or the modulith's `application/api`
 * assembly. Its archive base name is the module path with dashes
 * under either build system.
 */
const unitBase = (unit: string): string => unit.split('/').join('-');

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
    const unit = jvmLayout(ctx.manifest.tags).restRuntime;
    const artifactPath =
      flavor === 'native'
        ? gradle
          ? // The one file nativeCompile leaves in its output directory;
            // globbed because the binary is named after the Gradle
            // project (`executable`), not the module path.
            `${unit}/build/native/nativeCompile/*`
          : `${unit}/target/${unitBase(unit)}`
        : gradle
          ? `${unit}/build/libs/${unitBase(unit)}-0.1.0-SNAPSHOT-all.jar`
          : `${unit}/target/${unitBase(unit)}-0.1.0-SNAPSHOT.jar`;
    const buildCommand =
      flavor === 'native'
        ? gradle
          ? `./gradlew ${gradleProject(unit)}:nativeCompile`
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
