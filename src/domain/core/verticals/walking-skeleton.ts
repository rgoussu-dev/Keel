/**
 * The `walking-skeleton` vertical — emits the thinnest end-to-end
 * runnable project for a given stack/arch combo.
 *
 * Adapters in this vertical compose by predicate: the bootstraps
 * pick the entrypoint shape (Quarkus CLI/REST, Go CLI, Go HTTP, a
 * web-components SPA; more later), and shared adapters like
 * `sample-port-fake` / `go-port-fake` / `wc-sample-port-fake` add
 * the hexagonal niceties wherever they apply. Each dimension is
 * covered per-platform — e.g. `build-tool` by `gradle-wrapper`
 * under `pkg.gradle` and by `npm-install` under `pkg.npm` — and the
 * resolver picks whichever predicates match the project's tag set.
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
import { npmInstallAdapter } from '../adapters/npm-install.js';
import { quarkusCliBootstrapAdapter } from '../adapters/quarkus-cli-bootstrap.js';
import { quarkusRestBootstrapAdapter } from '../adapters/quarkus-rest-bootstrap.js';
import { samplePortFakeAdapter } from '../adapters/sample-port-fake.js';
import { wcSamplePortFakeAdapter } from '../adapters/wc-sample-port-fake.js';
import { wcSpaBootstrapAdapter } from '../adapters/wc-spa-bootstrap.js';
import type { Vertical } from '../../contract/composition.js';

export const walkingSkeletonVertical: Vertical = {
  id: 'walking-skeleton',
  description: 'Greenfield project skeleton with a runnable end-to-end slice.',
  dimensions: ['entrypoint', 'port-example', 'build-tool', 'agentic-baseline'],
  adapters: [
    quarkusCliBootstrapAdapter,
    quarkusRestBootstrapAdapter,
    samplePortFakeAdapter,
    gradleWrapperAdapter,
    goBootstrapAdapter,
    goCliBootstrapAdapter,
    goHttpBootstrapAdapter,
    goPortFakeAdapter,
    wcSpaBootstrapAdapter,
    wcSamplePortFakeAdapter,
    npmInstallAdapter,
    claudeCoreAdapter,
  ],
};
