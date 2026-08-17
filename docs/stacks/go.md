# Go stacks

| Stack     | Shape                             | Entry tags                     |
| --------- | --------------------------------- | ------------------------------ |
| `go-cli`  | Terminal binary on the stdlib     | `lang.go` + `arch.cli`         |
| `go-http` | HTTP service on stdlib `net/http` | `lang.go` + `arch.server-http` |

The two entrypoints **compose**: a tag set carrying both ships both
deployment units on one shared module.

Both scaffold on either **module layout** — `basic` (the flat tree
below) or `modulith`. Your pick; `basic` is the default.

## How to

```sh
mkdir my-service && cd my-service
npx @rgoussu.dev/keel new --stack=go-http     # or go-cli
npx @rgoussu.dev/keel new --stack=go-http --module-layout modulith
```

## Prerequisites

| Requirement   | Why                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------- |
| `git` on PATH | The [`vcs`](../verticals/vcs.md) vertical initialises the repository.                       |
| `go` on PATH  | keel runs `go mod tidy` after scaffolding (and again when observability adds dependencies). |

## What you'll be asked

| Question        | Notes                                                          |
| --------------- | -------------------------------------------------------------- |
| Go module path  | e.g. `github.com/acme/my-service`.                             |
| Project name    | Naming inside the generated files.                             |
| `origin` remote | Optional; registered by [`vcs`](../verticals/vcs.md) if given. |

## What gets generated

The house Go hexagonal reference — the compiler enforces the
dependency rule instead of module boundaries:

```
my-service/
  cmd/
    my-service/          # one directory per deployment unit; main.go is
                         # the assembly point (explicit wiring, no DI)
  internal/
    domain/              # the contract face: commands (structs), driving
      internal/          # ports (per-use-case interfaces), read models
                         # ^ the core — compiler-hidden, factories only
    app/                 # primary adapters (CLI command / HTTP handler)
    infra/               # Clock port: real adapter + canonical fake
  go.mod                 # tidied at scaffold time
  AGENTS.md              # the binding spec; CLAUDE.md is a pointer to it
```

**No mediator object** — per the binding spec's Go stance, commands
are structs and driving ports are per-use-case interfaces wired
explicitly in `main`.

## Module layout

`--module-layout=modulith` carves the same skeleton one bounded
context at a time. Go pays no manifest files for a context, which
makes it the cheapest of the five stack families to turn on — but the
facade and the `modules/<ctx>/` level are indirection a single-context
service can reasonably decline, so `basic` stays the default.

```
my-service/
  cmd/
    http/ | cli/               # unchanged: one directory per deployment unit
  internal/
    platform/                  # what no bounded context owns
      clock/                   # the ubiquitous Clock port
      clockfake/               # and its canonical fake
      observability/           # probes, correlation ids, telemetry
    modules/
      greeting/                # one bounded context
        greeting.go            # THE FACADE — factories only
        internal/
          domain/              # commands, ports, factories
            internal/          # the compiler-hidden core
        userside/              # primary adapters (cli / resthttp)
          service/             # THE PEER SEAM — what a peer may import
        infra/                 # secondary adapters, one per technology
```

Three placements are load-bearing, and the Go compiler enforces each
of them rather than a linter:

- **The context's core hides behind its own `internal/`.** Anything
  under `modules/greeting/internal/` is importable from inside
  `modules/greeting/` and nowhere else. An import from `cmd/` fails
  with `use of internal package … not allowed`.
- **Adapters sit beside that wall, not behind it.** `userside/` and
  `infra/` are inside the context (so they may name its ports) but
  outside its `internal/` — put either behind the wall and the
  assembly cannot construct it.
- **The facade re-exports nothing.** There is deliberately no
  `type Greeter = domain.Greeter`: a consumer holds what the context
  returns but cannot _name_ it, so it cannot declare its own
  implementation of the context's ports either. `greeting.Greeter`
  from `cmd/` fails with `undefined`. The assembly loses nothing —
  `:=` infers the type it may not write.

### The peer seam, and what Go actually holds

A second context is a sibling directory under `internal/modules/`,
and it reaches this one through `userside/service`.

That seam is here for a different reason than the JVM's or Rust's.
There it _narrows_ what a peer may reach — build scope and the crate
graph make everything else unreachable. **Go has no such lever**:
`internal/` is scoped to the project root, so every package under it
may import every other, this context's facade included, and the seam
narrows nothing.

What Go enforces is _where the domain sits_. It is behind
`modules/greeting/internal/`, so a peer that imports it fails to
build with `use of internal package … not allowed` — greeting's
commands, its ports and its error values are unreachable from any
other context, as a compile error and not a review comment. A peer
can still reach the facade, and cannot name one thing it returns.

The tempting stronger claim is false, and keel does not make it:
**unnameability does not stop a peer calling through.** Go's
assignability is structural for unnamed types, so a foreign package
can write `greeting.NewGreeter().Greet(struct{ Name string }{…})` and
it compiles, with `greeting.Greeter` and `domain.GreetCommand` both
`undefined` there. What that buys is coupling nothing declares, to a
shape that breaks the first time greeting adds a field — an argument
for using the seam rather than a hole in it.

