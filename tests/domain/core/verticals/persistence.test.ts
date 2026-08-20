/**
 * Tests for the `persistence` vertical. The resolution block proves
 * the Quarkus/Java selection and the hard-fail on stacks without a
 * persistence adapter (no half-installs). The install blocks chain
 * `walking-skeleton` (→ `dev-env` → `observability`) then
 * `persistence` on one tree and assert the layered result: the
 * Unit-of-Work and greeting-log ports with their adapters and fakes,
 * module registration per build system, datasource + Flyway config,
 * the rewired composition root, the isolated `migrations/` unit, and
 * the compose database + migrations one-shot. The exported patch
 * helpers' drift guards are covered directly.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rejectingPrompt } from '../../../../src/infrastructure/prompt/fake.js';
import { FakeLogger } from '../../../../src/infrastructure/commons/fake-logger.js';
import { ejsTemplateSource } from '../../../../src/infrastructure/template/ejs-template-source.js';
import { spawnProcessRunner } from '../../../../src/infrastructure/process/spawn-process-runner.js';
import { installVertical } from '../../../../src/domain/core/install.js';
import { devEnvVertical } from '../../../../src/domain/core/verticals/dev-env.js';
import { observabilityVertical } from '../../../../src/domain/core/verticals/observability.js';
import { persistenceVertical } from '../../../../src/domain/core/verticals/persistence.js';
import { walkingSkeletonVertical } from '../../../../src/domain/core/verticals/walking-skeleton.js';
import { resolveVertical, ResolutionError } from '../../../../src/domain/core/resolver.js';
import { DATABASE_COMPOSE_ID } from '../../../../src/domain/core/adapters/database-compose.js';
import { patchMicronautImportPackages } from '../../../../src/domain/core/adapters/jvm-persistence.js';
import { jvmLayout } from '../../../../src/domain/core/adapters/jvm-module-layout.js';
import { FLYWAY_MIGRATIONS_ID } from '../../../../src/domain/core/adapters/flyway-migrations.js';
import { LIQUIBASE_MIGRATIONS_ID } from '../../../../src/domain/core/adapters/liquibase-migrations.js';
import { MARIADB, POSTGRES } from '../../../../src/domain/core/adapters/persistence-engine.js';
import { databaseComposeAdapter } from '../../../../src/domain/core/adapters/database-compose.js';
import {
  persistencePropertiesBlock,
  QUARKUS_PERSISTENCE_ID,
  QUARKUS_PERSISTENCE_KOTLIN_ID,
} from '../../../../src/domain/core/adapters/quarkus-persistence.js';
import { SPRING_PERSISTENCE_KOTLIN_ID } from '../../../../src/domain/core/adapters/spring-persistence.js';
import { MICRONAUT_PERSISTENCE_KOTLIN_ID } from '../../../../src/domain/core/adapters/micronaut-persistence.js';
import {
  patchGreetControllerTest as patchSpringGreetControllerTest,
  SPRING_PERSISTENCE_ID,
} from '../../../../src/domain/core/adapters/spring-persistence.js';
import { MICRONAUT_PERSISTENCE_ID } from '../../../../src/domain/core/adapters/micronaut-persistence.js';
import { GO_PERSISTENCE_ID } from '../../../../src/domain/core/adapters/go-persistence.js';
import { tsLayout } from '../../../../src/domain/core/adapters/ts-module-layout.js';
import {
  BASIC_LAYOUT_TAG,
  MODULITH_LAYOUT_TAG,
  PEER_CONTEXT_TAG,
} from '../../../../src/domain/core/adapters/module-layout.js';
import { RUST_PERSISTENCE_ID } from '../../../../src/domain/core/adapters/rust-persistence.js';
import {
  addPackageDependencies,
  patchMainTs,
  patchServerTs,
  TS_PERSISTENCE_ID,
} from '../../../../src/domain/core/adapters/ts-persistence.js';
import { emptyManifestV2, type ManifestV2 } from '../../../../src/domain/contract/manifest.js';
import { FsTree } from '../../../../src/infrastructure/tree/fs-tree.js';

const read = (tree: FsTree, p: string): string => tree.read(p)?.toString() ?? '';

/**
 * The dependency **keys** of a Cargo manifest, per table.
 *
 * Substring-matching a manifest is how I.4 got an assertion to fail
 * against a correct file: a comment mentioning the very crate the
 * test was proving absent counted as a hit. Reading the keys means a
 * `not.toContain` can only be satisfied by an actual missing edge.
 */
const parseCargoDependencies = (
  manifest: string,
): { dependencies: string[]; devDependencies: string[] } => {
  const tables: Record<string, string[]> = { dependencies: [], devDependencies: [] };
  let current: string[] | null = null;
  for (const raw of manifest.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('[')) {
      current =
        line === '[dependencies]'
          ? tables.dependencies!
          : line === '[dev-dependencies]'
            ? tables.devDependencies!
            : null;
      continue;
    }
    if (current === null || line === '' || line.startsWith('#')) continue;
    const key = /^([A-Za-z0-9_.-]+)\s*=/.exec(line);
    if (key?.[1]) current.push(key[1]);
  }
  return { dependencies: tables.dependencies!, devDependencies: tables.devDependencies! };
};

const QUARKUS_JAVA = [
  'lang.java',
  'runtime.jvm',
  'framework.quarkus',
  'arch.hexagonal',
  'arch.server-http',
];

let cwds: string[] = [];

beforeEach(() => {
  cwds = [];
});

afterEach(async () => {
  await Promise.all(cwds.map((c) => fs.remove(c)));
});

const installChain = async (
  tags: string[],
  {
    devEnv = true,
    observability = false,
    answers = {},
  }: {
    devEnv?: boolean;
    observability?: boolean;
    /** Sticky answers preset before any install, as `--set` would. */
    answers?: Record<string, Record<string, string>>;
  } = {},
): Promise<{ tree: FsTree; cwd: string; manifest: ManifestV2 }> => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-persistence-'));
  cwds.push(cwd);
  const tree = new FsTree(cwd);
  let manifest: ManifestV2 = {
    ...emptyManifestV2('2026-08-11T00:00:00Z', '0.0.0-test'),
    tags,
    answers,
  };
  const deps = {
    tree,
    mode: 'non-interactive' as const,
    prompt: rejectingPrompt,
    logger: new FakeLogger(),
    cwd,
    templates: ejsTemplateSource,
    processes: spawnProcessRunner,
    now: () => '2026-08-11T12:00:00Z',
  };
  const skeleton = await installVertical({ vertical: walkingSkeletonVertical, manifest, ...deps });
  manifest = skeleton.manifest;
  if (devEnv) {
    const dev = await installVertical({ vertical: devEnvVertical, manifest, ...deps });
    manifest = dev.manifest;
  }
  if (observability) {
    const obs = await installVertical({ vertical: observabilityVertical, manifest, ...deps });
    manifest = obs.manifest;
  }
  const persistence = await installVertical({ vertical: persistenceVertical, manifest, ...deps });
  return { tree, cwd, manifest: persistence.manifest };
};

