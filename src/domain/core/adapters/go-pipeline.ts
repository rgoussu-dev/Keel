/**
 * `ci/go-pipeline` adapter — a CI pipeline that builds and tests
 * every push of a Go project. On GitHub the toolchain version comes
 * from the project's own `go.mod` (`go-version-file`), so that half
 * carries no version at all; GitLab needs an image tag, and it comes
 * from the shared pin source (`version-pins.ts`) — the same entry
 * `go.mod` and the `toolchain` block are written from, with the Go
 * toolchain mechanism still upgrading past it when a module asks for
 * more.
 */

import type { Adapter } from '../../contract/composition.js';
import { ciTemplateId, PROVIDER_QUESTION, ciProvider, providerTag } from './ci-pipeline.js';
import { loadToolchainPins } from './version-pins.js';

export const GO_PIPELINE_ID = 'ci/go-pipeline';

export const goPipelineAdapter: Adapter = {
  id: GO_PIPELINE_ID,
  vertical: 'ci',
  covers: ['pipeline'],
  predicate: { requires: ['lang.go'] },
  questions: [PROVIDER_QUESTION],
  async contribute(ctx) {
    const provider = ciProvider(ctx.answer('provider'), GO_PIPELINE_ID);
    const pins = await loadToolchainPins(ctx, GO_PIPELINE_ID);
    const files = await ctx.templates.render(ciTemplateId('go-pipeline', provider), '', {
      goVersion: pins.version('go'),
    });
    return { files, tagsAdd: [providerTag(provider)] };
  },
};
