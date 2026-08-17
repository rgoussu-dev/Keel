/**
 * `ci/ts-github-actions` adapter — a GitHub Actions workflow that
 * builds and tests every push of a TypeScript workspace, serving both
 * `ts-http` and `web-components` from one template: the root scripts
 * they share (`typecheck`, `test`) run unconditionally, while `lint`
 * and `build` run `--if-present` because only some shapes declare
 * them (the SPA has a `build`, the modulith layouts a `lint`).
 *
 * The package manager is read from the manifest tag set, exactly as
 * `containerization/ts-http-image` reads it: `npm ci` under
 * `pkg.npm`, corepack-provisioned `pnpm install --frozen-lockfile`
 * (pinned by the workspace's `packageManager` field) under
 * `pkg.pnpm`. Both install from the committed lockfile, so the
 * pipeline fails loudly on drift instead of resolving silently.
 */

import type { Adapter } from '../../contract/composition.js';
import { CI_PIPELINE_TAG } from './ci-pipeline.js';

export const TS_GITHUB_ACTIONS_ID = 'ci/ts-github-actions';

const TEMPLATE_ID = 'composition/ci/ts-github-actions/templates';

export const tsGithubActionsAdapter: Adapter = {
  id: TS_GITHUB_ACTIONS_ID,
  vertical: 'ci',
  covers: ['pipeline'],
  predicate: { requires: ['lang.typescript'] },
  async contribute(ctx) {
    const pm = ctx.manifest.tags.includes('pkg.pnpm') ? 'pnpm' : 'npm';
    const files = await ctx.templates.render(TEMPLATE_ID, '', { pm });
    return { files, tagsAdd: [CI_PIPELINE_TAG] };
  },
};
