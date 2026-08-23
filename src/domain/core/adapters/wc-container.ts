/**
 * `distribution/wc-container` adapter — ships the SPA's **assets
 * image** (see `containerization/wc-spa-image`) as a CI-built image
 * pushed to a registry on tag push, plus a deployment descriptor.
 * The pipeline builds the Vite bundle with the workspace's own
 * package manager, then builds the Dockerfile the containerization
 * vertical emitted.
 *
 * The descriptor is where the assets image becomes a site: the image
 * populates a shared volume as an init container (compose:
 * `restart: 'no'` gated by `service_completed_successfully`;
 * Kubernetes: a real `initContainers` entry over an `emptyDir`), and
 * an unmodified official nginx serves the volume. Per-environment
 * config (the API base URL) is injected at deploy time — the init
 * container templates `env.js` from the environment — so one bundle
 * serves every environment, never a rebuild.
 */

import type { Adapter } from '../../contract/composition.js';
import { PROVIDER_QUESTION, otherProviderAskers } from './ci-pipeline.js';
import { wcLayout } from './wc-module-layout.js';
import { WC_SPA_BOOTSTRAP_ID } from './wc-spa-bootstrap.js';
import {
  bootstrapProjectName,
  containerDistribution,
  DEPLOY_QUESTION,
} from './distribution-container.js';

export const WC_CONTAINER_ID = 'distribution/wc-container';

export const wcContainerAdapter: Adapter = {
  id: WC_CONTAINER_ID,
  vertical: 'distribution',
  covers: ['build', 'release-channel'],
  predicate: { requires: ['framework.web-components', 'arch.spa'] },
  questions: [PROVIDER_QUESTION, DEPLOY_QUESTION],
  sharesAnswersWith: otherProviderAskers(WC_CONTAINER_ID),
  contribute(ctx) {
    const pm = ctx.manifest.tags.includes('pkg.pnpm') ? 'pnpm' : 'npm';
    const layout = wcLayout(
      ctx.manifest.tags,
      ctx.manifest.answers[WC_SPA_BOOTSTRAP_ID]?.npmScope ?? '',
    );
    return containerDistribution(ctx, {
      id: WC_CONTAINER_ID,
      family: 'wc-container',
      releaseVars: { pm, bundleDir: `${layout.appRoot}/dist` },
      deployVars: { projectName: bootstrapProjectName(ctx.manifest) },
      deployTree: 'spa-deploy',
    });
  },
};
