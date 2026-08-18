/**
 * The SQL-engine dial of the `persistence` vertical. Everything a
 * persistence adapter varies on per engine lives in one
 * {@link SqlEngineSpec} record — a second RDBMS is one more record
 * plus a value on the sticky `engine` question, never an adapter
 * family. The question is asked by `persistence/database-compose`
 * (the first adapter every install runs, see
 * {@link PERSISTENCE_DIALS_ID}); every other adapter reads the
 * resolved choice through {@link sqlEngine}.
 *
 * PostgreSQL is the sane default on every HTTP stack. MariaDB is the
 * second engine, on the JVM stacks: JDBC is what makes it a spec
 * record there. The Go/Rust/TS drivers (pgx, the sync `postgres`
 * crate, `pg`) speak the PostgreSQL wire protocol and nothing else,
 * so a non-postgres engine on those stacks fails loudly at install —
 * `database-compose` owns that guard.
 */

import { anyProjectName } from '../util.js';
import type { ManifestV2, Question } from '../../contract/composition.js';

/**
 * The adapter that asks the vertical's project-wide sticky dials
 * (`engine`, `migrations`). Declared here rather than in
 * `database-compose.ts` — which re-exports it as its id — so the
 * resolution helpers can read `manifest.answers` without a circular
 * import.
 */
export const PERSISTENCE_DIALS_ID = 'persistence/database-compose';

/** A Maven/Gradle artifact the engine dial swaps. */
export interface EngineArtifact {
  readonly groupId: string;
  readonly artifactId: string;
}

/** Everything about one SQL engine the persistence adapters vary on. */
export interface SqlEngineSpec {
  readonly id: string;
  /** Human name for emitted prose ("PostgreSQL", "MariaDB"). */
  readonly name: string;
  /** Capability tag recorded on install, e.g. `db.postgres`. */
  readonly tag: string;
  /** Container image of the dev database. */
  readonly image: string;
  /** Port the engine listens on (and the dev compose publishes). */
  readonly port: number;
  /** JDBC url for a host/database pair. */
  jdbcUrl(host: string, database: string): string;
  /**
   * Driver-native url for a host/database pair, carrying the dev
   * credentials — what the non-JVM datasources (pgx, node-postgres,
   * the `postgres` crate) read as their dev default.
   */
  devUrl(host: string, database: string): string;
  /** The dev container's environment lines (compose indentation). */
  composeEnv(database: string): string;
  /** The dev container's healthcheck `test:` value (YAML array). */
  healthcheckTest(database: string): string;
  /** Where the container keeps its data (the `db-data` mount point). */
  readonly dataDir: string;
  /** Quarkus `db-kind`, doubling as the `quarkus-jdbc-*` suffix. */
  readonly quarkusDbKind: string;
  /** The JDBC driver artifact, pinned where a BOM doesn't cover it. */
  readonly jdbcDriver: EngineArtifact & { readonly version: string; readonly driverClass: string };
  /** The Flyway database module for this engine. */
  readonly flywayModule: EngineArtifact;
  /** The `org.testcontainers` module artifactId + container class. */
  readonly testcontainers: { readonly artifactId: string; readonly containerClass: string };
  /** The driver's plain `DataSource` the emitted contract test wires. */
  readonly testDataSource: { readonly fqcn: string; readonly className: string };
  /** Class name of the emitted Micronaut Testcontainers fixture. */
  readonly testFixtureClass: string;
  /** Engine spellings inside the emitted schema and tests. */
  readonly sql: {
    readonly identityColumn: string;
    readonly timestampType: string;
    readonly truncateGreeting: string;
  };
}

/** Dev-only database credentials every persistence contributor agrees on. */
export const DEV_DB_USER = 'app';

/** Dev-only database password (dev compose only — never production). */
export const DEV_DB_PASSWORD = 'app';

/** PostgreSQL — the persistence vertical's sane default. */
export const POSTGRES: SqlEngineSpec = {
  id: 'postgres',
  name: 'PostgreSQL',
  tag: 'db.postgres',
  image: 'postgres:18-alpine',
  port: 5432,
  jdbcUrl(host, database) {
    return `jdbc:postgresql://${host}:${this.port}/${database}`;
  },
  devUrl(host, database) {
    return `postgres://${DEV_DB_USER}:${DEV_DB_PASSWORD}@${host}:${this.port}/${database}`;
  },
  composeEnv(database) {
    return `      POSTGRES_USER: ${DEV_DB_USER}
      POSTGRES_PASSWORD: ${DEV_DB_PASSWORD}
      POSTGRES_DB: ${database}`;
  },
  healthcheckTest(database) {
    return `["CMD-SHELL", "pg_isready -U ${DEV_DB_USER} -d ${database}"]`;
  },
  dataDir: '/var/lib/postgresql/data',
  quarkusDbKind: 'postgresql',
  jdbcDriver: {
    groupId: 'org.postgresql',
    artifactId: 'postgresql',
    version: '42.7.13',
    driverClass: 'org.postgresql.Driver',
  },
  flywayModule: { groupId: 'org.flywaydb', artifactId: 'flyway-database-postgresql' },
  testcontainers: { artifactId: 'postgresql', containerClass: 'PostgreSQLContainer' },
  testDataSource: { fqcn: 'org.postgresql.ds.PGSimpleDataSource', className: 'PGSimpleDataSource' },
  testFixtureClass: 'PostgresTestFixture',
  sql: {
    identityColumn: 'bigint generated always as identity primary key',
    timestampType: 'timestamptz',
    truncateGreeting: 'truncate table greeting restart identity',
  },
};

