/**
 * `persistence/ts-persistence` adapter — the service side of the SQL
 * persistence vertical for the `ts-http` skeleton:
 *
 *   - **datasource**: `pg` (node-postgres) with a pooled connection
 *     factory. Config is env-only 12-factor: `DB_URL` overrides the
 *     dev default (the compose database) in every deployed
 *     environment.
 *   - **unit-of-work**: the `UnitOfWork` port on the contract face
 *     with a PostgreSQL adapter — the open transaction's client rides
 *     `AsyncLocalStorage`, so repository statements made through
 *     `transactionalQueryable` join it without threading a client
 *     through the domain — plus the canonical fake.
 *   - **repository-example**: the `GreetingLog` port with a SQL
 *     adapter (driver-free — it queries through a structural SQL
 *     seam) contract-tested against a Testcontainers PostgreSQL
 *     (schema applied from the very `migrations/sql/` the isolated
 *     runner ships; skipped without Docker), its in-memory fake, the
 *     greeting-log handlers (writes demarcated by the unit of work),
 *     and `POST|GET /greetings` on the `node:http` server.
 *
 * Where any of that *lands* is the layout's business, not this
 * adapter's. Under `basic` the two driven adapters are their own
 * `infrastructure/*` workspace packages; under the modulith they are
 * directories inside the context's single package, which turns four
 * package specifiers into relative paths and two manifests into none.
 * Every destination, specifier and patch target comes from
 * `tsLayout`.
 *
 * The modulith adds one thing `basic` does not need. The assembly may
 * not reach into the context, so the adapters it wires have to be
 * published by the context's facade — the same constraint Go's
 * facade imposes, and the reason the facade grows a block of
 * re-exports here rather than the assembly growing an import of
 * `modules/greeting/src/infra/…`.
 *
 * Every patch is guarded so re-installing is a no-op.
 */

import { databaseName, PERSISTENCE_DIALS_ID, sqlEngine } from './persistence-engine.js';
import { TS_HTTP_BOOTSTRAP_ID } from './ts-http-bootstrap.js';
import { tsLayout, type TsLayoutPaths } from './ts-module-layout.js';
import { tsWorkspaceVars, workspaceInstall } from './ts-workspace.js';
import { eolAware, eolOf, withEol } from '../util.js';
import type { Adapter, ContributionPatch } from '../../contract/composition.js';

export const TS_PERSISTENCE_ID = 'persistence/ts-persistence';

const TEMPLATE_ROOT = 'composition/persistence/ts-persistence/templates';

const CONTRACT_EXPORTS = `export * from './greeting-log.ts';
export * from './unit-of-work.ts';`;

const README_MARKER = '\n### Persistence\n';

const readmeSection = (layout: TsLayoutPaths): string =>
  `${README_MARKER}
The persistence slice: \`POST /greetings\` records a greeting durably
and \`GET /greetings?limit=…\` reads the log back, most recent first.
The domain owns two secondary ports — \`GreetingLog\` (the repository)
and \`UnitOfWork\` (the transactional boundary, a domain concept) —
with the real adapters (\`pg\` over the pool; the open transaction
rides AsyncLocalStorage so repository statements join it) in ${adapterHomes(layout)} Schema lives in
\`migrations/\` — its own deployment unit, see the Database section.
Config is env-only: \`DB_URL\` (defaults to the compose database in
dev). The SQL adapter's contract test runs against a Testcontainers
PostgreSQL and skips without Docker.
`;

/** Where the slice's driven adapters landed, in the layout's terms. */
const adapterHomes = (layout: TsLayoutPaths): string =>
  layout.infraIsPackage
    ? `the
\`${layout.infraRoot('greeting-log')}\` and \`${layout.infraRoot('unit-of-work')}\`
workspace packages beside their canonical fakes.`
    : `\`${layout.infraSrc('greeting-log')}\`
and \`${layout.infraSrc('unit-of-work')}\` beside their canonical fakes —
directories inside the context's package, not packages of their own,
and reachable from the assembly only through the facade.`;

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
const SERVER_ROUTE_ANCHOR = `    if (request.method !== 'GET' || url.pathname !== '/greet') {`;

