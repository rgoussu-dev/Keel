/**
 * `persistence/micronaut-persistence` adapter — the service side of
 * the SQL persistence vertical for the Micronaut REST skeleton
 * (Java):
 *
 *   - **datasource**: `micronaut-jdbc-hikari` + the PostgreSQL
 *     driver, with Micronaut Data's JDBC transaction manager making
 *     the pool transaction-aware. The default environment targets
 *     the dev compose database and applies Flyway at startup (the
 *     local loop); the emitted `application-prod.properties`
 *     (activate with `MICRONAUT_ENVIRONMENTS=prod`) makes config
 *     environment-only and disables in-process migrations — the
 *     isolated runner owns the schema.
 *   - **unit-of-work**: the `UnitOfWork` port with the Micronaut-tx
 *     adapter (`infrastructure/unit-of-work/micronaut-tx`, the
 *     framework's `TransactionOperations`) and the canonical fake.
 *   - **repository-example**: the shared `GreetingLog` slice up to
 *     `POST|GET /greetings`, with an embedded-server test on a
 *     Testcontainers PostgreSQL (`PostgresTestFixture` implements
 *     `TestPropertyProvider`). The walking skeleton's own controller
 *     test extends the same fixture via a patch — a context with a
 *     datasource needs a database to boot against.
 *
 * Micronaut's compile-time DI never sees the plain infrastructure
 * modules: the adapters are constructed in the `@Factory`
 * (`PersistenceFactory`), so no annotation processing is added to
 * them. Shared trees and build-registration patches come from
 * `jvm-persistence.ts`; every patch is guarded so re-installing is a
 * no-op.
 */

import { jvmBuildSystem } from './jvm-build-system.js';
import {
  coreTestDepsPatch,
  executableProjectDepsPatch,
  GRADLE_EXECUTABLE_TARGET,
  jvmPersistenceBootstrapAnswers,
  jvmPersistenceVars,
  jvmSharedPersistenceFiles,
  MAVEN_EXECUTABLE_TARGET,
  moduleRegistrationPatch,
  patchJavaCompositionRoot,
  persistenceReadmePatch,
  PROPERTIES_TARGET,
} from './jvm-persistence.js';
import { databaseName, sqlEngine } from './persistence-engine.js';
import { eolAware, packageToPath } from '../util.js';
import type { Adapter, ContributionPatch } from '../../contract/composition.js';

export const MICRONAUT_PERSISTENCE_ID = 'persistence/micronaut-persistence';

const TEMPLATE_ID = 'composition/persistence/micronaut-persistence/templates';
const BUILD_TEMPLATE_ROOT = 'composition/persistence/micronaut-persistence/build';

const UOW_MODULE = 'micronaut-tx';

const DEPS_GUARD = 'micronaut-data-tx-jdbc';
const GRADLE_FRAMEWORK_ANCHOR = 'implementation("io.micronaut:micronaut-jackson-databind")';
const GRADLE_FRAMEWORK_DEPS = `    implementation("io.micronaut.data:micronaut-data-tx-jdbc")
    implementation("io.micronaut.flyway:micronaut-flyway")
    implementation("io.micronaut.sql:micronaut-jdbc-hikari")
    runtimeOnly("org.flywaydb:flyway-database-postgresql")
    runtimeOnly("org.postgresql:postgresql")`;
const GRADLE_TEST_ANCHOR = 'testImplementation("io.micronaut:micronaut-http-client")';
const GRADLE_TEST_DEPS = `    testImplementation("org.testcontainers:postgresql:1.21.4")`;

const MAVEN_FRAMEWORK_ANCHOR =
  '<artifactId>micronaut-jackson-databind</artifactId>\n    </dependency>';
const MAVEN_FRAMEWORK_DEPS = `    <dependency>
      <groupId>io.micronaut.data</groupId>
      <artifactId>micronaut-data-tx-jdbc</artifactId>
    </dependency>
    <dependency>
      <groupId>io.micronaut.flyway</groupId>
      <artifactId>micronaut-flyway</artifactId>
    </dependency>
    <dependency>
      <groupId>io.micronaut.sql</groupId>
      <artifactId>micronaut-jdbc-hikari</artifactId>
    </dependency>
    <dependency>
      <groupId>org.flywaydb</groupId>
      <artifactId>flyway-database-postgresql</artifactId>
      <scope>runtime</scope>
    </dependency>
    <dependency>
      <groupId>org.postgresql</groupId>
      <artifactId>postgresql</artifactId>
      <scope>runtime</scope>
    </dependency>`;
const MAVEN_TEST_ANCHOR = `    <dependency>
      <groupId>io.micronaut.test</groupId>
      <artifactId>micronaut-test-junit5</artifactId>
      <scope>test</scope>
    </dependency>`;
const MAVEN_TEST_DEPS = `    <dependency>
      <groupId>org.testcontainers</groupId>
      <artifactId>postgresql</artifactId>
      <version>1.21.4</version>
      <scope>test</scope>
    </dependency>`;

const PROPERTIES_GUARD = '--- persistence (installed by keel)';

/**
 * Builds the Micronaut `application.properties` block. The default
 * environment is the dev loop; the prod posture lives in the emitted
 * `application-prod.properties`. Exported for the vertical tests.
 */
