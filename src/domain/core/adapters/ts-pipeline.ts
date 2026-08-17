/**
 * `ci/ts-pipeline` adapter — a CI pipeline that builds and tests
 * every push of a TypeScript workspace, serving both `ts-http` and
 * `web-components` from one template per provider: the root scripts
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
import { ciTemplateId, PROVIDER_QUESTION, ciProvider, providerTag } from './ci-pipeline.js';

export const TS_PIPELINE_ID = 'ci/ts-pipeline';

export const tsPipelineAdapter: Adapter = {
  id: TS_PIPELINE_ID,
  vertical: 'ci',
  covers: ['pipeline'],
  predicate: { requires: ['lang.typescript'] },
  questions: [PROVIDER_QUESTION],
  async contribute(ctx) {
    const provider = ciProvider(ctx.answer('provider'), TS_PIPELINE_ID);
    const pm = ctx.manifest.tags.includes('pkg.pnpm') ? 'pnpm' : 'npm';
    const files = await ctx.templates.render(ciTemplateId('ts-pipeline', provider), '', { pm });
    return { files, tagsAdd: [providerTag(provider)] };
  },
};
