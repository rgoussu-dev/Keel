/**
 * `persistence/go-persistence` adapter — the service side of the SQL
 * persistence vertical for the Go HTTP skeleton:
 *
 *   - **datasource**: pgx (`jackc/pgx/v5`) with a pooled connection
 *     factory. Config is env-only 12-factor: `DB_URL` overrides the
 *     dev default (the compose database) in every deployed
 *     environment. Dependencies arrive the Go way — source imports +
 *     a deferred `go mod tidy`.
 *   - **unit-of-work**: the `UnitOfWork` secondary port beside the
 *     domain's other ports — per the Go stance there is no mediator;
 *     the open transaction rides the derived `context.Context` the
 *     block receives, so repository statements join it — with the
 *     PostgreSQL adapter and the counting fake (`uowfake`).
 *   - **repository-example**: the `GreetingLog` port, the
 *     `GreetingLogUseCases` driving port over a compiler-hidden core
 *     (validation reuses the domain's `ErrEmptyName`, so the
 *     existing problem mapping covers it), the pgx adapter
 *     contract-tested against a Testcontainers PostgreSQL (schema
 *     applied from `migrations/sql/`; skips without Docker), the
 *     in-memory fake, and `POST|GET /greetings` as a **decorator**
 *     (`resthttp.WithGreetings`) around the existing handler —
 *     cross-cutting the Go way, so neither `handler.go` nor its test
 *     is touched.
 *
 * The slice spans five packages, and every one of their homes moves
 * with the module layout, so nothing here names a directory: each
 * template subtree is rendered to a `goLayout` destination and
 * receives its import block already sorted. Under the modulith the
 * assembly cannot reach the context's `domain` at all, so the slice
 * also emits its own half of the facade — `NewGreetingLogUseCases`
 * beside `NewGreeter` — rather than letting `cmd/` name what it is
 * not allowed to name.
 *
 * Patches the HTTP assembly (anchored on the `greeter := …` line and
 * the `resthttp.NewHandler(greeter)` expression, both stable whether
 * or not the observability vertical rewrote the serve block) and
 * `README.md`. Every patch is guarded so re-installing is a no-op.
 */

import { goBootstrapAnswers } from './go-bootstrap.js';
import { addProjectImports, goLayout, type GoLayoutPaths } from './go-module-layout.js';
import { databaseName, PERSISTENCE_DIALS_ID, sqlEngine } from './persistence-engine.js';
import { eolAware } from '../util.js';
import type { Adapter } from '../../contract/composition.js';

export const GO_PERSISTENCE_ID = 'persistence/go-persistence';

const TEMPLATE_ROOT = 'composition/persistence/go-persistence';

const README_MARKER = '\n### Persistence\n';

const readmeSection = (layout: GoLayoutPaths): string =>
  `${README_MARKER}
The persistence slice: \`POST /greetings\` records a greeting durably
and \`GET /greetings?limit=…\` reads the log back, most recent first.
The domain owns two secondary ports — \`GreetingLog\` (the repository)
and \`UnitOfWork\` (the transactional boundary, a domain concept; the
open transaction rides the context) — with the pgx adapters in
\`${layout.infra('postgres')}\` beside the canonical fakes. The HTTP
routes decorate the existing handler (\`resthttp.WithGreetings\`).
Schema lives in \`migrations/\` — its own deployment unit, see the
Database section. Config is env-only: \`DB_URL\` (defaults to the
compose database in dev). The postgres adapter's contract test runs
against a Testcontainers PostgreSQL and skips without Docker.
`;

const WIRING_GUARD = 'NewGreetingLogUseCases';

/**
 * Wires the persistence slice into the assembly point: the pool, the
 * use cases over the pgx adapters, and the `/greetings` decorator
 * around the existing handler. Both the anchors and the imports it
 * adds come from the layout — under the modulith the assembly calls
 * the context's facade, not its domain, and the two secondary
 * adapters live in different halves of the tree. Exported for the
 * vertical tests; throws when the anchors drifted.
 */
export function patchGoMain(layout: GoLayoutPaths): (existing: string) => string {
  const facade = layout.facadePkg;
  const greeterAnchor = `\tgreeter := ${facade}.NewGreeter()`;
  const wiring = `${greeterAnchor}
\tpool, err := postgres.NewPool(context.Background())
\tif err != nil {
\t\tlog.Fatal(err)
\t}
\tdefer pool.Close()
\tgreetings := ${facade}.NewGreetingLogUseCases(
\t\tpostgres.NewGreetingLog(pool),
\t\tclocksys.Clock{},
\t\tpostgres.NewUnitOfWork(pool),
\t)`;
  const handlerAnchor = 'resthttp.NewHandler(greeter)';
  const handlerWiring = 'resthttp.WithGreetings(resthttp.NewHandler(greeter), greetings)';
  return eolAware((existing) => {
    if (existing.includes(WIRING_GUARD)) return existing;
    if (!existing.includes(greeterAnchor) || !existing.includes(handlerAnchor)) {
      throw new Error(driftMessage(layout));
    }
    let next: string;
    try {
      next = addProjectImports(existing, layout, [
        layout.platform('clocksys'),
        layout.infra('postgres'),
      ]);
    } catch {
      throw new Error(driftMessage(layout));
    }
    next = next.replace(greeterAnchor, wiring).replace(handlerAnchor, handlerWiring);
    if (!next.includes('\t"context"\n')) {
      next = next.replace('\t"log"\n', '\t"context"\n\t"log"\n');
    }
    return next;
  });
}