describe('persistence resolution (per-stack adapter by predicate)', () => {
  it('selects the Quarkus adapter plus the language-agnostic siblings on quarkus-rest (Java)', () => {
    const adapters = resolveVertical(persistenceVertical, [...QUARKUS_JAVA, 'pkg.gradle']);
    expect(adapters.map((a) => a.id).sort()).toEqual([
      DATABASE_COMPOSE_ID,
      FLYWAY_MIGRATIONS_ID,
      LIQUIBASE_MIGRATIONS_ID,
      QUARKUS_PERSISTENCE_ID,
    ]);
    // The migrations one-shot patches after the database it gates on.
    expect(adapters.map((a) => a.id).indexOf(FLYWAY_MIGRATIONS_ID)).toBeGreaterThan(
      adapters.map((a) => a.id).indexOf(DATABASE_COMPOSE_ID),
    );
  });

  it.each([
    [
      'spring-rest',
      ['lang.java', 'runtime.jvm', 'framework.spring', 'arch.hexagonal', 'arch.server-http'],
      SPRING_PERSISTENCE_ID,
    ],
    [
      'micronaut-rest',
      ['lang.java', 'runtime.jvm', 'framework.micronaut', 'arch.hexagonal', 'arch.server-http'],
      MICRONAUT_PERSISTENCE_ID,
    ],
    [
      'ts-http',
      ['lang.typescript', 'runtime.node', 'arch.hexagonal', 'arch.server-http', 'pkg.npm'],
      TS_PERSISTENCE_ID,
    ],
    [
      'go-http',
      ['lang.go', 'pkg.go-modules', 'arch.hexagonal', 'arch.server-http'],
      GO_PERSISTENCE_ID,
    ],
    [
      'rust-http',
      ['lang.rust', 'pkg.cargo', 'arch.hexagonal', 'arch.server-http'],
      RUST_PERSISTENCE_ID,
    ],
    [
      'quarkus-rest-kotlin',
      ['lang.kotlin', 'runtime.jvm', 'framework.quarkus', 'arch.hexagonal', 'arch.server-http'],
      QUARKUS_PERSISTENCE_KOTLIN_ID,
    ],
    [
      'spring-rest-kotlin',
      ['lang.kotlin', 'runtime.jvm', 'framework.spring', 'arch.hexagonal', 'arch.server-http'],
      SPRING_PERSISTENCE_KOTLIN_ID,
    ],
    [
      'micronaut-rest-kotlin',
      ['lang.kotlin', 'runtime.jvm', 'framework.micronaut', 'arch.hexagonal', 'arch.server-http'],
      MICRONAUT_PERSISTENCE_KOTLIN_ID,
    ],
  ])('selects the per-stack adapter on %s', (_label, tags, adapterId) => {
    const adapters = resolveVertical(persistenceVertical, tags);
    expect(adapters.map((a) => a.id).sort()).toEqual(
      [DATABASE_COMPOSE_ID, FLYWAY_MIGRATIONS_ID, LIQUIBASE_MIGRATIONS_ID, adapterId].sort(),
    );
  });

  it.each([
    [
      'quarkus-cli (no HTTP shape)',
      ['lang.java', 'runtime.jvm', 'framework.quarkus', 'arch.hexagonal', 'arch.cli'],
    ],
    [
      'web-components (no server, no persistence)',
      ['framework.web-components', 'arch.hexagonal', 'arch.spa', 'pkg.npm'],
    ],
  ])('hard-fails on %s instead of half-installing', (_label, tags) => {
    expect(() => resolveVertical(persistenceVertical, tags)).toThrow(ResolutionError);
  });
});

