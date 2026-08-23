/**
 * `distribution/rust-container` adapter — ships the Rust HTTP
 * service as a CI-built container image pushed to a registry on tag
 * push, plus a deployment descriptor. The pipeline runs the exact
 * build the `rust-http-image` Dockerfile documents (`cargo build
 * --release` on a glibc Linux host) and then builds that Dockerfile.
 */

import type { Adapter } from '../../contract/composition.js';
import { PROVIDER_QUESTION, otherProviderAskers } from './ci-pipeline.js';
import { rustBootstrapAnswers } from './rust-bootstrap.js';
import {
  containerDistribution,
  DEPLOY_QUESTION,
  serviceDeployVars,
} from './distribution-container.js';

export const RUST_CONTAINER_ID = 'distribution/rust-container';

export const rustContainerAdapter: Adapter = {
  id: RUST_CONTAINER_ID,
  vertical: 'distribution',
  covers: ['build', 'release-channel'],
  predicate: { requires: ['lang.rust', 'arch.server-http'] },
  questions: [PROVIDER_QUESTION, DEPLOY_QUESTION],
  sharesAnswersWith: otherProviderAskers(RUST_CONTAINER_ID),
  contribute(ctx) {
    const { projectName } = rustBootstrapAnswers(ctx.manifest, RUST_CONTAINER_ID);
    return containerDistribution(ctx, {
      id: RUST_CONTAINER_ID,
      family: 'rust-container',
      releaseVars: { projectName },
      deployVars: serviceDeployVars(ctx.manifest, { dbCredentials: false }),
      deployTree: 'service-deploy',
    });
  },
};
