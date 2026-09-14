/**
 * The `migrate` skill the `persistence` vertical ships — one shape
 * for both migration tools, so the Flyway and the Liquibase halves of
 * the sticky `migrations` dial cannot drift into two different
 * procedures.
 *
 * It exists because the doctrine here is counter-intuitive and
 * expensive to get wrong: the schema is **its own deployment unit**,
 * the service never migrates in production, and an applied migration
 * is never edited. `migrations/README.md` says all of that, and an
 * agent about to add a column does not read it — a description-
 * triggered skill is read exactly then.
 */

import type { SkillSpec } from '../../contract/composition.js';
import type { MigrationsTool } from './migrations-tool.js';

/** The skill's name — declared on the `persistence` vertical's `skills`. */
export const MIGRATE_SKILL_NAME = 'migrate';

/** The one-shot the dev compose file runs, per tool — the same container production uses. */
const RERUN = 'docker compose -f dev/compose.yaml run --rm migrations';

/** The `migrate` skill for the tool the sticky dial settled on. */
export function migrateSkill(tool: MigrationsTool): SkillSpec {
  const liquibase = tool === 'liquibase';
  return {
    name: MIGRATE_SKILL_NAME,
    description:
      'Change this project’s database schema by adding a migration and applying it. Use when asked to add a table, a column or an index, or to run migrations.',
    body: [
      '# Change the schema',
      '',
      'The schema is **its own deployment unit**. `migrations/` builds a',
      `self-contained ${liquibase ? 'Liquibase' : 'Flyway'} container that runs against the database`,
      'and exits, before the service is deployed. The service never migrates',
      'in production, and the credentials that can alter schema never ship',
      'inside its image.',
      '',
      '## Add one',
      '',
      '1. Write `migrations/sql/V<n>__<description>.sql`, taking the next',
      '   free `<n>`. Plain SQL, one concern per file. Look at the newest',
      '   file there for the dialect this project is on — the engine is a',
      '   recorded dial, not a given.',
      ...(liquibase
        ? [
            '2. Append a changeset to `migrations/changelog.yaml` wrapping the new',
            '   script with `sqlFile`. Liquibase applies the changelog, not the',
            '   directory: a script with no changeset is never run, and nothing',
            '   reports it.',
          ]
        : [
            '2. Nothing else to register — Flyway applies `sql/` in version order.',
            '   A duplicate `<n>` is what it refuses, so check the directory.',
          ]),
      `3. Apply it against the dev database: \`${RERUN}\`.`,
      '   That is the very same container that migrates staging and',
      '   production, so a script that fails here fails there.',
      '4. Run the project’s gate. The contract tests bring up a throwaway',
      '   database and apply the same `sql/`, so a green suite is the schema',
      '   and the adapter agreeing — but only on a host with Docker. On a',
      '   host without it those tests skip, and a green run has proven',
      '   nothing about this migration: say so rather than claiming done.',
      '',
      '## Never',
      '',
      '- **Never edit a migration that has been applied anywhere.**',
      `  ${liquibase ? 'Liquibase checksums each changeset' : 'Flyway checksums each script'}`,
      '  and refuses a database whose history no longer matches. Add the',
      '  next migration instead.',
      '- Never migrate from inside the service, and never add a startup',
      '  migration to production configuration. The `%dev` and `%test`',
      '  profiles replay `sql/` at startup as a local-loop convenience, and',
      '  that is the whole of it.',
      '- Never put a credential in a file here. Configuration is',
      '  environment-only.',
    ].join('\n'),
  };
}