So `userside/service` is the package that declares the types a peer
may write down, and they are this context's own. What crosses is a
`service.Greeting` and a `service.Unavailable`, never a domain type
and never a domain error value. Its `New` takes the context's
assembled driving port, which is why only the assembly can call it: a
peer receives the built `GreetingService` and never constructs one.

Note that two contexts may declare the same package name —
`modules/ordering` and `modules/billing/gateway/ordering` are both
`package ordering`, and every context's seam is `package service` —
so a file importing both must alias one.

### A second context

`--with-peer-context` scaffolds `guestbook` beside `greeting`, with a
gateway package at `modules/guestbook/infra/greetinggateway` that
imports `greeting/userside/service` and nothing else of greeting's.
It is what makes the seam demonstrable rather than merely present —
with one context, nothing in the project consumes the seam, so
nothing proves it holds.

The gateway is a driven adapter, so the dependency points from
infrastructure inwards and never between two domains. Guestbook's own
`Welcome` port is declared in guestbook's vocabulary: the context asks
for a welcome and does not know that some other context composes
greetings. Only the gateway knows, and only the assembly wires it.

**The forbidden import does not compile**, which is the part worth
having. Add `modules/greeting/internal/domain` to that gateway and
`go build` fails with `use of internal package … not allowed`. On
that one point Go's wall is stronger than Rust's, where a domain type
can still _flow_ across the seam because inference supplies the name
the consumer cannot write — here there is nothing to flow, because
the package cannot be reached.

Binding differs too, and in Go's favour. Rust must patch
`mod guestbook;` into the assembly root and the JVM must tell its
container to scan the new package, since both can emit a context that
compiles and is wired into nothing. A Go file in a `cmd/` directory
joins that package by existing, so `cmd/<unit>/guestbook.go` is bound
the moment it lands — there is no declaration to forget. It ships
with `cmd/<unit>/guestbook_test.go`, which drives the cross-context
call for real, with no fakes anywhere.

The peer ships five packages to Rust's four crates. The extra one is
`userside/signing`, a driving adapter, and it is not padding: a `cmd/`
main cannot name `domain.SignCommand`, so the translation from the
assembly's primitives into the context's command has to happen inside
the context — exactly as `userside/cli` does it for greeting.

Requires `--module-layout=modulith`; the flat layout is a single
hexagon with no seam to cross, and keel says so rather than silently
scaffolding one context.

[`keel add persistence`](../verticals/persistence.md#module-layout)
follows the same rules: its ports join the context's `domain`, its
pgx adapters and fakes join `infra/`, the system clock joins
`platform/`, and the facade grows a second factory —
`NewGreetingLogUseCases` beside `NewGreeter` — because the assembly
may not import the context's domain to reach one.

`go-http` additionally installs [`dev-env`](../verticals/dev-env.md)
and [`observability`](../verticals/observability.md) by default
(hand-rolled `/health/live` + `/health/ready`, correlation-id
middleware, OpenTelemetry over OTLP).

**And a third, and a fourth.** `--with-peer-context` is a flag on
`keel new`, so it grows the project exactly once. Growing it
afterwards is [`keel add module <name>`](../cli.md#keel-add-module),
which emits a context of the same shape **plus a
`user-side/service` seam of its own** — the one thing the peer context
deliberately lacks, because nothing in the emitted project consumes
_it_. That seam is what lets contexts compose: `--consumes <other>`
accepts any context that publishes one, so the second command is
`keel add module shipping --consumes ordering`, reaching a context
that did not exist when keel was written.

The seam is spelled like `greeting`'s with the new context's name in
it, and the consumer reaches it through that context's own
`wire<Name>Service()` in the same `package main` — `greeting`'s facade
constructor takes no arguments, so its seam can be built inline, while
an added context's may hold a gateway to a third.

**The alias hazard is real at two contexts, not three.** Every context
spells its seam `package service`, so a file naming two of them has
two `service` identifiers and does not compile — and an added context
publishes a seam, so its own wiring file names two the moment
`--consumes` is given. keel aliases **every** seam import as
`<context>service` rather than only the one that collides: aliasing on
collision is a rule someone has to apply correctly each time, and it
reads better besides, since `greetingservice.Greeting` says whose
value crossed.

## Verify it runs

```sh
go test ./...
go run ./cmd/my-service
```

## Add next

| Goal                 | Command                                     | Notes                                                  |
| -------------------- | ------------------------------------------- | ------------------------------------------------------ |
| Container image      | `keel add containerization`                 | `go-http`: static binary onto a distroless base.       |
| CI pipeline          | `keel add ci`                               | Build-and-test on push; toolchain pinned by `go.mod`.  |
| Pair with a frontend | `keel link ../frontend && keel add gateway` | CORS middleware lands on the backend side of the seam. |

## Related

- [Stack catalog](README.md) · [CLI reference](../cli.md) ·
  [Composition model](../composition.md)
- Fullstack twin: [`fullstack-go`](fullstack.md)
