/**
 * `ci/rust-github-actions` adapter — a GitHub Actions workflow that
 * builds and tests every push of a Rust project. `rustup update
 * stable` keeps the runner on the latest stable toolchain (the
 * binding spec's "always latest stable"), and the `--workspace` flag
 * makes one invocation serve both layouts — a single crate under
 * `basic`, the crate-per-module workspace under `modulith`.
 */

import type { Adapter } from '../../contract/composition.js';
import { CI_PIPELINE_TAG } from './ci-pipeline.js';

export const RUST_GITHUB_ACTIONS_ID = 'ci/rust-github-actions';

const TEMPLATE_ID = 'composition/ci/rust-github-actions/templates';

export const rustGithubActionsAdapter: Adapter = {
  id: RUST_GITHUB_ACTIONS_ID,
  vertical: 'ci',
  covers: ['pipeline'],
  predicate: { requires: ['pkg.cargo'] },
  async contribute(ctx) {
    const files = await ctx.templates.render(TEMPLATE_ID, '', {});
    return { files, tagsAdd: [CI_PIPELINE_TAG] };
  },
};
