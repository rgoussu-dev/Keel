/**
 * `ci/jvm-github-actions` adapter — a GitHub Actions workflow that
 * builds and tests every push of a JVM project. One adapter serves
 * all twelve JVM stacks: the framework and language never change what
 * CI runs, and the Gradle-or-Maven choice is read from the manifest
 * tag set to pick the wrapper invocation (`./gradlew build` or
 * `./mvnw verify`) and the matching dependency cache.
 *
 * The workflow provisions JDK 25 — the release the emitted build
 * files target — and otherwise trusts the project's own wrapper, so
 * nothing here duplicates the build configuration.
 */

import type { Adapter } from '../../contract/composition.js';
import { jvmBuildSystem } from './container-image.js';
import { CI_PIPELINE_TAG } from './ci-pipeline.js';

export const JVM_GITHUB_ACTIONS_ID = 'ci/jvm-github-actions';

const TEMPLATE_ID = 'composition/ci/jvm-github-actions/templates';

export const jvmGithubActionsAdapter: Adapter = {
  id: JVM_GITHUB_ACTIONS_ID,
  vertical: 'ci',
  covers: ['pipeline'],
  predicate: { requires: ['runtime.jvm'] },
  async contribute(ctx) {
    const buildSystem = jvmBuildSystem(ctx.manifest, JVM_GITHUB_ACTIONS_ID);
    const files = await ctx.templates.render(TEMPLATE_ID, '', { buildSystem });
    return { files, tagsAdd: [CI_PIPELINE_TAG] };
  },
};
