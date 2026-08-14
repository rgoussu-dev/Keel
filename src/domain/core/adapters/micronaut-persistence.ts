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
 *     adapter in the hexagon's `unit-of-work/micronaut-tx` driven
 *     module (the framework's `TransactionOperations`) and the
 *     canonical fake.
 *   - **repository-example**: the shared `GreetingLog` slice up to
 *     `POST|GET /greetings`, with an embedded-server test on a
 *     Testcontainers PostgreSQL (`PostgresTestFixture` implements
 *     `TestPropertyProvider`). The walking skeleton's own controller
 *     test extends the same fixture via a patch — a context with a
 *     datasource needs a database to boot against.
 *
 * Micronaut's compile-time DI never sees the plain driven-adapter
 * modules: the adapters are constructed in the `@Factory`
 * (`PersistenceFactory`), so no annotation processing is added to
 * them. Shared trees and build-registration patches come from
 * `jvm-persistence.ts`, which reads every path and anchor off
 * `jvmLayout` — so the flat trisection and the modulith are both
 * served, each from its own template tree. Every patch is guarded so
 * re-installing is a no-op.
 */

import { jvmBuildSystem } from './jvm-build-system.js';
import { jvmLayout, type JvmLayoutPaths } from './jvm-module-layout.js';
import {
  assemblySourceRoot,
  coreTestDepsPatch,
  executableProjectDepsPatch,
  gradleAssemblyTarget,
  jvmPersistenceBootstrapAnswers,
  jvmPersistenceVars,
  jvmSharedPersistenceFiles,
  layoutSuffix,
  mavenAssemblyTarget,
  migrationsLocations,
  moduleRegistrationPatch,
  patchKotlinCompositionRoot,
  patchMicronautImportPackages,
  persistenceReadmePatch,
  propertiesTarget,
} from './jvm-persistence.js';
import { databaseName, sqlEngine } from './persistence-engine.js';
import { eolAware } from '../util.js';
import type { Adapter, ContributionPatch } from '../../contract/composition.js';

export const MICRONAUT_PERSISTENCE_ID = 'persistence/micronaut-persistence';

/** Adapter id of the Kotlin twin. */
export const MICRONAUT_PERSISTENCE_KOTLIN_ID = 'persistence/micronaut-persistence-kotlin';

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
export function micronautPersistencePropertiesBlock(
  database: string,
  layout: JvmLayoutPaths,
): string {
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
flyway.datasources.default.locations=${migrationsLocations(layout)}
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

function frameworkDepsPatch(
  buildSystem: 'gradle' | 'maven',
  layout: JvmLayoutPaths,
): ContributionPatch {
  if (buildSystem === 'maven') {
    return {
      target: mavenAssemblyTarget(layout),
      apply: eolAware((existing) => {
        if (existing.includes(DEPS_GUARD)) return existing;
        return existing
          .replace(MAVEN_FRAMEWORK_ANCHOR, `${MAVEN_FRAMEWORK_ANCHOR}\n${MAVEN_FRAMEWORK_DEPS}`)
          .replace(MAVEN_TEST_ANCHOR, `${MAVEN_TEST_ANCHOR}\n${MAVEN_TEST_DEPS}`);
      }),
    };
  }
  return {
    target: gradleAssemblyTarget(layout),
    apply: eolAware((existing) => {
      if (existing.includes(DEPS_GUARD)) return existing;
      return existing
        .replace(GRADLE_FRAMEWORK_ANCHOR, `${GRADLE_FRAMEWORK_ANCHOR}\n${GRADLE_FRAMEWORK_DEPS}`)
        .replace(GRADLE_TEST_ANCHOR, `${GRADLE_TEST_ANCHOR}\n${GRADLE_TEST_DEPS}`);
    }),
  };
}

const KOTLIN_TEST_CLASS_ANCHOR =
  'class GreetControllerTest(@Client("/") private val client: HttpClient) {';

/**
 * The Kotlin twin of {@link patchGreetControllerTest}. Exported for
 * the vertical tests.
 */
export function patchGreetControllerTestKotlin(existing: string): string {
  if (existing.includes(TEST_EXTENDS_GUARD)) return existing;
  if (!existing.includes(KOTLIN_TEST_CLASS_ANCHOR)) {
    throw new Error(
      `${MICRONAUT_PERSISTENCE_KOTLIN_ID}: GreetControllerTest.kt has drifted from the walking-skeleton shape — extend PostgresTestFixture manually so the embedded server has a database`,
    );
  }
  return existing.replace(
    KOTLIN_TEST_CLASS_ANCHOR,
    'class GreetControllerTest(@Client("/") private val client: HttpClient) : PostgresTestFixture() {',
  );
}

function makeMicronautPersistenceAdapter(language: 'java' | 'kotlin'): Adapter {
  const kotlin = language === 'kotlin';
  const id = kotlin ? MICRONAUT_PERSISTENCE_KOTLIN_ID : MICRONAUT_PERSISTENCE_ID;
  const templateId = kotlin ? `${TEMPLATE_ID}-kotlin` : TEMPLATE_ID;
  const sourceDir = kotlin ? 'kotlin' : 'java';
  return {
    id,
    vertical: 'persistence',
    covers: ['datasource', 'unit-of-work', 'repository-example'],
    predicate: { requires: ['framework.micronaut', 'arch.server-http', `lang.${language}`] },
    async contribute(ctx) {
      const { basePackage, projectName } = jvmPersistenceBootstrapAnswers(
        ctx.manifest,
        id,
        'micronaut',
        language,
      );
      const layout = jvmLayout(ctx.manifest.tags);
      const vars = jvmPersistenceVars(basePackage, projectName, layout);
      const buildSystem = jvmBuildSystem(ctx.manifest.tags);
      const suffix = layoutSuffix(layout);
      const [shared, sources, build] = await Promise.all([
        jvmSharedPersistenceFiles(ctx, language, layout, vars),
        ctx.templates.render(`${templateId}${suffix}`, '', vars),
        ctx.templates.render(`${BUILD_TEMPLATE_ROOT}${suffix}/${buildSystem}`, '', vars),
      ]);
      const database = databaseName(ctx.manifest);
      const mainRoot = assemblySourceRoot(layout, sourceDir, basePackage, 'main');
      const testRoot = assemblySourceRoot(layout, sourceDir, basePackage, 'test');
      return {
        files: [...shared, ...sources, ...build],
        patches: [
          moduleRegistrationPatch(buildSystem, id, UOW_MODULE, layout),
          frameworkDepsPatch(buildSystem, layout),
          executableProjectDepsPatch(buildSystem, basePackage, UOW_MODULE, layout),
          coreTestDepsPatch(buildSystem, basePackage, layout),
          {
            target: propertiesTarget(layout),
            apply: eolAware((existing) => {
              if (existing.includes(PROPERTIES_GUARD)) return existing;
              return `${existing.trimEnd()}\n\n${micronautPersistencePropertiesBlock(database, layout).trim()}\n`;
            }),
          },
          {
            target: `${mainRoot}/MediatorFactory.${kotlin ? 'kt' : 'java'}`,
            apply: kotlin
              ? patchKotlinCompositionRoot(id, basePackage, layout)
              : patchMicronautImportPackages(id, basePackage, layout),
          },
          {
            target: `${testRoot}/GreetControllerTest.${kotlin ? 'kt' : 'java'}`,
            apply: eolAware(kotlin ? patchGreetControllerTestKotlin : patchGreetControllerTest),
          },
          persistenceReadmePatch(layout),
        ],
        tagsAdd: [sqlEngine().tag],
      };
    },
  };
}

export const micronautPersistenceAdapter: Adapter = makeMicronautPersistenceAdapter('java');

/** The Kotlin twin — same slice, Kotlin trees and patchers. */
export const micronautPersistenceKotlinAdapter: Adapter = makeMicronautPersistenceAdapter('kotlin');