describe('persistence install on spring-rest and micronaut-rest (Gradle)', () => {
  it('lays the Spring slice: spring-tx unit of work, config profiles, patched tests', async () => {
    const tags = [
      'lang.java',
      'runtime.jvm',
      'framework.spring',
      'arch.hexagonal',
      'arch.server-http',
      'pkg.gradle',
    ];
    const { tree } = await installChain(tags);

    expect(
      tree.exists(
        'infrastructure/unit-of-work/spring-tx/src/main/java/com/example/unitofwork/springtx/SpringTxUnitOfWork.java',
      ),
    ).toBe(true);
    const settings = read(tree, 'settings.gradle.kts');
    expect(settings).toContain('include(":infrastructure:unit-of-work:spring-tx")');
    const executableBuild = read(tree, 'application/rest/executable/build.gradle.kts');
    expect(executableBuild).toContain('org.springframework.boot:spring-boot-starter-jdbc');
    expect(executableBuild).toContain('org.springframework.boot:spring-boot-testcontainers');
    expect(executableBuild).toContain(
      'implementation(project(":infrastructure:unit-of-work:spring-tx"))',
    );
    const properties = read(
      tree,
      'application/rest/executable/src/main/resources/application.properties',
    );
    expect(properties).toContain(
      'spring.datasource.url=${DB_URL:jdbc:postgresql://localhost:5432/walking_skeleton}',
    );
    expect(properties).toContain('spring.flyway.enabled=true');
    expect(
      read(tree, 'application/rest/executable/src/main/resources/application-prod.properties'),
    ).toContain('spring.flyway.enabled=false');
    // Discovery, not rewiring: the handlers carry the domain's marker
    // and Spring's include filter already admits them, so the
    // composition root is left exactly as the skeleton emitted it.
    const recordHandler = read(
      tree,
      'domain/core/src/main/java/com/example/core/greetinglog/RecordGreetingHandler.java',
    );
    expect(recordHandler).toContain('@DomainHandler');
    const config = read(
      tree,
      'application/rest/executable/src/main/java/com/example/rest/MediatorConfig.java',
    );
    expect(config).toContain('mediator(List<Handler<?, ?>> handlers)');
    expect(config).not.toContain('RecordGreetingHandler');
    const greetTest = read(
      tree,
      'application/rest/executable/src/test/java/com/example/rest/GreetControllerTest.java',
    );
    expect(greetTest).toContain('@Import(TestcontainersConfiguration.class)');
    expect(
      tree.exists(
        'application/rest/executable/src/test/java/com/example/rest/GreetingLogControllerTest.java',
      ),
    ).toBe(true);
  });

  it('lays the Micronaut slice: micronaut-tx unit of work, config, patched tests', async () => {
    const tags = [
      'lang.java',
      'runtime.jvm',
      'framework.micronaut',
      'arch.hexagonal',
      'arch.server-http',
      'pkg.gradle',
    ];
    const { tree } = await installChain(tags);

    expect(
      tree.exists(
        'infrastructure/unit-of-work/micronaut-tx/src/main/java/com/example/unitofwork/micronauttx/MicronautTxUnitOfWork.java',
      ),
    ).toBe(true);
    const executableBuild = read(tree, 'application/rest/executable/build.gradle.kts');
    expect(executableBuild).toContain('io.micronaut.data:micronaut-data-tx-jdbc');
    expect(executableBuild).toContain('io.micronaut.flyway:micronaut-flyway');
    const properties = read(
      tree,
      'application/rest/executable/src/main/resources/application.properties',
    );
    expect(properties).toContain(
      'datasources.default.url=${DB_URL:`jdbc:postgresql://localhost:5432/walking_skeleton`}',
    );
    expect(properties).toContain('flyway.datasources.default.enabled=true');
    // Micronaut's @Import does not scan sub-packages, so the new
    // aggregate package is named explicitly; the mediator body itself
    // is untouched.
    const factory = read(
      tree,
      'application/rest/executable/src/main/java/com/example/rest/MediatorFactory.java',
    );
    expect(factory).toContain('"com.example.core.greet", "com.example.core.greetinglog"');
    expect(factory).not.toContain('new ListGreetingsHandler(greetingLog));');
    expect(
      read(
        tree,
        'application/rest/executable/src/test/java/com/example/rest/GreetControllerTest.java',
      ),
    ).toContain('extends PostgresTestFixture');
  });
});

describe('persistence install on quarkus-rest-kotlin (Gradle)', () => {
  it('lays the Kotlin slice: kotlin trees, rewired composition root, patched config', async () => {
    const tags = [
      'lang.kotlin',
      'runtime.jvm',
      'framework.quarkus',
      'arch.hexagonal',
      'arch.server-http',
      'pkg.gradle',
    ];
    const { tree } = await installChain(tags);

    expect(tree.exists('domain/contract/src/main/kotlin/com/example/contract/UnitOfWork.kt')).toBe(
      true,
    );
    expect(
      tree.exists(
        'infrastructure/unit-of-work/jta/src/main/kotlin/com/example/unitofwork/jta/JtaUnitOfWork.kt',
      ),
    ).toBe(true);
    expect(
      tree.exists(
        'infrastructure/greeting-log/jdbc/src/test/kotlin/com/example/greetinglog/jdbc/JdbcGreetingLogTest.kt',
      ),
    ).toBe(true);
    const recordHandler = read(
      tree,
      'domain/core/src/main/kotlin/com/example/core/greetinglog/RecordGreetingHandler.kt',
    );
    expect(recordHandler).toContain('@DomainHandler');
    const producer = read(
      tree,
      'application/rest/executable/src/main/kotlin/com/example/rest/MediatorProducer.kt',
    );
    expect(producer).toContain('fun mediator(handlers: Instance<Handler<*, *>>): Mediator');
    expect(producer).not.toContain('RecordGreetingHandler');
    expect(read(tree, 'settings.gradle.kts')).toContain(
      'include(":infrastructure:unit-of-work:jta")',
    );
    expect(
      read(tree, 'application/rest/executable/src/main/resources/application.properties'),
    ).toContain('quarkus.datasource.db-kind=postgresql');
  });
});

describe('persistence install on go-http', () => {
  it('lays the Go slice: ports, pgx adapters, fakes, decorator, patched main', async () => {
    const tags = ['lang.go', 'pkg.go-modules', 'arch.hexagonal', 'arch.server-http'];
    const { tree } = await installChain(tags);

    expect(tree.exists('internal/domain/unitofwork.go')).toBe(true);
    expect(tree.exists('internal/domain/greetinglog.go')).toBe(true);
    expect(tree.exists('internal/infra/postgres/postgres.go')).toBe(true);
    expect(tree.exists('internal/infra/greetinglogfake/greetinglog.go')).toBe(true);
    expect(tree.exists('internal/infra/uowfake/uow.go')).toBe(true);
    expect(read(tree, 'internal/app/resthttp/greetings.go')).toContain('func WithGreetings(');
    const main = read(tree, 'cmd/http/main.go');
    expect(main).toContain('postgres.NewPool(context.Background())');
    expect(main).toContain('resthttp.WithGreetings(resthttp.NewHandler(greeter), greetings)');
    expect(main).toContain('"context"');
    expect(read(tree, 'internal/infra/postgres/postgres.go')).toContain(
      'postgres://app:app@localhost:5432/walking_skeleton',
    );
    expect(read(tree, 'internal/infra/postgres/postgres_test.go')).toContain(
      'testcontainers-go/modules/postgres',
    );
  });

  it('wires the persistence slice into the observability-shaped main too', async () => {
    const tags = ['lang.go', 'pkg.go-modules', 'arch.hexagonal', 'arch.server-http'];
    const { tree } = await installChain(tags, { observability: true });
    const main = read(tree, 'cmd/http/main.go');
    expect(main).toContain('resthttp.WithGreetings(resthttp.NewHandler(greeter), greetings)');
    expect(main).toContain('observability.RequestContext');
    expect(main.match(/"context"/g)?.length).toBe(1);
  });
});

