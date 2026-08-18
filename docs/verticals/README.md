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

There is one vertical `keel add` deliberately cannot name:
`bounded-context`. Every vertical here is a capability the project
either has or lacks, and a bounded context is a thing with a _name_ —
so it is reached through [`keel add module <name>`](../cli.md#keel-add-module)
instead, which has a name to give it.

## The verticals

| Vertical                                  | One-liner                                                                                        | Dimensions                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| [`vcs`](vcs.md)                           | git repo, default branch, optional `origin`                                                      | `vcs`                                                                                |
| [`walking-skeleton`](walking-skeleton.md) | the thinnest runnable end-to-end project for the chosen stack                                    | `entrypoint`, `port-example`, `build-tool`, `agentic-baseline`, `agentic-kit`        |
| [`dev-env`](dev-env.md)                   | `dev/compose.yaml` — local infra the dev loop needs but doesn't own                              | `compose-base`                                                                       |
| [`dev-container`](dev-container.md)       | `.devcontainer/` — a containerized dev environment that attaches to the dev env when present     | `definition`                                                                         |
| [`observability`](observability.md)       | health probes, correlation ids, OpenTelemetry, monitoring stack                                  | `health`, `request-context`, `telemetry`, `monitoring-stack`                         |
| [`persistence`](persistence.md)           | SQL persistence: PostgreSQL, Unit-of-Work port, isolated migrations                              | `datasource`, `unit-of-work`, `repository-example`, `migrations`, `database-compose` |
| [`gateway`](gateway.md)                   | the cross-service seam: gateway package, CORS, OpenAPI contract                                  | _none_ — fires purely on peer tags                                                   |
| [`containerization`](containerization.md) | a thin Dockerfile beside the deployment unit                                                     | `image`                                                                              |
| [`ci`](ci.md)                             | the pipeline every push has to pass: GitHub Actions or GitLab CI                                 | `pipeline`                                                                           |
| [`distribution`](distribution.md)         | how the project ships: CLI binaries or registry-pushed images + a deploy descriptor, on tag push | `build`, `release-channel`                                                           |
| [`iac`](iac.md)                           | where the project runs: the OpenTofu deploy target matching the recorded deployment flavor       | `deploy-target`                                                                      |
| [`fullstack`](fullstack.md)               | product-root glue for composite monorepos                                                        | `product-docs`, `product-compose`                                                    |

## Compatibility matrix

● installed by default · ➕ addable with `keel add` · ⛔ hard-fails
(uncovered dimensions) · — not applicable

| Vertical           | JVM CLI | JVM REST | Go/Rust/TS CLI | Go/Rust HTTP | `ts-http` | `web-components` | Fullstack product            |
| ------------------ | ------- | -------- | -------------- | ------------ | --------- | ---------------- | ---------------------------- |
| `vcs`              | ●       | ●        | ●              | ●            | ●         | ●                | ● (root or per repo)         |
| `walking-skeleton` | ●       | ●        | ●              | ●            | ●         | ●                | ● per service                |
| `dev-env`          | ➕      | ●        | ➕             | ●            | ●         | ➕               | ● backend                    |
| `dev-container`    | ●       | ●        | ●              | ●            | ●         | ●                | ● per service                |
| `observability`    | ⛔      | ●        | ⛔             | ●            | ●         | ⛔               | ● backend                    |
| `persistence`      | ⛔      | ➕       | ⛔             | ➕           | ➕        | ⛔               | ➕ backend                   |
| `gateway`          | —       | ➕ ¹     | —              | ➕ ¹         | ➕ ¹      | ➕ ¹             | ● both services              |
| `containerization` | ⛔      | ➕       | ⛔             | ➕           | ➕        | ➕               | (root compose is separate ²) |
| `ci`               | ➕      | ➕       | ➕             | ➕           | ➕        | ➕               | ➕ per service               |
| `distribution`     | ➕ ³    | ➕ ⁴     | ⛔ ³           | ➕ ⁴         | ➕ ⁴      | ➕ ⁴             | ➕ ⁴ per service             |
| `iac`              | ⛔ ⁵    | ➕ ⁵     | ⛔ ⁵           | ➕ ⁵         | ➕ ⁵      | ➕ ⁵             | ➕ ⁵ per service             |
| `fullstack`        | —       | —        | —              | —            | —         | —                | ● monorepo root only         |

¹ Needs a peer in scope first: `keel link <path>` on both projects,
then `keel add gateway` on each side. Without peers the vertical
installs nothing.
² Monorepo products get `compose.yaml` + Dockerfiles from the
[`fullstack`](fullstack.md) root glue; `containerization` is the
standalone-service story.
³ CLI distribution covers `quarkus-cli` on Gradle today; Go/Rust/TS
CLI siblings are the intended growth path.
⁴ The container family: requires `containerization` installed first —
the release pipeline builds that Dockerfile. See
[`distribution`](distribution.md).
⁵ Keyed on the `dist.container-image` tag the distribution container
family promotes — `keel add distribution` first. CLI shapes never
carry it, so they hard-fail. See [`iac`](iac.md).

## Prerequisites per vertical

Beyond the [stack's own prerequisites](../stacks/README.md#prerequisites-at-a-glance):

| Vertical           | Needs at install time                                                                            | Needs to use the result                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `vcs`              | `git` on PATH                                                                                    | —                                                                                                                                               |
| `walking-skeleton` | the stack's toolchain (see the [stack pages](../stacks/README.md))                               | —                                                                                                                                               |
| `dev-env`          | —                                                                                                | Docker + Compose to run `dev/compose.yaml`                                                                                                      |
| `dev-container`    | —                                                                                                | Docker + a Dev Container client (VS Code, the `devcontainer` CLI, or Codespaces)                                                                |
| `observability`    | Go stacks: `go` on PATH (`go mod tidy`); TS stacks: `npm`/`pnpm` (install runs)                  | Docker + Compose for the monitoring stack; an OTLP endpoint via `OTEL_*` env vars                                                               |
| `persistence`      | Go: `go` on PATH (`go mod tidy`); Rust: `cargo` (`cargo check`); TS: `npm`/`pnpm` (install runs) | Docker + Compose for the dev database and the generated tests (Testcontainers); `DB_URL` (+ `DB_USERNAME`/`DB_PASSWORD` on the JVM) env in prod |
| `gateway`          | both projects linked (`keel link`)                                                               | —                                                                                                                                               |
| `containerization` | —                                                                                                | Docker to build; the host build must produce the artifact first                                                                                 |
| `ci`               | —                                                                                                | a GitHub or GitLab repository per the chosen provider; TypeScript stacks: the lockfile committed                                                |
| `distribution`     | server shapes: `containerization` installed first                                                | a GitHub or GitLab repository per the chosen provider; GraalVM/toolchains run in CI, not locally; Docker + Compose or Helm to run `deploy/`     |
| `iac`              | `distribution` installed first (the `dist.container-image` tag)                                  | OpenTofu ≥ 1.6 and an account + API key on the chosen cloud, credentials via environment only                                                   |
| `fullstack`        | orchestrated by composite stacks — not user-addable                                              | Docker + Compose for `docker compose up --build`                                                                                                |
