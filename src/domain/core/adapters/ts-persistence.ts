/**
 * `persistence/ts-persistence` adapter — the service side of the SQL
 * persistence vertical for the `ts-http` skeleton:
 *
 *   - **datasource**: `pg` (node-postgres) with a pooled connection
 *     factory. Config is env-only 12-factor: `DB_URL` overrides the
 *     dev default (the compose database) in every deployed
 *     environment.
 *   - **unit-of-work**: the `UnitOfWork` port in `domain/contract`
 *     with a PostgreSQL adapter in the new
 *     `infrastructure/unit-of-work` workspace package — the open
 *     transaction's client rides `AsyncLocalStorage`, so repository
 *     statements made through `transactionalQueryable` join it
 *     without threading a client through the domain — plus the
 *     canonical fake.
 *   - **repository-example**: the `GreetingLog` port with a SQL
 *     adapter (`infrastructure/greeting-log`, driver-free — it
 *     queries through a structural SQL seam) contract-tested against
 *     a Testcontainers PostgreSQL (schema applied from the very
 *     `migrations/sql/` the isolated runner ships; skipped without
 *     Docker), its in-memory fake, the greeting-log handlers in
 *     `domain/core` (writes demarcated by the unit of work), and
 *     `POST|GET /greetings` on the `node:http` server.
 *
 * Patches the workspace where the bootstrap wrote it: the contract
 * and core barrel files re-export the new modules, `server.ts`
 * routes `/greetings`, `main.ts` wires the real adapters into the
 * mediator, and the touched `package.json` files gain their
 * workspace dependencies (JSON-merged, not string-spliced). A
 * deferred `npm|pnpm install` fetches the new packages. Every patch
 * is guarded so re-installing is a no-op.
 */

import { databaseName, sqlEngine } from './persistence-engine.js';
import { TS_HTTP_BOOTSTRAP_ID } from './ts-http-bootstrap.js';
import { tsWorkspaceVars } from './ts-workspace.js';
import { eolAware, eolOf, withEol } from '../util.js';
import type { Adapter, ContributionPatch } from '../../contract/composition.js';

export const TS_PERSISTENCE_ID = 'persistence/ts-persistence';

const TEMPLATE_ID = 'composition/persistence/ts-persistence/templates';

const CONTRACT_INDEX_TARGET = 'domain/contract/src/index.ts';
const CORE_INDEX_TARGET = 'domain/core/src/index.ts';
const CORE_PACKAGE_TARGET = 'domain/core/package.json';
const SERVER_TARGET = 'application/rest/src/server.ts';
const MAIN_TARGET = 'application/rest/src/main.ts';
const REST_PACKAGE_TARGET = 'application/rest/package.json';

const CONTRACT_EXPORTS = `export * from './greeting-log.ts';
export * from './unit-of-work.ts';`;

const CORE_EXPORTS = `export {
  createListGreetingsHandler,
  createRecordGreetingHandler,
} from './internal/greeting-log-handlers.ts';`;

const README_MARKER = '\n### Persistence\n';

const readmeSection = (): string =>
  `${README_MARKER}
The persistence slice: \`POST /greetings\` records a greeting durably
and \`GET /greetings?limit=…\` reads the log back, most recent first.
The domain owns two secondary ports — \`GreetingLog\` (the repository)
and \`UnitOfWork\` (the transactional boundary, a domain concept) —
with the real adapters (\`pg\` over the pool; the open transaction
rides AsyncLocalStorage so repository statements join it) in the
\`infrastructure/greeting-log\` and \`infrastructure/unit-of-work\`
workspace packages beside their canonical fakes. Schema lives in
\`migrations/\` — its own deployment unit, see the Database section.
Config is env-only: \`DB_URL\` (defaults to the compose database in
dev). The SQL adapter's contract test runs against a Testcontainers
PostgreSQL and skips without Docker.
`;

/**
 * Merges dependencies into a package.json (JSON parse/re-serialize,
 * not string splicing), leaving present entries untouched. Exported
 * for the vertical tests.
 */
