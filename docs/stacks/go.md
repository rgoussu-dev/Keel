# Go stacks

| Stack     | Shape                             | Entry tags                     |
| --------- | --------------------------------- | ------------------------------ |
| `go-cli`  | Terminal binary on the stdlib     | `lang.go` + `arch.cli`         |
| `go-http` | HTTP service on stdlib `net/http` | `lang.go` + `arch.server-http` |

The two entrypoints **compose**: a tag set carrying both ships both
deployment units on one shared module.

## How to

```sh
mkdir my-service && cd my-service
npx @rgoussu.dev/keel new --stack=go-http     # or go-cli
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
