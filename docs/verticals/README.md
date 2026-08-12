# Verticals catalog

A **vertical** is one concern of a project's lifecycle — version
control, the runnable skeleton, observability, shipping — bundled as a
set of predicate-selected adapters. Verticals install at bootstrap
(listed by the [stack](../stacks/README.md)) or later:

```sh
keel add <vertical>
```

Each vertical declares **dimensions** its install must cover; if no
adapter matches your project's tags for a dimension, the install
**hard-fails naming the gap** instead of half-installing. See the
[composition model](../composition.md) for the machinery.

## The verticals

| Vertical                                  | One-liner                                                           | Dimensions                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [`vcs`](vcs.md)                           | git repo, default branch, optional `origin`                         | `vcs`                                                                                |
| [`walking-skeleton`](walking-skeleton.md) | the thinnest runnable end-to-end project for the chosen stack       | `entrypoint`, `port-example`, `build-tool`, `agentic-baseline`                       |
| [`dev-env`](dev-env.md)                   | `dev/compose.yaml` — local infra the dev loop needs but doesn't own | `compose-base`                                                                       |
| [`observability`](observability.md)       | health probes, correlation ids, OpenTelemetry, monitoring stack     | `health`, `request-context`, `telemetry`, `monitoring-stack`                         |
| [`persistence`](persistence.md)           | SQL persistence: PostgreSQL, Unit-of-Work port, isolated migrations | `datasource`, `unit-of-work`, `repository-example`, `migrations`, `database-compose` |
| [`gateway`](gateway.md)                   | the cross-service seam: gateway package, CORS, OpenAPI contract     | _none_ — fires purely on peer tags                                                   |
| [`containerization`](containerization.md) | a thin Dockerfile beside the deployment unit                        | `image`                                                                              |
| [`distribution`](distribution.md)         | how the project ships: release workflows on tag push                | `build`, `release-channel`                                                           |
| [`fullstack`](fullstack.md)               | product-root glue for composite monorepos                           | `product-docs`, `product-compose`                                                    |

## Compatibility matrix

● installed by default · ➕ addable with `keel add` · ⛔ hard-fails
(uncovered dimensions) · — not applicable

| Vertical           | JVM CLI | JVM REST | Go/Rust CLI | Go/Rust HTTP | `ts-http` | `web-components` | Fullstack product            |
| ------------------ | ------- | -------- | ----------- | ------------ | --------- | ---------------- | ---------------------------- |
| `vcs`              | ●       | ●        | ●           | ●            | ●         | ●                | ● (root or per repo)         |
| `walking-skeleton` | ●       | ●        | ●           | ●            | ●         | ●                | ● per service                |
| `dev-env`          | ➕      | ●        | ➕          | ●            | ●         | ➕               | ● backend                    |
| `observability`    | ⛔      | ●        | ⛔          | ●            | ●         | ⛔               | ● backend                    |
| `persistence`      | ⛔      | ➕ ⁴     | ⛔          | ⛔           | ⛔        | ⛔               | ➕ ⁴ backend                 |
| `gateway`          | —       | ➕ ¹     | —           | ➕ ¹         | ➕ ¹      | ➕ ¹             | ● both services              |
| `containerization` | ⛔      | ➕       | ⛔          | ➕           | ➕        | ➕               | (root compose is separate ²) |
| `distribution`     | ➕ ³    | ⛔       | ⛔          | ⛔           | ⛔        | ⛔               | ⛔                           |
| `fullstack`        | —       | —        | —           | —            | —         | —                | ● monorepo root only         |

¹ Needs a peer in scope first: `keel link <path>` on both projects,
then `keel add gateway` on each side. Without peers the vertical
installs nothing.
² Monorepo products get `compose.yaml` + Dockerfiles from the
[`fullstack`](fullstack.md) root glue; `containerization` is the
standalone-service story.
³ `quarkus-cli` on Gradle today; the REST/container sibling is
[roadmap item E](../roadmap.md#e--distribution-for-rest-container-image).
⁴ Quarkus REST in Java today (Gradle or Maven); the Kotlin twin and
the other stacks' siblings are on the
[roadmap backlog](../roadmap.md#backlog-unordered).

## Prerequisites per vertical

Beyond the [stack's own prerequisites](../stacks/README.md#prerequisites-at-a-glance):

| Vertical           | Needs at install time                                                           | Needs to use the result                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `vcs`              | `git` on PATH                                                                   | —                                                                                                                                |
| `walking-skeleton` | the stack's toolchain (see the [stack pages](../stacks/README.md))              | —                                                                                                                                |
| `dev-env`          | —                                                                               | Docker + Compose to run `dev/compose.yaml`                                                                                       |
| `observability`    | Go stacks: `go` on PATH (`go mod tidy`); TS stacks: `npm`/`pnpm` (install runs) | Docker + Compose for the monitoring stack; an OTLP endpoint via `OTEL_*` env vars                                                |
| `persistence`      | —                                                                               | Docker + Compose for the dev database and the generated tests (Testcontainers); `DB_URL`/`DB_USERNAME`/`DB_PASSWORD` env in prod |
| `gateway`          | both projects linked (`keel link`)                                              | —                                                                                                                                |
| `containerization` | —                                                                               | Docker to build; the host build must produce the artifact first                                                                  |
| `distribution`     | —                                                                               | a GitHub repository (Actions + Releases); GraalVM runs in CI, not locally                                                        |
| `fullstack`        | orchestrated by composite stacks — not user-addable                             | Docker + Compose for `docker compose up --build`                                                                                 |