describe('persistence install on rust-http', () => {
  it('lays the Rust slice: ports, postgres adapters, fakes, stitched modules, patched main', async () => {
    const tags = ['lang.rust', 'pkg.cargo', 'arch.hexagonal', 'arch.server-http'];
    const { tree } = await installChain(tags);

    expect(tree.exists('src/domain/greeting_log.rs')).toBe(true);
    expect(tree.exists('src/domain/unit_of_work.rs')).toBe(true);
    expect(tree.exists('src/infra/postgres.rs')).toBe(true);
    expect(read(tree, 'src/domain.rs')).toContain('pub mod greeting_log;');
    expect(read(tree, 'src/infra.rs')).toContain('pub mod postgres;');
    const cargo = read(tree, 'Cargo.toml');
    expect(cargo).toContain('postgres = "0.19"');
    expect(cargo).toContain('testcontainers-modules');
    const main = read(tree, 'src/bin/http/main.rs');
    expect(main).toContain('mod greetings;');
    expect(main).toContain('postgres::connect()');
    expect(main).toContain('handler::router(greeter).merge(greetings::router(greetings))');
    expect(read(tree, 'src/infra/postgres.rs')).toContain(
      'postgres://app:app@localhost:5432/walking_skeleton',
    );
  });
});

describe('persistence install on rust-http under the modulith', () => {
  const tags = [
    'lang.rust',
    'pkg.cargo',
    'arch.hexagonal',
    'arch.server-http',
    MODULITH_LAYOUT_TAG,
  ];
  const CONTEXT = 'modules/greeting';
  const CONTRACT = `${CONTEXT}/domain/contract`;
  const INFRA = `${CONTEXT}/infra/postgres`;

  it('files each half of the slice with the crate that owns it', async () => {
    const { tree } = await installChain(tags);

    // Ports on the contract face; adapters and their fakes in a crate
    // of their own; a context-free clock in the kernel. An adapter
    // emitted at the wrong crate's path still renders, so the homes
    // are the assertion.
    expect(tree.exists(`${CONTRACT}/src/greeting_log.rs`)).toBe(true);
    expect(tree.exists(`${CONTRACT}/src/unit_of_work.rs`)).toBe(true);
    expect(tree.exists(`${INFRA}/src/postgres.rs`)).toBe(true);
    expect(tree.exists(`${INFRA}/src/greeting_log_fake.rs`)).toBe(true);
    expect(tree.exists(`${INFRA}/src/uow_fake.rs`)).toBe(true);
    expect(tree.exists('platform/kernel/src/clock_sys.rs')).toBe(true);
    expect(tree.exists(`${CONTRACT}/tests/greeting_log.rs`)).toBe(true);
    expect(tree.exists('application/http/src/greetings.rs')).toBe(true);
    // None of the flat-layout homes exist under a workspace.
    expect(tree.exists('src/infra/postgres.rs')).toBe(false);
    expect(tree.exists('src/domain/greeting_log.rs')).toBe(false);
  });

  it('registers the new crate and gives every module the use path its position implies', async () => {
    const { tree } = await installChain(tags);

    expect(read(tree, 'Cargo.toml')).toContain(`"${INFRA}",`);
    expect(read(tree, `${INFRA}/src/lib.rs`)).toContain('pub mod postgres;');
    expect(read(tree, `${CONTRACT}/src/lib.rs`)).toContain('pub mod greeting_log;');
    expect(read(tree, 'platform/kernel/src/lib.rs')).toContain('pub mod clock_sys;');
    // The contract face reaches the Clock across a crate boundary now.
    expect(read(tree, `${CONTRACT}/src/greeting_log.rs`)).toContain('use platform_kernel::Clock;');
    expect(read(tree, `${INFRA}/src/postgres.rs`)).toContain('use greeting_domain_contract::{');
    expect(read(tree, 'platform/kernel/src/clock_sys.rs')).toContain('use crate::clock::Clock;');
    // Cargo runs a test from its package root, so the crate's own
    // depth is what the path to the project's migrations must climb.
    expect(read(tree, `${INFRA}/src/postgres.rs`)).toContain('"../../../../migrations/sql"');
  });

  it('puts each dependency on the crate that compiles against it, and nowhere else', async () => {
    const { tree } = await installChain(tags);

    const infra = parseCargoDependencies(read(tree, `${INFRA}/Cargo.toml`));
    expect(infra.dependencies).toContain('postgres');
    expect(infra.dependencies).toContain('greeting-domain-contract');
    expect(infra.devDependencies).toContain('testcontainers-modules');

    // The driver belongs to the adapter crate. On the workspace root
    // or the contract face it would reach every crate that names the
    // domain, which is the coupling the layout is bought to prevent.
    expect(parseCargoDependencies(read(tree, 'Cargo.toml')).dependencies).not.toContain('postgres');
    const contract = parseCargoDependencies(read(tree, `${CONTRACT}/Cargo.toml`));
    expect(contract.dependencies).not.toContain('postgres');
    expect(contract.dependencies).toContain('platform-kernel');
    // The fakes its integration test wires live with the adapter, so
    // the edge back is a dev-dependency and stays out of the library.
    expect(contract.devDependencies).toContain('greeting-infra-postgres');

    const assembly = parseCargoDependencies(read(tree, 'application/http/Cargo.toml'));
    expect(assembly.dependencies).toContain('greeting-infra-postgres');
    expect(assembly.dependencies).toContain('platform-kernel');
    // Only the assembly formats a timestamp for the wire.
    expect(assembly.dependencies).toContain('humantime');
    expect(infra.dependencies).not.toContain('humantime');
  });

  it('merges the greetings router into the assembly rather than leaving it unbound', async () => {
    const { tree } = await installChain(tags);

    const main = read(tree, 'application/http/src/main.rs');
    expect(main).toContain('mod greetings;');
    expect(main).toContain('use greeting_infra_postgres::postgres;');
    expect(main).toContain('use platform_kernel::clock_sys;');
    expect(main).toContain('handler::router(greeter).merge(greetings::router(greetings))');
  });

  it('adds no second platform-kernel entry when the peer context already declared one', async () => {
    const { tree } = await installChain([...tags, PEER_CONTEXT_TAG]);

    const assembly = read(tree, 'application/http/Cargo.toml');
    // Two entries under one key is a manifest Cargo rejects outright.
    expect(assembly.match(/^platform-kernel = /gm)).toHaveLength(1);
  });
});

