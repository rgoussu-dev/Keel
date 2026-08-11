/**
 * `containerization/spring-rest-image` adapter — a thin Dockerfile
 * for a Spring Boot REST service. No build stage: the image copies
 * the boot jar the host build already produced onto eclipse-temurin.
 *
 * JVM flavor only for now: unlike Quarkus and Micronaut, the
 * scaffolded Spring build carries no GraalVM Native Build Tools
 * wiring, so a native flavor would document a build the project
 * cannot run. It arrives together with that build wiring.
 *
 * The jar path is deterministic — the jvm-build templates pin the
 * archive base name to the module path and the version to
 * `0.1.0-SNAPSHOT` — and its root follows the build system read from
 * the manifest tags (`build/libs` under `pkg.gradle`, `target` under
 * `pkg.maven`).
 */

import type { Adapter } from '../../contract/composition.js';
import { imageTags, jvmBuildSystem } from './container-image.js';

export const SPRING_REST_IMAGE_ID = 'containerization/spring-rest-image';

const TEMPLATE_ID = 'composition/containerization/spring-rest-image/templates';

const JAR = 'application-rest-executable-0.1.0-SNAPSHOT.jar';

export const springRestImageAdapter: Adapter = {
  id: SPRING_REST_IMAGE_ID,
  vertical: 'containerization',
  covers: ['image'],
  predicate: { requires: ['framework.spring', 'arch.server-http'] },
  async contribute(ctx) {
    const build = jvmBuildSystem(ctx.manifest, SPRING_REST_IMAGE_ID);
    const jarPath =
      build === 'gradle'
        ? `application/rest/executable/build/libs/${JAR}`
        : `application/rest/executable/target/${JAR}`;
    const files = await ctx.templates.render(TEMPLATE_ID, '', {
      jarPath,
      buildCommand: build === 'gradle' ? './gradlew build' : './mvnw package',
    });
    return { files, tagsAdd: imageTags('jvm') };
  },
};