export function addPackageDependencies(
  existing: string,
  section: 'dependencies' | 'devDependencies',
  additions: Readonly<Record<string, string>>,
): string {
  const pkg = JSON.parse(existing) as Record<string, unknown>;
  const deps = { ...((pkg[section] as Record<string, string> | undefined) ?? {}) };
  let changed = false;
  for (const [name, version] of Object.entries(additions)) {
    if (deps[name] === undefined) {
      deps[name] = version;
      changed = true;
    }
  }
  if (!changed) return existing;
  pkg[section] = Object.fromEntries(Object.entries(deps).sort(([a], [b]) => a.localeCompare(b)));
  return `${JSON.stringify(pkg, null, 2)}\n`;
}

const SERVER_ROUTE_GUARD = "url.pathname === '/greetings'";
const SERVER_IMPORT_ANCHOR =
  "import { greetCommand, GREET_REJECTED } from '@%SCOPE%/domain-contract';";
const SERVER_ROUTE_ANCHOR = `    if (request.method !== 'GET' || url.pathname !== '/greet') {`;

/**
 * Routes `/greetings` on the hand-rolled `node:http` server before
 * the walking skeleton's greet route. Exported for the vertical
 * tests; throws when the anchors drifted.
 */
export function patchServerTs(npmScope: string): (existing: string) => string {
  const importAnchor = SERVER_IMPORT_ANCHOR.replace('%SCOPE%', npmScope);
  return eolAware((existing) => {
    if (existing.includes(SERVER_ROUTE_GUARD)) return existing;
    if (!existing.includes(importAnchor) || !existing.includes(SERVER_ROUTE_ANCHOR)) {
      throw new Error(
        `${TS_PERSISTENCE_ID}: server.ts has drifted from the walking-skeleton shape — route '/greetings' to handleGreetings (from './greetings.ts') manually`,
      );
    }
    return existing
      .replace(importAnchor, `${importAnchor}\nimport { handleGreetings } from './greetings.ts';`)
      .replace(
        SERVER_ROUTE_ANCHOR,
        `    if (url.pathname === '/greetings') {
      handleGreetings(mediator, request, response, url);
      return;
    }
${SERVER_ROUTE_ANCHOR}`,
      );
  });
}

const MAIN_WIRING_GUARD = 'createRecordGreetingHandler';

/**
 * Wires the real persistence adapters into the assembly point: the
 * pool, the SQL greeting log, the unit of work, and the two new
 * handlers on the mediator. Exported for the vertical tests; throws
 * when the anchors drifted.
 */
export function patchMainTs(npmScope: string): (existing: string) => string {
  const importAnchor = `import { createGreetHandler, createRegistryMediator } from '@${npmScope}/domain-core';`;
  const importReplacement = `import {
  createGreetHandler,
  createListGreetingsHandler,
  createRecordGreetingHandler,
  createRegistryMediator,
} from '@${npmScope}/domain-core';
import { systemClock } from '@${npmScope}/infrastructure-clock';
import { createPgGreetingLog } from '@${npmScope}/infrastructure-greeting-log';
import {
  createPgPool,
  createPgUnitOfWork,
  transactionalQueryable,
} from '@${npmScope}/infrastructure-unit-of-work';`;
  const mediatorAnchor = 'const mediator = createRegistryMediator([createGreetHandler()]);';
  const mediatorReplacement = `const pool = createPgPool();
const greetingLog = createPgGreetingLog(transactionalQueryable(pool));
const mediator = createRegistryMediator([
  createGreetHandler(),
  createRecordGreetingHandler(greetingLog, systemClock, createPgUnitOfWork(pool)),
  createListGreetingsHandler(greetingLog),
]);`;
  return eolAware((existing) => {
    if (existing.includes(MAIN_WIRING_GUARD)) return existing;
    if (!existing.includes(importAnchor) || !existing.includes(mediatorAnchor)) {
      throw new Error(
        `${TS_PERSISTENCE_ID}: main.ts has drifted from the walking-skeleton shape — wire createRecordGreetingHandler and createListGreetingsHandler into the mediator manually (pg pool + unit of work + greeting log)`,
      );
    }
    return existing
      .replace(importAnchor, importReplacement)
      .replace(mediatorAnchor, mediatorReplacement);
  });
}

