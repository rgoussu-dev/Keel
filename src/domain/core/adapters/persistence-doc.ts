/**
 * The `persistence` vertical's section of the per-directory docs:
 * what an agent needs beside the SQL adapter — the ports it
 * implements, where its Testcontainers test lives and what a run
 * without Docker has not proven, and how the schema moves. Composed
 * into the doc the family kit seeds for its driven adapters (on a
 * basic Rust crate, the port-level `tests/`), as its own section.
 */

import type { DocSection, Tag } from '../../contract/composition.js';
import { moduleLayoutOf } from './module-layout.js';

/** The section persistence owns in the docs it composes into. */
export const PERSISTENCE_DOC_SECTION = 'persistence';

type Family = 'jvm' | 'go' | 'rust' | 'ts';

function familyOf(tags: readonly Tag[]): Family {
  if (tags.includes('runtime.jvm')) return 'jvm';
  if (tags.includes('lang.go')) return 'go';
  if (tags.includes('lang.rust')) return 'rust';
  return 'ts';
}

/** Where each family's SQL adapter test lives, per module layout. */
const ADAPTER_TEST: Readonly<Record<Family, Record<'basic' | 'modulith', string>>> = {
  jvm: {
    basic: '`JdbcGreetingLogTest`, under the JDBC adapter module’s `src/test`',
    modulith: '`JdbcGreetingLogTest`, under the JDBC adapter module’s `src/test`',
  },
  go: {
    basic: '`internal/infra/postgres/postgres_test.go`',
    modulith: '`internal/modules/<ctx>/infra/postgres/postgres_test.go`',
  },
  rust: {
    basic: '`tests/greeting_log.rs`',
    modulith: '`modules/<ctx>/infra/postgres/tests/`',
  },
  ts: {
    basic: '`infrastructure/greeting-log/tests/pg-greeting-log.test.ts`',
    modulith: '`modules/<ctx>/tests/`',
  },
};

/** The doc each family's driven adapters are described in, per module layout. */
const ADAPTER_DOC: Readonly<Record<Family, Record<'basic' | 'modulith', string>>> = {
  jvm: { basic: 'infrastructure', modulith: 'modules' },
  go: { basic: 'internal/infra', modulith: 'internal/modules' },
  rust: { basic: 'tests', modulith: 'modules' },
  ts: { basic: 'infrastructure', modulith: 'modules' },
};

/** The persistence section for a project's tag set. */
export function persistenceDoc(tags: readonly Tag[]): DocSection {
  const family = familyOf(tags);
  const layout = moduleLayoutOf(tags) === 'modulith' ? 'modulith' : 'basic';
  return {
    directory: ADAPTER_DOC[family][layout],
    section: PERSISTENCE_DOC_SECTION,
    description: 'the SQL adapter, its Testcontainers test and the migrations',
    body: [
      '## Persistence',
      '',
      '- `GreetingLog` is the repository port and `UnitOfWork` the transaction boundary; the SQL adapter implements them, and the domain never sees SQL.',
      `- The SQL adapter’s test is ${ADAPTER_TEST[family][layout]}: it runs PostgreSQL through Testcontainers and needs Docker. A green run on a host without Docker has not proven the adapter — say so before claiming done.`,
      '- The schema moves only by a new `migrations/sql/V<n>__<name>.sql`; never edit a migration that has shipped.',
    ].join('\n'),
  };
}
