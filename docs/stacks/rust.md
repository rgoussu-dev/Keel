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

Both stacks offer a **module layout** — `basic` (the flat single
crate below) or `modulith`. Your pick; `basic` is the default, and on
Rust it stays the right default longer than elsewhere.

```sh
npx @rgoussu.dev/keel new --stack=rust-http --module-layout modulith
npx @rgoussu.dev/keel new --stack=rust-http --module-layout modulith --with-peer-context
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

## Module layout

`--module-layout=modulith` carves the same skeleton one bounded
context at a time. Rust is the **most expensive** of the five stack
families to turn on and the one whose walls are strongest once paid
for: four crates per context minimum, each a `Cargo.toml` and a
workspace member line. A project that knows it has two contexts
should start here; a project that does not should not pay for it.

```
my-service/
  Cargo.toml                        # the workspace; every crate is a member
  platform/
    kernel/                         # what no context owns: BoxFuture,
                                    # block_on, the ubiquitous Clock + fake
  modules/
    greeting/                       # one bounded context
      domain/
        core/                       # pure functions; only contract depends on it
        contract/                   # commands, driving ports, factories
      user-side/
        service/                    # THE PEER SEAM — its own DTOs only
      infra/<tech>/                 # driven adapters, one crate each
  application/
    http/ | cli/                    # one assembly crate per deployment unit
```

**The binary keeps its name.** `my-service` and `my-service-http`
under either layout — the dial is a structural choice, not a reason
to rename your executable.

**Ports return `BoxFuture`, not `async fn`.** This is not style. An
`async fn` in a trait is not dyn-compatible, and every port here is
wired behind `Arc<dyn Port>` at an assembly point, so an `async fn`
port produces a skeleton that stops compiling the moment a second
adapter is wired. `platform-kernel` ships the alias, the `boxed!`
macro, and a `block_on` that lets the synchronous CLI assembly drive
an async port without a runtime.

### Why four crates

Three are obvious; the fourth is the point. `domain/core` and
`domain/contract` are the same wall a private `mod` builds under
`basic` — split here for rebuild blast radius, not for the wall.
`user-side/service` **must** be its own crate: a Cargo dependency
hands the consumer everything the crate exports, so folding the seam
into `domain/contract` gives every gateway a legal edge to the whole
domain.

### The peer seam is weaker in Rust than in the JVM or Go

This is the one place the layouts are not at parity across stack
families, and it is worth knowing before you choose.

The rule for a seam crate is that every type in its public API is
declared by that crate. What holds it:

|                                             | JVM                               | Go                           | **Rust**                         |
| ------------------------------------------- | --------------------------------- | ---------------------------- | -------------------------------- |
| Consumer can **name** a foreign domain type | no — build scope                  | no — unexported              | **no** — `E0432`, unlinked crate |
| Domain type can **flow** through the seam   | no — not on the compile classpath | no — unnameable, so unusable | **yes** — inference supplies it  |
| Enforcement available on stable             | yes                               | yes                          | **no**                           |

Verified on rustc 1.94.1: a gateway crate with no dependency on
`greeting-domain-contract` held a value that crate declares, returned
through the seam, and read its fields — no error, no warning. So in
Rust the rule is a **convention held by review**, not a compiler
guarantee. `cargo tree -p <consumer>` names the one crate a reviewer
has to look at, and the seam crate states the rule in its own module
doc at the point where it would be broken.

There is no stable-Rust lint for this. The check needs the crate's
public API surface, and every tool that computes one (`cargo
public-api`, `cargo-semver-checks`) reads nightly-only rustdoc JSON;
`cargo-deny` bans dependency edges and cannot see type flow at all.
The exact fix — `public = false` on the seam crate's domain
dependency plus `#![deny(exported_private_dependencies)]` — is
`-Z public-dependency`, rejected by stable. Enabling it would pin
every scaffolded project to nightly to enforce one rule on one crate,
so keel does not. The upgrade is two lines and no restructuring the
day it stabilises, and the seam crate's docs carry them ready to
uncomment.

### A second context

`--with-peer-context` scaffolds `guestbook` beside `greeting`, with a
gateway crate under `modules/guestbook/infra/greeting-gateway` that
depends on `greeting-user-side-service` and on nothing else of
greeting's. It is what makes the seam demonstrable rather than merely
present — with one context, nothing in the project consumes the seam,
so nothing proves it holds.

Requires `--module-layout=modulith`; the flat layout has no
`user-side/service` for a peer to reach through, and keel says so
rather than silently scaffolding one context.

### Verticals under the modulith

Every vertical Rust offers works under both layouts.
[`keel add persistence`](../verticals/persistence.md) is the one that
changes shape rather than just moving: its adapters become a crate of
their own, `modules/greeting/infra/postgres`, added to the workspace
members and depended on by the assembly. The ports join the context's
contract crate, the system clock joins `platform-kernel`, and the
`postgres` driver stays on the new crate's manifest and nowhere else —
so nothing that merely names the domain compiles against a database
driver. `containerization`, `gateway` and `observability` need no
restructuring under either layout.

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
