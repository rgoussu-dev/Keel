/**
 * `ci/rust-pipeline` adapter — a CI pipeline that builds and tests
 * every push of a Rust project on the latest stable toolchain (the
 * binding spec's "always latest stable"), and the `--workspace` flag
 * makes one invocation serve both layouts — a single crate under
 * `basic`, the crate-per-module workspace under `modulith`.
 */

import type { Adapter } from '../../contract/composition.js';
import {
  ciPipelineContribution,
  ciTemplateId,
  PROVIDER_QUESTION,
  ciProvider,
  ciFormatCheck,
  ciLintCheck,
  otherProviderAskers,
} from './ci-pipeline.js';

export const RUST_PIPELINE_ID = 'ci/rust-pipeline';

export const rustPipelineAdapter: Adapter = {
  id: RUST_PIPELINE_ID,
  vertical: 'ci',
  covers: ['pipeline'],
  predicate: { requires: ['pkg.cargo'] },
  questions: [PROVIDER_QUESTION],
  sharesAnswersWith: otherProviderAskers(RUST_PIPELINE_ID),
  async contribute(ctx) {
    const provider = ciProvider(ctx.answer('provider'), RUST_PIPELINE_ID);
    const files = await ctx.templates.render(ciTemplateId('rust-pipeline', provider), '', {
      formatCheck: ciFormatCheck(ctx.manifest.tags),
      lintCheck: ciLintCheck(ctx.manifest.tags),
    });
    return ciPipelineContribution(provider, files);
  },
};
