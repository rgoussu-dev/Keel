/**
 * The `walking-skeleton` vertical — emits the thinnest end-to-end
 * runnable project for a given stack/arch combo.
 *
 * Adapters in this vertical compose by predicate: the bootstraps
 * pick the entrypoint shape (Quarkus/Spring/Micronaut CLI and REST
 * in Java or Kotlin, Go CLI, Go HTTP, Rust CLI, Rust HTTP, a
 * web-components SPA; more later), and shared adapters like
 * `sample-port-fake` / `sample-port-fake-kotlin` / `go-port-fake` /
 * `rust-port-fake` / `wc-sample-port-fake` add the hexagonal
 * niceties wherever they apply. Each dimension is covered
 * per-platform — e.g. `build-tool` by `gradle-wrapper` under
 * `pkg.gradle`, `maven-wrapper` under `pkg.maven`, and `npm-install`
 * under `pkg.npm` — and the resolver picks whichever predicates
 * match the project's tag set.
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
import { jvmPeerContextAdapter } from '../adapters/jvm-peer-context.js';
import { mavenWrapperAdapter } from '../adapters/maven-wrapper.js';
import { micronautCliBootstrapAdapter } from '../adapters/micronaut-cli-bootstrap.js';
import { micronautCliKotlinBootstrapAdapter } from '../adapters/micronaut-cli-kotlin-bootstrap.js';
import { micronautRestBootstrapAdapter } from '../adapters/micronaut-rest-bootstrap.js';
import { micronautRestKotlinBootstrapAdapter } from '../adapters/micronaut-rest-kotlin-bootstrap.js';
import { npmInstallAdapter } from '../adapters/npm-install.js';
import { pnpmInstallAdapter } from '../adapters/pnpm-install.js';
import { quarkusCliBootstrapAdapter } from '../adapters/quarkus-cli-bootstrap.js';
import { quarkusCliKotlinBootstrapAdapter } from '../adapters/quarkus-cli-kotlin-bootstrap.js';
import { quarkusRestBootstrapAdapter } from '../adapters/quarkus-rest-bootstrap.js';
import { quarkusRestKotlinBootstrapAdapter } from '../adapters/quarkus-rest-kotlin-bootstrap.js';
import { samplePortFakeKotlinAdapter } from '../adapters/sample-port-fake-kotlin.js';
import { rustBootstrapAdapter } from '../adapters/rust-bootstrap.js';
import { rustCliBootstrapAdapter } from '../adapters/rust-cli-bootstrap.js';
import { rustHttpBootstrapAdapter } from '../adapters/rust-http-bootstrap.js';
import { rustPortFakeAdapter } from '../adapters/rust-port-fake.js';
import { samplePortFakeAdapter } from '../adapters/sample-port-fake.js';
import { tsHttpBootstrapAdapter } from '../adapters/ts-http-bootstrap.js';
import { tsPortFakeAdapter } from '../adapters/ts-port-fake.js';
import { springCliBootstrapAdapter } from '../adapters/spring-cli-bootstrap.js';
import { springCliKotlinBootstrapAdapter } from '../adapters/spring-cli-kotlin-bootstrap.js';
import { springRestBootstrapAdapter } from '../adapters/spring-rest-bootstrap.js';
import { springRestKotlinBootstrapAdapter } from '../adapters/spring-rest-kotlin-bootstrap.js';
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
    quarkusCliKotlinBootstrapAdapter,
    quarkusRestKotlinBootstrapAdapter,
    springCliBootstrapAdapter,
    springRestBootstrapAdapter,
    springCliKotlinBootstrapAdapter,
    springRestKotlinBootstrapAdapter,
    micronautCliBootstrapAdapter,
    micronautRestBootstrapAdapter,
    micronautCliKotlinBootstrapAdapter,
    micronautRestKotlinBootstrapAdapter,
    samplePortFakeAdapter,
    samplePortFakeKotlinAdapter,
    jvmPeerContextAdapter,
    gradleWrapperAdapter,
    mavenWrapperAdapter,
    goBootstrapAdapter,
    goCliBootstrapAdapter,
    goHttpBootstrapAdapter,
    goPortFakeAdapter,
    rustBootstrapAdapter,
    rustCliBootstrapAdapter,
    rustHttpBootstrapAdapter,
    rustPortFakeAdapter,
    tsHttpBootstrapAdapter,
    tsPortFakeAdapter,
    wcSpaBootstrapAdapter,
    wcSamplePortFakeAdapter,
    wcDesignSystemAdapter,
    npmInstallAdapter,
    pnpmInstallAdapter,
    claudeCoreAdapter,
  ],
};
