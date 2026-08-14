/**
 * `persistence/go-persistence` adapter — the service side of the SQL
 * persistence vertical for the Go HTTP skeleton:
 *
 *   - **datasource**: pgx (`jackc/pgx/v5`) with a pooled connection
 *     factory. Config is env-only 12-factor: `DB_URL` overrides the
 *     dev default (the compose database) in every deployed
 *     environment. Dependencies arrive the Go way — source imports +
 *     a deferred `go mod tidy`.
 *   - **unit-of-work**: the `UnitOfWork` secondary port in
 *     `internal/domain` — per the Go stance there is no mediator;
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
 * Patches only `cmd/http/main.go` (anchored on the
 * `greeter := domain.NewGreeter()` line and the
 * `resthttp.NewHandler(greeter)` expression, both stable whether or
 * not the observability vertical rewrote the serve block) and
 * `README.md`. Every patch is guarded so re-installing is a no-op.
 */

import { goBootstrapAnswers } from './go-bootstrap.js';
import { databaseName, sqlEngine } from './persistence-engine.js';
import { eolAware } from '../util.js';
import { MODULITH_LAYOUT_TAG } from './module-layout.js';
import type { Adapter } from '../../contract/composition.js';

export const GO_PERSISTENCE_ID = 'persistence/go-persistence';

const TEMPLATE_ID = 'composition/persistence/go-persistence/templates';

const MAIN_TARGET = 'cmd/http/main.go';

const README_MARKER = '\n### Persistence\n';

const readmeSection = (): string =>
  `${README_MARKER}
The persistence slice: \`POST /greetings\` records a greeting durably
and \`GET /greetings?limit=…\` reads the log back, most recent first.
The domain owns two secondary ports — \`GreetingLog\` (the repository)
and \`UnitOfWork\` (the transactional boundary, a domain concept; the
open transaction rides the context) — with the pgx adapters in
\`internal/infra/postgres\` beside the canonical fakes. The HTTP
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
 * around the existing handler. Exported for the vertical tests;
 * throws when the anchors drifted.
 */
export function patchGoMain(modulePath: string): (existing: string) => string {
  const greeterAnchor = '\tgreeter := domain.NewGreeter()';
  const wiring = `\tgreeter := domain.NewGreeter()
\tpool, err := postgres.NewPool(context.Background())
\tif err != nil {
\t\tlog.Fatal(err)
\t}
\tdefer pool.Close()
\tgreetings := domain.NewGreetingLogUseCases(
\t\tpostgres.NewGreetingLog(pool),
\t\tclocksys.Clock{},
\t\tpostgres.NewUnitOfWork(pool),
\t)`;
  const handlerAnchor = 'resthttp.NewHandler(greeter)';
  const handlerWiring = 'resthttp.WithGreetings(resthttp.NewHandler(greeter), greetings)';
  const domainImport = `\t"${modulePath}/internal/domain"`;
  const infraImports = `${domainImport}
\t"${modulePath}/internal/infra/clocksys"
\t"${modulePath}/internal/infra/postgres"`;
  return eolAware((existing) => {
    if (existing.includes(WIRING_GUARD)) return existing;
    if (
      !existing.includes(greeterAnchor) ||
      !existing.includes(handlerAnchor) ||
      !existing.includes(domainImport)
    ) {
      throw new Error(
        `${GO_PERSISTENCE_ID}: cmd/http/main.go has drifted from the walking-skeleton shape — wire postgres.NewPool + domain.NewGreetingLogUseCases and wrap the handler in resthttp.WithGreetings manually`,
      );
    }
    let next = existing
      .replace(domainImport, infraImports)
      .replace(greeterAnchor, wiring)
      .replace(handlerAnchor, handlerWiring);
    if (!next.includes('\t"context"\n')) {
      next = next.replace('\t"log"\n', '\t"context"\n\t"log"\n');
    }
    return next;
  });
}

export const goPersistenceAdapter: Adapter = {
  id: GO_PERSISTENCE_ID,
  vertical: 'persistence',
  covers: ['datasource', 'unit-of-work', 'repository-example'],
  // Flat layout only, for now. The slice spans five packages whose
  // homes all move under the modulith — the ports into the context's
  // domain, the pgx adapters into modules/<ctx>/infra/, the system
  // clock into platform/ — and half of its templates cross-import the
  // others. Excluding the tag makes `keel add persistence` on a Go
  // modulith fail loudly with an uncovered dimension, which is the
  // right failure: emitting the slice at flat paths would compile and
  // silently not wire, exactly as observability did before its own
  // move.
  predicate: { requires: ['lang.go', 'arch.server-http'], excludes: [MODULITH_LAYOUT_TAG] },
  async contribute(ctx) {
    const { modulePath } = goBootstrapAnswers(ctx.manifest, GO_PERSISTENCE_ID);
    const files = await ctx.templates.render(TEMPLATE_ID, '', {
      modulePath,
      devUrl: sqlEngine().devUrl('localhost', databaseName(ctx.manifest)),
    });
    return {
      files,
      patches: [
        { target: MAIN_TARGET, apply: patchGoMain(modulePath) },
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
      tagsAdd: [sqlEngine().tag],
    };
  },
};
