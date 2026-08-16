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

## Verify it runs

```sh
go test ./...
go run ./cmd/my-service
```

## Add next

| Goal                 | Command                                     | Notes                                                  |
| -------------------- | ------------------------------------------- | ------------------------------------------------------ |
| Container image      | `keel add containerization`                 | `go-http`: static binary onto a distroless base.       |
| Pair with a frontend | `keel link ../frontend && keel add gateway` | CORS middleware lands on the backend side of the seam. |

## Related

- [Stack catalog](README.md) · [CLI reference](../cli.md) ·
  [Composition model](../composition.md)
- Fullstack twin: [`fullstack-go`](fullstack.md)
