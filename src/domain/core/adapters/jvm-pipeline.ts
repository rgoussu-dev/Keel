/**
 * `ci/jvm-pipeline` adapter — a CI pipeline that builds and tests
 * every push of a JVM project. One adapter serves all twelve JVM
 * stacks: the framework and language never change what CI runs, and
 * the Gradle-or-Maven choice is read from the manifest tag set to
 * pick the wrapper invocation (`./gradlew build` or `./mvnw verify`)
 * and the matching dependency cache.
 *
 * The pipeline provisions the JDK the pin registry names — the same
 * release the emitted build files target and the `toolchain` block
 * declares, resolved through the shared pin source
 * (`version-pins.ts`) so the workflow cannot state a JDK of its own
 * — and otherwise trusts the project's own wrapper, so nothing here
 * duplicates the build configuration.
 */

import type { Adapter } from '../../contract/composition.js';
import { jvmBuildSystem } from './container-image.js';
import { ciTemplateId, PROVIDER_QUESTION, ciProvider, providerTag } from './ci-pipeline.js';
import { loadToolchainPins } from './version-pins.js';

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
    const pins = await loadToolchainPins(ctx, JVM_PIPELINE_ID);
    const files = await ctx.templates.render(ciTemplateId('jvm-pipeline', provider), '', {
      buildSystem,
      jdkVersion: pins.version('jdk'),
    });
    return { files, tagsAdd: [providerTag(provider)] };
  },
};
