# `persistence` — where the state lives, and how it changes safely

SQL persistence for HTTP services: a PostgreSQL datasource, the
transactional boundary as a domain port (Unit of Work), a
repository example contract-tested against a real database, and
migrations as **their own deployment unit**. Brownfield only:

```sh
keel add persistence
```

**Quarkus REST (Java) today** — on any other stack the install
hard-fails with uncovered dimensions (the Kotlin twin and the
Spring/Micronaut/Go/Rust/TS siblings follow the observability
vertical's factory pattern). PostgreSQL is the sane default; the
engine dial (`src/domain/core/adapters/persistence-engine.ts`) is
where further RDBMS land as one spec record + a sticky question.

## The five dimensions

| Dimension            | What lands                                                                                                                                                                                                                                                                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `datasource`         | PostgreSQL JDBC driver + Agroal pool. Prod config is **environment-only** (`DB_URL`, `DB_USERNAME`, `DB_PASSWORD`); `%dev` targets the compose database; `%test` gets a throwaway PostgreSQL from Dev Services (Testcontainers). Pool health feeds readiness; pool metrics — and JDBC spans, when [`observability`](observability.md) is installed — feed telemetry. |
| `unit-of-work`       | The `UnitOfWork` **secondary port** in `domain/contract` — transaction management as a domain concept, shaped as a Unit of Work: handlers demarcate what commits or rolls back together; the JTA adapter (`infrastructure/unit-of-work/jta`) and the canonical fake carry the how.                                                                                   |
| `repository-example` | The earned persistence slice: the `GreetingLog` port, a plain-JDBC adapter contract-tested against a **Testcontainers PostgreSQL**, its in-memory fake, the `RecordGreetingCommand`/`ListGreetingsQuery` handlers (writes inside the unit of work), and `POST`/`GET /greetings` on the REST channel.                                                                 |
| `migrations`         | `migrations/` — the schema's own deployment unit: plain-SQL Flyway scripts (`V<n>__<desc>.sql`, no XML) baked into the official Flyway image, configured via `FLYWAY_*` env vars, run against the database **before the service deploys**, never from inside it.                                                                                                     |
| `database-compose`   | Supplements [`dev-env`](dev-env.md)'s `dev/compose.yaml` with the PostgreSQL container (healthcheck-gated, `db-data` volume) and the migrations one-shot running the very same runner image against it.                                                                                                                                                              |

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

- `JdbcGreetingLogTest` — the JDBC adapter's contract test against a
  real PostgreSQL via Testcontainers, schema applied from
  `migrations/sql/`; skipped automatically when Docker is absent.
- `GreetingLogResourceTest` — `@QuarkusTest` driving the slice end to
  end on a Dev Services PostgreSQL (Testcontainers under the hood).
- `GreetingLogHandlersTest` — domain handlers against the fakes
  (Scenario + Factory, no mocks), asserting the unit-of-work
  boundary.

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
