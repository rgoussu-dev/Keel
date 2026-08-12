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
import { FLYWAY_MIGRATIONS_ID } from '../../../../src/domain/core/adapters/flyway-migrations.js';
import {
  patchMediatorProducer,
  persistencePropertiesBlock,
  QUARKUS_PERSISTENCE_ID,
} from '../../../../src/domain/core/adapters/quarkus-persistence.js';
import { emptyManifestV2, type ManifestV2 } from '../../../../src/domain/contract/manifest.js';
import { FsTree } from '../../../../src/infrastructure/tree/fs-tree.js';

const read = (tree: FsTree, p: string): string => tree.read(p)?.toString() ?? '';

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
  { devEnv = true, observability = false }: { devEnv?: boolean; observability?: boolean } = {},
): Promise<{ tree: FsTree; cwd: string; manifest: ManifestV2 }> => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-persistence-'));
  cwds.push(cwd);
  const tree = new FsTree(cwd);
  let manifest: ManifestV2 = {
    ...emptyManifestV2('2026-08-11T00:00:00Z', '0.0.0-test'),
    tags,
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
      QUARKUS_PERSISTENCE_ID,
    ]);
    // The migrations one-shot patches after the database it gates on.
    expect(adapters.map((a) => a.id).indexOf(FLYWAY_MIGRATIONS_ID)).toBeGreaterThan(
      adapters.map((a) => a.id).indexOf(DATABASE_COMPOSE_ID),
    );
  });

  it.each([
    [
      'spring-rest (no Spring adapter yet)',
      ['lang.java', 'runtime.jvm', 'framework.spring', 'arch.hexagonal', 'arch.server-http'],
    ],
    [
      'quarkus-rest-kotlin (no Kotlin twin yet)',
      ['lang.kotlin', 'runtime.jvm', 'framework.quarkus', 'arch.hexagonal', 'arch.server-http'],
    ],
    ['go-http', ['lang.go', 'arch.hexagonal', 'arch.server-http', 'pkg.go-modules']],
    [
      'quarkus-cli (no HTTP shape)',
      ['lang.java', 'runtime.jvm', 'framework.quarkus', 'arch.hexagonal', 'arch.cli'],
    ],
  ])('hard-fails on %s instead of half-installing', (_label, tags) => {
    expect(() => resolveVertical(persistenceVertical, tags)).toThrow(ResolutionError);
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

    // Composition root rewired with the new handlers.
    const producer = read(
      tree,
      'application/rest/executable/src/main/java/com/example/rest/MediatorProducer.java',
    );
    expect(producer).toContain(
      'public Mediator mediator(GreetingLog greetingLog, Clock clock, UnitOfWork unitOfWork) {',
    );
    expect(producer).toContain('new RecordGreetingHandler(greetingLog, clock, unitOfWork)');
    expect(producer).toContain('new ListGreetingsHandler(greetingLog));');

    // The isolated migrations unit.
    expect(read(tree, 'migrations/sql/V1__create_greeting.sql')).toContain('create table greeting');
    const dockerfile = read(tree, 'migrations/Dockerfile');
    expect(dockerfile).toContain('FROM flyway/flyway:11-alpine');
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

describe('persistence patch helpers', () => {
  it('rewires the template-shaped MediatorProducer once and only once', () => {
    const original = `import java.util.List;

import com.example.kernel.Handler;
import com.example.core.greet.GreetHandler;

public class MediatorProducer {

    public Mediator mediator() {
        List<Handler<?, ?>> handlers = List.of(new GreetHandler());
        return new RegistryMediator(handlers);
    }
}
`;
    const patched = patchMediatorProducer('com.example')(original);
    expect(patched).toContain('import com.example.contract.greetinglog.GreetingLog;');
    expect(patched).toContain(
      'public Mediator mediator(GreetingLog greetingLog, Clock clock, UnitOfWork unitOfWork) {',
    );
    expect(patched).toContain('new RecordGreetingHandler(greetingLog, clock, unitOfWork)');
    expect(patchMediatorProducer('com.example')(patched)).toBe(patched);
  });

  it('names the manual fix when MediatorProducer drifted from the skeleton shape', () => {
    expect(() => patchMediatorProducer('com.example')('public class Custom {}')).toThrow(
      /register RecordGreetingHandler and ListGreetingsHandler .* manually/,
    );
  });

  it('keeps the telemetry line out of the properties block until observability is installed', () => {
    expect(persistencePropertiesBlock('app_db', false)).not.toContain(
      'quarkus.datasource.jdbc.telemetry',
    );
    expect(persistencePropertiesBlock('app_db', true)).toContain(
      'quarkus.datasource.jdbc.telemetry=true',
    );
    expect(persistencePropertiesBlock('app_db', true)).toContain(
      'jdbc:postgresql://localhost:5432/app_db',
    );
  });
});
