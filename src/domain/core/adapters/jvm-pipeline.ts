/**
 * `ci/jvm-pipeline` adapter — a CI pipeline that builds and tests
 * every push of a JVM project. One adapter serves all twelve JVM
 * stacks: the framework and language never change what CI runs, and
 * the Gradle-or-Maven choice is read from the manifest tag set to
 * pick the wrapper invocation (`./gradlew build` or `./mvnw verify`)
 * and the matching dependency cache.
 *
 * The pipeline provisions JDK 25 — the release the emitted build
 * files target — and otherwise trusts the project's own wrapper, so
 * nothing here duplicates the build configuration.
 */

import type { Adapter } from '../../contract/composition.js';
import { jvmBuildSystem } from './container-image.js';
import { ciTemplateId, PROVIDER_QUESTION, ciProvider, providerTag } from './ci-pipeline.js';

export const JVM_PIPELINE_ID = 'ci/jvm-pipeline';

export const jvmPipelineAdapter: Adapter = {
  id: JVM_PIPELINE_ID,
  vertical: 'ci',
  covers: ['pipeline'],
  predicate: { requires: ['runtime.jvm'] },
  questions: [PROVIDER_QUESTION],
  async contribute(ctx) {
    const provider = ciProvider(ctx.answer('provider'), JVM_PIPELINE_ID);
    const buildSystem = jvmBuildSystem(ctx.manifest, JVM_PIPELINE_ID);
    const files = await ctx.templates.render(ciTemplateId('jvm-pipeline', provider), '', {
      buildSystem,
    });
    return { files, tagsAdd: [providerTag(provider)] };
  },
};
