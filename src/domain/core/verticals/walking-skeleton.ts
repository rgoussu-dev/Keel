/**
 * The `walking-skeleton` vertical — emits the thinnest end-to-end
 * runnable project for a given stack/arch combo.
 *
 * Adapters in this vertical compose by predicate: the bootstraps
 * pick the entrypoint shape (Quarkus CLI, Go CLI, Go HTTP; more
 * later), and shared adapters like `sample-port-fake` /
 * `go-port-fake` add the hexagonal niceties wherever they apply.
 * The Go entrypoints are additive — a tag set carrying both
 * `arch.cli` and `arch.server-http` ships both `cmd/` units on one
 * shared `go-bootstrap` shell.
 */

import { claudeCoreAdapter } from '../adapters/claude-core.js';
import { goBootstrapAdapter } from '../adapters/go-bootstrap.js';
import { goCliBootstrapAdapter } from '../adapters/go-cli-bootstrap.js';
import { goHttpBootstrapAdapter } from '../adapters/go-http-bootstrap.js';
import { goPortFakeAdapter } from '../adapters/go-port-fake.js';
import { gradleWrapperAdapter } from '../adapters/gradle-wrapper.js';
import { quarkusCliBootstrapAdapter } from '../adapters/quarkus-cli-bootstrap.js';
import { samplePortFakeAdapter } from '../adapters/sample-port-fake.js';
import type { Vertical } from '../../contract/composition.js';

export const walkingSkeletonVertical: Vertical = {
  id: 'walking-skeleton',
  description: 'Greenfield project skeleton with a runnable end-to-end slice.',
  dimensions: ['entrypoint', 'port-example', 'build-tool', 'agentic-baseline'],
  adapters: [
    quarkusCliBootstrapAdapter,
    samplePortFakeAdapter,
    gradleWrapperAdapter,
    goBootstrapAdapter,
    goCliBootstrapAdapter,
    goHttpBootstrapAdapter,
    goPortFakeAdapter,
    claudeCoreAdapter,
  ],
};
