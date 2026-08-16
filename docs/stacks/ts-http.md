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
| Module layout   | `basic` (default) or `modulith`; pin with `--module-layout`.   |
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

Each package's `exports` map is the wall the compiler holds:
`domain/core` publishes its factories and nothing else, so a deep
import of a handler is a `TS2307` from `tsc` **and** an
`ERR_PACKAGE_PATH_NOT_EXPORTED` from Node.

The domain packages also set `"types": []`. That is worth stating
precisely, because it is easy to over-read: it suppresses the
automatic global `@types`, and an explicit
`import … from 'node:async_hooks'` still resolves and typechecks
clean. "The domain never imports the platform" is a rule `basic`
holds by review; the [`modulith` layout](#module-layout) holds it with
a `domain-knows-no-platform` lint.

[`dev-env`](../verticals/dev-env.md) and
[`observability`](../verticals/observability.md) are installed by
default (hand-rolled health endpoints, correlation-id middleware,
OpenTelemetry over OTLP).

## Module layout

`--module-layout=modulith` carves the same skeleton one bounded
context at a time — and here a context is **one workspace package**,
not one per layer:

```
my-service/
  platform/
    kernel/              # @scope/platform-kernel: the dispatch vocabulary +
                         # createRegistryMediator. Owned by no context
  modules/
    greeting/            # @scope/greeting: ONE package for the whole hexagon
      src/
        index.ts         # THE FACADE — what the assembly wires through
        service.ts       # THE PEER SEAM — what another context may call
        domain/
          contract/      # commands, ports, domain error codes
          core/internal/  # handlers; unreachable from outside the package
        infra/           # driven adapters (clock; more as verticals land)
      tests/
  application/
    rest/                # the deployment unit, unchanged
  .dependency-cruiser.cjs
```

**One package per context, deliberately.** In a TypeScript workspace
the package graph enforces nothing to begin with: an _undeclared_
workspace dependency still resolves (npm hoists every member into the
root `node_modules`), and TypeScript project references do not
restrict which projects a project may import — the same undeclared
import builds clean under `tsc -b --force`. Splitting a context into
four packages therefore buys four manifests and no wall.

What is enforced is the `exports` map, and one package per context
keeps all of it at 1 manifest instead of 3.5:

| Specifier                 | Reaches                                      |
| ------------------------- | -------------------------------------------- |
| `@scope/greeting`         | the facade — contract face + factories       |
| `@scope/greeting/service` | the peer seam — a peer context's only way in |

`@scope/greeting/src/domain/core/internal/…` is a `TS2307` from `tsc`
and an `ERR_PACKAGE_PATH_NOT_EXPORTED` from Node. Widening that map is
the single edit that undoes the layout.

**The map is coupled to the build mode.** `ts-http` has no build step,
so the map points at `./src/index.ts` and every import specifier ends
in `.ts`. An emitting build would need `./dist/index.js` plus a
`types` condition and `.js` specifiers — and mixing the two typechecks
before failing at runtime, so the two are decided together.

**The lint ships with the layout**, because two rules are outside what
resolution can see: a relative path that walks into another package's
tree, and an import that crosses layers inside one package (including
`node:*` from `src/domain/` — one package per context means one
`types` setting for the whole hexagon, so that wall moves from `tsc`
to the linter).

```sh
npm run lint      # depcruise platform modules application
```

The emitted `.dependency-cruiser.cjs` carries an
`enhancedResolveOptions` block, and it is load-bearing rather than
tuning: with default options dependency-cruiser resolves every
`@scope/*` import to a bare specifier, records no edge for it, and
reports **zero** violations over a tree that is in violation.

### A second context

`--with-peer-context` scaffolds `guestbook` beside `greeting` — one
sibling package under `modules/`, with a gateway at
`src/infra/greeting-gateway/` that imports `@scope/greeting/service`
and nothing else of greeting's. It is what makes the seam
demonstrable rather than merely present: with one context, nothing in
the workspace consumes the seam, so nothing proves it holds.

The gateway is a driven adapter, so the dependency points from
infrastructure inwards and never between two domains. Guestbook's
`Welcome` port is declared in guestbook's vocabulary — the context
asks for a welcome and does not know that another context composes
greetings.

**Be clear about which wall holds which rule**, because they are not
the same wall:

| rule                             | held by                   | how it fails                                                 |
| -------------------------------- | ------------------------- | ------------------------------------------------------------ |
| no deep import past the aperture | the `exports` map         | `TS2307` from tsc, `ERR_PACKAGE_PATH_NOT_EXPORTED` from Node |
| a peer reaches only `./service`  | `.dependency-cruiser.cjs` | `peers-meet-at-the-service-seam`, on `npm run lint`          |

Only the first is the compiler. The second cannot be: greeting's
facade legitimately publishes its contract face, so
`from '@scope/greeting'` inside the gateway typechecks perfectly and
lints red. An undeclared workspace dependency resolves anyway under
hoisting, and project references restrict nothing — so TypeScript's
peer seam is enforced at lint time, which is weaker than the JVM's
build scope and Go's `internal/`. It is stated here rather than
implied away, and it is why the rule ships in a config the build runs
rather than in a style guide.

The assembly binds the context in `application/rest/src/guestbook.ts`
— `createGuestbookHandler()`, which `main.ts` imports and puts in the
mediator's handler list. That import is load-bearing: an unimported
TypeScript module is never loaded, so the peer would typecheck, lint
and run in nothing without it. The emitted
`application/rest/tests/guestbook-wiring.test.ts` calls that same
function and drives the cross-context call for real, with no fakes.

When guestbook should become its own service, that seam is the only
thing to replace.

Requires `--module-layout=modulith`; the flat layout is a single
hexagon with no seam to cross, and keel says so rather than silently
scaffolding one context.

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
