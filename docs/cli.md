# CLI reference

All commands operate on the **current working directory**. There is no
`--global` flag and no path under `$HOME` is ever touched — keel is
[project-scoped by design](../README.md).

```sh
npx @rgoussu.dev/keel <command>   # one-shot
```

The examples below use the short `keel <command>` form. Run them as
`npx @rgoussu.dev/keel <command>`, or install the binary once with
`npm install -g @rgoussu.dev/keel` to have `keel` on PATH.

## `keel new`

Bootstrap a greenfield project from a [stack preset](stacks/README.md).

```sh
keel new --stack=<id> [options]
```

| Option                 | Meaning                                                                                                                                                                                                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-s, --stack <id>`     | Stack preset id (see the [stack catalog](stacks/README.md)). Defaults to `quarkus-cli`.                                                                                                                                                                                                                                   |
| `--layout <layout>`    | Composite stacks only: `monorepo` (default) or `polyrepo`. Prompted when interactive and omitted.                                                                                                                                                                                                                         |
| `--build-system <id>`  | Stacks offering a choice: `gradle` (default) or `maven` on the JVM stacks, `npm` (default) or `pnpm` on the TypeScript stacks.                                                                                                                                                                                            |
| `--module-layout <id>` | JVM, Go, `ts-http` and `web-components` stacks: `basic` (default, the flat trisection) or `modulith` (one hexagon per bounded context). Prompted when interactive and omitted. Distinct from `--layout`, which is about repositories.                                                                                     |
| `--with-peer-context`  | Every stack offering `--module-layout=modulith` — the twelve JVM stacks, `go-cli`/`go-http`, `rust-cli`/`rust-http`, `ts-http` and `web-components`: also scaffold a second bounded context reaching the first only through its peer seam. Rejected, with the stack named, on a stack whose modulith has no peer context. |
| `-y, --yes`            | Non-interactive — use defaults for unanswered questions.                                                                                                                                                                                                                                                                  |
| `--dry-run`            | Print the plan without writing any file.                                                                                                                                                                                                                                                                                  |
| `--set <k=v>`          | Preset an answer as `adapterId:questionId=value` (repeatable).                                                                                                                                                                                                                                                            |

Examples:

```sh
keel new --stack=quarkus-rest                       # interactive
keel new --stack=spring-rest --build-system maven   # pin the build system
keel new --stack=fullstack --layout polyrepo        # one repo per service
keel new --stack=quarkus-rest --module-layout modulith  # modules/ + platform/ + application/
keel new --stack=go-http --yes                      # all defaults, no prompts
keel new --stack=rust-cli --dry-run                 # inspect the plan first
```

## `keel add`

Install a [vertical](verticals/README.md) onto an existing keel
project (one that carries a keel manifest — i.e. was scaffolded by
`keel new`).

```sh
keel add <vertical> [options]
```

Available verticals: `vcs`, `walking-skeleton`, `dev-env`,
`observability`, `persistence`, `gateway`, `containerization`, `ci`,
`distribution`. See
the [compatibility matrix](verticals/README.md#compatibility-matrix)
for which vertical applies to which stack — a vertical whose declared
dimensions cannot be covered on your project **hard-fails with a
message naming the gap** (e.g. `observability` on a CLI project).

| Option        | Meaning                                        |
| ------------- | ---------------------------------------------- |
| `-y, --yes`   | Non-interactive — defaults for every question. |
| `--dry-run`   | Print the plan; write nothing.                 |
| `--set <k=v>` | Preset an answer (same shape as `keel new`).   |

Adding an already-installed vertical errors with
`keel.vertical-already-installed`; a re-apply/update path is on the
[roadmap](roadmap.md).

## `keel add module`

Add a **named bounded context** to an existing modulith project.

```sh
keel add module <name> [--consumes <other>] [options]
```

A bounded context is not a vertical, which is why it has a command of
its own: `keel add persistence` names a capability the project either
has or lacks, while a context is a thing with a _name_, and
`keel add bounded-context` would have nowhere to put one.

What lands is a structural shell in the layout your stack already
uses — a contract face, a core with one handler, and a
`user-side/service` seam of its own:

```sh
keel add module ordering                     # a context that consumes nothing
keel add module ordering --consumes greeting # …and a gateway to greeting's seam
keel add module shipping --consumes ordering # contexts compose: any context with a seam
```

**The use case inside is a placeholder and says so.** keel knows the
context's name and nothing about its purpose, so it emits
`<Name>Command` / `<Name>Result` with a doc comment telling you that
renaming it is the first thing to do. What is not a placeholder is
everything around it: the driving port, the rejection this context
owns, the seam's own vocabulary, and the fact that no file in the new
context names another context except through that context's seam.

**`--consumes <other>` is opt-in, and its argument must publish a
seam.** Every context added this way does, from the start — that is
what makes `keel add module shipping --consumes ordering` work without
you building the seam by hand first. The one context that does not is
the one `keel new --with-peer-context` scaffolds: it is a pure
consumer, so it is a legal name and an impossible target, and keel
says so rather than emitting a gateway to nothing.

| Option           | Meaning                                                  |
| ---------------- | -------------------------------------------------------- |
| `--consumes <c>` | Also emit a driven port and a gateway over `<c>`'s seam. |
| `-y, --yes`      | Non-interactive — defaults for every question.           |
| `--dry-run`      | Print the plan; write nothing.                           |

The front door refuses, with a reason, when: the name is not a
lowercase word `[a-z][a-z0-9]*` or is a keyword in one of the target
languages; there is no keel project here; the project uses the flat
`basic` layout, which has no seam for a second context to meet the
first at; this is a composite product root rather than one service;
the name is already taken; `--consumes` names something that does not
exist, is the context being added, or publishes no seam; or the
project's stack has no bounded-context adapter, in which case the
command would otherwise scaffold nothing at all and report success.

Supported on every stack that ships a modulith: the twelve JVM stacks,
`go-cli`/`go-http`, `rust-cli`/`rust-http`, `ts-http` and
`web-components`.

## `keel link`

Record a sibling keel project as a **peer** (both ways), so
peer-conditional adapters — the [gateway seam](verticals/gateway.md) —
resolve on both sides.

```sh
cd my-frontend && keel link ../my-backend
keel add gateway                          # frontend half of the seam
cd ../my-backend && keel add gateway      # backend half (CORS + OpenAPI contract)
```

Each project's manifest records the other's projected tags
(`peer.api.rest`, `peer.ui.spa`); see
[peers in the composition model](composition.md#peer-tags-and-products).

## Answers, stickiness, and `--set`

Adapters ask only the questions they need (base package, project name,
git remote, …). Answers are recorded in the manifest — **sticky**
questions (e.g. the vcs answers, the JVM-vs-native image flavor) are
not re-asked on later runs. Any answer can be pre-seeded
non-interactively:

```sh
keel new --stack=quarkus-cli --yes \
  --set walking-skeleton/quarkus-cli-bootstrap:basePackage=com.acme.tool
```

The key format is `adapterId:questionId`; `--dry-run` prints the
questions a plan would ask.
