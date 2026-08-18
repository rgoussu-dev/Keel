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
 * **The slice redistributes by ownership under the modulith**, and
 * that — not path resolution, which is all the other three Rust
 * verticals needed — is what made this the one I.4 left behind. The
 * two ports join the context's contract crate; the three adapters
 * become a **crate of their own**, `<ctx>-infra-postgres`, because a
 * Cargo dependency is inherited by every dependent and folding a
 * database driver into `<ctx>-domain-contract` would put `postgres`
 * on the compile graph of everything that names the domain. The
 * system clock joins `platform-kernel`, where `rust-port-fake`
 * already put the `Clock` port it implements and its fake. Nothing
 * here names a directory: every destination and every `use` spelling
 * comes from {@link rustLayout}, so one template tree serves both
 * layouts and the `basic` output is byte-for-byte what it always was.
 *
 * **Dependencies follow their code rather than the project.** Under
 * `basic` there is one manifest and they all land in it. Under the
 * modulith `postgres` and Testcontainers belong to the new infra
 * crate, `humantime` to the assembly that formats timestamps for the
 * wire, and the contract crate gains an edge to the kernel (for
 * `Clock`) plus a *dev*-edge back onto the infra crate for the fakes
 * its integration test wires. Cargo permits that last cycle — a
 * dev-dependency is not part of the library's own graph — which is
 * what lets the fakes live beside the adapter they stand in for.
 *
 * Patches the contract face (module stitching, the `rust-port-fake`
 * idiom), the manifests above, and the HTTP assembly — anchored on
 * lines stable in both the plain and observability-rewritten shapes.
 * Every patch is guarded so re-installing is a no-op.
 */

import { databaseName, imageTagOf, PERSISTENCE_DIALS_ID, sqlEngine } from './persistence-engine.js';
import { rustBootstrapAnswers } from './rust-bootstrap.js';
import {
  addWorkspaceMembers,
  rustLayout,
  type RustCrate,
  type RustLayoutPaths,
} from './rust-module-layout.js';
import { eolAware, eolOf, withEol } from '../util.js';
import type {
  Adapter,
  ContributionFile,
  ContributionPatch,
  Ctx,
} from '../../contract/composition.js';

export const RUST_PERSISTENCE_ID = 'persistence/rust-persistence';

const TEMPLATE_ROOT = 'composition/persistence/rust-persistence/templates';

/** The delivery typology this vertical decorates. */
const TYPOLOGY = 'http';

const DEPENDENCIES_MARKER = '[dependencies]';
const DEV_DEPENDENCIES_MARKER = '[dev-dependencies]';

const POSTGRES_DEPENDENCY = 'postgres = "0.19"';
const HUMANTIME_DEPENDENCY = 'humantime = "2"';
const TESTCONTAINERS_DEPENDENCY =
  'testcontainers-modules = { version = "0.15", features = ["blocking", "postgres"] }';

/** Everything the single `basic` crate compiles, in one manifest. */
const BASIC_RUNTIME_DEPENDENCIES = `${HUMANTIME_DEPENDENCY}
${POSTGRES_DEPENDENCY}`;

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

const CLOCK_SYS_STITCH = 'pub mod clock_sys;';

const README_MARKER = '\n### Persistence\n';

const readmeSection = (adaptersHome: string): string =>
  `${README_MARKER}
The persistence slice: \`POST /greetings\` records a greeting durably
and \`GET /greetings?limit=…\` reads the log back, most recent first.
The domain owns two secondary ports — \`GreetingLog\` (the repository)
and \`UnitOfWork\` (the transactional boundary, a domain concept; a
sync trait, so the HTTP adapter runs it on the blocking pool) — with
the PostgreSQL adapters in \`${adaptersHome}\` beside the
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
 * `/greetings` router merged into the service.
 *
 * Only the two `use` lines move with the layout — under `basic` both
 * the contract face and the adapters are modules of the one crate,
 * under the modulith they are three separate crates — so the wiring
 * body below is written against the module names those lines bind and
 * is identical either way. Exported for the vertical tests; throws
 * when the anchors drifted.
 */
export function patchRustMain(layout: RustLayoutPaths): (existing: string) => string {
  const contractUse = layout.contract.usePath;
  const modsAnchor = 'mod handler;';
  const useAnchor = `use ${contractUse}::new_greeter;`;
  const useReplacement = `use ${contractUse}::{new_greeter, new_greeting_log_use_cases};