describe('persistence install on ts-http (npm)', () => {
  it('lays the TS slice: workspace packages, barrel exports, server + main wiring', async () => {
    const tags = [
      'lang.typescript',
      'runtime.node',
      'arch.hexagonal',
      'arch.server-http',
      'pkg.npm',
    ];
    const { tree } = await installChain(tags);

    expect(tree.exists('domain/contract/src/unit-of-work.ts')).toBe(true);
    expect(read(tree, 'domain/contract/src/index.ts')).toContain(
      "export * from './greeting-log.ts';",
    );
    expect(read(tree, 'domain/core/src/index.ts')).toContain('greeting-log-handlers');
    expect(tree.exists('infrastructure/greeting-log/src/pg-greeting-log.ts')).toBe(true);
    expect(tree.exists('infrastructure/unit-of-work/src/pg-unit-of-work.ts')).toBe(true);
    const restPackage = read(tree, 'application/rest/package.json');
    expect(restPackage).toContain('"@acme/infrastructure-greeting-log": "*"');
    expect(restPackage).toContain('"@acme/infrastructure-unit-of-work": "*"');
    const server = read(tree, 'application/rest/src/server.ts');
    expect(server).toContain("if (url.pathname === '/greetings') {");
    const main = read(tree, 'application/rest/src/main.ts');
    expect(main).toContain(
      'createRecordGreetingHandler(greetingLog, systemClock, createPgUnitOfWork(pool))',
    );
    expect(read(tree, 'infrastructure/unit-of-work/src/pool.ts')).toContain(
      'postgres://app:app@localhost:5432/walking_skeleton',
    );
    // The SQL adapter's contract test ships Testcontainers-backed.
    expect(read(tree, 'infrastructure/greeting-log/tests/pg-greeting-log.test.ts')).toContain(
      'PostgreSqlContainer',
    );
    const compose = read(tree, 'dev/compose.yaml');
    expect(compose).toContain('image: postgres:18-alpine');
    expect(compose).toContain('build: ../migrations');
  });
});

describe('persistence install on quarkus-rest (Gradle)', () => {
  it('lays the full slice: ports, adapters, fakes, wiring, config, migrations, compose', async () => {
    const { tree } = await installChain([...QUARKUS_JAVA, 'pkg.gradle']);

    // Ports in domain/contract, adapters + fakes under infrastructure/.
    expect(tree.exists('domain/contract/src/main/java/com/example/contract/UnitOfWork.java')).toBe(
      true,
    );
    expect(
      tree.exists(
        'domain/contract/src/main/java/com/example/contract/greetinglog/GreetingLog.java',
      ),
    ).toBe(true);
    expect(
      tree.exists(
        'infrastructure/greeting-log/jdbc/src/main/java/com/example/greetinglog/jdbc/JdbcGreetingLog.java',
      ),
    ).toBe(true);
    expect(
      tree.exists(
        'infrastructure/greeting-log/fake/src/main/java/com/example/greetinglog/fake/FakeGreetingLog.java',
      ),
    ).toBe(true);
    expect(
      tree.exists(
        'infrastructure/unit-of-work/jta/src/main/java/com/example/unitofwork/jta/JtaUnitOfWork.java',
      ),
    ).toBe(true);
    expect(
      tree.exists(
        'infrastructure/unit-of-work/fake/src/main/java/com/example/unitofwork/fake/FakeUnitOfWork.java',
      ),
    ).toBe(true);

    // The Testcontainers contract test ships with the JDBC adapter.
    const jdbcTest = read(
      tree,
      'infrastructure/greeting-log/jdbc/src/test/java/com/example/greetinglog/jdbc/JdbcGreetingLogTest.java',
    );
    expect(jdbcTest).toContain('@Testcontainers(disabledWithoutDocker = true)');
    expect(jdbcTest).toContain('filesystem:../../../migrations/sql');

    // Modules registered and dependencies patched (Gradle).
    const settings = read(tree, 'settings.gradle.kts');
    expect(settings).toContain('include(":infrastructure:greeting-log:jdbc")');
    expect(settings).toContain('include(":infrastructure:unit-of-work:fake")');
    const executableBuild = read(tree, 'application/rest/executable/build.gradle.kts');
    expect(executableBuild).toContain('io.quarkus:quarkus-jdbc-postgresql');
    expect(executableBuild).toContain('io.quarkus:quarkus-flyway');
    expect(executableBuild).toContain('org.flywaydb:flyway-database-postgresql');
    expect(executableBuild).toContain(
      'implementation(project(":infrastructure:greeting-log:jdbc"))',
    );
    expect(executableBuild).toContain(
      'implementation(project(":infrastructure:unit-of-work:jta"))',
    );
    const coreBuild = read(tree, 'domain/core/build.gradle.kts');
    expect(coreBuild).toContain('testImplementation(project(":infrastructure:greeting-log:fake"))');
    expect(coreBuild).toContain('testImplementation(project(":infrastructure:clock:fake"))');

    // Runtime config: env-only prod, compose db in dev, Dev Services
    // in test, migrations disabled outside dev/test.
    const properties = read(
      tree,
      'application/rest/executable/src/main/resources/application.properties',
    );
    expect(properties).toContain('quarkus.datasource.db-kind=postgresql');
    expect(properties).toContain('%prod.quarkus.datasource.jdbc.url=${DB_URL}');
    expect(properties).toContain(
      '%dev.quarkus.datasource.jdbc.url=jdbc:postgresql://localhost:5432/walking_skeleton',
    );
    expect(properties).toContain('quarkus.flyway.migrate-at-start=false');
    expect(properties).toContain('%test.quarkus.flyway.migrate-at-start=true');
    expect(properties).toContain('quarkus.datasource.health.enabled=true');
    expect(properties).not.toContain('quarkus.datasource.jdbc.telemetry=true');

    // The composition root is NOT rewired: the handlers carry
    // @DomainHandler and PersistenceProducer already exposes their
    // ports as beans, so ArC discovers the whole slice.
    const recordHandler = read(
      tree,
      'domain/core/src/main/java/com/example/core/greetinglog/RecordGreetingHandler.java',
    );
    expect(recordHandler).toContain('@DomainHandler');
    const producer = read(
      tree,
      'application/rest/executable/src/main/java/com/example/rest/MediatorProducer.java',
    );
    expect(producer).toContain('mediator(Instance<Handler<?, ?>> handlers)');
    expect(producer).not.toContain('RecordGreetingHandler');

    // The isolated migrations unit.
    expect(read(tree, 'migrations/sql/V1__create_greeting.sql')).toContain('create table greeting');
    const dockerfile = read(tree, 'migrations/Dockerfile');
    expect(dockerfile).toContain('FROM flyway/flyway:13-alpine');
    expect(dockerfile).toContain('CMD ["migrate"]');
    expect(read(tree, 'migrations/README.md')).toContain('walking-skeleton-migrations');

    // Compose: database + healthcheck-gated one-shot + volume.
    const compose = read(tree, 'dev/compose.yaml');
    expect(compose).toContain('db:');
    expect(compose).toContain('image: postgres:18-alpine');
    expect(compose).toContain('POSTGRES_DB: walking_skeleton');
    expect(compose).toContain('pg_isready -U app -d walking_skeleton');
    expect(compose).toContain('build: ../migrations');
    expect(compose).toContain('FLYWAY_URL: jdbc:postgresql://db:5432/walking_skeleton');
    expect(compose).toContain('condition: service_healthy');
    expect(compose).toMatch(/volumes:\n {2}db-data:/);

    // README sections and the REST slice.
    const readme = read(tree, 'README.md');
    expect(readme).toContain('### Persistence');
    expect(readme).toContain('### Database');
    expect(
      tree.exists(
        'application/rest/executable/src/main/java/com/example/rest/GreetingLogResource.java',
      ),
    ).toBe(true);
    expect(
      tree.exists(
        'application/rest/executable/src/main/java/com/example/rest/PersistenceProducer.java',
      ),
    ).toBe(true);
  });

  it('records the capability tags on the manifest', async () => {
    const { manifest } = await installChain([...QUARKUS_JAVA, 'pkg.gradle']);
    expect(manifest.tags).toContain('db.postgres');
    expect(manifest.tags).toContain('db.migrations.flyway');
    expect(manifest.verticals.map((v) => v.id)).toContain('persistence');
  });

  it('turns JDBC telemetry on when the observability vertical is already installed', async () => {
    const { tree } = await installChain([...QUARKUS_JAVA, 'pkg.gradle'], { observability: true });
    const properties = read(
      tree,
      'application/rest/executable/src/main/resources/application.properties',
    );
    expect(properties).toContain('quarkus.datasource.jdbc.telemetry=true');
  });

  it('creates dev/compose.yaml from the seed when dev-env is absent', async () => {
    const { tree } = await installChain([...QUARKUS_JAVA, 'pkg.gradle'], { devEnv: false });
    const compose = read(tree, 'dev/compose.yaml');
    expect(compose).toContain('name: walking-skeleton-dev');
    expect(compose).toContain('db:');
    expect(compose).toContain('migrations:');
    expect(compose).not.toContain('services: {}');
  });
});

