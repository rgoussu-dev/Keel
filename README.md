# keel

keel bootstraps projects. One command scaffolds a runnable,
production-shaped walking skeleton — Java, Kotlin, Go, Rust, or
TypeScript; CLI, HTTP service, SPA, or a composed fullstack product —
carrying opinionated engineering conventions (hexagonal architecture,
trunk-based development, XP) and the Claude Code affordances to keep
it growing that way.

[![CI](https://github.com/rgoussu-dev/Keel/actions/workflows/ci.yml/badge.svg)](https://github.com/rgoussu-dev/Keel/actions/workflows/ci.yml)
[![Release](https://github.com/rgoussu-dev/Keel/actions/workflows/release.yml/badge.svg)](https://github.com/rgoussu-dev/Keel/actions/workflows/release.yml)

---

## Why keel

Day one sets a project's shape, and most day-ones are spent on
boilerplate that encodes no opinion at all. keel front-loads the
opinions: `npx @rgoussu.dev/keel new` gives you, in under a minute,
the project you would otherwise converge on months in — the
hexagonal trisection with the dependency rule laid out, a walking
skeleton that builds, tests, and runs end to end before your first
commit, a sample port with its canonical fake to pattern-match from,
git initialised, and the toolchain wired.

The bootstrap is composition, not a template dump. A stack preset
seeds capability tags; predicate-selected adapters compose the
project from them, asking only the questions they need to. That is
how one engine serves 24 stacks — the same conventions rendered as
idiomatic Java, Kotlin, Go, Rust, or TypeScript — and why a
fullstack product is just two services whose seam adapters found
each other. The conventions, not the framework, are the product.

The scaffold doubles as a Claude Code workflow kit. Claude Code is
much more useful when it shares your team's conventions, so every
generated project ships the binding spec as `AGENTS.md` (plus a
`CLAUDE.md` pointer) — the agentic affordances Claude needs to keep
working inside the shape the bootstrap laid down.

**keel is project-scoped only.** It writes into your project
directory and never reads, writes, or otherwise touches `~/.claude`
or any other global Claude Code configuration. Everything keel adds
lives in your repository, so the conventions travel with the code.

---

## Quickstart

Greenfield — bootstrap a Quarkus CLI project from scratch:

```sh
mkdir my-cli && cd my-cli
npx @rgoussu.dev/keel new --stack=quarkus-cli
```

Or a Quarkus REST service:

```sh
mkdir my-service && cd my-service
npx @rgoussu.dev/keel new --stack=quarkus-rest
```

You'll be asked for a base Java package, a project name, a build
system (Gradle by default, or Maven — `--build-system maven` pins it
non-interactively), and an optional `origin` git remote. The result
is a hexagonal multi-module project — `domain/kernel`,
`domain/contract`, `domain/core`, plus the channel modules for the
chosen stack:
`application/cli` (a Quarkus picocli entrypoint with a sample
subcommand) or `application/rest/contract` +
`application/rest/executable` (`GET /greet` with RFC 9457 Problem
Details errors) — with a Quarkus test driving it end to end, a
sample secondary port (`Clock`) with a fake module, the binding spec
emitted as `AGENTS.md` (plus a `CLAUDE.md` pointer), an initialised
git repo, and the build tool's wrapper (`gradlew` or `mvnw`).

The same two shapes exist for Spring Boot (`spring-cli`,
`spring-rest`) and Micronaut (`micronaut-cli`, `micronaut-rest`),
and every JVM stack has a Kotlin twin (`quarkus-rest-kotlin`,
`spring-cli-kotlin`, `micronaut-rest-kotlin`, …) that emits the
identical hexagonal layout as idiomatic Kotlin — with the same
Gradle-or-Maven choice. The domain
trisection is byte-for-byte the same across frameworks per language
— only the application layer and build wiring change, which is the
point: the conventions, not the framework, are the product.

Or a Go project — `go-cli` for a terminal binary, `go-http` for a
stdlib `net/http` service:

```sh
mkdir my-service && cd my-service
npx @rgoussu.dev/keel new --stack=go-http
```

You'll be asked for a Go module path, a project name, and an optional
`origin` git remote. The result follows the house Go hexagonal
reference: one module, one `cmd/` directory per deployment unit,
`internal/domain` as the contract face over a compiler-hidden core
(`internal/domain/internal/`), primary adapters under
`internal/app/`, a sample secondary port (`Clock`) with its canonical
fake under `internal/infra/`, and no mediator object — commands are
structs, driving ports are per-use-case interfaces wired explicitly
in `main`.

Or a Rust project — `rust-cli` for a dependency-free terminal binary,
`rust-http` for an axum service:

```sh
mkdir my-service && cd my-service
npx @rgoussu.dev/keel new --stack=rust-http
```

You'll be asked for a project name and an optional `origin` git
remote. The result follows the house Rust hexagonal reference: one
package, one `src/bin/` directory per deployment unit (its `main.rs`
the assembly point, its sibling modules the unit's primary adapter),
`src/domain.rs` as the contract face over a compiler-hidden core
(`src/domain/greet.rs`, a private module), a sample secondary port
(`Clock`) with its canonical fake under `src/infra/`, and no
mediator object — commands are structs, driving ports are
per-use-case traits wired explicitly in `main`.

Or a TypeScript backend — `ts-http` for a `node:http` service with
no build step (Node 22.18+ runs the TypeScript sources directly):

```sh
mkdir my-service && cd my-service
npx @rgoussu.dev/keel new --stack=ts-http
```

You'll be asked for an npm scope, a project name, a package manager
(npm by default, or pnpm — `--build-system pnpm` pins it
non-interactively), and an optional `origin` git remote. The result
is a TypeScript workspace in the binding-spec trisection —
`domain/kernel` (Command, Result, Handler, Mediator bases; depends
on nothing), `domain/contract`, `domain/core` (factories only via
its `exports` map) — plus an `application/rest` deployment unit
whose `main.ts` assembles the registry mediator behind a `node:http`
server (`GET /greet` with RFC 9457 Problem Details errors), the
sample `Clock` port with real + fake adapters in
`infrastructure/clock`, and per-package `tsc --noEmit` walls: the
domain packages compile with `"types": []`, so a domain import of
`node:*` is a compile error.

Or a framework-free web-components SPA — the browser and the DOM API
as the framework:

```sh
mkdir my-app && cd my-app
npx @rgoussu.dev/keel new --stack=web-components
```

You'll be asked for an npm scope, a project name, and a package
manager (npm or pnpm). The result is a TypeScript workspace in a
hexagonal layout — `domain/domain-api`
(ports, commands, read models; compiled without the DOM lib),
`domain/domain-core` (factories only, via its `exports` map), an
`application/web-app` Vite deployment unit whose `main.ts` wires
ports to custom elements over the WCCG Context protocol, a
`design-system/` package (atomic design on
[planks](https://github.com/rgoussu-dev/planks) layout primitives +
tokens; domain-blind by construction), and the sample `Clock` port
with real + fake adapters in `infrastructure/commons` — installed
and ready to `npm run dev`.

Or a fullstack product — a backend and the SPA composed
(`fullstack` pairs `quarkus-rest`, `fullstack-spring` pairs
`spring-rest`, `fullstack-micronaut` pairs `micronaut-rest`,
`fullstack-go` pairs `go-http`, `fullstack-rust` pairs `rust-http`,
`fullstack-ts` pairs `ts-http`;
all select the _same_ frontend gateway adapters, because the seam is
driven by peer tags, not by the backend's language or framework):

```sh
mkdir my-product && cd my-product
npx @rgoussu.dev/keel new --stack=fullstack
```

You'll be asked for the usual per-service answers plus a **repository
layout**: `monorepo` (one repository, `backend/` + `frontend/` side by
side, git initialised once at the root, a product README tying them
together) or `polyrepo` (a repository per service, no shared root).
Either way each service is a complete keel project with its own
manifest, and each records the other as a **peer** — the backend
projects `peer.api.rest`, the frontend `peer.ui.spa` — which is how
the cross-service elements get selected: the frontend gains an
`infrastructure/gateway-rest` package (fetch adapter + fake behind a
`GreetGateway` driven port, Vite dev proxy to `localhost:8080`), and
the backend gains the CORS config for the Vite dev origin. The wire
itself is pinned by an OpenAPI document the backend owns
(`contract/greet.openapi.yaml`), the greet slice runs end to end
across both hexagons, and monorepo products ship a `compose.yaml`
with a Dockerfile beside each deployment unit
(`docker compose up --build`).

Brownfield — layer an additional vertical onto an existing keel
project:

```sh
keel add distribution
keel add containerization
```

Or wire two existing keel projects together after the fact:

```sh
cd my-frontend && keel link ../my-backend
keel add gateway                              # frontend side of the seam
cd ../my-backend && keel add gateway          # backend side (CORS)
```

The `distribution` vertical adds GitHub Actions workflows that
cross-compile the CLI to native binaries via GraalVM and publish them
to a GitHub Release on tag push. The `containerization` vertical adds
a thin Dockerfile beside the deployment unit — no build stage, the
image copies the artifact the host build produced — with an opt-in
GraalVM native flavor on every JVM backend (Spring gets the Native
Build Tools wiring patched into its build files on opt-in).

---

## CLI

| Command                       | What it does                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `keel new --stack=<id>`       | Bootstrap a greenfield project from a stack preset. Today: `quarkus-cli`, `quarkus-rest`, `spring-cli`, `spring-rest`, `micronaut-cli`, `micronaut-rest` (each also as `…-kotlin`), `go-cli`, `go-http`, `rust-cli`, `rust-http`, `ts-http`, `web-components`, `fullstack`, `fullstack-spring`, `fullstack-micronaut`, `fullstack-go`, `fullstack-rust`, `fullstack-ts`. |
| `keel new ... --layout`       | Composite stacks only: `monorepo` (default) or `polyrepo`; prompted when interactive and omitted.                                                                                                                                                                                                                                                                        |
| `keel new ... --build-system` | Stacks offering a choice: `gradle` (default) or `maven` on the Java JVM stacks; prompted when interactive and omitted.                                                                                                                                                                                                                                                   |
| `keel new ... --yes`          | Non-interactive — use defaults for unanswered questions.                                                                                                                                                                                                                                                                                                                 |
| `keel new ... --dry-run`      | Print the plan without writing any file.                                                                                                                                                                                                                                                                                                                                 |
| `keel new ... --set k=v`      | Preset an answer as `adapterId:questionId=value` (repeatable).                                                                                                                                                                                                                                                                                                           |
| `keel add <vertical>`         | Install a vertical onto an existing keel project. Today: `vcs`, `walking-skeleton`, `distribution`, `gateway`, `containerization`, `dev-env`, `observability`.                                                                                                                                                                                                           |
| `keel link <path>`            | Record a sibling keel project as a peer (both ways) so peer-conditional adapters resolve here.                                                                                                                                                                                                                                                                           |
| `keel add ... --yes`          | Non-interactive.                                                                                                                                                                                                                                                                                                                                                         |
| `keel add ... --dry-run`      | Print the plan; write nothing.                                                                                                                                                                                                                                                                                                                                           |
| `keel add ... --set k=v`      | Preset an answer (same shape as `keel new`).                                                                                                                                                                                                                                                                                                                             |

All commands operate on the current working directory. There is no
`--global` flag and no path under `$HOME` is ever touched.

---

## Composition model

A keel project is composed from three primitives:

- **Tags.** Flat strings with hierarchical-dot naming —
  `lang.java`, `framework.quarkus`, `arch.cli`, `pkg.gradle`,
  `runtime.graalvm-native`, `arch.hexagonal`. Tags are facts about
  the project, captured in the manifest at install time and grown by
  adapters that promote new capabilities (via `tagsAdd`).
- **Adapters.** A single composable unit. Each adapter declares the
  tags it requires and excludes (its `predicate`), the dimensions of
  its parent vertical that it covers, any user choice points
  (`questions`), ordering hints (`after`), and a `contribute()`
  function that returns files, patches, deferred actions, agentic
  bundles, and tags to add.
- **Verticals.** Bundles of adapters under one umbrella
  (`vcs`, `walking-skeleton`, `distribution`). The resolver verifies
  that every entry in `vertical.dimensions` is covered by at least
  one matching adapter; if a dimension is uncovered after predicate
  filtering, install hard-fails with a clear message naming the gap.

A **stack preset** (`keel new --stack=<id>`) is sugar over a list of
tags + verticals — pick `quarkus-cli` and the engine seeds
`lang.java`, `runtime.jvm`, `framework.quarkus`, `pkg.gradle`,
`arch.cli`, `arch.hexagonal`, then composes the `vcs` and
`walking-skeleton` verticals; `quarkus-rest` swaps `arch.cli` for
`arch.server-http` and the same verticals compose the REST shape.
Adding a stack is a couple of lines in `src/domain/core/stacks.ts`.

Two more primitives compose services into **products**:

- **Peer tags.** A stack declares the tags it _projects_ onto sibling
  services (`peer.api.rest`, `peer.ui.spa`); each project's manifest
  records its siblings' projections as `peers`, and adapter
  resolution runs against tags ∪ peer tags. Cross-service elements
  are therefore ordinary predicate-selected adapters — the same
  gateway adapter fires for any backend projecting `peer.api.rest`,
  whatever its language.
- **Composite stacks.** A stack may declare `services` instead of
  scaffolding in place; each service is a full stack installed into
  its own directory with its siblings' projections in scope. The
  repository layout (monorepo/polyrepo) is the user's choice and is
  deliberately _not_ a tag: no adapter behaves differently by
  topology — what varies (where git runs, whether root glue exists)
  belongs to the orchestrator.

---

## Verticals shipped

- **`vcs`** — version control bootstrap. Initialises a git repo (with
  the requested default branch) and optionally registers an `origin`
  remote. Sticky answers, so subsequent runs don't re-ask.
- **`walking-skeleton`** — the thinnest end-to-end runnable project
  for the chosen stack, in a hexagonal layout with a sample secondary
  port + fake — the entrypoint shape is selected by predicate from
  the stack's tags. Today: a JVM picocli CLI or REST service
  (`GET /greet` with RFC 9457 Problem Details errors) on Gradle or
  Maven for Quarkus, Spring Boot, or Micronaut, each in Java or
  Kotlin — the framework, language, and build system are ordinary
  predicate dimensions, and the domain trisection is shared per
  language across all three frameworks (the wrapper is generated via
  the canonical `gradle wrapper` / `mvn -N wrapper:wrapper` task,
  not committed as a binary — the build tool must be on PATH); Go
  and Rust skeletons with CLI (`arch.cli`) and HTTP
  (`arch.server-http`) entrypoints that compose — a tag set carrying
  both ships both deployment units on one shared module/package; a
  no-build-step TypeScript `node:http` service (Node 22.18+ runs the
  sources directly); or a framework-free web-components SPA on Vite
  as an npm or pnpm workspace, with a planks-based atomic design
  system package (dependencies installed at scaffold time).
- **`gateway`** — the cross-service seam. Declares no dimensions; its
  adapters fire purely on peer tags, so without peers it installs
  nothing. Today: a REST gateway package for the web-components
  frontend (`peer.api.rest`), CORS accommodations for the Quarkus,
  Spring, Micronaut, Go, Rust, and TypeScript HTTP backends
  (`peer.ui.spa`), and
  the seam's OpenAPI contract emitted on the backend. Installed
  automatically for composite services; brownfield via `keel link` +
  `keel add gateway`.
- **`fullstack`** — product-root glue for composite monorepos: the
  product README (service map, run order), root housekeeping, and the
  container story (`compose.yaml` + a Dockerfile beside each
  deployment unit). Orchestrated by composite stacks, not
  user-addable.
- **`dev-env`** — the local development environment:
  `dev/compose.yaml`, one Compose file for everything the service
  needs on a laptop but does not own. The vertical seeds the empty
  base; supplementing verticals patch their services in (the
  observability vertical's monitoring stack today; a persistence
  vertical's database, a cache, a broker tomorrow), and ad-hoc local
  infra goes in the same file. Dev-only by design — production
  infrastructure belongs to IaC. No install-order coupling:
  contributors carry the shared base as a patch seed, so each
  vertical stands alone and whichever runs first creates the file.
  Listed on every REST/HTTP stack; brownfield via `keel add dev-env`
  at any point.
- **`observability`** — how you know the service is alive, ready,
  and what it is doing. Four dimensions: the first three covered per
  HTTP stack by one predicate-selected adapter, the fourth by the
  language-agnostic monitoring-compose adapter resolving alongside
  it: **health** (liveness + readiness probes,
  framework-native on the JVM — SmallRye Health, Actuator, Micronaut
  Management — hand-rolled `/health/live` + `/health/ready` on
  Go/Rust/TS, plus a template readiness check), **request-context**
  (one filter/middleware extracts-or-mints `X-Correlation-Id` — and
  the optional `X-Tenant-Id` — into a request-scoped context and the
  MDC/log context, echoes it on the response, and is the extension
  point for more propagated fields), and **telemetry**
  (OpenTelemetry traces + metrics over OTLP with an example span
  enrichment and an `app.http.requests` counter, configured via the
  standard `OTEL_*` env vars), and **monitoring-stack** (the
  receiving end as a worked example: supplements the `dev-env`
  vertical's `dev/compose.yaml` with a monitoring stack listening
  where the service exports — granular collector + Tempo +
  Prometheus + Loki + provisioned Grafana by default, the base a
  production setup grows from, or the all-in-one `grafana/otel-lgtm`
  dev container by sticky choice).
  Listed on every REST/HTTP stack after
  `walking-skeleton`; brownfield via `keel add observability`.
  HTTP-services only — `keel add observability` on a CLI project
  hard-fails with uncovered dimensions (no probe surface to cover).
- **`distribution`** — how the project ships. Today: native CLI
  binaries via GraalVM, cross-compiled in a GitHub Actions matrix
  (linux-amd64, linux-arm64, darwin-arm64) and uploaded to a GitHub
  Release on tag push. Promotes `runtime.graalvm-native` so future
  verticals can key off it. CLI-shaped only for now — `keel add
distribution` on a `quarkus-rest` project hard-fails with
  uncovered dimensions until the container-image sibling lands
  ([roadmap](./docs/roadmap.md) item E).
- **`containerization`** — how the project runs as a container
  image. A thin Dockerfile (plus `.dockerignore`) beside the
  deployment unit for every HTTP-shaped stack: no build stage, the
  image copies the artifact the host build already produced and
  documents the build command instead of running it. Quarkus fast-jar
  / Spring boot jar / Micronaut shadow jar onto a JRE base (artifact
  paths following the Gradle-or-Maven choice), Go and Rust binaries
  onto distroless bases, the `ts-http` sources onto `node:22-alpine`,
  the SPA bundle onto nginx with a history-API fallback. Every JVM
  backend offers a sticky JVM-vs-native flavor question, promoting
  `runtime.graalvm-native` on top of the `deploy.container-image` tag
  every image adapter adds: Quarkus and Micronaut builds already
  produce the GraalVM binary without build-file changes, and Spring
  gets the Native Build Tools wiring patched in (the Gradle plugin,
  or a `native` Maven profile mirroring the starter parent's).
  CLI-shaped projects hard-fail with the uncovered `image` dimension
  (a CLI ships through `distribution`).

---

## Principles

The four-line summary; the binding version is in
[`assets/project/AGENTS.md`](assets/project/AGENTS.md).

- Hexagonal always (domain / application / infrastructure / interface),
  three-module DAG: `domain/kernel ← domain/contract ← domain/core`.
- Command/Query + Mediator: sealed bases and Mediator interface in
  `domain/kernel`; concrete commands in `domain/contract`; Mediator
  implementation (`RegistryMediator`) and handlers in `domain/core`.
- Tests: Scenario + Factory + fakes (never mocks), DIP-strict.
- Walking skeleton first. IaC via OpenTofu.
- Trunk-based, Conventional Commits, XP, SOLID, 12-Factor.
- Always latest stable (langs: latest LTS; frameworks: latest stable).

---

## Development

For working on keel itself. Requirements: Node 22+ and pnpm 10+.

```sh
pnpm install
pnpm lint          # eslint (flat config, src + tests) + prettier --check . + depcruise src
pnpm typecheck     # tsc --noEmit
pnpm test          # vitest run
pnpm test:watch    # vitest watch mode
pnpm build         # compile to dist/ via tsconfig.build.json
pnpm format        # prettier --write .
```

Repository layout:

```
src/
  domain/
    kernel/               # Command/Query, Result, Handler, Mediator
    contract/             # commands, composition vocabulary,
                          # manifest schema, ports/
    core/                 # engine + composition adapters/verticals +
                          # handlers + RegistryMediator
  application/
    cli/                  # contract/ (commander → mediator) +
                          # executable/ (composition root)
  infrastructure/         # one directory per port: real adapter +
                          # canonical fake (tree, prompt, manifest,
                          # template, process, commons)
assets/
  composition/            # adapter template trees (ejs)
tests/                    # vitest (Scenario + Factory + fakes),
                          # mirrors src/; support/factory.ts
```

keel dogfoods its own binding spec: hexagonal trisection with the
dependency rule enforced by dependency-cruiser in `pnpm lint`.

Conventions for contributing to keel itself are in the root
[`AGENTS.md`](./AGENTS.md) (`CLAUDE.md` is a pointer to it).

---

## Release process

1. Bump `version` in `package.json` (SemVer prerelease identifier: `alpha`,
   `beta`, or `rc`; omit for a stable release).
2. Update `CHANGELOG.md` — move items from `[Unreleased]` under a new
   `[x.y.z] — YYYY-MM-DD` heading (Keep a Changelog 1.1.0).
3. Commit with a Conventional Commit (`chore(release): vX.Y.Z`).
4. Tag and push: `git tag vX.Y.Z && git push origin vX.Y.Z`.

The `Release` workflow then:

- verifies the tag matches `package.json`,
- reruns lint / typecheck / test / build,
- publishes to npm with `--provenance --access public` using an npm dist-tag
  derived from the prerelease identifier (`alpha` → `alpha`, `beta` → `beta`,
  `rc` → `next`, none → `latest`; any other identifier is a hard error),
- creates a GitHub Release with auto-generated notes (marked prerelease for
  non-`latest` dist-tags).

Required repository secret: `NPM_TOKEN` (npm automation token with publish
rights on `@rgoussu.dev/keel`).

---

## Acknowledgments

keel's TDD-first agent and skill methodology is being progressively informed
by [`citypaul/.dotfiles`](https://github.com/citypaul/.dotfiles) by Paul
Hammond, licensed under MIT. Each file derived from that work carries a
provenance header pointing back to the upstream commit it was lifted from;
the audit trail and the upstream license are kept under
[`THIRD_PARTY_LICENSES/`](./THIRD_PARTY_LICENSES/).

## License

MIT. See [`LICENSE`](./LICENSE). Third-party material under
[`THIRD_PARTY_LICENSES/`](./THIRD_PARTY_LICENSES/).
