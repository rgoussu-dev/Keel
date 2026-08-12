/**
 * `persistence/spring-persistence` adapter — the service side of the
 * SQL persistence vertical for the Spring Boot REST skeleton (Java):
 *
 *   - **datasource**: `spring-boot-starter-jdbc` (Hikari pool) + the
 *     PostgreSQL driver. The default profile targets the dev compose
 *     database and applies Flyway at startup (the local loop); the
 *     emitted `application-prod.properties` (activate with
 *     `SPRING_PROFILES_ACTIVE=prod`) makes config environment-only
 *     (`DB_URL`/`DB_USERNAME`/`DB_PASSWORD`) and disables in-process
 *     migrations — the isolated runner owns the schema. With the
 *     observability vertical, Actuator's datasource health indicator
 *     joins readiness and Hikari metrics join telemetry
 *     automatically.
 *   - **unit-of-work**: the `UnitOfWork` port with the Spring-tx
 *     adapter (`infrastructure/unit-of-work/spring-tx`, a
 *     `TransactionTemplate` over the auto-configured transaction
 *     manager); the composition root hands the JDBC repository a
 *     `TransactionAwareDataSourceProxy` so its statements enlist.
 *   - **repository-example**: the shared `GreetingLog` slice up to
 *     `POST|GET /greetings`, with a `@SpringBootTest` +
 *     Testcontainers (`@ServiceConnection`) test. The walking
 *     skeleton's own boot test gains the same container via an
 *     `@Import(TestcontainersConfiguration.class)` patch — a Boot
 *     context with a datasource needs a database to boot against.
 *
 * Shared trees and build-registration patches come from
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

export const SPRING_PERSISTENCE_ID = 'persistence/spring-persistence';

const TEMPLATE_ID = 'composition/persistence/spring-persistence/templates';
const BUILD_TEMPLATE_ROOT = 'composition/persistence/spring-persistence/build';

const UOW_MODULE = 'spring-tx';

const DEPS_GUARD = 'spring-boot-starter-jdbc';
const GRADLE_FRAMEWORK_ANCHOR =
  'implementation("org.springframework.boot:spring-boot-starter-webmvc")';
const GRADLE_FRAMEWORK_DEPS = `    implementation("org.springframework.boot:spring-boot-starter-jdbc")
    implementation("org.flywaydb:flyway-core")
    implementation("org.flywaydb:flyway-database-postgresql")
    runtimeOnly("org.postgresql:postgresql")`;
const GRADLE_TEST_ANCHOR =
  'testImplementation("org.springframework.boot:spring-boot-starter-test")';
const GRADLE_TEST_DEPS = `    testImplementation("org.springframework.boot:spring-boot-testcontainers")
    testImplementation("org.testcontainers:postgresql:1.21.4")`;

const MAVEN_FRAMEWORK_ANCHOR =
  '<artifactId>spring-boot-starter-webmvc</artifactId>\n    </dependency>';
const MAVEN_FRAMEWORK_DEPS = `    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-jdbc</artifactId>
    </dependency>
    <dependency>
      <groupId>org.flywaydb</groupId>
      <artifactId>flyway-core</artifactId>
    </dependency>
    <dependency>
      <groupId>org.flywaydb</groupId>
      <artifactId>flyway-database-postgresql</artifactId>
    </dependency>
    <dependency>
      <groupId>org.postgresql</groupId>
      <artifactId>postgresql</artifactId>
      <scope>runtime</scope>
    </dependency>`;
const MAVEN_TEST_ANCHOR = `    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-test</artifactId>
      <scope>test</scope>
    </dependency>`;
const MAVEN_TEST_DEPS = `    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-testcontainers</artifactId>
      <scope>test</scope>
    </dependency>
    <dependency>
      <groupId>org.testcontainers</groupId>
      <artifactId>postgresql</artifactId>
      <version>1.21.4</version>
      <scope>test</scope>
    </dependency>`;

const PROPERTIES_GUARD = '--- persistence (installed by keel)';

/**
 * Builds the Spring `application.properties` block. The default
 * profile is the dev loop; the prod posture lives in the emitted
 * `application-prod.properties`. Exported for the vertical tests.
 */
