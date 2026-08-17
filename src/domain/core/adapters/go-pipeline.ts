/**
 * `ci/go-pipeline` adapter — a CI pipeline that builds and tests
 * every push of a Go project. The toolchain version comes from the
 * project's own `go.mod` (GitHub's `go-version-file`; GitLab via the
 * Go toolchain mechanism upgrading past the image), so the pipeline
 * never carries a version to drift.
 */

import type { Adapter } from '../../contract/composition.js';
import { ciTemplateId, PROVIDER_QUESTION, ciProvider, providerTag } from './ci-pipeline.js';

export const GO_PIPELINE_ID = 'ci/go-pipeline';

export const goPipelineAdapter: Adapter = {
  id: GO_PIPELINE_ID,
  vertical: 'ci',
  covers: ['pipeline'],
  predicate: { requires: ['lang.go'] },
  questions: [PROVIDER_QUESTION],
  async contribute(ctx) {
    const provider = ciProvider(ctx.answer('provider'), GO_PIPELINE_ID);
    const files = await ctx.templates.render(ciTemplateId('go-pipeline', provider), '', {});
    return { files, tagsAdd: [providerTag(provider)] };
  },
};
