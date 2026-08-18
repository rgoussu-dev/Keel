/**
 * `persistence/database-compose` adapter — the crossover between
 * persistence and the dev environment: supplements the `dev-env`
 * vertical's `dev/compose.yaml` with the SQL database the service's
 * `%dev` profile targets, exactly as the compose base's header
 * promises (`a postgres: service here beats a hand-managed local
 * install`).
 *
 * Language- and framework-agnostic: it fires for every HTTP service
 * (`arch.server-http`) alongside the per-stack persistence adapter —
 * and it fires **first** (the per-stack and migrations adapters
 * declare `after` edges on it), which makes it the home of the
 * vertical's two project-wide sticky dials: the SQL `engine` and the
 * `migrations` tool. It asks both, validates them against the stack
 * before anything is written, and every later adapter reads them
 * through `sqlEngine()` / `migrationsTool()`.
 *
 * Dev-only by doctrine — the production database is provisioned by
 * IaC; these credentials never leave the laptop. The container gets
 * a healthcheck so the migration one-shot (see
 * `persistence/flyway-migrations` / `persistence/liquibase-migrations`)
 * can gate on the database being ready.
 *
 * No install-order coupling with `dev-env`: the patch carries the
 * shared base as its `seed`, so `keel add persistence` composes into
 * an existing `dev/compose.yaml` or creates it — each vertical
 * stands on its own.
 */

import {
  addComposeService,
  addComposeVolumes,
  devComposeSeed,
  DEV_COMPOSE_TARGET,
} from './dev-env-compose.js';
import { MIGRATIONS_TOOL_QUESTION, migrationsToolById } from './migrations-tool.js';
import {
  databaseName,
  PERSISTENCE_DIALS_ID,
  SQL_ENGINE_QUESTION,
  sqlEngineById,
  type SqlEngineSpec,
} from './persistence-engine.js';
import { eolAware } from '../util.js';
import type { Adapter } from '../../contract/composition.js';

export const DATABASE_COMPOSE_ID = PERSISTENCE_DIALS_ID;

const SERVICE_MARKER = '--- database (persistence vertical)';

/**
 * Builds the compose service block for the dev database. Exported so
 * the persistence vertical tests can assert against the same shape
 * the adapter patches in.
 */
export function databaseServiceBlock(database: string, engine: SqlEngineSpec): string {
  return `  # ${SERVICE_MARKER} ---------------------------------
  # The dev database the service's %dev profile targets. Dev-only
  # credentials; production gets a managed database provisioned by
  # IaC. The healthcheck gates the migrations one-shot below.
  db:
    image: ${engine.image}
    environment:
${engine.composeEnv(database)}
    ports:
      - "${engine.port}:${engine.port}"
    volumes:
      - db-data:${engine.dataDir}
    healthcheck:
      test: ${engine.healthcheckTest(database)}
      interval: 5s
      timeout: 3s
      retries: 20`;
}

export const databaseComposeAdapter: Adapter = {
  id: DATABASE_COMPOSE_ID,
  vertical: 'persistence',
  covers: ['database-compose'],
  predicate: { requires: ['arch.server-http'] },
  questions: [SQL_ENGINE_QUESTION, MIGRATIONS_TOOL_QUESTION],
  async contribute(ctx) {
    const engine = sqlEngineById(ctx.answer('engine'), DATABASE_COMPOSE_ID);
    const tool = migrationsToolById(ctx.answer('migrations'), DATABASE_COMPOSE_ID);
    // The dial guards live here, on the first adapter to run, so an
    // unsupported combination fails before a single file is written.
    const jvm = ctx.manifest.tags.includes('runtime.jvm');
    if (engine.id !== 'postgres' && !jvm) {
      throw new Error(
        `${DATABASE_COMPOSE_ID}: engine '${engine.id}' is served on the JVM stacks only — this stack's driver (pgx / the sync postgres crate / pg) speaks the PostgreSQL wire protocol. Pick 'postgres', or see docs/roadmap.md.`,
      );
    }
    if (tool === 'liquibase' && jvm) {
      throw new Error(
        `${DATABASE_COMPOSE_ID}: migrations tool 'liquibase' is served on the Go/Rust/TS stacks today — the JVM %dev/%test replay is wired through the framework's Flyway integration. Pick 'flyway', or see docs/roadmap.md.`,
      );
    }
    const seed = await devComposeSeed(ctx);
    const database = databaseName(ctx.manifest);
    return {
      patches: [
        {
          target: DEV_COMPOSE_TARGET,
          seed,
          apply: eolAware((existing) => {
            if (existing.includes(SERVICE_MARKER)) return existing;
            return addComposeVolumes(
              addComposeService(existing, databaseServiceBlock(database, engine)),
              ['db-data'],
            );
          }),
        },
      ],
    };
  },
};