const appendExports = (target: string, guard: string, block: string): ContributionPatch => ({
  target,
  apply: (existing) => {
    if (existing.includes(guard)) return existing;
    const eol = eolOf(existing);
    return `${existing.trimEnd()}${withEol(`\n${block}\n`, eol)}`;
  },
});

export const tsPersistenceAdapter: Adapter = {
  id: TS_PERSISTENCE_ID,
  vertical: 'persistence',
  covers: ['datasource', 'unit-of-work', 'repository-example'],
  predicate: { requires: ['lang.typescript', 'runtime.node', 'arch.server-http'] },
  async contribute(ctx) {
    const answers = ctx.manifest.answers[TS_HTTP_BOOTSTRAP_ID];
    const npmScope = answers?.npmScope;
    if (!npmScope) {
      throw new Error(
        `${TS_PERSISTENCE_ID}: requires '${TS_HTTP_BOOTSTRAP_ID}' to have run first; npmScope not in manifest`,
      );
    }
    const ws = tsWorkspaceVars(ctx.manifest.tags);
    const files = await ctx.templates.render(TEMPLATE_ID, '', {
      npmScope,
      devUrl: sqlEngine().devUrl('localhost', databaseName(ctx.manifest)),
      ...ws,
    });
    const workspaceDeps = (names: readonly string[]): Record<string, string> =>
      Object.fromEntries(names.map((name) => [`@${npmScope}/${name}`, ws.workspaceDep]));
    return {
      files,
      patches: [
        appendExports(CONTRACT_INDEX_TARGET, './greeting-log.ts', CONTRACT_EXPORTS),
        appendExports(CORE_INDEX_TARGET, 'greeting-log-handlers', CORE_EXPORTS),
        {
          target: CORE_PACKAGE_TARGET,
          apply: (existing) =>
            addPackageDependencies(
              existing,
              'devDependencies',
              workspaceDeps([
                'infrastructure-clock',
                'infrastructure-greeting-log',
                'infrastructure-unit-of-work',
              ]),
            ),
        },
        {
          target: REST_PACKAGE_TARGET,
          apply: (existing) =>
            addPackageDependencies(
              existing,
              'dependencies',
              workspaceDeps([
                'infrastructure-clock',
                'infrastructure-greeting-log',
                'infrastructure-unit-of-work',
              ]),
            ),
        },
        { target: SERVER_TARGET, apply: patchServerTs(npmScope) },
        { target: MAIN_TARGET, apply: patchMainTs(npmScope) },
        {
          target: 'README.md',
          apply: eolAware((existing) => {
            if (existing.includes(README_MARKER)) return existing;
            return `${existing.trimEnd()}\n${readmeSection()}`;
          }),
        },
      ],
      actions: [
        {
          id: TS_PERSISTENCE_ID,
          description: `${ws.pm} install (fetch pg and the new workspace packages)`,
          run: async ({ cwd, processes }) => {
            const args = ws.pm === 'npm' ? ['install', '--no-fund', '--no-audit'] : ['install'];
            const result = await processes.run(ws.pm, args, { cwd });
            if (result.startFailure) {
              throw new Error(
                `'${ws.pm}' is not on PATH — run '${ws.pm} install' in the project root to fetch pg and the new workspace packages`,
              );
            }
            if (result.status !== 0) {
              throw new Error(
                [`'${ws.pm} install' failed`, result.stderr, result.stdout]
                  .filter(Boolean)
                  .join('\n'),
              );
            }
          },
        },
      ],
      tagsAdd: [sqlEngine().tag],
    };
  },
};
