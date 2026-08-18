/**
 * `dev-container/jvm-devcontainer` adapter — the Dev Container
 * definition for all twelve JVM stacks. One adapter serves them
 * all: the toolchain is JDK 25 via the devcontainers `java` feature
 * (Temurin — the distro that tracks new majors fastest), and the
 * build tool matching the manifest's `pkg.*` tag is installed
 * alongside for ad-hoc use — the scaffolded wrapper only needs the
 * JDK. Shape and dev-env attachment come from the shared machinery
 * in `dev-container.ts`.
 */

import { devContainerAdapter } from './dev-container.js';
import { jvmBuildSystem } from './container-image.js';

export const JVM_DEVCONTAINER_ID = 'dev-container/jvm-devcontainer';

export const jvmDevcontainerAdapter = devContainerAdapter(
  JVM_DEVCONTAINER_ID,
  ['runtime.jvm'],
  (ctx) => {
    const build = jvmBuildSystem(ctx.manifest, JVM_DEVCONTAINER_ID);
    return {
      features: {
        'ghcr.io/devcontainers/features/java:1': {
          version: '25',
          jdkDistro: 'tem',
          installGradle: build === 'gradle',
          installMaven: build === 'maven',
        },
      },
    };
  },
);
