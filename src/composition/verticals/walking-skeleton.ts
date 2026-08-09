/**
 * The `walking-skeleton` vertical — emits the thinnest end-to-end
 * runnable project for a given stack/arch combo.
 *
 * Adapters in this vertical compose by predicate: the bootstrap
 * picks the entrypoint shape (Quarkus CLI today; REST and others
 * later), and shared adapters like `sample-port-fake` add the
 * hexagonal niceties wherever they apply.
 */

import { claudeCoreAdapter } from '../adapters/claude-core.js';
import { gradleWrapperAdapter } from '../adapters/gradle-wrapper.js';
import { quarkusCliBootstrapAdapter } from '../adapters/quarkus-cli-bootstrap.js';
import { samplePortFakeAdapter } from '../adapters/sample-port-fake.js';
import type { Vertical } from '../../domain/contract/composition.js';

export const walkingSkeletonVertical: Vertical = {
  id: 'walking-skeleton',
  description: 'Greenfield project skeleton with a runnable end-to-end slice.',
  dimensions: ['entrypoint', 'port-example', 'build-tool', 'agentic-baseline'],
  adapters: [
    quarkusCliBootstrapAdapter,
    samplePortFakeAdapter,
    gradleWrapperAdapter,
    claudeCoreAdapter,
  ],
};