describe('persistence install on quarkus-rest (Maven)', () => {
  it('registers the modules and dependencies through the poms', async () => {
    const { tree } = await installChain([...QUARKUS_JAVA, 'pkg.maven']);

    const rootPom = read(tree, 'pom.xml');
    expect(rootPom).toContain('<module>infrastructure/greeting-log/jdbc</module>');
    expect(rootPom).toContain('<module>infrastructure/unit-of-work/fake</module>');
    const executablePom = read(tree, 'application/rest/executable/pom.xml');
    expect(executablePom).toContain('<artifactId>quarkus-jdbc-postgresql</artifactId>');
    expect(executablePom).toContain('<artifactId>quarkus-flyway</artifactId>');
    expect(executablePom).toContain('<artifactId>infrastructure-greeting-log-jdbc</artifactId>');
    expect(executablePom).toContain('<artifactId>infrastructure-unit-of-work-jta</artifactId>');
    const corePom = read(tree, 'domain/core/pom.xml');
    expect(corePom).toContain('<artifactId>infrastructure-greeting-log-fake</artifactId>');
    expect(corePom).toContain('<artifactId>infrastructure-clock-fake</artifactId>');
    expect(corePom).toContain('<scope>test</scope>');
    expect(tree.exists('infrastructure/greeting-log/jdbc/pom.xml')).toBe(true);
    expect(tree.exists('infrastructure/unit-of-work/jta/pom.xml')).toBe(true);
  });
});

const BASIC_LAYOUT = jvmLayout([]);
const MODULITH_LAYOUT = jvmLayout([MODULITH_LAYOUT_TAG]);

describe('persistence patch helpers', () => {
  it('names the new aggregate package in @Import once and only once', () => {
    const original = `@Factory
@Import(
    packages = "com.example.core.greet",
    annotated = "com.example.contract.DomainHandler")
public class MediatorFactory {
}
`;
    const patched = patchMicronautImportPackages(
      'persistence/micronaut-persistence',
      'com.example',
      BASIC_LAYOUT,
    )(original);
    expect(patched).toContain('"com.example.core.greet", "com.example.core.greetinglog"');
    expect(
      patchMicronautImportPackages(
        'persistence/micronaut-persistence',
        'com.example',
        BASIC_LAYOUT,
      )(patched),
    ).toBe(patched);
  });

  it('names the manual fix when the @Import list drifted from the skeleton shape', () => {
    expect(() =>
      patchMicronautImportPackages(
        'persistence/micronaut-persistence',
        'com.example',
        BASIC_LAYOUT,
      )('public class Custom {}'),
    ).toThrow(/add "com\.example\.core\.greetinglog" to the @Import packages/);
  });

  it('merges package.json dependencies without clobbering existing entries', () => {
    const pkg = JSON.stringify({ name: 'x', dependencies: { pg: '^8.0.0' } }, null, 2);
    const patched = addPackageDependencies(pkg, 'dependencies', {
      pg: '^9.9.9',
      '@acme/infrastructure-unit-of-work': '*',
    });
    const parsed = JSON.parse(patched) as { dependencies: Record<string, string> };
    expect(parsed.dependencies['pg']).toBe('^8.0.0');
    expect(parsed.dependencies['@acme/infrastructure-unit-of-work']).toBe('*');
    expect(addPackageDependencies(patched, 'dependencies', { pg: '^9.9.9' })).toBe(patched);
  });

  it('names the manual fix when the TS anchors drifted', () => {
    // Both anchors are layout-derived — the package the assembly
    // imports the domain from is the whole difference between them —
    // so the guard is exercised under each layout rather than one.
    for (const tag of [BASIC_LAYOUT_TAG, MODULITH_LAYOUT_TAG]) {
      const layout = tsLayout([tag], 'acme');
      expect(() => patchServerTs(layout)('const custom = true;')).toThrow(/route '\/greetings'/);
      expect(() => patchMainTs(layout)('const custom = true;')).toThrow(
        /wire createRecordGreetingHandler/,
      );
    }
  });

  it('patches the Spring boot test once and only once', () => {
    const original = `import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class GreetControllerTest {
}
`;
    const patched = patchSpringGreetControllerTest(original);
    expect(patched).toContain('@Import(TestcontainersConfiguration.class)');
    expect(patchSpringGreetControllerTest(patched)).toBe(patched);
  });

  it('keeps the telemetry line out of the properties block until observability is installed', () => {
    expect(persistencePropertiesBlock('app_db', false, BASIC_LAYOUT, POSTGRES)).not.toContain(
      'quarkus.datasource.jdbc.telemetry',
    );
    expect(persistencePropertiesBlock('app_db', true, BASIC_LAYOUT, POSTGRES)).toContain(
      'quarkus.datasource.jdbc.telemetry=true',
    );
    expect(persistencePropertiesBlock('app_db', true, BASIC_LAYOUT, POSTGRES)).toContain(
      'jdbc:postgresql://localhost:5432/app_db',
    );
    // The assembly sits three directories deep under `basic` and two
    // under the modulith, so Flyway's filesystem location follows.
    expect(persistencePropertiesBlock('app_db', false, BASIC_LAYOUT, POSTGRES)).toContain(
      'filesystem:../../../migrations/sql',
    );
    expect(persistencePropertiesBlock('app_db', false, MODULITH_LAYOUT, POSTGRES)).toContain(
      'filesystem:../../migrations/sql',
    );
  });
});

