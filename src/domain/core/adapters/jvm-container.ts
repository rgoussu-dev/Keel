/**
 * `distribution/jvm-container` adapter — ships a JVM REST service as
 * a CI-built container image pushed to a registry on tag push, plus
 * a deployment descriptor. One adapter serves all twelve JVM stacks:
 * the framework and build system are read from the manifest, exactly
 * as the `containerization` image adapters read them, and the
 * artifact derivation is the shared one (`jvmRestArtifact`) so the
 * pipeline and the Dockerfile can never disagree about what the host
 * build produces.
 *
 * The JVM-vs-native flavor is **not re-asked**: `containerization`
 * already asked it and rendered the Dockerfile in one flavor, so the
 * pipeline reads the recorded dial — the `runtime.graalvm-native`
 * tag that answer promoted — and builds the artifact that Dockerfile
 * copies. A second question could disagree with the image and break
 * the build.
 */

import type { Adapter } from '../../contract/composition.js';
import { PROVIDER_QUESTION, otherProviderAskers } from './ci-pipeline.js';
import {
  GRAALVM_NATIVE_TAG,
  jvmBuildSystem,
  jvmRestArtifact,
  jvmRestFramework,
} from './container-image.js';
import { jvmLayout } from './jvm-module-layout.js';
import {
  containerDistribution,
  DEPLOY_QUESTION,
  serviceDeployVars,
} from './distribution-container.js';

export const JVM_CONTAINER_ID = 'distribution/jvm-container';

export const jvmContainerAdapter: Adapter = {
  id: JVM_CONTAINER_ID,
  vertical: 'distribution',
  covers: ['build', 'release-channel'],
  predicate: { requires: ['runtime.jvm', 'arch.server-http'] },
  questions: [PROVIDER_QUESTION, DEPLOY_QUESTION],
  sharesAnswersWith: otherProviderAskers(JVM_CONTAINER_ID),
  contribute(ctx) {
    const framework = jvmRestFramework(ctx.manifest, JVM_CONTAINER_ID);
    const build = jvmBuildSystem(ctx.manifest, JVM_CONTAINER_ID);
    const native = ctx.manifest.tags.includes(GRAALVM_NATIVE_TAG);
    const unit = jvmLayout(ctx.manifest.tags).restRuntime;
    const artifact = jvmRestArtifact(framework, build, native ? 'native' : 'jvm', unit);
    return containerDistribution(ctx, {
      id: JVM_CONTAINER_ID,
      family: 'jvm-container',
      releaseVars: {
        native,
        buildSystem: build,
        buildCommand: artifact.ciBuildCommand,
        artifactPath: artifact.artifactPath,
      },
      deployVars: serviceDeployVars(ctx.manifest, { dbCredentials: true }),
      deployTree: 'service-deploy',
    });
  },
};