function driftMessage(layout: GoLayoutPaths): string {
  return `${GO_PERSISTENCE_ID}: ${layout.main('http')} has drifted from the walking-skeleton shape — wire postgres.NewPool + ${layout.facadePkg}.NewGreetingLogUseCases and wrap the handler in resthttp.WithGreetings manually`;
}

export const goPersistenceAdapter: Adapter = {
  id: GO_PERSISTENCE_ID,
  vertical: 'persistence',
  covers: ['datasource', 'unit-of-work', 'repository-example'],
  predicate: { requires: ['lang.go', 'arch.server-http'] },
  // The dials adapter must have asked its questions before this one
  // reads them through sqlEngine().
  after: [PERSISTENCE_DIALS_ID],
  async contribute(ctx) {
    const { modulePath } = goBootstrapAnswers(ctx.manifest, GO_PERSISTENCE_ID);
    const engine = sqlEngine(ctx.manifest);
    const layout = goLayout(ctx.manifest.tags, modulePath);
    const core = layout.domainInternal('greetinglog');
    const clockfake = layout.platform('clockfake');
    const postgres = layout.infra('postgres');
    const greetinglogfake = layout.infra('greetinglogfake');
    const uowfake = layout.infra('uowfake');
    const resthttp = layout.app('resthttp');
    const clockIsLocal = layout.clockPort === layout.domain;
    const shared = { modulePath };
    const subtrees: readonly (readonly [string, string, Readonly<Record<string, string>>])[] = [
      [
        'templates/domain',
        layout.domain,
        {
          // Under `basic` the Clock port is declared in this very
          // package; under the modulith it belongs to no context and
          // has left for platform/, so the contract face has to import
          // it and qualify it. Both facts follow from the same
          // comparison rather than from the layout's name.
          projectImports: layout.importBlock(clockIsLocal ? [core] : [core, layout.clockPort]),
          testImports: layout.importBlock([layout.domain, clockfake, greetinglogfake, uowfake]),
          clockType: clockIsLocal ? 'Clock' : `${layout.clockPkg}.Clock`,
        },
      ],
      ['templates/domain-core', core, { projectImports: layout.importBlock([layout.domainCore]) }],
      [
        'templates/clocksys',
        layout.platform('clocksys'),
        {
          projectImports: layout.importBlock([layout.clockPort]),
          clockRef: `${layout.clockPkg}.Clock`,
        },
      ],
      [
        'templates/greetinglogfake',
        greetinglogfake,
        {
          projectImports: layout.importBlock([layout.domain]),
          testImports: layout.importBlock([layout.domain, greetinglogfake]),
        },
      ],
      ['templates/uowfake', uowfake, { testImports: layout.importBlock([layout.domain, uowfake]) }],
      [
        'templates/postgres',
        postgres,
        {
          projectImports: layout.importBlock([layout.domain]),
          testImports: layout.importBlock([layout.domain, postgres]),
          devUrl: engine.devUrl('localhost', databaseName(ctx.manifest)),
          dbImage: engine.image,
          upToRoot: layout.upToRoot(postgres),
        },
      ],
      [
        'templates/resthttp',
        resthttp,
        {
          projectImports: layout.importBlock([layout.domain]),
          testImports: layout.importBlock([
            layout.domain,
            resthttp,
            clockfake,
            greetinglogfake,
            uowfake,
          ]),
        },
      ],
    ];
    const rendered = await Promise.all(
      subtrees.map(([id, dest, vars]) =>
        ctx.templates.render(`${TEMPLATE_ROOT}/${id}`, dest, { ...shared, ...vars }),
      ),
    );
    // Under the modulith the assembly may not import the context's
    // domain, so the factory it needs has to live in the facade.
    // Under `basic` the facade *is* the domain package and the
    // factory the domain emitted is already the one main calls.
    const facade =
      layout.layout === 'modulith'
        ? await ctx.templates.render(`${TEMPLATE_ROOT}/templates-modulith/facade`, layout.facade, {
            ...shared,
            facadePkg: layout.facadePkg,
            clockPkg: layout.clockPkg,
            projectImports: layout.importBlock([layout.domain, layout.clockPort]),
          })
        : [];
    return {
      files: [...rendered.flat(), ...facade],
      patches: [
        { target: layout.main('http'), apply: patchGoMain(layout) },
        {
          target: 'README.md',
          apply: eolAware((existing) => {
            if (existing.includes(README_MARKER)) return existing;
            return `${existing.trimEnd()}\n${readmeSection(layout)}`;
          }),
        },
      ],
      actions: [
        {
          id: GO_PERSISTENCE_ID,
          description: 'go mod tidy (fetch pgx and testcontainers-go)',
          run: async ({ cwd, processes }) => {
            const result = await processes.run('go', ['mod', 'tidy'], { cwd });
            if (result.startFailure) {
              throw new Error(
                "'go' is not on PATH — run 'go mod tidy' in the project root to fetch pgx and testcontainers-go",
              );
            }
            if (result.status !== 0) {
              throw new Error(
                ["'go mod tidy' failed", result.stderr, result.stdout].filter(Boolean).join('\n'),
              );
            }
          },
        },
      ],
      tagsAdd: [engine.tag],
    };
  },
};
