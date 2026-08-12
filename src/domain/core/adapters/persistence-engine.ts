/**
 * The SQL-engine dial of the `persistence` vertical. PostgreSQL is
 * the only engine today, so there is no question yet — every
 * persistence adapter reads the spec through {@link sqlEngine}, so a
 * second RDBMS lands as one more spec record plus a sticky question
 * on the dial, not a rewrite of the adapters.
 */

import { anyProjectName } from '../util.js';
import type { ManifestV2 } from '../../contract/composition.js';

/** Everything about one SQL engine the persistence adapters vary on. */
export interface SqlEngineSpec {
  readonly id: string;
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
   * sqlx) read as their dev default.
   */
  devUrl(host: string, database: string): string;
}

/** Dev-only database credentials every persistence contributor agrees on. */
export const DEV_DB_USER = 'app';

/** Dev-only database password (dev compose only — never production). */
export const DEV_DB_PASSWORD = 'app';

/** PostgreSQL — the persistence vertical's sane default. */
export const POSTGRES: SqlEngineSpec = {
  id: 'postgres',
  tag: 'db.postgres',
  image: 'postgres:18-alpine',
  port: 5432,
  jdbcUrl(host, database) {
    return `jdbc:postgresql://${host}:${this.port}/${database}`;
  },
  devUrl(host, database) {
    return `postgres://${DEV_DB_USER}:${DEV_DB_PASSWORD}@${host}:${this.port}/${database}`;
  },
};

/** Resolves the project's SQL engine (PostgreSQL until more land). */
export function sqlEngine(): SqlEngineSpec {
  return POSTGRES;
}

/**
 * The dev database name: the project name with `-` folded to `_` so
 * it needs no quoting in SQL or connection strings.
 */
export function databaseName(manifest: ManifestV2): string {
  return anyProjectName(manifest).replace(/-/g, '_');
}
