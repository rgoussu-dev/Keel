# Changelog

All notable changes to `@rgoussu.dev/keel` are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning: [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **The `persistence` vertical** — SQL persistence for every HTTP
  stack (`keel add persistence`), PostgreSQL as the default engine
  behind an extensible engine spec. Five dimensions: a `datasource`
  (the stack's idiomatic pool — Agroal, Hikari, pgx, the sync
  `postgres` crate, `pg` — env-only prod config, compose database in
  dev, throwaway Testcontainers PostgreSQL in tests, pool health →
  readiness and pool metrics/JDBC spans → telemetry with the
  observability vertical on the JVM); transaction management as a
  **domain secondary port** shaped as a Unit of Work, with per-stack
  adapters (JTA on Quarkus, `TransactionTemplate` on Spring,
  `TransactionOperations` on Micronaut, the transaction riding the
  context on Go / `AsyncLocalStorage` on TS, a shared-connection
  transaction on Rust) beside canonical counting fakes; a repository
  example (`GreetingLog` port, SQL adapter contract-tested against a
  Testcontainers PostgreSQL that skips without Docker, in-memory
  fake, record/list operations demarcating writes with the unit of
  work, `POST`/`GET /greetings`); **migrations as their own
  deployment unit** (`migrations/` — plain-SQL Flyway scripts in a
  self-contained container run against the database before the
  service deploys, never from inside it, with dev/test replaying the
  same SQL at startup as a local-loop convenience); and the dev
  database + healthcheck-gated migrations one-shot patched into
  `dev/compose.yaml`. Covered per stack by one predicate-selected
  adapter: Quarkus/Spring/Micronaut in Java and Kotlin (Gradle or
  Maven), `go-http`, `rust-http`, `ts-http`.
- **`@DomainHandler` — container discovery of handlers on the JVM
  stacks.** Handlers in scaffolded projects now carry a marker the
  **domain owns** (`domain/contract`), so a new aggregate no longer
  needs an edit in the composition root. No framework stereotype ever
  appears in domain code: the marker is meta-annotated only with
  Jakarta specification APIs (`jakarta.inject`,
  `jakarta.enterprise.cdi-api`), declared `compileOnly`/`provided` so
  neither reaches a runtime classpath, and each composition root reads
  the same marker in its own idiom — a CDI stereotype for Quarkus (the
  domain modules ship a `beans.xml` marking them bean archives), a
  `@ComponentScan` include filter for Spring, and `@Import` for
  Micronaut Java. Mediator factories now take the discovered
  collection instead of constructing handlers by hand, and the
  `persistence` vertical's greeting-log handlers ride the same
  marker — so on Quarkus and Spring it no longer rewrites the
  composition root at all, and on Micronaut Java it only names the
  new package in `@Import` (which does not scan sub-packages).
  Micronaut Kotlin keeps its explicit wiring in both verticals.
- **Dedicated documentation under `docs/`** — cross-linked pages for
  every stack family (`docs/stacks/`: JVM, Go, Rust, `ts-http`,
  `web-components`, fullstack) and every vertical
  (`docs/verticals/`), each with explicit prerequisites (toolchains
  on PATH, env vars), the questions asked, and the generated tree;
  plus a full CLI reference (`docs/cli.md`), the composition model
  with diagrams (`docs/composition.md`), and contributor/maintainer
  guides (`docs/development.md`, `docs/release.md`).
- **`CONTRIBUTING.md`** — the fork → branch → PR contribution
  workflow, commit conventions, and pointers into the docs.

### Changed

- **README reorganized for first-time users** — prose trimmed in
  favor of a stack matrix, per-family "How to" sections (command +
  what you get + prerequisites), a composition diagram, and a
  verticals table; the deep material moved to `docs/` with
  cross-links.

### Fixed

- **Adapter patches preserve the patched file's line endings.** Every
  text patch (the gateway CORS decorations, the Cargo/README/module
  registrations of the walking-skeleton adapters, the Spring native
  build wiring, the observability and dev-env patchers) spliced
  LF-only content, mixing endings in brownfield CRLF files — e.g.
  Windows checkouts under `core.autocrlf` — and multi-line anchors
  (`rust-cors`'s serve block, the observability assembly-point
  rewires) failed to match outright on them. Patches now share the
  `eolOf` / `withEol` / `eolAware` helpers: simple splices convert
  their fragments and anchors to the file's dominant EOL, and the
  multi-anchor patchers run on LF-normalized text with the file's
  EOL restored after. LF files round-trip byte-identical.
- **`fullstack/product-compose` ships a `.dockerignore` beside every
  Dockerfile.** Its multi-stage builds `COPY . .`, so the whole
  context — including `.env` and package-manager rc files — reached
  the builder (and, for the single-stage `ts-http` image, the final
  image). Each deployment unit now excludes VCS metadata, secrets,
  and host build outputs (`build`/`target`/`bin`/`node_modules`/
  `dist`) from its context.

### Added

- **`containerization` vertical** (`keel add containerization`) — a
  thin Dockerfile (plus `.dockerignore`) beside the deployment unit
  for every HTTP-shaped stack. No build stage anywhere: the image
  copies the artifact the host build already produced and documents
  the build command instead of running it. Per stack: the Quarkus
  fast-jar layout, Spring boot jar, or Micronaut shadow/shaded jar
  onto `eclipse-temurin:25-jre` (artifact paths following the
  Gradle-or-Maven choice), the Go static binary onto distroless
  static, the Rust release binary onto distroless cc, the `ts-http`
  sources onto `node:22-alpine` (npm or pnpm install to link the
  workspace), and the SPA's Vite bundle onto `nginx:alpine` with a
  history-API fallback config. Every JVM backend poses a sticky
  `flavor` question with an opt-in **GraalVM native** image,
  promoting `runtime.graalvm-native` on top of the
  `deploy.container-image` tag every image adapter adds. Quarkus and
  Micronaut builds already produce the binary without build-file
  changes (`-Dquarkus.native.enabled=true`, `nativeCompile` /
  `-Dpackaging=native-image`); Spring's opt-in patches the GraalVM
  Native Build Tools wiring in — the `org.graalvm.buildtools.native`
  Gradle plugin beside the Boot plugin, or a `native` Maven profile
  mirroring the one `spring-boot-starter-parent` ships (the skeleton
  imports the BOM instead of that parent) — marker-guarded and
  idempotent, exercising the composition contract's patch path.
  CLI-shaped projects hard-fail with the uncovered `image`
  dimension — a CLI ships through `distribution`, not a serving
  container.
- **`observability` vertical** — production observability for every
  HTTP-service stack, greenfield (listed after `walking-skeleton` on
  the nine REST/HTTP presets) and brownfield
  (`keel add observability`). Four dimensions — the first three
  covered per stack by one adapter selected on
  `framework.*`/`lang.*` + `arch.server-http`, the fourth
  (`monitoring-stack`, described below) by a language-agnostic
  sibling adapter:
  **health** — liveness ("restart me", dependency-free by design)
  and readiness ("route traffic to me") probe endpoints,
  framework-native where the framework has them (SmallRye Health
  `/q/health/*`, Actuator `/actuator/health/*`, Micronaut Management
  `/health/*`) and hand-rolled `/health/live` + `/health/ready` on
  the Go/Rust/TS stacks, plus a template readiness check to hang
  real dependency checks on; **request-context** — one
  filter/middleware at the HTTP edge extracts-or-mints
  `X-Correlation-Id` (and the optional `X-Tenant-Id` as the
  multi-tenant worked example) into a request-scoped context and the
  log context (SLF4J MDC, `slog` context handler, `tracing` span
  fields, `AsyncLocalStorage`), echoes it on the response, and is
  the documented extension point for more propagated fields;
  **telemetry** — OpenTelemetry across the stack (traces + metrics
  over OTLP, standard `OTEL_*` env vars) with one example span
  enrichment and one example `app.http.requests` counter per stack
  (quarkus-opentelemetry, micrometer-tracing OTel bridge + OTLP
  registries, micronaut-tracing-opentelemetry + Micrometer OTLP,
  otel-go, tracing-opentelemetry, NodeSDK). Each install patches the
  bootstrap's build + config files at guarded anchors and ships a
  wire-level `ObservabilityTest` in the generated project; the
  gateway CORS adapters learned the observability-decorated assembly
  points so both verticals compose in the fullstack presets.

- **`dev-env` vertical** — the local development environment:
  `dev/compose.yaml`, one Compose file for everything the service
  needs on a laptop but does not own. The vertical seeds the empty
  base (plus a README section); supplementing verticals patch their
  services in through shared compose helpers, and ad-hoc local infra
  (a database, redis, a broker) goes in the same file — the single
  place to look for what the dev loop needs. Dev-only by design:
  production infrastructure belongs to IaC. Listed on every REST/HTTP
  stack before `observability`; brownfield via `keel add dev-env`.

- **Monitoring stack in the dev environment** — the observability
  vertical's fourth dimension (`monitoring-stack`) supplements
  `dev/compose.yaml` with a monitoring stack listening exactly where
  the service already exports (OTLP `localhost:4317/4318`, Grafana
  `:3000`). A sticky `stack` question picks the shape: **granular**
  (default) — one service per concern as the base a production setup
  grows from: an OpenTelemetry Collector as the single OTLP
  entrypoint fanning signals out to Tempo (traces), Prometheus
  (metrics via remote-write), and Loki (logs), plus Grafana
  provisioned with all three datasources, config files landed under
  `dev/observability/` ready to edit — or **lgtm**, the all-in-one
  `grafana/otel-lgtm` dev container. No install-order coupling with
  `dev-env`: contributions to `dev/compose.yaml` ride the composition
  contract's new **seeded patches** (`ContributionPatch.seed` — a
  patch that runs against a supplied seed when its target does not
  exist yet), so each vertical stands alone and whichever runs first
  creates the shared file. Quarkus projects now also enable OTLP log
  export (`quarkus.otel.logs.enabled=true`) so all three signals
  flow.

