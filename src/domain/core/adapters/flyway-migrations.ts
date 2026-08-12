/**
 * `persistence/flyway-migrations` adapter — the schema as its own
 * deployment unit. Emits `migrations/`: plain-SQL Flyway scripts
 * (`sql/V1__create_greeting.sql` seeds the walking slice's table)
 * plus a `Dockerfile` that bakes them into the official Flyway
 * image, configured purely through `FLYWAY_*` env vars. The runner
 * is deployed and run against the database **before** the service —
 * never from inside it — so a bad migration blocks the rollout
 * instead of the fleet, and schema-altering credentials never ship
 * in the service image.
 *
 * Also supplements the dev environment: a one-shot `migrations`
 * service in `dev/compose.yaml` (built from `../migrations`, gated
 * on the database healthcheck) runs the very same container against
 * the dev database, exercising the production path on every
 * `docker compose up`. Language-agnostic — SQL and a container fire
 * for any HTTP stack; the per-stack persistence adapter decides how
 * dev/test profiles reuse the same scripts.
 */

import { DATABASE_COMPOSE_ID } from './database-compose.js';
import { addComposeService, devComposeSeed, DEV_COMPOSE_TARGET } from './dev-env-compose.js';
import { databaseName, DEV_DB_PASSWORD, DEV_DB_USER, sqlEngine } from './persistence-engine.js';
import { anyProjectName, eolAware } from '../util.js';
import type { Adapter } from '../../contract/composition.js';

export const FLYWAY_MIGRATIONS_ID = 'persistence/flyway-migrations';

const TEMPLATE_ID = 'composition/persistence/flyway-migrations/templates';

const SERVICE_MARKER = '--- migrations (persistence vertical)';

const README_MARKER = '\n### Database\n';

const readmeSection = (database: string): string =>
  `${README_MARKER}
The dev environment (\`docker compose -f dev/compose.yaml up\`) starts
PostgreSQL on \`localhost:5432\` (database \`${database}\`, dev-only
credentials \`app\`/\`app\`) and runs the migrations one-shot against it
— the same isolated Flyway container that migrates staging and
production (see \`migrations/README.md\`; re-run it after adding a
script with \`docker compose -f dev/compose.yaml run --rm migrations\`).
The service never migrates in production; the \`%dev\` and \`%test\`
profiles apply the same \`migrations/sql/\` at startup as a local-loop
convenience. Data lives in the \`db-data\` volume —
\`docker compose -f dev/compose.yaml down -v\` resets it.
`;

/**
 * Builds the compose service block of the migrations one-shot.
 * Exported so the persistence vertical tests can assert against the
 * same shape the adapter patches in.
 */
export function migrationsServiceBlock(database: string): string {
  const engine = sqlEngine();
  return `  # ${SERVICE_MARKER} -------------------------------
  # The isolated migration runner: the same container that migrates
  # staging/production runs here against the dev database. One-shot —
  # it migrates and exits; re-run it after adding a script with
  # \`docker compose -f dev/compose.yaml run --rm migrations\`.
  migrations:
    build: ../migrations
    environment:
      FLYWAY_URL: ${engine.jdbcUrl('db', database)}
      FLYWAY_USER: ${DEV_DB_USER}
      FLYWAY_PASSWORD: ${DEV_DB_PASSWORD}
    depends_on:
      db:
        condition: service_healthy
    restart: "no"`;
}

export const flywayMigrationsAdapter: Adapter = {
  id: FLYWAY_MIGRATIONS_ID,
  vertical: 'persistence',
  covers: ['migrations'],
  predicate: { requires: ['arch.server-http'] },
  after: [DATABASE_COMPOSE_ID],
  async contribute(ctx) {
    const database = databaseName(ctx.manifest);
    const files = await ctx.templates.render(TEMPLATE_ID, '', {
      projectName: anyProjectName(ctx.manifest),
    });
    const seed = await devComposeSeed(ctx);
    return {
      files,
      patches: [
        {
          target: DEV_COMPOSE_TARGET,
          seed,
          apply: eolAware((existing) => {
            if (existing.includes(SERVICE_MARKER)) return existing;
            return addComposeService(existing, migrationsServiceBlock(database));
          }),
        },
        {
          target: 'README.md',
          apply: eolAware((existing) => {
            if (existing.includes(README_MARKER)) return existing;
            return `${existing.trimEnd()}\n${readmeSection(database)}`;
          }),
        },
      ],
      tagsAdd: ['db.migrations.flyway'],
    };
  },
};