export function micronautPersistencePropertiesBlock(database: string): string {
  const engine = sqlEngine();
  return `# ${PROPERTIES_GUARD} ---------------------------------
# PostgreSQL over JDBC (Hikari pool). These defaults are the dev
# loop: the compose database (dev/compose.yaml) plus Flyway applying
# the isolated runner's SQL (migrations/ — its own deployment unit)
# at startup. Production activates the prod environment
# (MICRONAUT_ENVIRONMENTS=prod, see application-prod.properties):
# environment-only config, no in-process migrations. Tests get a
# throwaway PostgreSQL via Testcontainers (PostgresTestFixture).
datasources.default.url=\${DB_URL:\`${engine.jdbcUrl('localhost', database)}\`}
datasources.default.username=\${DB_USERNAME:app}
datasources.default.password=\${DB_PASSWORD:app}
datasources.default.driver-class-name=org.postgresql.Driver
flyway.datasources.default.enabled=true
flyway.datasources.default.locations=filesystem:../../../migrations/sql,filesystem:migrations/sql
`;
}

const TEST_EXTENDS_GUARD = 'PostgresTestFixture';
const TEST_CLASS_ANCHOR = '@MicronautTest\nclass GreetControllerTest {';

/**
 * Points the walking skeleton's controller test at the
 * Testcontainers database — once the executable carries a
 * datasource, every embedded-server boot needs one. Exported for the
 * vertical tests.
 */
export function patchGreetControllerTest(existing: string): string {
  if (existing.includes(TEST_EXTENDS_GUARD)) return existing;
  if (!existing.includes(TEST_CLASS_ANCHOR)) {
    throw new Error(
      `${MICRONAUT_PERSISTENCE_ID}: GreetControllerTest.java has drifted from the walking-skeleton shape — extend PostgresTestFixture manually so the embedded server has a database`,
    );
  }
  return existing.replace(
    TEST_CLASS_ANCHOR,
    '@MicronautTest\nclass GreetControllerTest extends PostgresTestFixture {',
  );
}

function frameworkDepsPatch(buildSystem: 'gradle' | 'maven'): ContributionPatch {
  if (buildSystem === 'maven') {
    return {
      target: MAVEN_EXECUTABLE_TARGET,
      apply: eolAware((existing) => {
        if (existing.includes(DEPS_GUARD)) return existing;
        return existing
          .replace(MAVEN_FRAMEWORK_ANCHOR, `${MAVEN_FRAMEWORK_ANCHOR}\n${MAVEN_FRAMEWORK_DEPS}`)
          .replace(MAVEN_TEST_ANCHOR, `${MAVEN_TEST_ANCHOR}\n${MAVEN_TEST_DEPS}`);
      }),
    };
  }
  return {
    target: GRADLE_EXECUTABLE_TARGET,
    apply: eolAware((existing) => {
      if (existing.includes(DEPS_GUARD)) return existing;
      return existing
        .replace(GRADLE_FRAMEWORK_ANCHOR, `${GRADLE_FRAMEWORK_ANCHOR}\n${GRADLE_FRAMEWORK_DEPS}`)
        .replace(GRADLE_TEST_ANCHOR, `${GRADLE_TEST_ANCHOR}\n${GRADLE_TEST_DEPS}`);
    }),
  };
}

export const micronautPersistenceAdapter: Adapter = {
  id: MICRONAUT_PERSISTENCE_ID,
  vertical: 'persistence',
  covers: ['datasource', 'unit-of-work', 'repository-example'],
  predicate: { requires: ['framework.micronaut', 'arch.server-http', 'lang.java'] },
  async contribute(ctx) {
    const { basePackage, projectName } = jvmPersistenceBootstrapAnswers(
      ctx.manifest,
      MICRONAUT_PERSISTENCE_ID,
      'micronaut',
      'java',
    );
    const vars = jvmPersistenceVars(basePackage, projectName);
    const buildSystem = jvmBuildSystem(ctx.manifest.tags);
    const [shared, sources, build] = await Promise.all([
      jvmSharedPersistenceFiles(ctx, 'java', vars),
      ctx.templates.render(TEMPLATE_ID, '', vars),
      ctx.templates.render(`${BUILD_TEMPLATE_ROOT}/${buildSystem}`, '', vars),
    ]);
    const database = databaseName(ctx.manifest);
    const javaRoot = `application/rest/executable/src/main/java/${packageToPath(basePackage)}/rest`;
    const testRoot = `application/rest/executable/src/test/java/${packageToPath(basePackage)}/rest`;
    return {
      files: [...shared, ...sources, ...build],
      patches: [
        moduleRegistrationPatch(buildSystem, MICRONAUT_PERSISTENCE_ID, UOW_MODULE),
        frameworkDepsPatch(buildSystem),
        executableProjectDepsPatch(buildSystem, basePackage, UOW_MODULE),
        coreTestDepsPatch(buildSystem, basePackage),
        {
          target: PROPERTIES_TARGET,
          apply: eolAware((existing) => {
            if (existing.includes(PROPERTIES_GUARD)) return existing;
            return `${existing.trimEnd()}\n\n${micronautPersistencePropertiesBlock(database).trim()}\n`;
          }),
        },
        {
          target: `${javaRoot}/MediatorFactory.java`,
          apply: patchJavaCompositionRoot(MICRONAUT_PERSISTENCE_ID, basePackage),
        },
        {
          target: `${testRoot}/GreetControllerTest.java`,
          apply: eolAware(patchGreetControllerTest),
        },
        persistenceReadmePatch(),
      ],
      tagsAdd: [sqlEngine().tag],
    };
  },
};
