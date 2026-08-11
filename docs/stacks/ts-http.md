# `ts-http` — TypeScript HTTP service

A `node:http` service with **no build step**: Node 22.18+ runs the
TypeScript sources directly. The trisected layout is keel-shaped by
keel — the same `RegistryMediator` pattern the engine itself uses.

## How to

```sh
mkdir my-service && cd my-service
npx @rgoussu.dev/keel new --stack=ts-http
```

## Prerequisites

| Requirement             | Why                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| `git` on PATH           | The [`vcs`](../verticals/vcs.md) vertical initialises the repository.                          |
| Node **22.18+**         | The generated service runs its TypeScript sources directly — no transpile step.                |
| `npm` or `pnpm` on PATH | keel runs the workspace install at scaffold time (your choice; `--build-system pnpm` pins it). |

## What you'll be asked

| Question        | Notes                                                          |
| --------------- | -------------------------------------------------------------- |
| npm scope       | e.g. `@acme` — workspace package naming.                       |
| Project name    | Workspace + package naming.                                    |
| Package manager | `npm` (default) or `pnpm`; pin with `--build-system`.          |
| `origin` remote | Optional; registered by [`vcs`](../verticals/vcs.md) if given. |

## What gets generated

A TypeScript workspace in the binding-spec trisection:

```
my-service/
  domain/
    kernel/              # Command, Result, Handler, Mediator bases — depends on nothing
    contract/            # concrete commands, ports, read models
    core/                # handlers + RegistryMediator — factories only, via its exports map
  application/
    rest/                # deployment unit: main.ts assembles the mediator behind a
                         # node:http server — GET /greet, RFC 9457 Problem Details
  infrastructure/
    clock/               # Clock port: real adapter + canonical fake
  AGENTS.md              # the binding spec; CLAUDE.md is a pointer to it
```

The domain packages compile with `"types": []` and per-package
`tsc --noEmit` walls — **a domain import of `node:*` is a compile
error**, so the dependency rule is enforced by the compiler, not by
review.

[`dev-env`](../verticals/dev-env.md) and
[`observability`](../verticals/observability.md) are installed by
default (hand-rolled health endpoints, correlation-id middleware,
OpenTelemetry over OTLP).

## Verify it runs

```sh
npm test          # or pnpm test
npm start         # GET http://localhost:3000/greet
```

## Add next

| Goal                 | Command                                     | Notes                                                  |
| -------------------- | ------------------------------------------- | ------------------------------------------------------ |
| Container image      | `keel add containerization`                 | Sources onto `node:22-alpine` — still no build step.   |
| Pair with a frontend | `keel link ../frontend && keel add gateway` | CORS middleware lands on the backend side of the seam. |

## Related

- [Stack catalog](README.md) · [CLI reference](../cli.md) ·
  [Composition model](../composition.md)
- Fullstack twin: [`fullstack-ts`](fullstack.md)
- Frontend counterpart: [`web-components`](web-components.md)