describe('the persistence dials (engine + migrations tool)', () => {
  it('declares both dials as sticky questions on database-compose', () => {
    const questions = databaseComposeAdapter.questions ?? [];
    expect(questions.map((q) => q.id)).toEqual(['engine', 'migrations']);
    expect(questions.every((q) => q.memory === 'sticky')).toBe(true);
    expect(questions.map((q) => q.default)).toEqual(['postgres', 'flyway']);
  });

  it('threads mariadb through the whole Quarkus slice', async () => {
    const { tree, manifest } = await installChain([...QUARKUS_JAVA, 'pkg.gradle'], {
      answers: { [DATABASE_COMPOSE_ID]: { engine: 'mariadb' } },
    });

    // Runtime config: db-kind, Dev Services image and the %dev url
    // all follow the dial.
    const properties = read(
      tree,
      'application/rest/executable/src/main/resources/application.properties',
    );
    expect(properties).toContain('quarkus.datasource.db-kind=mariadb');
    expect(properties).toContain('quarkus.datasource.devservices.image-name=mariadb:12');
    expect(properties).toContain(
      '%dev.quarkus.datasource.jdbc.url=jdbc:mariadb://localhost:3306/walking_skeleton',
    );

    // The build follows: driver + Flyway database module, in the
    // assembly and in the JDBC module's own test dependencies.
    const executableBuild = read(tree, 'application/rest/executable/build.gradle.kts');
    expect(executableBuild).toContain('io.quarkus:quarkus-jdbc-mariadb');
    expect(executableBuild).toContain('org.flywaydb:flyway-mysql');
    expect(executableBuild).not.toContain('flyway-database-postgresql');
    const jdbcBuild = read(tree, 'infrastructure/greeting-log/jdbc/build.gradle.kts');
    expect(jdbcBuild).toContain('org.mariadb.jdbc:mariadb-java-client:3.5.10');
    expect(jdbcBuild).toContain('org.testcontainers:mariadb:1.21.4');
    expect(jdbcBuild).toContain('org.flywaydb:flyway-mysql:13.3.0');

    // The contract test and the Testcontainers image follow the
    // chosen engine, per the dial's contract.
    const jdbcTest = read(
      tree,
      'infrastructure/greeting-log/jdbc/src/test/java/com/example/greetinglog/jdbc/JdbcGreetingLogTest.java',
    );
    expect(jdbcTest).toContain('new MariaDBContainer<>("mariadb:12")');
    expect(jdbcTest).toContain('import org.mariadb.jdbc.MariaDbDataSource;');
    expect(jdbcTest).toContain('statement.execute("truncate table greeting")');
    expect(jdbcTest).not.toContain('restart identity');

    // The adapter's time mapping and the schema speak the dialect.
    const jdbcAdapter = read(
      tree,
      'infrastructure/greeting-log/jdbc/src/main/java/com/example/greetinglog/jdbc/JdbcGreetingLog.java',
    );
    expect(jdbcAdapter).toContain('Timestamp.from(greetedAt)');
    expect(jdbcAdapter).not.toContain('OffsetDateTime');
    const migration = read(tree, 'migrations/sql/V1__create_greeting.sql');
    expect(migration).toContain('bigint auto_increment primary key');
    expect(migration).toContain('datetime(6) not null');

    // The dev environment follows: container, env dialect,
    // healthcheck, data dir, and the one-shot's JDBC url.
    const compose = read(tree, 'dev/compose.yaml');
    expect(compose).toContain('image: mariadb:12');
    expect(compose).toContain('MARIADB_DATABASE: walking_skeleton');
    expect(compose).toContain('MARIADB_RANDOM_ROOT_PASSWORD');
    expect(compose).toContain('healthcheck.sh');
    expect(compose).toContain('db-data:/var/lib/mysql');
    expect(compose).toContain('FLYWAY_URL: jdbc:mariadb://db:3306/walking_skeleton');

    // The choice is recorded: capability tag + sticky memory.
    expect(manifest.tags).toContain('db.mariadb');
    expect(manifest.tags).not.toContain('db.postgres');
    expect(manifest.answers[DATABASE_COMPOSE_ID]?.['engine']).toBe('mariadb');
  });

  it("threads mariadb through Spring's Testcontainers config and driver deps", async () => {
    const tags = [
      'lang.java',
      'runtime.jvm',
      'framework.spring',
      'arch.hexagonal',
      'arch.server-http',
      'pkg.gradle',
    ];
    const { tree } = await installChain(tags, {
      answers: { [DATABASE_COMPOSE_ID]: { engine: 'mariadb' } },
    });

    const executableBuild = read(tree, 'application/rest/executable/build.gradle.kts');
    expect(executableBuild).toContain('runtimeOnly("org.mariadb.jdbc:mariadb-java-client")');
    expect(executableBuild).toContain('org.testcontainers:mariadb:1.21.4');
    const tcConfig = read(
      tree,
      'application/rest/executable/src/test/java/com/example/rest/TestcontainersConfiguration.java',
    );
    expect(tcConfig).toContain('new MariaDBContainer<>("mariadb:12")');
    expect(
      read(tree, 'application/rest/executable/src/main/resources/application.properties'),
    ).toContain('spring.datasource.url=${DB_URL:jdbc:mariadb://localhost:3306/walking_skeleton}');
  });

  it("threads mariadb through Micronaut's fixture and driver class", async () => {
    const tags = [
      'lang.java',
      'runtime.jvm',
      'framework.micronaut',
      'arch.hexagonal',
      'arch.server-http',
      'pkg.gradle',
    ];
    const { tree } = await installChain(tags, {
      answers: { [DATABASE_COMPOSE_ID]: { engine: 'mariadb' } },
    });

    const properties = read(
      tree,
      'application/rest/executable/src/main/resources/application.properties',
    );
    expect(properties).toContain('datasources.default.driver-class-name=org.mariadb.jdbc.Driver');
    // The fixture is named per engine, and the patched walking-
    // skeleton test extends the one that was emitted.
    const fixture = read(
      tree,
      'application/rest/executable/src/test/java/com/example/rest/MariaDbTestFixture.java',
    );
    expect(fixture).toContain('abstract class MariaDbTestFixture');
    expect(fixture).toContain('new MariaDBContainer<>("mariadb:12")');
    expect(
      read(
        tree,
        'application/rest/executable/src/test/java/com/example/rest/GreetControllerTest.java',
      ),
    ).toContain('extends MariaDbTestFixture');
  });

  it('renders the Kotlin trees under mariadb too (the templates branch per engine)', async () => {
    const tags = [
      'lang.kotlin',
      'runtime.jvm',
      'framework.quarkus',
      'arch.hexagonal',
      'arch.server-http',
      'pkg.gradle',
    ];
    const { tree } = await installChain(tags, {
      answers: { [DATABASE_COMPOSE_ID]: { engine: 'mariadb' } },
    });

    const jdbcTest = read(
      tree,
      'infrastructure/greeting-log/jdbc/src/test/kotlin/com/example/greetinglog/jdbc/JdbcGreetingLogTest.kt',
    );
    expect(jdbcTest).toContain('MariaDBContainer("mariadb:12")');
    expect(jdbcTest).toContain('import org.mariadb.jdbc.MariaDbDataSource');
    const jdbcAdapter = read(
      tree,
      'infrastructure/greeting-log/jdbc/src/main/kotlin/com/example/greetinglog/jdbc/JdbcGreetingLog.kt',
    );
    expect(jdbcAdapter).toContain('Timestamp.from(greetedAt)');
    expect(jdbcAdapter).not.toContain('OffsetDateTime');
  });

  it('refuses a non-postgres engine where the driver is postgres-only', async () => {
    await expect(
      installChain(['lang.go', 'pkg.go-modules', 'arch.hexagonal', 'arch.server-http'], {
        answers: { [DATABASE_COMPOSE_ID]: { engine: 'mariadb' } },
      }),
    ).rejects.toThrow(/served on the JVM stacks only/);
  });

  it('lays the Liquibase migrations unit on ts-http when the dial says so', async () => {
    const tags = [
      'lang.typescript',
      'runtime.node',
      'arch.hexagonal',
      'arch.server-http',
      'pkg.npm',
    ];
    const { tree, manifest } = await installChain(tags, {
      answers: { [DATABASE_COMPOSE_ID]: { migrations: 'liquibase' } },
    });

    // The runner unit is Liquibase-shaped, wrapping the same SQL.
    const dockerfile = read(tree, 'migrations/Dockerfile');
    expect(dockerfile).toContain('FROM liquibase/liquibase:5.0-alpine');
    expect(dockerfile).toContain('CMD ["update"]');
    const changelog = read(tree, 'migrations/changelog.yaml');
    expect(changelog).toContain('sqlFile');
    expect(changelog).toContain('path: sql/V1__create_greeting.sql');
    const migration = read(tree, 'migrations/sql/V1__create_greeting.sql');
    expect(migration).toContain('timestamptz not null');

    // The one-shot follows the tool; nothing Flyway-shaped remains.
    const compose = read(tree, 'dev/compose.yaml');
    expect(compose).toContain('LIQUIBASE_COMMAND_URL: jdbc:postgresql://db:5432/walking_skeleton');
    expect(compose).not.toContain('FLYWAY_URL');
    expect(read(tree, 'README.md')).toContain('Liquibase');

    // The choice is recorded — and the Flyway adapter stood down.
    expect(manifest.tags).toContain('db.migrations.liquibase');
    expect(manifest.tags).not.toContain('db.migrations.flyway');
    expect(manifest.answers[DATABASE_COMPOSE_ID]?.['migrations']).toBe('liquibase');
  });

  it('refuses liquibase on a JVM stack, naming the Flyway-wired replay', async () => {
    await expect(
      installChain([...QUARKUS_JAVA, 'pkg.gradle'], {
        answers: { [DATABASE_COMPOSE_ID]: { migrations: 'liquibase' } },
      }),
    ).rejects.toThrow(/Flyway integration/);
  });

  it('keeps the two engine spec records disjoint where the adapters branch', () => {
    // A second engine is one spec record; these are the fields the
    // adapters and templates read, so a new engine that forgets one
    // fails here rather than in an emitted project.
    for (const engine of [POSTGRES, MARIADB]) {
      expect(engine.jdbcUrl('h', 'd')).toContain(`:${engine.port}/d`);
      expect(engine.composeEnv('d')).toContain('d');
      expect(engine.healthcheckTest('d')).toMatch(/^\["CMD/);
      expect(engine.sql.truncateGreeting).toContain('truncate table greeting');
    }
    expect(MARIADB.quarkusDbKind).toBe('mariadb');
    expect(MARIADB.flywayModule.artifactId).toBe('flyway-mysql');
    expect(MARIADB.testcontainers.containerClass).toBe('MariaDBContainer');
  });
});