- **TypeScript backend stack** (`keel new --stack=ts-http`) — the
  Node realization of the walking skeleton: a TypeScript workspace in
  the binding-spec trisection (`domain/kernel` with the
  Command/Result/Handler/Mediator bases, `domain/contract`,
  `domain/core` exposing factories through its `exports` map — the
  registry-mediator stance keel itself is built on) plus an
  `application/rest` deployment unit on bare `node:http` mapping
  `GET /greet` to the mediator and rejections to RFC 9457 Problem
  Details. No build step: Node 22.18+ runs the sources directly
  (type stripping, held honest by `erasableSyntaxOnly`), per-package
  `tsc --noEmit` and `"types": []` hold the walls, and the sample
  `Clock` port ships real + fake adapters in `infrastructure/clock`
  (`walking-skeleton/ts-port-fake`). Projects `peer.api.rest`, so it
  slots into the same gateway seam as the other REST backends.
- **`fullstack-ts` stack** (`keel new --stack=fullstack-ts`) — the
  fourth backend behind the same seam: a `ts-http` backend +
  `web-components` frontend product selecting exactly the same
  frontend gateway adapters as the other pairs. The Node side gets
  its own CORS decoration (`gateway/ts-cors` wraps the server at the
  assembly point), the shared OpenAPI wire contract, and a
  `node:22-alpine` Dockerfile with no build stage — the container
  runs the TypeScript sources directly.
