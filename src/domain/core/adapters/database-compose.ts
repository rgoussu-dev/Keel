/**
 * `persistence/database-compose` adapter — the crossover between
 * persistence and the dev environment: supplements the `dev-env`
 * vertical's `dev/compose.yaml` with the SQL database the service's
 * `%dev` profile targets, exactly as the compose base's header
 * promises (`a postgres: service here beats a hand-managed local
 * install`).
 *
 * Language- and framework-agnostic: it fires for every HTTP service
 * (`arch.server-http`) alongside the per-stack persistence adapter.
 * Dev-only by doctrine — the production database is provisioned by
 * IaC; these credentials never leave the laptop. The container gets
 * a healthcheck so the migration one-shot (see
 * `persistence/flyway-migrations`) can gate on the database being
 * ready.
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
import { databaseName, DEV_DB_PASSWORD, DEV_DB_USER, sqlEngine } from './persistence-engine.js';
import { eolAware } from '../util.js';
import type { Adapter } from '../../contract/composition.js';

export const DATABASE_COMPOSE_ID = 'persistence/database-compose';

const SERVICE_MARKER = '--- database (persistence vertical)';

/**
 * Builds the compose service block for the dev database. Exported so
 * the persistence vertical tests can assert against the same shape
 * the adapter patches in.
 */
export function databaseServiceBlock(database: string): string {
  const engine = sqlEngine();
  return `  # ${SERVICE_MARKER} ---------------------------------
  # The dev database the service's %dev profile targets. Dev-only
  # credentials; production gets a managed database provisioned by
  # IaC. The healthcheck gates the migrations one-shot below.
  db:
    image: ${engine.image}
    environment:
      POSTGRES_USER: ${DEV_DB_USER}
      POSTGRES_PASSWORD: ${DEV_DB_PASSWORD}
      POSTGRES_DB: ${database}
    ports:
      - "${engine.port}:${engine.port}"
    volumes:
      - db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DEV_DB_USER} -d ${database}"]
      interval: 5s
      timeout: 3s
      retries: 20`;
}

export const databaseComposeAdapter: Adapter = {
  id: DATABASE_COMPOSE_ID,
  vertical: 'persistence',
  covers: ['database-compose'],
  predicate: { requires: ['arch.server-http'] },
  async contribute(ctx) {
    const seed = await devComposeSeed(ctx);
    const database = databaseName(ctx.manifest);
    return {
      patches: [
        {
          target: DEV_COMPOSE_TARGET,
          seed,
          apply: eolAware((existing) => {
            if (existing.includes(SERVICE_MARKER)) return existing;
            return addComposeVolumes(addComposeService(existing, databaseServiceBlock(database)), [
              'db-data',
            ]);
          }),
        },
      ],
    };
  },
};
