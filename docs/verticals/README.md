# Verticals catalog

A **vertical** is one concern of a project's lifecycle — version
control, the runnable skeleton, observability, shipping — bundled as a
set of predicate-selected adapters. Verticals install at bootstrap
(listed by the [stack](../stacks/README.md)) or later:

```sh
keel add <vertical>...
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

| Vertical                                  | One-liner                                                                                                                     | Dimensions                                                                           |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [`vcs`](vcs.md)                           | git repo, default branch, optional `origin`; commit-msg gate + split changelog                                                | `vcs`, `commit-conventions`, `changelog`                                             |
| [`walking-skeleton`](walking-skeleton.md) | the thinnest runnable end-to-end project for the chosen stack                                                                 | `entrypoint`, `port-example`, `build-tool`                                           |
| [`agent-harness`](agent-harness.md)       | agent documents, skills and hooks; default-on, with opt-out and later adoption                                                | `agentic-baseline`, `agentic-kit`                                                    |
| [`code-style`](code-style.md)             | the layout contract + free-tier static checks: `.editorconfig`, the stack's own formatter, and a linter, from one style model | `editor-baseline`, `formatter`, `linter`                                             |
| [`dev-env`](dev-env.md)                   | `dev/compose.yaml` — local infra the dev loop needs but doesn't own                                                           | `compose-base`                                                                       |
| [`dev-container`](dev-container.md)       | `.devcontainer/` — a containerized dev environment that attaches to the dev env when present                                  | `definition`                                                                         |
| [`observability`](observability.md)       | health probes, correlation ids, OpenTelemetry, monitoring stack                                                               | `health`, `request-context`, `telemetry`, `monitoring-stack`                         |
| [`persistence`](persistence.md)           | SQL persistence: engine dial (PostgreSQL/MariaDB), Unit-of-Work port, isolated migrations (Flyway/Liquibase)                  | `datasource`, `unit-of-work`, `repository-example`, `migrations`, `database-compose` |
| [`gateway`](gateway.md)                   | the cross-service seam: gateway package, CORS, OpenAPI contract                                                               | _none_ — fires purely on peer tags                                                   |
| [`containerization`](containerization.md) | a thin Dockerfile beside the deployment unit                                                                                  | `image`                                                                              |
| [`ci`](ci.md)                             | the pipeline every push has to pass: GitHub Actions or GitLab CI                                                              | `pipeline`                                                                           |
| [`distribution`](distribution.md)         | how the project ships: CLI binaries or registry-pushed images + a deploy descriptor, on tag push                              | `build`, `release-channel`                                                           |
| [`iac`](iac.md)                           | where the project runs: the OpenTofu deploy target matching the recorded deployment flavor                                    | `deploy-target`                                                                      |
| [`toolchain`](toolchain.md)               | records the project's declared toolchain needs in the manifest's `toolchain` block (opt-in)                                   | `needs`                                                                              |
| [`fullstack`](fullstack.md)               | product-root glue for composite monorepos                                                                                     | `product-docs`, `product-compose`                                                    |

## Compatibility matrix

What `keel add <vertical>` does in a freshly scaffolded project of each
shape — every preset on its default dials, with no project linked to
it. The table is generated from the verdicts of the
[composition grid](../../tests/AGENTS.md#the-composition-grid), which
previews every one of those adds through keel itself, so it says what
keel does rather than what it was meant to; when a verdict moves, the
table is regenerated in the same change. On a single-service stack
`keel new --with <vertical>` reaches the same outcome, which the grid
holds too.

<!-- generated:compatibility-matrix:begin -->
<!-- Generated by tests/support/generated-docs.ts from the registry and the composition grid's goldens: edit the generator, not this region. Regenerate with KEEL_UPDATE_GOLDEN=1 pnpm exec vitest run tests/generated-docs.test.ts -->

● comes with it: `keel new` installs it, or, in a monorepo service, the product root gives it ·
➕ `keel add` installs it, with anything it needs first ·
⛔ refused: nothing keel has installs it there (`keel.uncoverable-vertical`) ·
↪ refused there: it belongs in another scope, a service or the repository's root (`keel.wrong-scope`)

| Vertical           | CLI                                                  | HTTP server | CLI + HTTP server | Browser SPA | Product root | Product `backend/`       | Product `frontend/`      |
| ------------------ | ---------------------------------------------------- | ----------- | ----------------- | ----------- | ------------ | ------------------------ | ------------------------ |
| `vcs`              | ●                                                    | ●           | ●                 | ●           | ●            | ●                        | ●                        |
| `walking-skeleton` | ●                                                    | ●           | ●                 | ●           | ↪            | ●                        | ●                        |
| `agent-harness`    | ●                                                    | ●           | ●                 | ●           | ↪            | ●                        | ●                        |
| `code-style`       | ●                                                    | ●           | ●                 | ●           | ↪            | ●                        | ●                        |
| `dev-env`          | ➕                                                   | ●           | ●                 | ➕          | ➕           | ●                        | ➕                       |
| `dev-container`    | ●                                                    | ●           | ●                 | ●           | ↪            | ●                        | ●                        |
| `observability`    | ⛔                                                   | ●           | ●                 | ⛔          | ↪            | ●                        | ⛔                       |
| `persistence`      | ⛔                                                   | ➕          | ➕                | ⛔          | ↪            | ➕                       | ⛔                       |
| `gateway`          | ⛔                                                   | ⛔          | ⛔                | ⛔          | ↪            | ●                        | ●                        |
| `containerization` | ⛔                                                   | ➕          | ➕                | ➕          | ↪            | ● monorepo · ➕ polyrepo | ● monorepo · ➕ polyrepo |
| `ci`               | ➕                                                   | ➕          | ➕                | ➕          | ⛔           | ↪ monorepo · ➕ polyrepo | ↪ monorepo · ➕ polyrepo |
| `distribution`     | ➕ `quarkus-cli`, `quarkus-cli-kotlin` · ⛔ the rest | ➕          | ➕                | ➕          | ⛔           | ↪ monorepo · ➕ polyrepo | ↪ monorepo · ➕ polyrepo |
| `iac`              | ⛔                                                   | ➕          | ➕                | ➕          | ↪            | ↪ monorepo · ➕ polyrepo | ↪ monorepo · ➕ polyrepo |
| `toolchain`        | ➕                                                   | ➕          | ➕                | ➕          | ↪            | ➕                       | ➕                       |

Who each column speaks for:

- **CLI** — `go-cli`, `micronaut-cli`, `micronaut-cli-kotlin`, `quarkus-cli`, `quarkus-cli-kotlin`, `rust-cli`, `spring-cli`, `spring-cli-kotlin`, `ts-cli`
- **HTTP server** — `go-http`, `micronaut-rest`, `micronaut-rest-kotlin`, `quarkus-rest`, `quarkus-rest-kotlin`, `rust-http`, `spring-rest`, `spring-rest-kotlin`, `ts-http`
- **CLI + HTTP server** — `go-cli-http`, `micronaut-cli-rest`, `micronaut-cli-rest-kotlin`, `quarkus-cli-rest`, `quarkus-cli-rest-kotlin`, `rust-cli-http`, `spring-cli-rest`, `spring-cli-rest-kotlin`, `ts-cli-http`
- **Browser SPA** — `web-components`
- **Product root** — `fullstack`, `fullstack-go`, `fullstack-micronaut`, `fullstack-rust`, `fullstack-spring`, `fullstack-ts`; under the monorepo layout
- **Product `backend/`** — `fullstack` (`quarkus-rest`), `fullstack-go` (`go-http`), `fullstack-micronaut` (`micronaut-rest`), `fullstack-rust` (`rust-http`), `fullstack-spring` (`spring-rest`), `fullstack-ts` (`ts-http`); under the monorepo and polyrepo layouts
- **Product `frontend/`** — `fullstack`, `fullstack-go`, `fullstack-micronaut`, `fullstack-rust`, `fullstack-spring`, `fullstack-ts`, each on `web-components`; under the monorepo and polyrepo layouts

<!-- generated:compatibility-matrix:end -->

Reading a cell:

- **Other dials can move it.** `distribution` on `quarkus-cli` and
  `quarkus-cli-kotlin` covers Gradle, their default; on Maven it is
  refused, as on every other CLI. CLI release adapters for the other
  families are the intended growth path.
- **`gateway` needs a peer.** It wires linked projects, so with none
  linked it is refused everywhere: on a CLI for the HTTP server it
  lacks, elsewhere pointing at `keel link`. Run `keel link <path>` in
  both projects, then `keel add gateway` on each side. It is not
  offered as an extra at `keel new`, and every service of a product
  has it from the start.
- **`distribution` and `iac` come after what they need.** On an HTTP
  server or an SPA, `distribution` is the container family: its
  release pipeline builds the `containerization` Dockerfile, and each
  container adapter declares so in its predicate, so it is offered as
  _needs Container image_ and, named without it, brings it along. A
  composed CLI + HTTP Quarkus stack on Gradle ships native binaries when
  `distribution` comes alone. `iac` keys on the `dist.container-image`
  tag the container family promotes, so it needs `containerization` and
  `distribution`, in that order; a CLI never carries it, and is refused
  for the HTTP server it lacks. See [`distribution`](distribution.md)
  and [`iac`](iac.md).
- **A monorepo product's services are directories of one
  repository.** The product root holds its version control, and its
  [`fullstack`](fullstack.md) glue builds each service's image
  (`compose.yaml` + a Dockerfile beside each) and declares so. That is
  why `vcs` and `containerization` come with such a service, and
  `keel add containerization` there adds nothing, saying so (a plugin
  backend the glue does not know keeps it to add). A pipeline and a release are
  read only at the repository root: `ci` and `distribution` declare
  that placement, so a monorepo service refuses them — and `iac`,
  which needs `distribution` — as belonging elsewhere, and the product
  root refuses them too, since keel has no adapter for a product root's
  own pipeline yet. Per-service pipelines, releases and IaC need the
  `polyrepo` layout, where each service is a repository of its own.
- **The product root takes what is the product's own.** It has `vcs`,
  and `dev-env` adds a root `dev/compose.yaml`. `keel add` refuses
  anything else there, and where a service can take it the refusal
  names that service; at `keel new`, a bare `--with` naming one goes to
  the one service that can take it
  (`keel new --stack=fullstack --with persistence` puts it in
  `backend/`). A polyrepo product's root is no keel project, so the
  column reads the monorepo layout alone.
- **`fullstack` has no row.** It is the glue a monorepo product's root
  installs, and no command names it.

Needing another vertical first is an order, not a separate run:
[`keel new --with`](../cli.md#keel-new) and
[`keel add`](../cli.md#keel-add) install a set in the order its
verticals depend on one another, so `--with containerization,distribution,iac`
is one run in any order of the three — and naming `iac` alone installs
the other two with it, first, saying so in the plan's first note.

## Prerequisites per vertical

Beyond the [stack's own prerequisites](../stacks/README.md#prerequisites-at-a-glance):

| Vertical           | Needs at install time                                                                            | Needs to use the result                                                                                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vcs`              | `git` on PATH                                                                                    | —                                                                                                                                                                                                                     |
| `walking-skeleton` | the stack's toolchain (see the [stack pages](../stacks/README.md))                               | —                                                                                                                                                                                                                     |
| `agent-harness`    | —                                                                                                | an agent that reads the emitted documents or workflow kit                                                                                                                                                             |
| `code-style`       | —                                                                                                | JVM/web: the formatter dependency resolves on first use (Spotless, Prettier; web also adds ESLint for the `linter` dimension). Go and Rust add nothing — both formatters, `go vet` and clippy ship with the toolchain |
| `dev-env`          | —                                                                                                | Docker + Compose to run `dev/compose.yaml`                                                                                                                                                                            |
| `dev-container`    | —                                                                                                | Docker + a Dev Container client (VS Code, the `devcontainer` CLI, or Codespaces)                                                                                                                                      |
| `observability`    | Go stacks: `go` on PATH (`go mod tidy`); TS stacks: `npm`/`pnpm` (install runs)                  | Docker + Compose for the monitoring stack; an OTLP endpoint via `OTEL_*` env vars                                                                                                                                     |
| `persistence`      | Go: `go` on PATH (`go mod tidy`); Rust: `cargo` (`cargo check`); TS: `npm`/`pnpm` (install runs) | Docker + Compose for the dev database and the generated tests (Testcontainers); `DB_URL` (+ `DB_USERNAME`/`DB_PASSWORD` on the JVM) env in prod                                                                       |
| `gateway`          | both projects linked (`keel link`)                                                               | —                                                                                                                                                                                                                     |
| `containerization` | —                                                                                                | Docker to build; the host build must produce the artifact first                                                                                                                                                       |
| `ci`               | —                                                                                                | a GitHub or GitLab repository per the chosen provider; TypeScript stacks: the lockfile committed                                                                                                                      |
| `distribution`     | server shapes: `containerization` installed first                                                | a GitHub or GitLab repository per the chosen provider; GraalVM/toolchains run in CI, not locally; Docker + Compose or Helm to run `deploy/`                                                                           |
| `iac`              | `distribution` installed first (the `dist.container-image` tag)                                  | OpenTofu ≥ 1.6 and an account + API key on the chosen cloud, credentials via environment only                                                                                                                         |
| `fullstack`        | orchestrated by composite stacks — not user-addable                                              | Docker + Compose for `docker compose up --build`                                                                                                                                                                      |
