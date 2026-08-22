/**
 * The `persistence` vertical — answers "where does this service's
 * state live, and how does it change safely?" SQL-first, with two
 * project-wide sticky dials asked by `database-compose`: the SQL
 * `engine` (PostgreSQL default everywhere; MariaDB on the JVM
 * stacks, via the spec records in `persistence-engine.ts`) and the
 * `migrations` tool (Flyway default; Liquibase on Go/Rust/TS, via
 * `migrations-tool.ts`). Migrations are plain SQL under either tool,
 * and the transactional boundary is a domain concept.
 *
 * Five dimensions:
 *
 *   - `datasource` — driver + connection pool + runtime config:
 *     env-only in prod (12-factor), the compose database in `%dev`,
 *     a throwaway Testcontainers database in `%test`. Pool health
 *     feeds readiness and pool metrics + JDBC spans feed telemetry
 *     when the observability vertical is installed.
 *   - `unit-of-work` — transaction management as a **secondary port**
 *     in `domain/contract`, shaped as a Unit of Work: handlers
 *     demarcate "this work commits or rolls back together"; how
 *     (JTA, a framework transaction) is an adapter concern.
 *   - `repository-example` — the earned walking slice: a repository
 *     port (`GreetingLog`), its real adapter contract-tested against
 *     a real database (Testcontainers), its canonical fake, and the
 *     command/query pair driving it end to end from the REST channel.
 *   - `migrations` — the schema as its **own deployment unit**: a
 *     Flyway container holding plain SQL scripts, run against the
 *     database before the service deploys — never from inside the
 *     service. Dev and test profiles replay the same scripts at
 *     startup as a local-loop convenience.
 *   - `database-compose` — the dev database in the `dev-env`
 *     vertical's `dev/compose.yaml`, healthcheck-gated, with the
 *     migration one-shot wired against it. Order-independent: the
 *     patches are seeded with the shared base.
 *
 * The first three are covered per stack by one predicate-selected
 * adapter (Quarkus/Java today; Kotlin and the other stacks follow
 * the observability vertical's factory pattern); the last two by
 * language-agnostic adapters that resolve alongside it. On a stack
 * with no persistence adapter the install hard-fails naming the
 * uncovered dimensions — no half-installs.
 */

import { databaseComposeAdapter } from '../adapters/database-compose.js';
import { flywayMigrationsAdapter } from '../adapters/flyway-migrations.js';
import { liquibaseMigrationsAdapter } from '../adapters/liquibase-migrations.js';
import { goPersistenceAdapter } from '../adapters/go-persistence.js';
import {
  micronautPersistenceAdapter,
  micronautPersistenceKotlinAdapter,
} from '../adapters/micronaut-persistence.js';
import {
  quarkusPersistenceAdapter,
  quarkusPersistenceKotlinAdapter,
} from '../adapters/quarkus-persistence.js';
import { rustPersistenceAdapter } from '../adapters/rust-persistence.js';
import {
  springPersistenceAdapter,
  springPersistenceKotlinAdapter,
} from '../adapters/spring-persistence.js';
import { tsPersistenceAdapter } from '../adapters/ts-persistence.js';
import { FLYWAY_TAG, LIQUIBASE_TAG } from '../adapters/migrations-tool.js';
import { SQL_ENGINES } from '../adapters/persistence-engine.js';
import type { Vertical } from '../../contract/composition.js';

export const persistenceVertical: Vertical = {
  id: 'persistence',
  description:
    'SQL persistence: engine-dialed datasource (PostgreSQL default, MariaDB on the JVM), Unit-of-Work port, repository example, isolated migrations (Flyway or Liquibase), dev database.',
  dimensions: [
    'datasource',
    'unit-of-work',
    'repository-example',
    'migrations',
    'database-compose',
  ],
  promotes: [...SQL_ENGINES.map((engine) => engine.tag), FLYWAY_TAG, LIQUIBASE_TAG],
  adapters: [
    quarkusPersistenceAdapter,
    quarkusPersistenceKotlinAdapter,
    springPersistenceAdapter,
    springPersistenceKotlinAdapter,
    micronautPersistenceAdapter,
    micronautPersistenceKotlinAdapter,
    tsPersistenceAdapter,
    goPersistenceAdapter,
    rustPersistenceAdapter,
    flywayMigrationsAdapter,
    liquibaseMigrationsAdapter,
    databaseComposeAdapter,
  ],
};
