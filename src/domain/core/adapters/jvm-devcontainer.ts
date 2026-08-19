/**
 * `dev-container/jvm-devcontainer` adapter — the Dev Container
 * definition for all twelve JVM stacks. One adapter serves them
 * all: the toolchain is the JDK the pin registry names via Temurin
 * (the distro that tracks new majors fastest) through the
 * devcontainers `java` feature, and the build tool matching the
 * manifest's `pkg.*` tag is installed alongside for ad-hoc use — the
 * scaffolded wrapper only needs the JDK. Shape, dev-env attachment
 * and the pinned JDK major come from the shared machinery in
 * `dev-container.ts` / `version-pins.ts`, so the feature cannot ask
 * for a JDK the `toolchain` block does not declare.
 */

import { devContainerAdapter } from './dev-container.js';
import { jvmBuildSystem } from './container-image.js';

export const JVM_DEVCONTAINER_ID = 'dev-container/jvm-devcontainer';

export const jvmDevcontainerAdapter = devContainerAdapter(
  JVM_DEVCONTAINER_ID,
  ['runtime.jvm'],
  (ctx, pins) => {
    const build = jvmBuildSystem(ctx.manifest, JVM_DEVCONTAINER_ID);
    return {
      features: {
        'ghcr.io/devcontainers/features/java:1': {
          version: pins.version('jdk'),
          jdkDistro: 'tem',
          installGradle: build === 'gradle',
          installMaven: build === 'maven',
        },
      },
    };
  },
);
