/**
 * `distribution/go-container` adapter — ships the Go HTTP service as
 * a CI-built container image pushed to a registry on tag push, plus
 * a deployment descriptor. The pipeline runs the exact build the
 * `go-http-image` Dockerfile documents (a static Linux binary into
 * `bin/`) and then builds that Dockerfile — one image definition, no
 * second build system.
 */

import type { Adapter } from '../../contract/composition.js';
import { PROVIDER_QUESTION, otherProviderAskers } from './ci-pipeline.js';
import { goBootstrapAnswers } from './go-bootstrap.js';
import {
  containerDistribution,
  DEPLOY_QUESTION,
  serviceDeployVars,
} from './distribution-container.js';

export const GO_CONTAINER_ID = 'distribution/go-container';

export const goContainerAdapter: Adapter = {
  id: GO_CONTAINER_ID,
  vertical: 'distribution',
  covers: ['build', 'release-channel'],
  predicate: { requires: ['lang.go', 'arch.server-http'] },
  questions: [PROVIDER_QUESTION, DEPLOY_QUESTION],
  sharesAnswersWith: otherProviderAskers(GO_CONTAINER_ID),
  contribute(ctx) {
    const { projectName } = goBootstrapAnswers(ctx.manifest, GO_CONTAINER_ID);
    return containerDistribution(ctx, {
      id: GO_CONTAINER_ID,
      family: 'go-container',
      releaseVars: { projectName },
      deployVars: serviceDeployVars(ctx.manifest, { dbCredentials: false }),
      deployTree: 'service-deploy',
    });
  },
};
