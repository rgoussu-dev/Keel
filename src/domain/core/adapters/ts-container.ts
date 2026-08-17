/**
 * `distribution/ts-container` adapter — ships the `ts-http` service
 * as a CI-built container image pushed to a registry on tag push,
 * plus a deployment descriptor. There is no host build step at all:
 * Node runs the sources directly, so the `ts-http-image` Dockerfile
 * copies the workspace and installs production dependencies inside
 * the image — the pipeline goes straight to `docker build`.
 */

import type { Adapter } from '../../contract/composition.js';
import { PROVIDER_QUESTION } from './ci-pipeline.js';
import {
  containerDistribution,
  DEPLOY_QUESTION,
  serviceDeployVars,
} from './distribution-container.js';

export const TS_CONTAINER_ID = 'distribution/ts-container';

export const tsContainerAdapter: Adapter = {
  id: TS_CONTAINER_ID,
  vertical: 'distribution',
  covers: ['build', 'release-channel'],
  predicate: { requires: ['lang.typescript', 'runtime.node', 'arch.server-http'] },
  questions: [PROVIDER_QUESTION, DEPLOY_QUESTION],
  contribute(ctx) {
    return containerDistribution(ctx, {
      id: TS_CONTAINER_ID,
      family: 'ts-container',
      releaseVars: {},
      deployVars: serviceDeployVars(ctx.manifest, { dbCredentials: false }),
      deployTree: 'service-deploy',
    });
  },
};