/**
 * Routes `/greetings` on the hand-rolled `node:http` server before
 * the walking skeleton's greet route. The import it anchors on names
 * whichever package publishes the contract face — a dedicated one
 * under `basic`, the context itself under the modulith — so the
 * anchor is resolved rather than spelled. Exported for the vertical
 * tests; throws when the anchors drifted.
 */
export function patchServerTs(layout: TsLayoutPaths): (existing: string) => string {
  const importAnchor = `import { greetCommand, GREET_REJECTED } from '${layout.contractPkg}';`;
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

const MEDIATOR_ANCHOR = 'const mediator = createRegistryMediator([createGreetHandler()]);';
const MEDIATOR_REPLACEMENT = `const pool = createPgPool();
const greetingLog = createPgGreetingLog(transactionalQueryable(pool));
const mediator = createRegistryMediator([
  createGreetHandler(),
  createRecordGreetingHandler(greetingLog, systemClock, createPgUnitOfWork(pool)),
  createListGreetingsHandler(greetingLog),
]);`;

/**
 * Wires the real persistence adapters into the assembly point: the
 * pool, the SQL greeting log, the unit of work, and the two new
 * handlers on the mediator.
 *
 * The mediator line is the same under both layouts; the imports above
 * it are not, and that is the whole difference between them. Under
 * `basic` the assembly names four packages — the domain and three
 * `infrastructure/*` siblings. Under the modulith it names one, the
 * context, because everything it wires is published by that context's
 * facade and nothing else of it is reachable at all.
 *
 * Exported for the vertical tests; throws when the anchors drifted.
 */
export function patchMainTs(layout: TsLayoutPaths): (existing: string) => string {
  const domainAnchor = `import { createGreetHandler } from '${layout.corePkg}';`;
  const basicAnchor = `import { createGreetHandler, createRegistryMediator } from '${layout.corePkg}';`;
  const anchor = layout.layout === 'modulith' ? domainAnchor : basicAnchor;
  const replacement =
    layout.layout === 'modulith'
      ? `import {
  createGreetHandler,
  createListGreetingsHandler,
  createPgGreetingLog,
  createPgPool,
  createPgUnitOfWork,
  createRecordGreetingHandler,
  systemClock,
  transactionalQueryable,
} from '${layout.corePkg}';`
      : `import {
  createGreetHandler,
  createListGreetingsHandler,
  createRecordGreetingHandler,
  createRegistryMediator,
} from '${layout.corePkg}';
import { systemClock } from '${layout.infraPkg('clock')}';
import { createPgGreetingLog } from '${layout.infraPkg('greeting-log')}';
import {
  createPgPool,
  createPgUnitOfWork,
  transactionalQueryable,
} from '${layout.infraPkg('unit-of-work')}';`;
  return eolAware((existing) => {
    if (existing.includes(MAIN_WIRING_GUARD)) return existing;
    if (!existing.includes(anchor) || !existing.includes(MEDIATOR_ANCHOR)) {
      throw new Error(
        `${TS_PERSISTENCE_ID}: main.ts has drifted from the walking-skeleton shape — wire createRecordGreetingHandler and createListGreetingsHandler into the mediator manually (pg pool + unit of work + greeting log)`,
      );
    }
    return existing.replace(anchor, replacement).replace(MEDIATOR_ANCHOR, MEDIATOR_REPLACEMENT);
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

const PG_RUNTIME_DEPENDENCIES: Readonly<Record<string, string>> = { pg: '^8.16.0' };
const PG_DEV_DEPENDENCIES: Readonly<Record<string, string>> = {
  '@testcontainers/postgresql': '^12.1.0',
  // The pg unit of work rides `node:async_hooks`, so the package that
  // now contains it needs the Node types declared rather than
  // borrowed from a hoisted sibling — pnpm's isolated `node_modules`
  // does not lend them.
  '@types/node': '^24.0.0',
  '@types/pg': '^8.15.0',
};

export const tsPersistenceAdapter: Adapter = {
  id: TS_PERSISTENCE_ID,
  vertical: 'persistence',
  covers: ['datasource', 'unit-of-work', 'repository-example'],
  predicate: { requires: ['lang.typescript', 'runtime.node', 'arch.server-http'] },
  // The dials adapter must have asked its questions before this one
  // reads them through sqlEngine().
  after: [PERSISTENCE_DIALS_ID],
  async contribute(ctx) {
    const engine = sqlEngine(ctx.manifest);
    const answers = ctx.manifest.answers[TS_HTTP_BOOTSTRAP_ID];
    const npmScope = answers?.npmScope;
    if (!npmScope) {
      throw new Error(
        `${TS_PERSISTENCE_ID}: requires '${TS_HTTP_BOOTSTRAP_ID}' to have run first; npmScope not in manifest`,
      );
    }
    const layout = tsLayout(ctx.manifest.tags, npmScope);
    const ws = tsWorkspaceVars(ctx.manifest.tags);
    const index = (name: string): string => `${layout.infraSrc(name)}/index.ts`;
    const shared = {
      kernelSpec: layout.kernelPkg,
      workspaceDep: ws.workspaceDep,
      devUrl: engine.devUrl('localhost', databaseName(ctx.manifest)),
      dbImage: engine.image,
    };
    const renders: (readonly [string, string, Readonly<Record<string, string>>])[] = [
      [
        'contract',
        layout.contractSrc,
        { kernelSpec: layout.specifierFrom(layout.contractSrc, `${layout.kernelSrc}/index.ts`) },
      ],
      [
        'core',
        layout.coreInternal,
        {
          kernelSpec: layout.specifierFrom(layout.coreInternal, `${layout.kernelSrc}/index.ts`),
          contractSpec: layout.specifierFrom(layout.coreInternal, layout.contractIndex),
        },
      ],
      [
        'core-tests',
        layout.coreTests,
        {
          contractSpec: layout.specifierFrom(layout.coreTests, layout.contractIndex),
          coreSpec: layout.specifierFrom(layout.coreTests, layout.coreIndex),
          clockSpec: layout.specifierFrom(layout.coreTests, index('clock')),
          greetingLogSpec: layout.specifierFrom(layout.coreTests, index('greeting-log')),
          uowSpec: layout.specifierFrom(layout.coreTests, index('unit-of-work')),
        },
      ],
      [
        'greeting-log/src',
        layout.infraSrc('greeting-log'),
        {
          contractSpec: layout.specifierFrom(layout.infraSrc('greeting-log'), layout.contractIndex),
        },
      ],
      [
        'greeting-log/tests',
        layout.infraTests('greeting-log'),
        {
          // This test names its own package's barrel relatively, and
          // the clock's names its package. Both spellings predate the
          // dial; the resolver keeps each rather than normalising the
          // emitted tree under cover of a layout change.
          greetingLogSpec: layout.internalSpecifierFrom(
            layout.infraTests('greeting-log'),
            index('greeting-log'),
          ),
          uowSpec: layout.specifierFrom(layout.infraTests('greeting-log'), index('unit-of-work')),
          upToRoot: layout.upToRoot(layout.infraTests('greeting-log')),
        },
      ],
      [
        'unit-of-work/src',
        layout.infraSrc('unit-of-work'),
        {
          contractSpec: layout.specifierFrom(layout.infraSrc('unit-of-work'), layout.contractIndex),
        },
      ],
      [
        'unit-of-work/tests',
        layout.infraTests('unit-of-work'),
        {
          uowSpec: layout.internalSpecifierFrom(
            layout.infraTests('unit-of-work'),
            index('unit-of-work'),
          ),
        },
      ],
      ['rest', layout.restSrc, { contractSpec: layout.contractPkg }],
    ];
    if (layout.infraIsPackage) {
      const manifestVars = {
        greetingLogPkg: layout.infraPkg('greeting-log'),
        uowPkg: layout.infraPkg('unit-of-work'),
        contractPkg: layout.contractPkg,
        infraExports: layout.exportsMap('domain'),
      };
      renders.push(
        ['greeting-log/manifest', layout.infraRoot('greeting-log'), manifestVars],
        ['unit-of-work/manifest', layout.infraRoot('unit-of-work'), manifestVars],
      );
    }
    const rendered = await Promise.all(
      renders.map(([tree, dest, vars]) =>
        ctx.templates.render(`${TEMPLATE_ROOT}/${tree}`, dest, { ...shared, ...vars }),
      ),
    );
    return {
      files: rendered.flat(),
      patches: [
        appendExports(layout.contractIndex, './greeting-log.ts', CONTRACT_EXPORTS),
        appendExports(layout.coreIndex, 'greeting-log-handlers', coreExports(layout)),
        ...packagePatches(layout, ws.workspaceDep),
        { target: `${layout.restSrc}/server.ts`, apply: patchServerTs(layout) },
        { target: `${layout.restSrc}/main.ts`, apply: patchMainTs(layout) },
        {
          target: 'README.md',
          apply: eolAware((existing) => {
            if (existing.includes(README_MARKER)) return existing;
            return `${existing.trimEnd()}\n${readmeSection(layout)}`;
          }),
        },
      ],
      actions: [
        workspaceInstall(TS_PERSISTENCE_ID, ws.pm, 'fetch pg and the new workspace packages'),
      ],
      tagsAdd: [engine.tag],
    };
  },
};

/**
 * What the domain package's public barrel gains. Under the modulith
 * that barrel is the context's facade and the assembly's only way in,
 * so it also has to publish the adapters the composition root wires —
 * a peer context never sees them, because a peer is confined to
 * `./service`.
 */
function coreExports(layout: TsLayoutPaths): string {
  const handlers = `export {
  createListGreetingsHandler,
  createRecordGreetingHandler,
} from '${layout.coreExport('greeting-log-handlers.ts')}';`;
  if (layout.infraIsPackage) return handlers;
  return `${handlers}
export { systemClock } from './infra/clock/index.ts';
export { createPgGreetingLog } from './infra/greeting-log/index.ts';
export {
  createPgPool,
  createPgUnitOfWork,
  transactionalQueryable,
} from './infra/unit-of-work/index.ts';`;
}

/**
 * The manifest edits the slice needs, which are a different shape per
 * layout rather than the same shape at different paths.
 *
 * Under `basic` the new adapters are workspace packages, so the two
 * packages that consume them declare the dependency. Under the
 * modulith they are directories in the context's own package, so
 * there is nothing to declare between packages — but `pg` and its
 * types now have a consumer inside the context, and that is a real
 * dependency the package has to carry.
 */
function packagePatches(layout: TsLayoutPaths, workspaceDep: string): readonly ContributionPatch[] {
  const corePackage = `${layout.coreRoot}/package.json`;
  if (!layout.infraIsPackage) {
    return [
      {
        target: corePackage,
        apply: (existing) =>
          addPackageDependencies(
            addPackageDependencies(existing, 'dependencies', PG_RUNTIME_DEPENDENCIES),
            'devDependencies',
            PG_DEV_DEPENDENCIES,
          ),
      },
    ];
  }
  const adapters = ['clock', 'greeting-log', 'unit-of-work'] as const;
  const workspaceDeps = Object.fromEntries(
    adapters.map((name) => [layout.infraPkg(name), workspaceDep]),
  );
  return [
    {
      target: corePackage,
      apply: (existing) => addPackageDependencies(existing, 'devDependencies', workspaceDeps),
    },
    {
      target: `${layout.restRoot}/package.json`,
      apply: (existing) => addPackageDependencies(existing, 'dependencies', workspaceDeps),
    },
  ];
}