${adapterImports(layout)}`;
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
        `${RUST_PERSISTENCE_ID}: ${layout.assembly(TYPOLOGY).rootFile} has drifted from the walking-skeleton shape — wire postgres::connect + new_greeting_log_use_cases and merge greetings::router into the service manually`,
      );
    }
    return existing
      .replace(modsAnchor, 'mod greetings;\nmod handler;')
      .replace(useAnchor, useReplacement)
      .replace(greeterAnchor, wiring)
      .replace(routerAnchor, routerReplacement);
  });
}

/**
 * The `use` lines binding `postgres` and `clock_sys` in the assembly.
 * One crate holds both under `basic`; under the modulith they are the
 * infra crate and the kernel, sorted as rustfmt would leave them.
 */
function adapterImports(layout: RustLayoutPaths): string {
  if (layout.layout === 'basic') {
    return `use ${layout.contract.crate.ident}::infra::{clock_sys, postgres};`;
  }
  return `use ${layout.infra('postgres').crate.ident}::postgres;
use ${layout.kernel.crate.ident}::clock_sys;`;
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
  // The dials adapter must have asked its questions before this one
  // reads them through sqlEngine().
  after: [PERSISTENCE_DIALS_ID],
  async contribute(ctx) {
    const { projectName } = rustBootstrapAnswers(ctx.manifest, RUST_PERSISTENCE_ID);
    const engine = sqlEngine(ctx.manifest);
    const layout = rustLayout(ctx.manifest.tags, projectName);
    const basic = layout.layout === 'basic';
    const infra = layout.infra('postgres');
    const assembly = layout.assembly(TYPOLOGY);
    const files = await renderSlice(ctx, layout, {
      devUrl: engine.devUrl('localhost', databaseName(ctx.manifest)),
      dbImageTag: imageTagOf(engine),
    });
    return {
      files,
      patches: [
        ...(basic ? basicPatches(layout) : modulithPatches(layout)),
        { target: assembly.rootFile, apply: patchRustMain(layout) },
        {
          target: 'README.md',
          apply: eolAware((existing) => {
            if (existing.includes(README_MARKER)) return existing;
            return `${existing.trimEnd()}\n${readmeSection(adaptersHome(layout, infra))}`;
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
      tagsAdd: [engine.tag],
    };
  },
};

/** Where the README tells the reader to find the adapters. */
function adaptersHome(
  layout: RustLayoutPaths,
  infra: ReturnType<RustLayoutPaths['infra']>,
): string {
  return layout.layout === 'basic' ? 'src/infra/postgres.rs' : `${infra.crate.dir}/`;
}

/**
 * Renders every subtree of the slice to the home its layout gives it,
 * each with the `use` spellings its own position implies.
 *
 * Three different spellings of the same contract face appear below and
 * they are not interchangeable: a *sibling module* of the face says
 * `crate::domain` / `crate`, the infra crate says `crate::domain` /
 * `greeting_domain_contract`, and the assembly — a separate binary
 * crate even under `basic` — says `skel::domain` /
 * `greeting_domain_contract`. Collapsing any two of them produces a
 * tree that renders and does not compile.
 */
async function renderSlice(
  ctx: Ctx,
  layout: RustLayoutPaths,
  shared: Readonly<Record<string, string>>,
): Promise<ContributionFile[]> {
  const basic = layout.layout === 'basic';
  const infra = layout.infra('postgres');
  const contract = layout.contract;
  const assembly = layout.assembly(TYPOLOGY);
  const fakeUse = (name: string): string =>
    basic ? layout.infra(name).usePath : `${infra.crate.ident}::${name}`;
  const externalUses = {
    contractUse: contract.usePath,
    clockFakeUse: layout.platform('clock_fake').usePath,
    logFakeUse: fakeUse('greeting_log_fake'),
    uowFakeUse: fakeUse('uow_fake'),
  };
  const subtrees: readonly (readonly [string, string, Readonly<Record<string, string>>])[] = [
    [
      'domain',
      dirOf(contract.moduleFile('greeting_log')),
      {
        siblingUse: basic ? 'crate::domain' : 'crate',
        // Under `basic` the Clock port is a submodule of this very
        // face; under the modulith it belongs to no context and has
        // left for the kernel, so the face imports it separately.
        logImports: basic
          ? 'use crate::domain::{Clock, GreetError, UnitOfWork};'
          : `use ${layout.kernel.crate.ident}::Clock;\n\nuse crate::{GreetError, UnitOfWork};`,
      },
    ],
    [
      'clock',
      dirOf(layout.platform('clock_sys').rootFile),
      // The kernel re-exports `Clock` from its root, but a sibling
      // module names the module that declares it, as the fake does.
      { clockUse: basic ? 'crate::domain' : 'crate::clock' },
    ],
    [
      'infra',
      dirOf(infra.rootFile),
      {
        portsUse: basic ? 'crate::domain' : contract.crate.ident,
        upToRoot: layout.upToRoot(infra.crate),
      },
    ],
    ['http', dirOf(assembly.rootFile), externalUses],
    ['tests', testsDirOf(contract.crate.dir), externalUses],
    // Only the modulith mints a crate, and only a crate needs a shell.
    ...(basic
      ? []
      : ([
          [
            'crate',
            infra.crate.dir,
            {
              infraCrate: infra.crate.name,
              contractCrate: contract.crate.name,
              contractPath: contract.crate.pathFrom(infra.crate),
            },
          ],
        ] as const)),
  ];
  const rendered = await Promise.all(
    subtrees.map(([id, dest, vars]) =>
      ctx.templates.render(`${TEMPLATE_ROOT}/${id}`, dest, { ...shared, ...vars }),
    ),
  );
  return rendered.flat();
}

function dirOf(file: string): string {
  return file.slice(0, file.lastIndexOf('/'));
}

/** The `tests/` directory of the crate rooted at `dir`. */
function testsDirOf(dir: string): string {
  return dir === '' ? 'tests' : `${dir}/tests`;
}

/**
 * The single-crate wiring: everything the slice adds is a module of
 * the one package, and its dependencies land in the one manifest.
 */
function basicPatches(layout: RustLayoutPaths): readonly ContributionPatch[] {
  return [
    {
      target: 'Cargo.toml',
      apply: eolAware((existing) => {
        if (existing.includes(POSTGRES_DEPENDENCY)) return existing;
        let next = existing.replace(
          DEPENDENCIES_MARKER,
          `${DEPENDENCIES_MARKER}\n${BASIC_RUNTIME_DEPENDENCIES}`,
        );
        if (next.includes(DEV_DEPENDENCIES_MARKER)) {
          next = next.replace(
            DEV_DEPENDENCIES_MARKER,
            `${DEV_DEPENDENCIES_MARKER}\n${TESTCONTAINERS_DEPENDENCY}`,
          );
        } else {
          next = `${next.trimEnd()}\n\n${DEV_DEPENDENCIES_MARKER}\n${TESTCONTAINERS_DEPENDENCY}\n`;
        }
        return next;
      }),
    },
    {
      target: layout.contract.rootFile,
      apply: eolAware(appendStitch('pub mod greeting_log;', DOMAIN_STITCH)),
    },
    { target: 'src/lib.rs', apply: eolAware(appendStitch('pub mod infra;', 'pub mod infra;')) },
    { target: 'src/infra.rs', apply: eolAware(appendStitch('pub mod postgres;', INFRA_STITCH)) },
  ];
}

/**
 * The workspace wiring: a new member crate, and one dependency edge
 * per crate that gained code — never one more, because an edge nobody
 * needs is exactly the coupling the layout was bought to prevent.
 */
function modulithPatches(layout: RustLayoutPaths): readonly ContributionPatch[] {
  const infra = layout.infra('postgres');
  const contract = layout.contract;
  const kernel = layout.kernel;
  const assembly = layout.assembly(TYPOLOGY);
  return [
    {
      target: 'Cargo.toml',
      apply: (existing) => addWorkspaceMembers(existing, [infra.crate.dir]),
    },
    {
      target: contract.crate.manifest,
      apply: eolAware((existing) => {
        if (existing.includes(infra.crate.name)) return existing;
        const withKernel = addDependencies(
          existing,
          DEPENDENCIES_MARKER,
          [dependencyLine(kernel.crate, contract.crate)],
          contract.crate.manifest,
        );
        // The fakes the contract's own integration test wires live
        // with the adapter they stand in for. A dev-dependency is not
        // part of this crate's library graph, so the cycle it closes
        // costs its dependents nothing.
        return addDependencies(
          withKernel,
          DEV_DEPENDENCIES_MARKER,
          [dependencyLine(infra.crate, contract.crate)],
          contract.crate.manifest,
        );
      }),
    },
    {
      target: contract.rootFile,
      apply: eolAware(appendStitch('pub mod greeting_log;', DOMAIN_STITCH)),
    },
    {
      target: kernel.rootFile,
      apply: eolAware(appendStitch(CLOCK_SYS_STITCH, CLOCK_SYS_STITCH)),
    },
    {
      target: assembly.crate.manifest,
      apply: eolAware((existing) => {
        if (existing.includes(infra.crate.name)) return existing;
        // `platform-kernel` may already be here: `--with-peer-context`
        // adds it to wire the peer. A second entry under the same key
        // is a manifest Cargo rejects, so the edge is added only when
        // it is missing rather than unconditionally.
        const needed = [
          HUMANTIME_DEPENDENCY,
          dependencyLine(infra.crate, assembly.crate),
          ...(existing.includes(`${kernel.crate.name} =`)
            ? []
            : [dependencyLine(kernel.crate, assembly.crate)]),
        ];
        return addDependencies(existing, DEPENDENCIES_MARKER, needed, assembly.crate.manifest);
      }),
    },
  ];
}

/** One `[dependencies]` entry pointing the manifest of `from` at `crate`. */
function dependencyLine(crate: RustCrate, from: RustCrate): string {
  return `${crate.name} = { path = "${crate.pathFrom(from)}" }`;
}

/**
 * Splices `lines` under `table`, appending the table when the
 * manifest has none. Throws naming the manifest when `table` is
 * `[dependencies]` and absent — a package manifest without one has
 * drifted past recognition, and a silently dropped edge surfaces much
 * later as an unresolved crate.
 */
function addDependencies(
  existing: string,
  table: string,
  lines: readonly string[],
  manifest: string,
): string {
  const eol = eolOf(existing);
  if (existing.includes(table)) {
    return existing.replace(table, `${table}${withEol(`\n${lines.join('\n')}`, eol)}`);
  }
  if (table === DEPENDENCIES_MARKER) {
    throw new Error(
      `${RUST_PERSISTENCE_ID}: no ${table} table in '${manifest}' to add the persistence crates to`,
    );
  }
  return `${existing.trimEnd()}${withEol(`\n\n${table}\n${lines.join('\n')}\n`, eol)}`;
}
