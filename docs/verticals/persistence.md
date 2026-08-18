# `persistence` — where the state lives, and how it changes safely

SQL persistence for HTTP services: a PostgreSQL datasource, the
transactional boundary as a domain port (Unit of Work), a
repository example contract-tested against a real database, and
migrations as **their own deployment unit**. Brownfield only:

```sh
keel add persistence
```

**Every HTTP stack** — Quarkus, Spring and Micronaut (Java and
Kotlin, Gradle or Maven), `go-http`, `rust-http` and `ts-http`, each
through one predicate-selected adapter; on a stack with no server
(CLIs, `web-components`) the install hard-fails with uncovered
dimensions.

## The two dials

The vertical carries two project-wide **sticky questions**, asked
once by `persistence/database-compose` (the first adapter every
install runs) and read by everything downstream:

| Dial         | Choices                           | Where each is served                                                                                                                                                                                                                                                                                |
| ------------ | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `engine`     | `postgres` (default) \| `mariadb` | PostgreSQL on every HTTP stack. MariaDB on the six JVM stacks — JDBC makes it one spec record in `persistence-engine.ts`. The Go/Rust/TS drivers (pgx, the sync `postgres` crate, `pg`) speak the PostgreSQL wire protocol, so a non-postgres engine there fails loudly before anything is written. |
| `migrations` | `flyway` (default) \| `liquibase` | Flyway on every HTTP stack. Liquibase (YAML changelog over the **same plain SQL**) on Go/Rust/TS, whose emitted replay paths are tool-agnostic; the JVM `%dev`/`%test` replay is Flyway-wired today, so `liquibase` there fails loudly — the framework integrations are a roadmap item.             |

Non-interactively, preset them with
`keel add persistence --set 'persistence/database-compose:engine=mariadb'`
(and/or `…:migrations=liquibase`). The whole slice follows the engine:
driver + pool config, the migration SQL's dialect, the dev-compose
container (image, env, healthcheck), the Testcontainers image and
container class in every emitted test, and the capability tag
(`db.postgres` / `db.mariadb`, `db.migrations.flyway` /
`db.migrations.liquibase`). A further RDBMS lands as one more spec
record on the dial, not an adapter family.

## The five dimensions

| Dimension            | What lands                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `datasource`         | The stack's idiomatic PostgreSQL access — Agroal (Quarkus), Hikari (Spring, Micronaut), pgx (Go), the sync `postgres` crate (Rust), `pg` (TS). Config is **environment-only** (`DB_URL`, and `DB_USERNAME`/`DB_PASSWORD` on the JVM); dev defaults target the compose database and tests get a throwaway Testcontainers PostgreSQL. On the JVM, pool health feeds readiness and pool metrics — plus JDBC spans on Quarkus — feed telemetry when [`observability`](observability.md) is installed. |
| `unit-of-work`       | The `UnitOfWork` **secondary port** on the domain's contract face — transaction management as a domain concept, shaped as a Unit of Work: handlers demarcate what commits or rolls back together; the _how_ is a per-stack adapter — JTA (Quarkus), `TransactionTemplate` (Spring), `TransactionOperations` (Micronaut), the transaction riding the `context.Context` (Go) / `AsyncLocalStorage` (TS), a shared-connection transaction (Rust) — each beside its canonical counting fake.          |
| `repository-example` | The earned persistence slice: the `GreetingLog` port, a SQL adapter contract-tested against a **Testcontainers PostgreSQL** (schema applied from the same `migrations/sql/` the runner ships; skips without Docker), its in-memory fake, the record/list operations demarcating writes with the unit of work, and `POST`/`GET /greetings` on the REST channel — mediator handlers on the JVM and TS, per-use-case driving ports on Go and Rust, per the binding spec's dispatch stances.          |
| `migrations`         | `migrations/` — the schema's own deployment unit: plain-SQL scripts (`V<n>__<desc>.sql`, no XML) baked into the official runner image of the dialed tool — Flyway configured via `FLYWAY_*` env vars, or Liquibase with a YAML changelog (`changelog.yaml`, wrapping the same SQL via `sqlFile`) configured via `LIQUIBASE_COMMAND_*` — run against the database **before the service deploys**, never from inside it.                                                                            |
| `database-compose`   | Supplements [`dev-env`](dev-env.md)'s `dev/compose.yaml` with the dialed engine's container (healthcheck-gated, `db-data` volume) and the migrations one-shot running the very same runner image against it. Also the home of the two sticky dials above.                                                                                                                                                                                                                                         |

## The migration doctrine

The service never migrates in production. The `migrations/` container
is deployed and run in isolation against the database (a rollout
gate), so a bad migration blocks the deploy instead of taking the
fleet down, and schema-altering credentials never ship in the service
image. Dev and test are the sanctioned exception: `%dev`/`%test`
apply the same `migrations/sql/` at startup for a tight local loop,
and `docker compose -f dev/compose.yaml up` exercises the real runner
against the dev database on every boot.

## Tests

Every stack ships three layers of tests:

