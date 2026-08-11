# Rust stacks

| Stack       | Shape                            | Entry tags                       |
| ----------- | -------------------------------- | -------------------------------- |
| `rust-cli`  | Dependency-free terminal binary  | `lang.rust` + `arch.cli`         |
| `rust-http` | HTTP service on **axum + tokio** | `lang.rust` + `arch.server-http` |

The two entrypoints **compose**: a tag set carrying both ships both
deployment units on one shared package.

## How to

```sh
mkdir my-service && cd my-service
npx @rgoussu.dev/keel new --stack=rust-http    # or rust-cli
```

## Prerequisites

| Requirement     | Why                                                                       |
| --------------- | ------------------------------------------------------------------------- |
| `git` on PATH   | The [`vcs`](../verticals/vcs.md) vertical initialises the repository.     |
| `cargo` on PATH | keel runs `cargo check` after scaffolding to prove the skeleton compiles. |

## What you'll be asked

| Question        | Notes                                                          |
| --------------- | -------------------------------------------------------------- |
| Project name    | The package name.                                              |
| `origin` remote | Optional; registered by [`vcs`](../verticals/vcs.md) if given. |

## What gets generated

The house Rust hexagonal reference — module privacy enforces the
dependency rule:

```
my-service/
  src/
    bin/
      my-service/        # one directory per deployment unit; main.rs is
                         # the assembly point, sibling modules the unit's
                         # primary adapter
    domain.rs            # the contract face: commands (structs), driving
    domain/              # ports (per-use-case traits), read models
      greet.rs           # ^ the core — a private module, factories only
    infra/               # Clock port: real adapter + canonical fake
  Cargo.toml             # `cargo check` already run
  AGENTS.md              # the binding spec; CLAUDE.md is a pointer to it
```

**No mediator object** — per the binding spec's Rust stance, commands
are structs and driving ports are per-use-case traits wired explicitly
in `main`.

`rust-http` additionally installs [`dev-env`](../verticals/dev-env.md)
and [`observability`](../verticals/observability.md) by default
(hand-rolled `/health/live` + `/health/ready`, correlation-id
middleware, OpenTelemetry over OTLP).

## Verify it runs

```sh
cargo test
cargo run --bin my-service
```

## Add next

| Goal                 | Command                                     | Notes                                               |
| -------------------- | ------------------------------------------- | --------------------------------------------------- |
| Container image      | `keel add containerization`                 | `rust-http`: release binary onto a distroless base. |
| Pair with a frontend | `keel link ../frontend && keel add gateway` | CORS layer lands on the backend side of the seam.   |

## Related

- [Stack catalog](README.md) · [CLI reference](../cli.md) ·
  [Composition model](../composition.md)
- Fullstack twin: [`fullstack-rust`](fullstack.md)