export function springPersistencePropertiesBlock(database: string): string {
  const engine = sqlEngine();
  return `# ${PROPERTIES_GUARD} ---------------------------------
# PostgreSQL over JDBC (Hikari pool). These defaults are the dev
# loop: the compose database (dev/compose.yaml) plus Flyway applying
# the isolated runner's SQL (migrations/ — its own deployment unit)
# at startup. Production activates the prod profile
# (SPRING_PROFILES_ACTIVE=prod, see application-prod.properties):
# environment-only config, no in-process migrations. Tests get a
# throwaway PostgreSQL via Testcontainers (@ServiceConnection).
# With the observability vertical, the datasource health indicator
# joins readiness and Hikari pool metrics join telemetry.
spring.datasource.url=\${DB_URL:${engine.jdbcUrl('localhost', database)}}
spring.datasource.username=\${DB_USERNAME:app}
spring.datasource.password=\${DB_PASSWORD:app}
spring.flyway.enabled=true
spring.flyway.locations=filesystem:../../../migrations/sql,filesystem:migrations/sql
`;
}

const TEST_IMPORT_GUARD = '@Import(TestcontainersConfiguration.class)';
const TEST_CLASS_ANCHOR =
  '@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)\nclass GreetControllerTest {';
const TEST_IMPORT_ANCHOR = 'import org.springframework.boot.test.context.SpringBootTest;';

/**
 * Points the walking skeleton's boot test at the Testcontainers
 * database — once the executable carries a datasource, every full
 * context boot needs one. Exported for the vertical tests.
 */
export function patchGreetControllerTest(existing: string): string {
  if (existing.includes(TEST_IMPORT_GUARD)) return existing;
  if (!existing.includes(TEST_CLASS_ANCHOR) || !existing.includes(TEST_IMPORT_ANCHOR)) {
    throw new Error(
      `${SPRING_PERSISTENCE_ID}: GreetControllerTest.java has drifted from the walking-skeleton shape — add @Import(TestcontainersConfiguration.class) to it manually so the context boot has a database`,
    );
  }
  return existing
    .replace(
      TEST_IMPORT_ANCHOR,
      `${TEST_IMPORT_ANCHOR}\nimport org.springframework.context.annotation.Import;`,
    )
    .replace(
      TEST_CLASS_ANCHOR,
      `@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)\n${TEST_IMPORT_GUARD}\nclass GreetControllerTest {`,
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

export const springPersistenceAdapter: Adapter = {
  id: SPRING_PERSISTENCE_ID,
  vertical: 'persistence',
  covers: ['datasource', 'unit-of-work', 'repository-example'],
  predicate: { requires: ['framework.spring', 'arch.server-http', 'lang.java'] },
  async contribute(ctx) {
    const { basePackage, projectName } = jvmPersistenceBootstrapAnswers(
      ctx.manifest,
      SPRING_PERSISTENCE_ID,
      'spring',
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
        moduleRegistrationPatch(buildSystem, SPRING_PERSISTENCE_ID, UOW_MODULE),
        frameworkDepsPatch(buildSystem),
        executableProjectDepsPatch(buildSystem, basePackage, UOW_MODULE),
        coreTestDepsPatch(buildSystem, basePackage),
        {
          target: PROPERTIES_TARGET,
          apply: eolAware((existing) => {
            if (existing.includes(PROPERTIES_GUARD)) return existing;
            return `${existing.trimEnd()}\n\n${springPersistencePropertiesBlock(database).trim()}\n`;
          }),
        },
        {
          target: `${javaRoot}/MediatorConfig.java`,
          apply: patchJavaCompositionRoot(SPRING_PERSISTENCE_ID, basePackage),
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
