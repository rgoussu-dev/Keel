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
 *
 * The Node major comes from the shared pin source
 * (`version-pins.ts`), the same entry the `toolchain` block records
 * the need from and the Dev Container feature provisions, so the
 * pipeline cannot state a Node of its own.
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
import { loadToolchainPins } from './version-pins.js';

export const TS_PIPELINE_ID = 'ci/ts-pipeline';

export const tsPipelineAdapter: Adapter = {
  id: TS_PIPELINE_ID,
  vertical: 'ci',
  covers: ['pipeline'],
  predicate: { requires: ['lang.typescript'] },
  questions: [PROVIDER_QUESTION],
  sharesAnswersWith: otherProviderAskers(TS_PIPELINE_ID),
  async contribute(ctx) {
    const provider = ciProvider(ctx.answer('provider'), TS_PIPELINE_ID);
    const pm = ctx.manifest.tags.includes('pkg.pnpm') ? 'pnpm' : 'npm';
    const pins = await loadToolchainPins(ctx, TS_PIPELINE_ID);
    const files = await ctx.templates.render(ciTemplateId('ts-pipeline', provider), '', {
      pm,
      nodeVersion: pins.version('node'),
      formatCheck: ciFormatCheck(ctx.manifest.tags),
      lintCheck: ciLintCheck(ctx.manifest.tags),
    });
    return ciPipelineContribution(provider, files);
  },
};
