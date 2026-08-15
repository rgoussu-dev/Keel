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

| Option                 | Meaning                                                                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-s, --stack <id>`     | Stack preset id (see the [stack catalog](stacks/README.md)). Defaults to `quarkus-cli`.                                                                                                                             |
| `--layout <layout>`    | Composite stacks only: `monorepo` (default) or `polyrepo`. Prompted when interactive and omitted.                                                                                                                   |
| `--build-system <id>`  | Stacks offering a choice: `gradle` (default) or `maven` on the JVM stacks, `npm` (default) or `pnpm` on the TypeScript stacks.                                                                                      |
| `--module-layout <id>` | JVM, Go and `ts-http` stacks: `basic` (default, the flat trisection) or `modulith` (one hexagon per bounded context). Prompted when interactive and omitted. Distinct from `--layout`, which is about repositories. |
| `--with-peer-context`  | JVM stacks, under `--module-layout=modulith`: also scaffold a second bounded context reaching the first only through its `user-side/service` seam.                                                                  |
| `-y, --yes`            | Non-interactive — use defaults for unanswered questions.                                                                                                                                                            |
| `--dry-run`            | Print the plan without writing any file.                                                                                                                                                                            |
| `--set <k=v>`          | Preset an answer as `adapterId:questionId=value` (repeatable).                                                                                                                                                      |

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
`observability`, `persistence`, `gateway`, `containerization`,
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
