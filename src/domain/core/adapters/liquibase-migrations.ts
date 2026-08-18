/**
 * `persistence/liquibase-migrations` adapter — the schema as its own
 * deployment unit, on the Liquibase side of the sticky `migrations`
 * dial. The schema itself does not move: the same plain SQL the
 * Flyway shape ships (the shared `migrations-sql` tree) lands under
 * `migrations/sql/`, and a YAML changelog (`migrations/changelog.yaml`)
 * wraps each script in a changeset via `sqlFile` — no XML, no second
 * source of schema truth. The `Dockerfile` bakes both into the
 * official Liquibase image, configured purely through
 * `LIQUIBASE_COMMAND_*` env vars, and is deployed and run against
 * the database **before** the service — never from inside it — the
 * same doctrine as the Flyway shape.
 *
 * Also supplements the dev environment with the same one-shot
 * `migrations` service in `dev/compose.yaml`, gated on the database
 * healthcheck.
 *
 * Served on the stacks whose emitted dev/test replay is
 * tool-agnostic — Go, Rust and TS apply `migrations/sql/*.sql`
 * directly in their contract tests. The JVM stacks replay through
 * their framework's Flyway integration, so the dial refuses
 * `liquibase` there (the guard lives in `database-compose`); wiring
 * quarkus/spring/micronaut Liquibase replay is a roadmap item. When
 * the dial picks Flyway this adapter contributes nothing.
 */

import { DATABASE_COMPOSE_ID } from './database-compose.js';
import { addComposeService, devComposeSeed, DEV_COMPOSE_TARGET } from './dev-env-compose.js';
import { LIQUIBASE_TAG, migrationsTool } from './migrations-tool.js';
import { MIGRATIONS_SQL_TEMPLATE_ID } from './flyway-migrations.js';
import {
  databaseName,
  DEV_DB_PASSWORD,
  DEV_DB_USER,
  sqlEngine,
  type SqlEngineSpec,
} from './persistence-engine.js';
import { anyProjectName, eolAware } from '../util.js';
import type { Adapter } from '../../contract/composition.js';

export const LIQUIBASE_MIGRATIONS_ID = 'persistence/liquibase-migrations';

const TEMPLATE_ID = 'composition/persistence/liquibase-migrations/templates';

const SERVICE_MARKER = '--- migrations (persistence vertical)';

const README_MARKER = '\n### Database\n';

const readmeSection = (database: string, engine: SqlEngineSpec): string =>
  `${README_MARKER}
The dev environment (\`docker compose -f dev/compose.yaml up\`) starts
${engine.name} on \`localhost:${engine.port}\` (database \`${database}\`, dev-only
credentials \`app\`/\`app\`) and runs the migrations one-shot against it
— the same isolated Liquibase container that migrates staging and
production (see \`migrations/README.md\`; re-run it after adding a
script with \`docker compose -f dev/compose.yaml run --rm migrations\`).
The service never migrates in production. Data lives in the
\`db-data\` volume — \`docker compose -f dev/compose.yaml down -v\`
resets it.
`;

/**
 * Builds the compose service block of the migrations one-shot.
 * Exported so the persistence vertical tests can assert against the
 * same shape the adapter patches in.
 */
export function liquibaseServiceBlock(database: string, engine: SqlEngineSpec): string {
  return `  # ${SERVICE_MARKER} -------------------------------
  # The isolated migration runner: the same container that migrates
  # staging/production runs here against the dev database. One-shot —
  # it updates and exits; re-run it after adding a script with
  # \`docker compose -f dev/compose.yaml run --rm migrations\`.
  migrations:
    build: ../migrations
    environment:
      LIQUIBASE_COMMAND_URL: ${engine.jdbcUrl('db', database)}
      LIQUIBASE_COMMAND_USERNAME: ${DEV_DB_USER}
      LIQUIBASE_COMMAND_PASSWORD: ${DEV_DB_PASSWORD}
    depends_on:
      db:
        condition: service_healthy
    restart: "no"`;
}

export const liquibaseMigrationsAdapter: Adapter = {
  id: LIQUIBASE_MIGRATIONS_ID,
  vertical: 'persistence',
  covers: ['migrations'],
  predicate: { requires: ['arch.server-http'] },
  after: [DATABASE_COMPOSE_ID],
  async contribute(ctx) {
    if (migrationsTool(ctx.manifest) !== 'liquibase') return {};
    const engine = sqlEngine(ctx.manifest);
    const database = databaseName(ctx.manifest);
    const [files, sql] = await Promise.all([
      ctx.templates.render(TEMPLATE_ID, '', {
        projectName: anyProjectName(ctx.manifest),
        jdbcUrlExample: engine.jdbcUrl('<host>', '<database>'),
      }),
      ctx.templates.render(MIGRATIONS_SQL_TEMPLATE_ID, 'migrations', {
        sqlIdentityColumn: engine.sql.identityColumn,
        sqlTimestampType: engine.sql.timestampType,
      }),
    ]);
    const seed = await devComposeSeed(ctx);
    return {
      files: [...files, ...sql],
      patches: [
        {
          target: DEV_COMPOSE_TARGET,
          seed,
          apply: eolAware((existing) => {
            if (existing.includes(SERVICE_MARKER)) {
              if (existing.includes('FLYWAY_URL')) {
                throw new Error(
                  `${LIQUIBASE_MIGRATIONS_ID}: dev/compose.yaml already carries the Flyway migrations one-shot — remove that service (and migrations/) before switching the sticky 'migrations' answer to 'liquibase', or keep Flyway`,
                );
              }
              return existing;
            }
            return addComposeService(existing, liquibaseServiceBlock(database, engine));
          }),
        },
        {
          target: 'README.md',
          apply: eolAware((existing) => {
            if (existing.includes(README_MARKER)) return existing;
            return `${existing.trimEnd()}\n${readmeSection(database, engine)}`;
          }),
        },
      ],
      tagsAdd: [LIQUIBASE_TAG],
    };
  },
};
