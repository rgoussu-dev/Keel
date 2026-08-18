# keel documentation

Comprehensive documentation for `@rgoussu.dev/keel`. If you are new,
start with the [README quickstart](../README.md), then come back here
when you need depth.

## Getting started

- [README — quickstart & stack matrix](../README.md)
- [CLI reference](cli.md) — every command, flag, and non-interactive
  option.

## Stacks

What `keel new --stack=<id>` scaffolds, per family — each page lists
prerequisites, the questions asked, the generated tree, and what to add
next:

- [Stack catalog & matrix](stacks/README.md)
- [JVM — Quarkus, Spring Boot, Micronaut (Java & Kotlin)](stacks/jvm.md)
- [Go](stacks/go.md)
- [Rust](stacks/rust.md)
- [TypeScript backends (`ts-http`, `ts-cli`)](stacks/ts-http.md)
- [Web-components SPA](stacks/web-components.md)
- [Fullstack products](stacks/fullstack.md)

## Verticals

What `keel add <vertical>` layers onto an existing project:

- [Verticals catalog & compatibility matrix](verticals/README.md)
- [`vcs`](verticals/vcs.md) ·
  [`walking-skeleton`](verticals/walking-skeleton.md) ·
  [`dev-env`](verticals/dev-env.md) ·
  [`observability`](verticals/observability.md) ·
  [`gateway`](verticals/gateway.md) ·
  [`containerization`](verticals/containerization.md) ·
  [`ci`](verticals/ci.md) ·
  [`distribution`](verticals/distribution.md) ·
  [`iac`](verticals/iac.md) ·
  [`fullstack`](verticals/fullstack.md)

## Concepts

- [Composition model](composition.md) — tags, adapters, predicates,
  verticals, dimensions, stacks, peers, composite stacks, the manifest.
- [Binding spec](../assets/project/AGENTS.md) — the engineering
  conventions every scaffolded project carries as its `AGENTS.md`.
- [Roadmap](roadmap.md) — what's next.

## Contributing & maintaining

- [CONTRIBUTING](../CONTRIBUTING.md) — the fork-based contribution
  workflow.
- [Development guide](development.md) — dev loop, repository layout,
  testing approach.
- [Release process](release.md) — cutting and publishing a release.
- [Contributor guide for coding agents](../AGENTS.md) — conventions
  agents follow when working on keel itself.
