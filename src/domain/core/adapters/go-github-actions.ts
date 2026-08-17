/**
 * `ci/go-github-actions` adapter — a GitHub Actions workflow that
 * builds and tests every push of a Go project. The toolchain version
 * comes from the project's own `go.mod` (`go-version-file`), so the
 * workflow never carries a version to drift.
 */

import type { Adapter } from '../../contract/composition.js';
import { CI_PIPELINE_TAG } from './ci-pipeline.js';

export const GO_GITHUB_ACTIONS_ID = 'ci/go-github-actions';

const TEMPLATE_ID = 'composition/ci/go-github-actions/templates';

export const goGithubActionsAdapter: Adapter = {
  id: GO_GITHUB_ACTIONS_ID,
  vertical: 'ci',
  covers: ['pipeline'],
  predicate: { requires: ['lang.go'] },
  async contribute(ctx) {
    const files = await ctx.templates.render(TEMPLATE_ID, '', {});
    return { files, tagsAdd: [CI_PIPELINE_TAG] };
  },
};
