/**
 * The `walking-skeleton` vertical — emits the thinnest end-to-end
 * runnable project for a given stack/arch combo.
 *
 * Adapters in this vertical compose by predicate: the bootstraps
 * pick the entrypoint shape (Quarkus CLI/REST, Go CLI, Go HTTP,
 * Rust CLI, Rust HTTP, a web-components SPA; more later), and shared
 * adapters like `sample-port-fake` / `go-port-fake` /
 * `rust-port-fake` / `wc-sample-port-fake` add the hexagonal
 * niceties wherever they apply. Each dimension is covered
 * per-platform — e.g. `build-tool` by `gradle-wrapper` under
 * `pkg.gradle` and by `npm-install` under `pkg.npm` — and the
 * resolver picks whichever predicates match the project's tag set.
 * The Go and Rust entrypoints are additive — a tag set carrying both
 * `arch.cli` and `arch.server-http` ships both deployment units on
 * one shared bootstrap shell.
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
import { rustBootstrapAdapter } from '../adapters/rust-bootstrap.js';
import { rustCliBootstrapAdapter } from '../adapters/rust-cli-bootstrap.js';
import { rustHttpBootstrapAdapter } from '../adapters/rust-http-bootstrap.js';
import { rustPortFakeAdapter } from '../adapters/rust-port-fake.js';
import { samplePortFakeAdapter } from '../adapters/sample-port-fake.js';
import { wcDesignSystemAdapter } from '../adapters/wc-design-system.js';
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
    rustBootstrapAdapter,
    rustCliBootstrapAdapter,
    rustHttpBootstrapAdapter,
    rustPortFakeAdapter,
    wcSpaBootstrapAdapter,
    wcSamplePortFakeAdapter,
    wcDesignSystemAdapter,
    npmInstallAdapter,
    claudeCoreAdapter,
  ],
};
