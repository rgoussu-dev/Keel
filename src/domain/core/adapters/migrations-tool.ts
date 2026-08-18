/**
 * The migrations-tool dial of the `persistence` vertical — the second
 * sticky dial beside the SQL engine. Both tools consume the same
 * plain SQL under `migrations/sql/` (the shared
 * `composition/persistence/migrations-sql` tree), so the choice swaps
 * the schema's deployment unit — the runner image, its configuration
 * surface, and the changelog wrapper — never the schema itself.
 *
 * Flyway is the default on every HTTP stack. Liquibase (YAML
 * changelog over the same SQL) is served where nothing in-process
 * depends on the tool: the Go/Rust/TS stacks, whose emitted contract
 * tests replay `migrations/sql/*.sql` directly. The JVM stacks'
 * `%dev`/`%test` replay is wired through each framework's Flyway
 * integration today, so `liquibase` there fails loudly at install —
 * `database-compose` owns that guard; wiring the frameworks'
 * Liquibase integrations is a roadmap item.
 *
 * The question is asked by `persistence/database-compose` alongside
 * the engine question; the migrations adapters read the resolved
 * choice through {@link migrationsTool} and the one matching the dial
 * contributes while the other returns an empty contribution.
 */

import { PERSISTENCE_DIALS_ID } from './persistence-engine.js';
import type { ManifestV2, Question, Tag } from '../../contract/composition.js';

/** A migrations tool the dial offers. */
export type MigrationsTool = 'flyway' | 'liquibase';

/** Capability tag the Flyway migrations adapter records. */
export const FLYWAY_TAG: Tag = 'db.migrations.flyway';

/** Capability tag the Liquibase migrations adapter records. */
export const LIQUIBASE_TAG: Tag = 'db.migrations.liquibase';

/**
 * The sticky migrations-tool question, asked once per project by
 * `persistence/database-compose` and read everywhere else through
 * {@link migrationsTool}.
 */
export const MIGRATIONS_TOOL_QUESTION: Question = {
  id: 'migrations',
  prompt: 'Which migrations tool?',
  doc: 'Sticky — both run the same plain SQL from migrations/sql/ as an isolated runner container.',
  default: 'flyway',
  memory: 'sticky',
  choices: [
    {
      value: 'flyway',
      label: 'Flyway — plain SQL scripts, V<n>__<desc>.sql',
      doc: 'Served on every HTTP stack; the JVM dev/test replay rides it.',
    },
    {
      value: 'liquibase',
      label: 'Liquibase — a YAML changelog over the same plain SQL',
      doc: 'Go/Rust/TS today — the JVM dev/test replay is Flyway-wired; see the roadmap.',
    },
  ],
};

/** Validates a raw `migrations` answer, failing loudly on anything else. */
export function migrationsToolById(id: string, requesterId: string): MigrationsTool {
  if (id === 'flyway' || id === 'liquibase') return id;
  throw new Error(
    `${requesterId}: unsupported migrations tool '${id}'; supported: flyway, liquibase`,
  );
}

/**
 * Resolves the project's migrations tool: the sticky `migrations`
 * answer when the dial has been asked, else the recorded
 * `db.migrations.*` capability tag (projects scaffolded before the
 * dial), else Flyway.
 */
export function migrationsTool(manifest: ManifestV2): MigrationsTool {
  const chosen = manifest.answers[PERSISTENCE_DIALS_ID]?.['migrations'];
  if (chosen !== undefined) return migrationsToolById(chosen, PERSISTENCE_DIALS_ID);
  if (manifest.tags.includes(LIQUIBASE_TAG)) return 'liquibase';
  return 'flyway';
}
