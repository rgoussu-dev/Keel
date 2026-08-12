/**
 * `persistence/rust-persistence` adapter — the service side of the
 * SQL persistence vertical for the Rust HTTP skeleton:
 *
 *   - **datasource**: the sync `postgres` crate behind a shared
 *     connection (`Arc<Mutex<Client>>`) — the walking-skeleton
 *     shape: BEGIN/COMMIT run as statements on that connection so
 *     both adapters share the transaction without lifetime
 *     gymnastics; production growth swaps in a pool behind the same
 *     ports. Config is env-only 12-factor: `DB_URL` overrides the
 *     dev default (the compose database). The service connects at
 *     boot — fail-fast when the database is absent.
 *   - **unit-of-work**: the `UnitOfWork` secondary port on the
 *     domain's contract face — a sync trait taking the block as a
 *     closure, per the house stance that domain traits stay sync —
 *     with the PostgreSQL adapter and the counting fake
 *     (`uow_fake`).
 *   - **repository-example**: the `GreetingLog` port + use cases
 *     behind a `GreetingLogUseCases` driving port (no mediator
 *     object), the PostgreSQL adapter contract-tested against a
 *     Testcontainers PostgreSQL (schema applied from
 *     `migrations/sql/`; skips without Docker), the in-memory fake,
 *     and `POST|GET /greetings` as an axum router merged into the
 *     service — the sync domain runs via `spawn_blocking` so the
 *     runtime never stalls on the database.
 *
 * Patches `Cargo.toml` (runtime + dev dependencies), the contract
 * face and `src/infra.rs` (module stitching, the `rust-port-fake`
 * idiom), and `src/bin/http/main.rs` — anchored on lines stable in
 * both the plain and observability-rewritten shapes. Every patch is
 * guarded so re-installing is a no-op.
 */

import { databaseName, sqlEngine } from './persistence-engine.js';
import { rustBootstrapAnswers } from './rust-bootstrap.js';
import { eolAware } from '../util.js';
import type { Adapter } from '../../contract/composition.js';

export const RUST_PERSISTENCE_ID = 'persistence/rust-persistence';

const TEMPLATE_ID = 'composition/persistence/rust-persistence/templates';

const CARGO_TARGET = 'Cargo.toml';
const DOMAIN_TARGET = 'src/domain.rs';
const LIB_TARGET = 'src/lib.rs';
const INFRA_TARGET = 'src/infra.rs';
const MAIN_TARGET = 'src/bin/http/main.rs';

const DEPENDENCIES_MARKER = '[dependencies]';
const RUNTIME_DEPENDENCIES = `humantime = "2"
postgres = "0.19"`;
const DEV_DEPENDENCIES_MARKER = '[dev-dependencies]';
const DEV_DEPENDENCIES =
  'testcontainers-modules = { version = "0.15", features = ["blocking", "postgres"] }';

const DOMAIN_STITCH = `pub mod greeting_log;
pub mod unit_of_work;
pub use greeting_log::{
    new_greeting_log_use_cases, GreetingLog, GreetingLogError, GreetingLogUseCases,
    ListGreetingsQuery, RecordGreetingCommand, RecordedGreeting,
};
pub use unit_of_work::UnitOfWork;`;

const INFRA_STITCH = `pub mod clock_sys;
pub mod greeting_log_fake;
pub mod postgres;
pub mod uow_fake;`;

const README_MARKER = '\n### Persistence\n';

const readmeSection = (): string =>
  `${README_MARKER}
The persistence slice: \`POST /greetings\` records a greeting durably
and \`GET /greetings?limit=…\` reads the log back, most recent first.
The domain owns two secondary ports — \`GreetingLog\` (the repository)
and \`UnitOfWork\` (the transactional boundary, a domain concept; a
sync trait, so the HTTP adapter runs it on the blocking pool) — with
the PostgreSQL adapters in \`src/infra/postgres.rs\` beside the
canonical fakes. Schema lives in \`migrations/\` — its own deployment
unit, see the Database section. Config is env-only: \`DB_URL\`
(defaults to the compose database in dev); the service connects at
boot, so start the dev environment first. The postgres adapters'
contract test runs against a Testcontainers PostgreSQL and skips
without Docker.
`;

const WIRING_GUARD = 'new_greeting_log_use_cases';

/**
 * Wires the persistence slice into the deployment unit: the shared
 * connection, the use cases over the PostgreSQL adapters, and the
 * `/greetings` router merged into the service. Exported for the
 * vertical tests; throws when the anchors drifted.
 */