- a **contract test of the SQL adapter against the dialed engine via
  Testcontainers** (the image and container class follow the sticky
  `engine` answer), schema applied from `migrations/sql/`; skipped
  automatically when Docker is absent (Go probes the daemon, Rust
  returns early, TS `describe.skipIf`, JVM
  `disabledWithoutDocker`).
- an **end-to-end REST test** where the framework boots one too —
  Quarkus Dev Services, Spring `@ServiceConnection`, a Micronaut
  `TestPropertyProvider` fixture (these require Docker).
- **domain tests against the fakes** (Scenario + Factory, no mocks),
  asserting the unit-of-work boundary: committed on success, rolled
  back — with nothing persisted — on rejection.

## Module layout

Persistence is a **bounded context's** concern, not the deployment
unit's, so on a
[`layout.modulith`](../stacks/jvm.md#module-layout) project the slice
follows the context rather than the assembly. On the JVM stacks:

| What                                                 | `basic`                     | `modulith`                                |
| ---------------------------------------------------- | --------------------------- | ----------------------------------------- |
| `GreetingLog` + `UnitOfWork` ports                   | `domain/contract`           | `modules/greeting/domain/contract`        |
| greeting-log handlers                                | `domain/core`               | `modules/greeting/domain/core`            |
| JDBC repository, unit-of-work adapter, the fakes     | `infrastructure/…`          | `modules/greeting/infra/…`                |
| `POST\|GET /greetings` resource                      | the executable              | `modules/greeting/user-side/api/adapters` |
| `RecordGreetingRequest` / `RecordedGreetingResponse` | `application/rest/contract` | `modules/greeting/user-side/api/contract` |
| datasource + migration config, boot test             | the executable              | the `application/api` assembly            |

Only the last row belongs to the assembly: the pool, the profile
config and the framework boot test are deployment concerns. Carving
the context out into its own service therefore takes its persistence
with it.

On Go the same rule reads in Go's spelling:

| What                                | `basic`                    | `modulith`                                           |
| ----------------------------------- | -------------------------- | ---------------------------------------------------- |
| `GreetingLog` + `UnitOfWork` ports  | `internal/domain`          | `internal/modules/greeting/internal/domain`          |
| greeting-log validation core        | `internal/domain/internal` | `internal/modules/greeting/internal/domain/internal` |
| pgx adapters, the fakes             | `internal/infra/…`         | `internal/modules/greeting/infra/…`                  |
| `POST\|GET /greetings` decorator    | `internal/app/resthttp`    | `internal/modules/greeting/userside/resthttp`        |
| the system clock                    | `internal/infra/clocksys`  | `internal/platform/clocksys`                         |
| `NewGreetingLogUseCases` for `cmd/` | the domain package itself  | a second factory on the context's facade             |

That last row is the one Go forces and the JVM does not. Under the
modulith the assembly cannot import the context's `domain` at all, so
the factory it calls has to live on the facade — where, like
`NewGreeter`, it hands back something `cmd/` can pass on but not name.

And on Rust, where the unit that moves is the **crate**:

| What                                             | `basic`                | `modulith`                                    |
| ------------------------------------------------ | ---------------------- | --------------------------------------------- |
| `GreetingLog` + `UnitOfWork` ports and use cases | `src/domain/`          | `modules/greeting/domain/contract`            |
| postgres adapters + the fakes                    | `src/infra/`           | `modules/greeting/infra/postgres`             |
| the system clock                                 | `src/infra/clock_sys`  | `platform/kernel`                             |
| `POST\|GET /greetings` router                    | `src/bin/http/`        | the `application/http` assembly               |
| DIP-strict use-case tests                        | the project's `tests/` | the contract crate's own `tests/`             |
| the `postgres` driver                            | the one `Cargo.toml`   | the infra crate's manifest, and no one else's |

The last row is what makes Rust's version a new crate rather than a
new directory. A Cargo dependency is inherited by every dependent, so
an adapter folded into `greeting-domain-contract` would put a database
driver on the compile graph of everything that names the domain.
`cargo tree -p greeting-domain-contract` is where you check it.

The system clock joins `platform-kernel` for the mirror-image reason:
it belongs to no context, and a `Clock` filed under `modules/greeting`
would make one context own everybody's time. That is where
`--module-layout=modulith` already puts the `Clock` port and its fake.

## Prerequisites

| Requirement                            | When                                                                                                            |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| none at install                        | keel only writes files and patches.                                                                             |
| Docker + Compose                       | To run the dev database + migrations one-shot, and for the generated test suite (Testcontainers, Dev Services). |
| `DB_URL`, `DB_USERNAME`, `DB_PASSWORD` | At service runtime in production — there are no baked-in defaults by design.                                    |

## Related

- [`dev-env`](dev-env.md) — the compose file this vertical
  supplements.
- [`observability`](observability.md) — datasource health joins the
  readiness probe; JDBC spans join the exported traces.
- [Verticals catalog](README.md) ·
  [Compatibility matrix](README.md#compatibility-matrix)