- **npm or pnpm for the TypeScript stacks** — `ts-http` and
  `web-components` offer the build-system choice: npm (hoisted
  workspaces, the default) or pnpm (`pnpm-workspace.yaml`, the
  `workspace:*` dependency protocol, a pinned `packageManager` field,
  and a `walking-skeleton/pnpm-install` adapter covering `build-tool`
  under `pkg.pnpm`). The workspace packages now declare their own
  tool devDependencies (correct under pnpm's strict layout, harmless
  under npm's hoisting), and `gateway/wc-gateway-rest` patches
  package manifests structurally so its dependency insertions follow
  whichever protocol the workspace uses.
- **Selectable build systems** (`keel new … --build-system <id>`) —
  stacks may now offer a choice of build system instead of pinning
  one. All twelve JVM stacks offer **Gradle or Maven**: the same
  hexagonal sources scaffold onto either, with per-build-system
  template trees (multi-module poms, Maven wrapper via a deferred
  `mvn -N wrapper:wrapper`, the sample-port-fake adapters registering
  their module through a root-pom `<module>` patch instead of a
  `settings.gradle.kts` include). The Kotlin twins compile through
  `kotlin-maven-plugin` declared once at the reactor root, with the
  per-framework compiler wiring each stance needs — the `all-open`
  presets for Quarkus and Spring proxying, kapt-driven
  `micronaut-inject-java` for Micronaut. Interactive installs prompt
  for the choice; non-interactive installs take the stack default
  (Gradle); `--build-system maven` pins it from the command line.
  Composite stacks scaffold each service on its default.
- **Spring Boot stacks** (`keel new --stack=spring-cli|spring-rest`)
  — the JVM walking skeleton generalised past Quarkus: the same
  hexagonal multi-module shape on Spring Boot 4.1.0, with a picocli
  CLI over the Spring container (`spring-cli`) or a Spring MVC
  `GET /greet` with an RFC 9457 Problem Details advice
  (`spring-rest`), each driven end to end by its generated test
  suite. Selected by the ordinary predicate machinery on
  `framework.spring`.
- **Micronaut stacks** (`keel new --stack=micronaut-cli|micronaut-rest`)
  — the same pair on Micronaut platform 4.10.17 (compile-time DI,
  `PicocliRunner` for the CLI, an `ExceptionHandler` for the Problem
  Details mapping), selected on `framework.micronaut`.
- **Kotlin across the JVM stacks** — every JVM stack now has a
  Kotlin twin (`quarkus-cli-kotlin` … `micronaut-rest-kotlin`):
  idiomatic Kotlin 2.3.21 over shared Kotlin domain-trisection
  template trees, with the per-framework compiler wiring each stance
  needs (allopen for Quarkus CDI, `plugin.spring` for Spring, KSP
  for Micronaut). Language is a predicate dimension like any other —
  `lang.kotlin` swaps the bootstrap _and_ the sample-port adapter
  (`sample-port-fake-kotlin`).
- **The gateway seam covers the new backends.**
  `gateway/spring-cors` (+ its Kotlin sibling) emits a
  `WebMvcConfigurer` CORS bean, `gateway/micronaut-cors` patches
  `application.properties`; `fullstack-spring` and
  `fullstack-micronaut` composite presets pair the new REST backends
  with the web-components frontend, Dockerfiles included.
- **`fullstack-rust` stack** (`keel new --stack=fullstack-rust`) —
  the third backend behind the same seam: a `rust-http` backend +
  `web-components` frontend product, selecting exactly the same
  frontend gateway adapters as the Quarkus and Go pairs because all
  three backends project `peer.api.rest`. The Rust side gets its own
  seam half — `gateway/rust-cors` layers a CORS decoration onto the
  HTTP unit's router in `main` for the Vite dev origin
  (cross-cutting as a decorator at the assembly point, per the
  binding spec's Rust stance) — plus the shared
  `contract/greet.openapi.yaml` via the language-generic
  `gateway/rest-api-contract`, and `fullstack/product-compose` learns
  a Rust backend image (musl-static cargo build onto distroless). A
  `fullstack-rust` e2e boots the real Rust backend and verifies the
  wire — named, defaulted, and rejected requests plus the CORS
  header.

- **`fullstack-go` stack** (`keel new --stack=fullstack-go`) — the
  proof that the gateway seam is generic over backends: a `go-http`
  backend + `web-components` frontend product, selecting exactly the
  same frontend gateway adapters as the Quarkus pair because both
  backends project `peer.api.rest`. The Go side gets its own seam
  half — `gateway/go-cors` decorates the HTTP unit's assembly point
  with a CORS wrapper for the Vite dev origin (cross-cutting as a
  decorator, per the binding spec's Go stance).
- **The REST seam contract is pinned as OpenAPI.**
  `gateway/rest-api-contract` emits `contract/greet.openapi.yaml` on
  any HTTP backend with an SPA peer, whatever its language:
  `GET /greet`, optional `name` defaulting to `world`,
  `{"greeting": …}` on 200, RFC 9457 problem documents on errors.
  The frontend gateway (and its fake) encode this shape, and the new
  `fullstack-go` e2e boots the real Go backend and verifies the wire
  against it — named, defaulted, and rejected requests plus the CORS
  header.
- **Monorepo products are containerised.**
  `fullstack/product-compose` emits a root `compose.yaml` plus a
  Dockerfile beside each deployment unit (Gradle multi-stage for
  `quarkus-rest`, Go-onto-distroless for `go-http`, Vite-build-onto
  nginx for the frontend, with nginx proxying `/api` to the backend
  service — the same convention as the dev proxy, so the bundle's
  default `VITE_API_BASE_URL` works unchanged in both worlds).

- **Fullstack composition: peer tags, composite stacks, and the
  `fullstack` preset.** Stacks now declare the peer tags they project
  onto sibling services (`quarkus-rest`/`go-http` → `peer.api.rest`,
  `web-components` → `peer.ui.spa`); each project's manifest records
  its own `projects` and its siblings' projections as `peers`, and
  adapter resolution runs against tags ∪ peer tags — so cross-service
  elements are ordinary predicate-selected adapters. A composite
  stack declares `services` instead of scaffolding in place:
  `keel new --stack=fullstack` scaffolds a `quarkus-rest` backend and
  a `web-components` frontend as full keel projects (own tree, own
  manifest each), under the user's choice of repository layout —
  `--layout=monorepo` (default; `vcs` hoisted to the product root,
  root README glue via the new `fullstack` vertical) or
  `--layout=polyrepo` (a repository per service, no shared root);
  prompted when interactive and unspecified.
- **The `gateway` vertical — the cross-service seam.** Declares no
  dimensions: its adapters fire purely on peer tags, so it installs
  nothing without peers. `gateway/wc-gateway-rest` (on
  `peer.api.rest`) gives the frontend the `GreetGateway` driven port,
  an `infrastructure/gateway-rest` package (fetch adapter + canonical
  fake on a `./fake` subpath so DOM-less test programs never resolve
  `fetch`), a Vite dev proxy (`/api` → `localhost:8080`) with
  `VITE_API_BASE_URL` for production, and rewrites the greet slice to
  run end-to-end across services — outcome and offline fallback both
  surfacing through the read model. `gateway/quarkus-cors` (on
  `peer.ui.spa`) allows the Vite dev origin in the backend's
  `application.properties`. Installed automatically for composite
  services; brownfield via the new **`keel link <path>`** command,
  which records two existing projects as peers of one another (both
  manifests, refs relative, re-link refreshes) followed by
  `keel add gateway` in each.
- **Rust walking skeleton with composable CLI and HTTP entrypoints.**
  Two new stacks — `rust-cli` and `rust-http` — compose the existing
  `vcs` + `walking-skeleton` verticals for Rust, realizing the house
  Rust hexagonal reference: one package per service, `src/domain.rs`
  as the contract face (commands, driving-port traits, exported
  factories) over a compiler-hidden core (`src/domain/greet.rs`, a
  private module nothing outside `domain` can name), one `src/bin/`
  directory per deployment unit wired by hand in `main`, and no
  mediator object — per the binding spec's settled Rust stance
  (per-use-case driving-port traits by default). Four new adapters:
  `walking-skeleton/rust-bootstrap` (package shell, domain,
  DIP-strict `tests/` integration test, deferred `cargo check`;
  covers `build-tool`), `walking-skeleton/rust-cli-bootstrap` (flags
  → command → port → exit code, dependency-free) and
  `walking-skeleton/rust-http-bootstrap` (`GET /greet` → command →
  port → JSON on axum + tokio, honouring the REST seam contract —
  `{"greeting": …}`, absent name defaulting to `world` at the
  transport boundary — with domain errors as RFC 9457 problem
  documents) — both covering `entrypoint`, additive so a tag set
  carrying `arch.cli` and `arch.server-http` ships both units, each
  registered as an explicit `[[bin]]` target — and
  `walking-skeleton/rust-port-fake` (the `Clock` trait with its
  canonical fake under `src/infra/`, stitched in by idempotent
  module-declaration patches; covers `port-example`). Exercised end
  to end by a Rust e2e suite (test, build, run the CLI, serve
  `/greet`).
- **The `quarkus-rest` stack — the REST entrypoint.** `keel new
--stack=quarkus-rest` scaffolds a Quarkus 3 REST service on Gradle
  in the binding-spec layout: the familiar `domain/kernel` /
  `domain/contract` / `domain/core` trisection plus the earned
  application pair `application/rest/contract` (transport DTOs) and
  `application/rest/executable` (Jakarta REST resource for
  `GET /greet?name=…`, the domain-error → RFC 9457 Problem Details
  mapper, and the CDI composition root), driven end to end by a
  `@QuarkusTest` + RestAssured test. The new
  `walking-skeleton/quarkus-rest-bootstrap` adapter covers the same
  `entrypoint` dimension as the CLI bootstrap under
  `framework.quarkus + arch.server-http` — the first proof that the
  entrypoint is selected by predicate, not hard-coded.
- **Go walking skeleton with composable CLI and HTTP entrypoints.**
  Two new stacks — `go-cli` and `go-http` — compose the existing
  `vcs` + `walking-skeleton` verticals for Go, realizing the house Go
  hexagonal reference: one module per service, `internal/domain` as
  the contract face (commands, driving ports, exported factories)
  over a compiler-hidden core in `internal/domain/internal/`, one
  `cmd/` directory per deployment unit wired by hand in `main`, and
  no mediator object — per the binding spec's settled Go stance.
  Four new adapters: `walking-skeleton/go-bootstrap` (module shell,
  domain, DIP-strict domain test, deferred `go mod tidy`; covers
  `build-tool`), `walking-skeleton/go-cli-bootstrap` (flags →
  command → port → exit code) and `walking-skeleton/go-http-bootstrap`
  (`GET /greet` → command → port → JSON, domain errors as RFC 9457
  problem documents) — both covering `entrypoint`, additive so a tag
  set carrying `arch.cli` and `arch.server-http` ships both units —
  and `walking-skeleton/go-port-fake` (the `Clock` port with its
  canonical fake under `internal/infra/clockfake`; covers
  `port-example`). The generated projects are stdlib-only and are
  exercised end to end by a Go e2e suite (vet, test, build, run the
  CLI, serve `/greet`).
- **`web-components` stack** (`keel new --stack=web-components`) —
  the walking skeleton's frontend realization, mirroring the house
  hexagonal reference for the browser: a framework-free
  web-components SPA as a TypeScript npm workspace. The
  `walking-skeleton/wc-spa-bootstrap` adapter emits
  `domain/domain-api` (ports, commands, read models — compiled with
  `"lib": ["ES2022"]`, so touching the DOM is a tsc error),
  `domain/domain-core` (an `exports` map exposing only factory entry
  points, so deep imports fail at module resolution), and an
  `application/web-app` Vite deployment unit whose `main.ts` is the
  assembly point — ports delivered to custom elements over the WCCG
  Context protocol, no mediator, cross-cutting via factory
  decoration, per binding spec §2. `walking-skeleton/wc-sample-port-fake`
  adds the sample `Clock` port with real (`systemClock`) and fake
  (`createFakeClock`) adapters side by side in
  `infrastructure/commons`, plus a contract test;
  `walking-skeleton/npm-install` covers the `build-tool` dimension
  under `pkg.npm` with a deferred `npm install`, the npm counterpart
  of `gradle-wrapper`.
- **Design system in the web-components skeleton** — the
  `walking-skeleton/wc-design-system` adapter (co-firing with the
  bootstrap) emits a `design-system/` workspace package following
  atomic design on top of `@rgoussu.dev/planks`: planks layout
  primitives + token scale as the sub-atomic substrate, a project
  brand-token layer (`tokens.css`), a button atom and a
  greeting-card molecule (attributes in, `CustomEvent`s out, tested
  under happy-dom), all domain-blind — the package declares no
  dependency on the domain, so a domain-aware "atom" fails at module
  resolution. The scaffolded shell and the greet organism compose it
  (planks `<center-pk>`/`<stack-pk>`/`<cluster-pk>` layout, state
  pushed down as attributes); everything renders in the light DOM,
  matching planks' tag-scoped styling convention.

### Changed

- **README reframed around the bootstrapper.** The tagline and _Why
  keel_ now lead with what `keel new` produces — a runnable,
  production-shaped walking skeleton in under a minute — with the
  composition engine and the Claude Code workflow kit presented as
  how and why it holds, instead of leading with the convention kit
  and mentioning scaffolding last. The _Verticals shipped_ section
  also catches up with the surface: Gradle **or Maven** on the JVM,
  the Rust and TypeScript skeletons, npm **or pnpm** workspaces, and
  the TypeScript backend's CORS half of the gateway seam.
- The npm package description follows the same reframing — it now
  leads with the bootstrapper instead of the workflow kit.
- **The gateway CORS seam is dev-only across every fullstack
  backend.** The accommodation for the Vite dev origin no longer
  reaches production, each stack using its own idiom: Quarkus
  properties are `%dev.`-scoped, the Spring `CorsConfig` bean is
  `@Profile("dev")`, Micronaut's properties move to a dev-environment
  `application-dev.properties`, the Go wrapper is a no-op unless
  `GO_ENV=dev`, the Rust decoration is gated on
  `cfg!(debug_assertions)` (release builds pass through), and the
  Node wrapper is a no-op under `NODE_ENV=production` (which the
  `backend-ts` image now sets). The Go and Rust wrappers also answer
  preflights completely (`allow-methods` + echoed `allow-headers`),
  matching the ts-cors fix below, and the product README's run hints
  show each stack's dev activation.
- **The JVM stacks target Java 25 (latest LTS).** Every JVM bootstrap
  now pins the JDK through a Gradle toolchain
  (`JavaLanguageVersion.of(25)`) instead of bare
  source/targetCompatibility flags, with the
  `foojay-resolver-convention` settings plugin so a machine without a
  local JDK 25 auto-provisions one instead of failing the first
  build. On the Kotlin twins the Kotlin compiler derives its
  `jvmTarget` from the same toolchain, replacing the explicit
  `JvmTarget.JVM_21` wiring. The fullstack backend images build on
  `gradle:jdk25` and run on `eclipse-temurin:25-jre`, the
  `quarkus-cli-native` workflows set up GraalVM for JDK 25, and the
  stack descriptions say so. The Maven build trees pin the same
  version (`maven.compiler.release`, the Kotlin `jvmTarget`, and the
  Micronaut `jdk.version`/`release.version` properties). The
  surrounding versions already
  supported 25 (Gradle 9.4.1, Quarkus 3.34.6, Spring Boot 4.1.0,
  Micronaut 4.10.17, Kotlin 2.3.21), so this closes the roadmap's
  "latest LTS" drift.
- **The JVM bootstraps share their domain templates.** The domain
  trisection is emitted from shared per-language trees
  (`assets/composition/walking-skeleton/jvm-domain/`) rather than
  being duplicated per framework, and all twelve JVM bootstrap
  adapters are built by one `jvmBootstrapAdapter` factory keyed on
  (framework, arch, language). Rendered output for the existing
  Quarkus stacks is unchanged. `sample-port-fake` (plain Java + a
  plain Gradle module) now fires for every Java JVM bootstrap
  (`runtime.jvm + lang.java`), not just Quarkus.
- **`walking-skeleton/sample-port-fake` now fires for both project
  shapes**: its predicate loosened from requiring `arch.cli` to
  `framework.quarkus + arch.hexagonal`, and it reads `basePackage`
  from whichever bootstrap ran. `keel add distribution` on a
  `quarkus-rest` project still hard-fails with uncovered dimensions —
  the REST-shaped distribution adapter is the next roadmap item.

### Fixed

- **The `ts-http` 500 problem detail is redacted in production.**
  The rejected-dispatch handler echoed `error.message` to clients
  unconditionally; under `NODE_ENV=production` the detail is now the
  generic `unexpected failure`, while dev and test keep the real
  message. The generated test suite pins both. (Post-merge review
  finding from #32.)
- **The `ts-http` request handler no longer leaves the response
  hanging on a rejected dispatch.** The generated `server.ts` chains
  `.catch()` onto `mediator.dispatch(…)` and maps unexpected failures
  to an RFC 9457 500 problem document; the generated test suite pins
  the behaviour. (Post-merge review finding from #31.)
- **`gateway/ts-cors` answers preflights completely.** The `OPTIONS`
  branch now sends `access-control-allow-methods` and echoes any
  `access-control-request-headers`, so a browser preflight that does
  fire is actually satisfied instead of blocked. (Post-merge review
  finding from #31.)
- **`go-http` now honours the REST seam contract.** Its greet reply
  was `{"message": …}` where the Quarkus REST unit replies
  `{"greeting": …}`, and it rejected an absent name where Quarkus
  defaults to `world` — so one frontend gateway could not serve both
  backends. Absent names now default at the transport boundary; a
  present-but-blank name still reaches the domain and is rejected as
  an RFC 9457 problem.
- **Composite-service peer refs are correct at any nesting depth.**
  `keel new` recorded a sibling's `peers` ref by prefixing `../`,
  which is only right for single-segment service paths; refs are now
  computed relatively, so nested layouts (e.g. `apps/backend` +
  `apps/frontend`) project correctly.
- **`gateway/go-cors` fails loudly on a diverged assembly point.**
  When `cmd/http/main.go` no longer contains the serve call the
  adapter knows how to wrap, the install now hard-fails with a clear
  message instead of appending a decorator that never runs.
- The npm package description no longer advertises "schematics" —
  the engine retired in v0.4.0-alpha — and describes the
  composition-driven scaffolding instead.
- `docs/roadmap.md` no longer presents the REST entrypoint as the
  recommended next step: landed work (quarkus-rest, the Go / Rust /
  web-components skeletons, fullstack composition and the gateway
  seam, the Spring / Micronaut / Kotlin generalisation) is collapsed
  into a "landed" summary, and the remaining items (container-image
  distribution, CI vertical, AGENTS.md addenda, server-side
  TypeScript stack) are restated against the current surface.
- README quickstart now describes the layout the v0.5 skeleton
  actually scaffolds (`domain/kernel`, `domain/contract`,
  `domain/core`, `application/cli`, plus the emitted `AGENTS.md` +
  `CLAUDE.md` pointer) instead of the pre-v0.5 `infrastructure/cli`
  shape, and the `quarkus-cli` seed-tag list includes `runtime.jvm`.

## [0.5.0-alpha] — 2026-08-09

### Changed

- **keel now dogfoods its own binding spec.** The source tree is
  trisected into `domain/` (kernel ← contract ← core), `application/`
  (`cli/contract` interface adapter + `cli/executable` composition
  root), and `infrastructure/` (one directory per port). Business
  operations dispatch as commands (`keel.new-project`,
  `keel.add-vertical`) through a `RegistryMediator` over handlers that
  self-declare via `supports()`; expected failures return
  `Result`-wrapped `DomainError`s that the CLI maps to stderr + exit
  code 1. All technology (fs, EJS, inquirer, chalk, `spawnSync`) sits
  behind ports — `Tree`, `Prompt`, `Logger`, `Clock`, `ManifestStore`,
  `TemplateSource`, `ProcessRunner` — each shipping a canonical
  in-memory fake beside its real adapter.
- **The agent-instructions files migrated to the AGENTS.md
  convention** — in this repo (the contributor guide is `AGENTS.md`;
  `CLAUDE.md` is a one-line `@AGENTS.md` import) and in scaffolded
  projects: the `walking-skeleton/claude-core` adapter now emits the
  binding spec as `<project>/AGENTS.md` plus the `CLAUDE.md` pointer,
  instead of `<project>/.claude/CLAUDE.md`, and the canonical asset
  moved to `assets/project/AGENTS.md`. Existing projects keep their
  `.claude/CLAUDE.md` until re-scaffolded.
- **Binding spec §2 now states the settled per-language dispatch
  stances**: commands through one explicit dispatch seam everywhere;
  registry Mediator on the JVM (and server-side TypeScript), enum +
  exhaustive match as Rust's unified-seam form, no mediator object in
  Go or the frontend (per-use-case ports + decorators). Mirrors the
  knowledge-base ruling of 2026-08-09.
- **CLI output ordering.** The planned-changes listing now prints
  after deferred actions run (the plan is part of the command's
  result). Dry-run output is unchanged.
- **Node 20 support dropped** (`engines.node` is now `>=22`). Node 20
  reached end-of-life in April 2026, and the enforced-dependency-rule
  tooling follows the node.js release cycle; CI now verifies on
  Node 22 and 24.
- The composition layer's deferred side effect is renamed `Action` →
  `DeferredAction` to keep it distinct from the kernel's dispatchable
  `Action` base; `InMemoryTree` is renamed `FsTree` and lives in
  `infrastructure/tree` (it stages in memory but reads/commits the
  real filesystem).

### Added

- **The scaffolded walking skeleton now follows the binding spec's
  layout itself**: a `domain/kernel` Gradle module owns the
  `Command`/`Handler`/`Mediator` bases; `GreetCommand` (the public
  surface) moves to `domain/contract`; the mediator implementation is
  named `RegistryMediator`; and the CLI — a primary adapter — moves
  from `infrastructure/cli` to `application/cli` (one module, per the
  earned-pair rule: a CLI has no consumable API artifact). The
  distribution workflows follow the new build paths.
- **The dependency rule is now enforced.** dependency-cruiser runs in
  `pnpm lint` (and CI): the kernel imports nothing, the contract sees
  only the kernel, core never imports outward, infrastructure sees
  only kernel+contract and adapters never import each other, the CLI
  interface adapter can't touch core or infrastructure, and the
  composition-root exception is pinned to
  `application/cli/executable`. No import cycles anywhere.
- Per-layer `README.md` + `AGENTS.md` documenting each layer's
  purpose and local conventions.
- Typecheck (`pnpm typecheck`) now covers `tests/` as well as `src/`.

### Removed

- The dead `util/hash` module (no importers).

## [0.4.0-alpha] — 2026-06-10

### Added

- **Composition engine.** Replaces the v0.3 schematic-and-engine model
  with a capability-tag composition layer: predicate-driven adapters
  contribute files, patches, and deferred actions; verticals group
  adapters under a coverage requirement; the resolver hard-fails if
  any dimension is uncovered for the current tag set. See
  `src/composition/types.ts` for the contract.
- **`keel new --stack=<id>`.** Greenfield bootstrap from a stack
  preset. Today the only stack is `quarkus-cli` — a Quarkus 3 CLI on
  Gradle (Java 21) in a hexagonal layout — composing the `vcs` and
  `walking-skeleton` verticals.
- **`keel add <vertical>`.** Brownfield path: layer an additional
  vertical onto an already-initialised keel project. Today
  `distribution` is the headline use case; the add command refuses to
  run without a manifest, rejects unknown verticals with a list of
  available ones, and refuses to install the same vertical twice.
- **`walking-skeleton/quarkus-cli-bootstrap` adapter.** Emits a
  multi-module hexagonal Quarkus picocli skeleton: `domain/contract`,
  `domain/core`, and `infrastructure/cli`, with a `Mediator` interface,
  a sample `GreetCommand` + handler, a picocli subcommand, and a
  `QuarkusMainTest` that drives it end to end. Reads `basePackage` and
  `projectName` as sticky answers reused by downstream adapters.
- **`walking-skeleton/sample-port-fake` adapter.** Adds a sample
  `Clock` secondary port to `domain/contract` plus a `FakeClock`
  module under `infrastructure/clock/fake` with a contract test, and
  patches `settings.gradle.kts` to include the new module.
- **`walking-skeleton/gradle-wrapper` adapter.** Generates the Gradle
  Wrapper via the canonical `gradle wrapper` task as a deferred Action
  after the bootstrap files land — no checked-in jar. Requires
  `gradle` on PATH; surfaces a clear error otherwise.
- **`distribution` vertical with `quarkus-cli-native` adapter.** Ships
  GitHub Actions workflows that cross-compile the Quarkus CLI to
  native binaries via GraalVM and publish them to a GitHub Release on
  tag push. One sticky question selects the matrix targets
  (linux-amd64, linux-arm64, darwin-arm64). Promotes
  `runtime.graalvm-native` so future verticals can key off it.
- **Manifest v2.** Adds `tags`, `verticals`, `versions`, and `answers`
  alongside the v1 file-tracking entries. Reads are version-aware: a
  v1 manifest on disk migrates in memory on first read, and writes
  always emit v2.
- **`walking-skeleton/claude-core` adapter.** Emits the universal
  binding spec (`assets/project/CLAUDE.md`) into
  `<project>/.claude/CLAUDE.md` so every keel-scaffolded project
  carries the conventions Claude Code reads at session start. Covers
  a new `agentic-baseline` dimension on the walking-skeleton vertical,
  predicate empty so it fires unconditionally. Reads from the same
  canonical file contributors edit, so there's exactly one source of
  truth for the spec.
- **Walking-skeleton end-to-end test.** New
  `tests/composition/walking-skeleton-e2e.test.ts` drives `newProject`
  for the `quarkus-cli` stack into a temp directory, then runs
  `./gradlew build` (compile + tests) and the produced
  `quarkus-run.jar` against a sample `hello --name E2E` invocation,
  asserting the greeting reaches stdout. Per the brief, the only
  side effect that's faked is git: `vcs/git-init` is replaced with a
  no-op; every other deferred action runs for real. Each run uses a
  fresh `GRADLE_USER_HOME` so the scenario starts from a blank cache.
  Skipped automatically when `gradle` or `java` is missing from PATH,
  and on CI by default (the cold-cache Quarkus download is too heavy
  to run on every PR); opt out locally with `KEEL_SKIP_E2E=1`, opt in
  on CI with `KEEL_RUN_E2E=1`.

### Fixed

- **Walking-skeleton template now actually builds.** Bumped the
  `quarkus-cli-bootstrap` template's Quarkus version from `3.16.0`
  (which was never published to Maven Central — the 3.16 line jumped
  from `3.16.0.CR1` to `3.16.1`) to `3.34.6`, the latest stable in
  the 3.x line. The new version is also compatible with the Gradle
  9.4.1 wrapper the `gradle-wrapper` adapter pins, where 3.16's Gradle
  plugin tripped Gradle 9's stricter detached-configuration model.
- **JUnit Platform launcher on the test runtime classpath.** Gradle 9
  no longer auto-provides the platform launcher, so
  `useJUnitPlatform()` alone fails with "Failed to load JUnit
  Platform". The root `build.gradle.kts` template now adds
  `testRuntimeOnly("org.junit.platform:junit-platform-launcher")` to
  every subproject.
- **`gradle-wrapper` adapter surfaces the actual Gradle error.**
  Gradle prints task failures (`Test of distribution url ... failed`,
  `BUILD FAILED in Ns`, the stacktrace under `--stacktrace`) on
  stdout, not stderr. The previous `describeFailure` only captured
  stderr and fell back to `exit N`, leaving users with a context-free
  message when `gradle wrapper` failed. The adapter now joins both
  streams into the thrown error.

### Removed

- **Legacy schematics engine.** Every module that the v0.3
  schematic-and-engine path needed is gone: `src/schematics/` (whole
  directory: claude-core, claude-quarkus, walking-skeleton, port,
  scenario, gradle-wrapper, executable-rest, iac-cloudrun, ci-github,
  git-init, registry, util), `src/engine/types.ts`,
  `src/engine/homegrown.ts`, `src/engine/template.ts`, the
  `assets/schematics/` template tree, and the `'schematics'` asset
  kind. The composition engine fully replaces the surface.
- **Legacy CLI commands.** `keel install`, `keel update`, `keel
doctor`, and `keel generate` are removed; the CLI ends up with just
  `new` and `add`. The legacy installers
  (`src/installer/install.ts`, `update.ts`, `doctor.ts`, `plan.ts`,
  `profile.ts`, `env.ts`) are gone.
- **Legacy manifest store.** `src/manifest/schema.ts` and
  `src/manifest/store.ts` are gone. The v1 ManifestSchema and
  `MANIFEST_FILENAME` are inlined into `schema-v2.ts` solely to keep
  the migration path working.

## [0.3.0-alpha] — 2026-04-26

### Added

- **Context-aware install.** `keel install` is now a progressive,
  schematic-driven flow. On a greenfield workspace it asks **language →
  framework → native?**, runs an environment preflight, and composes
  the chosen schematics through the engine onto a single shared tree:
  `claude-core` (universal scaffold), `claude-<framework>` (stack
  runbook skills + CLAUDE.md addendum), and `walking-skeleton` (the
  thinnest end-to-end slice). The progressive picker is driven by a
  small profile registry (`src/installer/profile.ts`); adding a stack
  is a profile-only change.
- **`claude-core` schematic.** Renders the universal Claude scaffold
  (CLAUDE.md, settings, hooks, commands, agents, conventions) into
  `<project>/.claude/`. Runnable standalone via
  `keel generate claude-core`.
- **`claude-quarkus` schematic.** Renders five universal-verb runbook
  skills tailored to the stack — `build`, `test`, `run`, `format`,
  `troubleshoot` — and appends a sentinel-marked addendum to
  `CLAUDE.md` describing the project layout, default endpoints, and a
  quick command reference. Idempotent: a second run does not duplicate
  the addendum.
- **Environment preflight.** New `Env` port + `realEnv` adapter +
  `preflight()` driver. Universal check: `git` is required (fatal).
  Stack-gated checks for `java-quarkus`: a JDK on PATH at major ≥ 25
  (warning if missing or older — Gradle toolchains still bail out on
  first build), and — when native packaging is opted into — GraalVM's
  `native-image` (warning).
- **Runtime gradle-wrapper download.** `gradle-wrapper.jar` is fetched
  from `services.gradle.org/distributions/` at install time and
  verified against the published `.sha256` sidecar. The committed
  binary jar is gone from the repo. Dry-run uses a placeholder buffer
  so the planned-changes preview still shows the path without any
  network I/O.

### Changed

- **Default versions for the Java/Quarkus stack.** Gradle Wrapper
  default bumped from `8.11.1` → **`9.4.1`** (Java 25 toolchain
  support). Quarkus default bumped from `3.15.0` → **`3.33.1` LTS**
  (full Java 25 support). Version catalog refreshed: junit `5.13.4`,
  assertj `3.27.7`, archunit `1.4.2`, pitest (lib) `1.23.0`, nullaway
  `0.13.0`, spotless plugin `8.4.0`, pitest plugin `1.19.0`.
- **Asset layout.** The universal scaffold moved from
  `assets/project/` to `assets/schematics/claude-core/templates/` —
  it's now a regular schematic. `paths.asset('project')` is replaced
  by `paths.claudeCoreTemplates()` as the seam used by `install` and
  `update`. Manifest `source` prefix shifts from `project/<rel>` to
  `<schematic>/<rel>` (informational only — manifests carrying the
  legacy `project/` prefix continue to upgrade cleanly).
- **`update` orphan handling.** Files installed by stack-specific
  schematics (`claude-<stack>`, `walking-skeleton`) are tracked in
  the manifest but live outside `claudeCoreTemplates()`. `update`
  now preserves their entries verbatim instead of treating them as
  orphans and deleting them on the next run.
- **`sha256Shipped` records the first-writer content.** For files
  composed by multiple schematics (e.g. `CLAUDE.md` = claude-core +
  claude-quarkus addendum), `sha256Shipped` is the first writer's
  content and `sha256Current` is the final composed content. The gap
  signals "non-trivial composition" to `update`, which then routes
  the file through the user-modified-conflict path instead of
  silently overwriting and dropping the addendum.

### Removed

- **Methodology-only skills.** The seven skills that only restated
  conventions already present in `CLAUDE.md` are gone:
  `hexagonal-review`, `mediator-pattern`, `trunk-based-xp`,
  `public-api-docs`, `test-scenario-pattern`, `walking-skeleton-guide`,
  `iac-opentofu`. The binding-spec content stays in CLAUDE.md;
  actionable skills now live alongside each stack profile.
- **Committed `gradle-wrapper.jar`.** The binary is no longer checked
  in; it is fetched and verified at install time.

### Notes

- `keel install` now refuses to operate on a directory containing
  anything beyond `.git` (override with `--force`). Brownfield-aware
  install support is on the roadmap.

## [0.2.0-alpha] — 2026-04-25

### Removed

- **Global install scope.** The `--global` flag is gone from
  `keel install` and `keel update`, and `keel doctor` no longer audits
  `~/.claude`. keel is now **project-scoped only**: the entire kit
  (CLAUDE.md, skills, agents, slash commands, hooks, settings) installs
  into `<project>/.claude/`, and the user's home directory is never
  read, written, or otherwise touched. This is a breaking change for
  anyone running `keel install --global` — the command now fails with
  an unknown-option error. Existing `~/.claude/` installs are left
  alone (no cleanup is performed); to migrate, run `keel install` in
  each project that should have keel and remove the now-orphaned
  `~/.claude/` files manually if desired.

### Changed

- **`assets/global/` and `assets/conventions/` collapsed into
  `assets/project/`.** The packaged asset tree no longer distinguishes
  scopes: `CLAUDE.md`, `agents/`, `commands/`, and `skills/` moved from
  `assets/global/` to `assets/project/`; the permissions / env block
  from `assets/global/settings.json` was merged into
  `assets/project/settings.json` alongside the existing hooks; and
  `assets/conventions/languages.json` (the per-language toolchain
  matrix consulted by hooks, agents, and slash commands) moved to
  `assets/project/conventions/`. Consumers see the merged bundle land
  in `<project>/.claude/`. Shipped agents and commands now reference
  `.claude/conventions/languages.json` instead of the keel-repo path
  `assets/conventions/languages.json`, which fixes a broken reference
  for consumer projects.
- **`doctor` foreign-file scan.** `conventions/` is now a managed
  directory; foreign files dropped there are flagged.
- **Manifest schema.** The `scope` field is removed from the schema (no
  longer typed, no longer written). Old manifests that still carry a
  `scope` key continue to parse — Zod silently strips unknown keys —
  but the value is ignored everywhere.
- **CLI help text** updated to describe the project-only behavior; the
  `keel doctor` summary line now reports a single audit instead of one
  per scope.
- **README rewritten.** New sections: _Why keel_, _Quickstart_,
  _CLI_ (full command table with flags and behavior), _What ships in
  the kit_, _Customizing your install_. Drops every reference to
  `--global`.
- **Root `CLAUDE.md`** updated: §1 points the binding spec at
  `assets/project/CLAUDE.md`; §6 layout shows a single `assets/project/`
  bundle; §7 testing reference relinked.

### Added

- `LICENSE` file at the repository root (MIT, © 2026 Romain Goussu).
  The package was already declared MIT in `package.json` but lacked a
  root license file.
- `THIRD_PARTY_LICENSES/` scaffolding for tracking derived work:
  `citypaul-dotfiles.LICENSE` (verbatim upstream license),
  `citypaul-dotfiles.NOTICE.md` (audit trail of imported artifacts
  pinned to upstream commit `a4b6c469`), and `HEADER_TEMPLATE.md`
  (per-file provenance header templates for Markdown, shell,
  TypeScript, PowerShell, and JSON sidecars).
- `README.md`: `Acknowledgments` section pointing to the
  `THIRD_PARTY_LICENSES/` audit trail.
- Four specialised agents under `assets/project/agents/`, adapted from
  citypaul/.dotfiles (MIT, © 2024 Paul Hammond) at upstream commit
  `a4b6c469`: `tdd-guardian`, `pr-reviewer`, `learn`, `adr`. Each file
  carries a provenance header listing the substantive deltas; the
  audit trail is in
  `THIRD_PARTY_LICENSES/citypaul-dotfiles.NOTICE.md`. Distributed to
  `<project>/.claude/agents/` by `keel install` (no installer change
  required; the planner walks `assets/project/` recursively).
- Three new skills extracted from the binding spec, each with TRIGGER /
  SKIP guidance for Claude Code's on-demand loading:
  - `mediator-pattern`: Action/Command/Query/Result kernel, mediator
    construction rules, sealed error hierarchies, transport mapping.
  - `iac-opentofu`: OpenTofu rules, walking-skeleton checkpoint,
    container-registry choice, anti-patterns.
  - `trunk-based-xp`: workflow, commit discipline, the "done"
    checklist.
- GitHub MCP permissions in `assets/project/settings.json`: read tools
  (`mcp__github__pull_request_read`,
  `mcp__github__list_pull_requests`,
  `mcp__github__get_file_contents`,
  `mcp__github__subscribe_pr_activity`, etc.) are pre-allowed; write
  tools (`mcp__github__pull_request_review_write`,
  `mcp__github__add_issue_comment`, `mcp__github__create_pull_request`,
  `mcp__github__merge_pull_request`, etc.) are ask-listed. Same
  read-vs-write split as the existing git permissions.

- **Domain split refined into a three-module DAG**:
  `domain/kernel ← domain/contract ← domain/core`. Builds on the
  kernel-relocation work in #6 (which had grouped everything in
  `domain/contract/kernel/`) by extracting the higher abstractions —
  sealed `Action` / `Command` / `Query` / `Result` / `Error` bases plus
  the `Handler` and `Mediator` interfaces — into a dedicated
  `:domain:kernel` Gradle module. The concrete `Command` / `Query` /
  `Error` subtypes that name each supported operation stay in
  `domain/contract` (the system's public surface). The Mediator
  implementation (`RegistryMediator`) and the handlers live in
  `domain/core`. Adapters
  (`application/<channel>/contract`, `infrastructure/<port>/*`)
  depend on `domain/kernel` and `domain/contract`; the composition
  root (`application/<channel>/executable`) keeps its cross-layer
  wiring exception introduced in #6. CLAUDE.md §1 + §2,
  `hexagonal-review` skill, `mediator-pattern` skill,
  `walking-skeleton-guide` skill, and `pr-reviewer` agent updated to
  match.
- **Walking-skeleton schematic ships the new module structure**: the
  Java template scaffolds `:domain:kernel`, `:domain:contract`,
  `:domain:core` as separate Gradle modules. `Mediator` becomes an
  interface in `domain/kernel/`; `RegistryMediator` (default impl
  built from `Collection<Handler<?>>`) lives in `domain/core/`.
  `settings.gradle.kts` includes `:domain:kernel` ahead of
  `:domain:contract`. `domain/contract/build.gradle.kts` declares
  `implementation(project(":domain:kernel"))`;
  `domain/core/build.gradle.kts` adds `:domain:kernel` alongside the
  existing `:domain:contract`. The walking-skeleton test asserts the
  new file layout, the interface/impl split, and the new include.
- **`executable-rest` schematic adapted to the three-module split**:
  `application/rest/contract/build.gradle.kts` and
  `application/rest/executable/build.gradle.kts` now also depend on
  `:domain:kernel`. `MediatorProducer.java.ejs` constructs
  `RegistryMediator` (the impl) and exposes it via the `Mediator`
  interface.
- **`iac-opentofu` skill aligned with `/iac/<target>/`**: the skill
  now describes IaC modules at the repo root (`/iac/cloudrun/`,
  `/iac/hetzner/`, etc.) instead of `infrastructure/iac/`, matching
  #6's IaC-relocation; container-registry section added per the same.
- **`assets/project/CLAUDE.md` trimmed from 214 to ~150 lines** (file
  was at `assets/global/CLAUDE.md` before the global-scope removal):
  each
  major section keeps a 2–4 line summary and points to its skill
  (`§1` → `hexagonal-review`, `§2` → `mediator-pattern`, `§3` →
  `test-scenario-pattern`, `§4` → `walking-skeleton-guide`, `§5` →
  `iac-opentofu`, `§6` → `trunk-based-xp`, `§8` → `public-api-docs`).
  `§7 Principles` and `§9 Claude behavior` (always-loaded) stay in
  the core. The on-demand-skills pattern is inspired by
  `citypaul/.dotfiles` (see `THIRD_PARTY_LICENSES/`).

### Fixed

- `package.json` `files` list now ships `LICENSE` and
  `THIRD_PARTY_LICENSES/` on `npm publish`, so consumers receive the
  audit trail and upstream permission notices the README points at.
- `THIRD_PARTY_LICENSES/HEADER_TEMPLATE.md` no longer hard-codes
  `© 2026 Romain Goussu, MIT.` in the modifier-copyright line; the
  year, holder, and license are now `<YYYY>` / `<holder>` /
  `<license>` placeholders documented under "Required fields", with
  a default pointing at the repo `LICENSE`.
- `THIRD_PARTY_LICENSES/HEADER_TEMPLATE.md` PowerShell template
  snippet uses an em dash (`MIT — see ...`) like the other templates
  instead of a hyphen.
- `trunk-based-xp` skill no longer claims "no branches / no pull
  requests" without acknowledging the keel-repo cloud-session
  exception for both. Each rule explicitly scopes to consumer
  projects and links to the keel repo root `CLAUDE.md`, §2 and §4
  for the exception.
- `pr-reviewer` agent's "Quality gates" section no longer references
  the stale `assets/global/CLAUDE.md §6.2`. It now points at the
  `trunk-based-xp` skill's "Done means" section, which is the live
  source of those checks since the binding spec was trimmed.

## [0.1.0-alpha.2] — 2026-04-19

### Added

- `CI` workflow (`.github/workflows/ci.yml`): lint, typecheck, test, build on
  every pull request and push to `main`, matrixed across Node 20 and 22 with
  pnpm 9 and a pnpm cache.
- `Release` workflow (`.github/workflows/release.yml`): on `v*` tag push,
  verifies the tag matches `package.json`, reruns the full verify pipeline,
  publishes to npm with `--provenance --access public`, and creates a GitHub
  Release with auto-generated notes.
- npm dist-tag is derived from the semver prerelease identifier (`alpha` →
  `alpha`, `beta` → `beta`, `rc` → `next`, none → `latest`); unknown
  prerelease identifiers fail the release.
- `CLAUDE.md` at the project root documenting repo-specific engineering and
  workflow conventions, including the PR auto-subscribe preference for
  cloud-hosted Claude sessions.
- `.github/dependabot.yml`: weekly grouped updates for `github-actions`.
- README: CI/Release badges, `Development` section, `Release process`
  section.
- `.prettierignore` so generated files (lockfile, `dist/`, schematic
  templates, manifests) are excluded from the prettier check.
- Claude `PreToolUse` hook (`.claude/hooks/pre-commit-format.sh`) that
  auto-formats and re-stages before every `git commit`, and blocks the
  commit if lint still fails after formatting.
- `format:check` npm script that runs `prettier --check .`.

### Changed

- `pnpm lint` now also runs `prettier --check .` after eslint, so
  formatting drift fails the same gate as code-style rules.

### Security

- Pinned every GitHub Action in CI and release workflows to a full commit
  SHA with a `# vX.Y.Z` comment (`actions/checkout`, `actions/setup-node`,
  `pnpm/action-setup`, `softprops/action-gh-release`) so upstream changes
  cannot reach the publishing pipeline without review.

## [0.1.0-alpha.1] — 2026-04-19

First cut of the kit. Installs globally (user-wide defaults) and per-project
(hooks, per-repo settings). Copy-based install with manifest tracking and
three-way update reconciliation. Homegrown schematics engine behind a
swappable `Engine` / `Schematic` / `Tree` / `Context` port interface.

### CLI

- `keel install [--global] [--force] [--dry-run]`
- `keel update  [--global] [--dry-run] [--yes]` — three-way merge, prompts on conflict
- `keel doctor` — audit both scopes for drift
- `keel generate <schematic> [--dry-run] [--set k=v...]` (alias `g`)

### Global assets (`~/.claude/`)

- `CLAUDE.md` encoding: hexagonal architecture, Command/Query + Mediator,
  DIP-strict tests (Scenario + Factory + fakes), walking skeleton first,
  IaC via OpenTofu, trunk-based + XP + SOLID + 12-Factor, public-API-docs
  policy, always-latest-stable rule, terse Claude behaviour.
- `settings.json` with pre-allowed toolchain (Gradle, pnpm, Cargo, Go,
  OpenTofu, rg/fd/tree) + ask-list (push/reset/rebase) + deny-list
  (force-push, reset --hard, sudo).
- Skills: `hexagonal-review`, `test-scenario-pattern`, `public-api-docs`,
  `walking-skeleton-guide` — language-agnostic, same principle across
  Java / Kotlin / TypeScript / Rust / Go.
- Slash commands: `/commit`, `/sync`, `/diff-review`, `/docs-check`.

### Project assets (`<project>/.claude/`)

- Hooks (`.sh` + `.ps1` pair each, platform-scoped in settings):
  - `PostToolUse` format-on-edit (spotless, prettier, rustfmt, gofmt, tofu fmt)
  - `PreToolUse` pre-commit-verify (gradle check, pnpm typecheck+test, cargo,
    go vet+test)
  - `SessionStart` context load (branch, dirty count, recent commits,
    walking-skeleton markers)
  - `Stop` commit-discipline reminder

### Conventions table

- `assets/conventions/languages.json` — per-language formatter, linter,
  typecheck, test, mutation, doc format. Single source of truth for all
  hooks / commands / schematics.

### Schematics (Java proving ground)

- `port` — secondary port + fake module + contract test (4 files).
- `scenario` — Scenario + Factory + Test triad in the domain test tree.
- `walking-skeleton` — multi-module Gradle shell + build-logic convention
  plugins + kernel (Action / Command / Query / Result / Error / Handler /
  Mediator / DuplicateHandlerException / NoHandlerError) + IaC stub +
  composes `port` for a starter secondary port (27 files).

### Not yet shipped (roadmap)

- `executable` schematic — chooses web / messaging framework at
  walking-skeleton time; wires an `application/<channel>/executable`.
- `handler` schematic — Action + Handler + wiring.
- `adapter` schematic — real adapter for an existing port.
- Additional language templates (Kotlin, TypeScript, Rust, Go).
- Adapter packages for alternative schematics engines (Plop, Nx).
- Migration runner for `keel update` (scripts exist as a concept but are
  not yet executed).

[Unreleased]: https://github.com/rgoussu-dev/Keel/compare/v0.5.0-alpha...HEAD
[0.5.0-alpha]: https://github.com/rgoussu-dev/Keel/compare/v0.4.0-alpha...v0.5.0-alpha
[0.4.0-alpha]: https://github.com/rgoussu-dev/Keel/compare/v0.3.0-alpha...v0.4.0-alpha
[0.3.0-alpha]: https://github.com/rgoussu-dev/Keel/compare/v0.2.0-alpha...v0.3.0-alpha
[0.2.0-alpha]: https://github.com/rgoussu-dev/Keel/compare/v0.1.0-alpha.2...v0.2.0-alpha
[0.1.0-alpha.2]: https://github.com/rgoussu-dev/Keel/compare/v0.1.0-alpha.1...v0.1.0-alpha.2
[0.1.0-alpha.1]: https://github.com/rgoussu-dev/Keel/releases/tag/v0.1.0-alpha.1