/**
 * MariaDB — the second engine, served on the JVM stacks. `datetime(6)`
 * rather than `timestamp`: MariaDB's `timestamp` carries implicit
 * DEFAULT/ON UPDATE semantics and a 2038 range, neither of which a
 * plain instant column wants. Truncate needs no `restart identity` —
 * MariaDB resets `auto_increment` on truncate by itself.
 */
export const MARIADB: SqlEngineSpec = {
  id: 'mariadb',
  name: 'MariaDB',
  tag: 'db.mariadb',
  image: 'mariadb:12',
  port: 3306,
  jdbcUrl(host, database) {
    return `jdbc:mariadb://${host}:${this.port}/${database}`;
  },
  devUrl(host, database) {
    return `mariadb://${DEV_DB_USER}:${DEV_DB_PASSWORD}@${host}:${this.port}/${database}`;
  },
  composeEnv(database) {
    return `      MARIADB_USER: ${DEV_DB_USER}
      MARIADB_PASSWORD: ${DEV_DB_PASSWORD}
      MARIADB_DATABASE: ${database}
      MARIADB_RANDOM_ROOT_PASSWORD: "yes"`;
  },
  healthcheckTest() {
    return '["CMD", "healthcheck.sh", "--connect", "--innodb_initialized"]';
  },
  dataDir: '/var/lib/mysql',
  quarkusDbKind: 'mariadb',
  jdbcDriver: {
    groupId: 'org.mariadb.jdbc',
    artifactId: 'mariadb-java-client',
    version: '3.5.10',
    driverClass: 'org.mariadb.jdbc.Driver',
  },
  flywayModule: { groupId: 'org.flywaydb', artifactId: 'flyway-mysql' },
  testcontainers: { artifactId: 'mariadb', containerClass: 'MariaDBContainer' },
  testDataSource: { fqcn: 'org.mariadb.jdbc.MariaDbDataSource', className: 'MariaDbDataSource' },
  testFixtureClass: 'MariaDbTestFixture',
  sql: {
    identityColumn: 'bigint auto_increment primary key',
    timestampType: 'datetime(6)',
    truncateGreeting: 'truncate table greeting',
  },
};

/** Every engine the dial offers, default first. */
export const SQL_ENGINES: readonly SqlEngineSpec[] = [POSTGRES, MARIADB];

/**
 * The sticky engine question, asked once per project by
 * `persistence/database-compose` and read everywhere else through
 * {@link sqlEngine}.
 */
export const SQL_ENGINE_QUESTION: Question = {
  id: 'engine',
  prompt: 'Which SQL engine?',
  doc: 'Sticky — the whole persistence slice (datasource, migrations, dev database, tests) follows it.',
  default: 'postgres',
  memory: 'sticky',
  choices: [
    {
      value: 'postgres',
      label: 'PostgreSQL — the sane default',
      doc: 'Served on every HTTP stack.',
    },
    {
      value: 'mariadb',
      label: 'MariaDB',
      doc: 'JVM stacks only today — the Go/Rust/TS drivers speak the PostgreSQL wire protocol.',
    },
  ],
};

/** Resolves an engine id to its spec, failing loudly on anything else. */
export function sqlEngineById(id: string, requesterId: string): SqlEngineSpec {
  const spec = SQL_ENGINES.find((e) => e.id === id);
  if (spec === undefined) {
    throw new Error(
      `${requesterId}: unsupported SQL engine '${id}'; supported: ${SQL_ENGINES.map((e) => e.id).join(', ')}`,
    );
  }
  return spec;
}

/**
 * Resolves the project's SQL engine: the sticky `engine` answer when
 * the dial has been asked, else the recorded `db.*` capability tag
 * (projects scaffolded before the dial), else PostgreSQL.
 */
export function sqlEngine(manifest: ManifestV2): SqlEngineSpec {
  const chosen = manifest.answers[PERSISTENCE_DIALS_ID]?.['engine'];
  if (chosen !== undefined) return sqlEngineById(chosen, PERSISTENCE_DIALS_ID);
  return SQL_ENGINES.find((e) => manifest.tags.includes(e.tag)) ?? POSTGRES;
}

/** The image's tag half, for template dialects that take only a tag. */
export function imageTagOf(engine: SqlEngineSpec): string {
  return engine.image.split(':')[1] ?? 'latest';
}

/**
 * The dev database name: the project name with `-` folded to `_` so
 * it needs no quoting in SQL or connection strings.
 */
export function databaseName(manifest: ManifestV2): string {
  return anyProjectName(manifest).replace(/-/g, '_');
}