export function patchRustMain(crateName: string): (existing: string) => string {
  const modsAnchor = 'mod handler;';
  const useAnchor = `use ${crateName}::domain::new_greeter;`;
  const useReplacement = `use ${crateName}::domain::{new_greeter, new_greeting_log_use_cases};
use ${crateName}::infra::{clock_sys, postgres};`;
  const greeterAnchor = '    let greeter: handler::SharedGreeter = Arc::new(new_greeter());';
  const wiring = `${greeterAnchor}
    let client = postgres::connect().expect("connect to PostgreSQL (set DB_URL)");
    let greetings: greetings::SharedGreetings = Arc::new(new_greeting_log_use_cases(
        Arc::new(postgres::PgGreetingLog::new(client.clone())),
        Arc::new(clock_sys::SystemClock),
        Arc::new(postgres::PgUnitOfWork::new(client)),
    ));`;
  const routerAnchor = 'handler::router(greeter)';
  const routerReplacement = 'handler::router(greeter).merge(greetings::router(greetings))';
  return eolAware((existing) => {
    if (existing.includes(WIRING_GUARD)) return existing;
    if (
      !existing.includes(modsAnchor) ||
      !existing.includes(useAnchor) ||
      !existing.includes(greeterAnchor) ||
      !existing.includes(routerAnchor)
    ) {
      throw new Error(
        `${RUST_PERSISTENCE_ID}: src/bin/http/main.rs has drifted from the walking-skeleton shape — wire postgres::connect + new_greeting_log_use_cases and merge greetings::router into the service manually`,
      );
    }
    return existing
      .replace(modsAnchor, 'mod greetings;\nmod handler;')
      .replace(useAnchor, useReplacement)
      .replace(greeterAnchor, wiring)
      .replace(routerAnchor, routerReplacement);
  });
}

const appendStitch =
  (guard: string, block: string): ((existing: string) => string) =>
  (existing: string) => {
    if (existing.includes(guard)) return existing;
    return `${existing.trimEnd()}\n\n${block}\n`;
  };

export const rustPersistenceAdapter: Adapter = {
  id: RUST_PERSISTENCE_ID,
  vertical: 'persistence',
  covers: ['datasource', 'unit-of-work', 'repository-example'],
  predicate: { requires: ['lang.rust', 'arch.server-http'] },
  async contribute(ctx) {
    const { projectName, crateName } = rustBootstrapAnswers(ctx.manifest, RUST_PERSISTENCE_ID);
    const files = await ctx.templates.render(TEMPLATE_ID, '', {
      projectName,
      crateName,
      devUrl: sqlEngine().devUrl('localhost', databaseName(ctx.manifest)),
    });
    return {
      files,
      patches: [
        {
          target: CARGO_TARGET,
          apply: eolAware((existing) => {
            if (existing.includes('postgres = "0.19"')) return existing;
            let next = existing.replace(
              DEPENDENCIES_MARKER,
              `${DEPENDENCIES_MARKER}\n${RUNTIME_DEPENDENCIES}`,
            );
            if (next.includes(DEV_DEPENDENCIES_MARKER)) {
              next = next.replace(
                DEV_DEPENDENCIES_MARKER,
                `${DEV_DEPENDENCIES_MARKER}\n${DEV_DEPENDENCIES}`,
              );
            } else {
              next = `${next.trimEnd()}\n\n${DEV_DEPENDENCIES_MARKER}\n${DEV_DEPENDENCIES}\n`;
            }
            return next;
          }),
        },
        {
          target: DOMAIN_TARGET,
          apply: eolAware(appendStitch('pub mod greeting_log;', DOMAIN_STITCH)),
        },
        { target: LIB_TARGET, apply: eolAware(appendStitch('pub mod infra;', 'pub mod infra;')) },
        { target: INFRA_TARGET, apply: eolAware(appendStitch('pub mod postgres;', INFRA_STITCH)) },
        { target: MAIN_TARGET, apply: patchRustMain(crateName) },
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
          id: RUST_PERSISTENCE_ID,
          description: 'cargo check (fetch postgres and testcontainers crates)',
          run: async ({ cwd, processes }) => {
            const result = await processes.run('cargo', ['check'], { cwd });
            if (result.startFailure) {
              throw new Error(
                "'cargo' is not on PATH — run 'cargo check' in the project root to fetch the new crates",
              );
            }
            if (result.status !== 0) {
              throw new Error(
                ["'cargo check' failed", result.stderr, result.stdout].filter(Boolean).join('\n'),
              );
            }
          },
        },
      ],
      tagsAdd: [sqlEngine().tag],
    };
  },
};
