/**
 * `persistence/quarkus-persistence` adapter — the service side of the
 * SQL persistence vertical for the Quarkus REST skeleton (Java):
 *
 *   - **datasource**: the PostgreSQL JDBC driver + Agroal pool wired
 *     through `application.properties` — prod config is env-only
 *     (12-factor `DB_URL`/`DB_USERNAME`/`DB_PASSWORD`), `%dev`
 *     targets the compose database, `%test` gets a throwaway
 *     PostgreSQL from Quarkus Dev Services (Testcontainers). Pool
 *     health feeds the readiness probe and pool metrics + JDBC spans
 *     feed telemetry when the observability vertical is installed.
 *   - **unit-of-work**: the `UnitOfWork` secondary port in
 *     `domain/contract` — the transactional boundary as a domain
 *     concept — with the JTA adapter (`infrastructure/unit-of-work/jta`)
 *     and the canonical fake (`…/fake`).
 *   - **repository-example**: the `GreetingLog` port with a plain-JDBC
 *     adapter (`infrastructure/greeting-log/jdbc`, contract-tested
 *     against a real PostgreSQL via Testcontainers) and its fake,
 *     plus the earned vertical slice: `RecordGreetingCommand` /
 *     `ListGreetingsQuery`, their handlers (writes demarcated by the
 *     unit of work), and `POST|GET /greetings` on the REST channel.
 *
 * The adapter renders the template tree plus the build-system module
 * files (Gradle or Maven, from the manifest's `pkg.*` tag), then
 * patches what the walking skeleton wrote: module registration
 * (`settings.gradle.kts` / root `pom.xml`), the executable's
 * dependencies, `domain/core`'s test dependencies on the fakes, the
 * runtime configuration, and the composition root
 * (`MediatorProducer`) to register the new handlers. Every patch is
 * guarded so re-installing is a no-op; the migrations themselves are
 * owned by the sibling `persistence/flyway-migrations` adapter.
 *
 * Reads `basePackage`/`projectName` from the Quarkus REST bootstrap's
 * manifest answers — the vertical therefore requires the walking
 * skeleton to have run first.
 */

import { jvmBuildSystem } from './jvm-build-system.js';
import { databaseName, sqlEngine } from './persistence-engine.js';
import { QUARKUS_REST_BOOTSTRAP_ID } from './quarkus-rest-bootstrap.js';
import { eolAware, eolOf, packageToPath, withEol } from '../util.js';
import type { Adapter, ContributionPatch, ManifestV2 } from '../../contract/composition.js';

export const QUARKUS_PERSISTENCE_ID = 'persistence/quarkus-persistence';

const TEMPLATE_ID = 'composition/persistence/quarkus-persistence/templates';
const BUILD_TEMPLATE_ROOT = 'composition/persistence/quarkus-persistence/build';

const GRADLE_SETTINGS_TARGET = 'settings.gradle.kts';
const MAVEN_ROOT_TARGET = 'pom.xml';
const GRADLE_EXECUTABLE_TARGET = 'application/rest/executable/build.gradle.kts';
const MAVEN_EXECUTABLE_TARGET = 'application/rest/executable/pom.xml';
const GRADLE_CORE_TARGET = 'domain/core/build.gradle.kts';
const MAVEN_CORE_TARGET = 'domain/core/pom.xml';
const PROPERTIES_TARGET = 'application/rest/executable/src/main/resources/application.properties';
const MEDIATOR_PRODUCER_TARGET_ROOT = 'application/rest/executable/src/main/java';

const GRADLE_MODULE_INCLUDES = `include(":infrastructure:greeting-log:jdbc")
include(":infrastructure:greeting-log:fake")
include(":infrastructure:unit-of-work:jta")
include(":infrastructure:unit-of-work:fake")`;

const MAVEN_MODULES = `    <module>infrastructure/greeting-log/jdbc</module>
    <module>infrastructure/greeting-log/fake</module>
    <module>infrastructure/unit-of-work/jta</module>
    <module>infrastructure/unit-of-work/fake</module>`;
const MAVEN_MODULES_END = '  </modules>';

const GRADLE_DEPS_GUARD = 'quarkus-jdbc-postgresql';
const GRADLE_QUARKUS_ANCHOR = 'implementation("io.quarkus:quarkus-rest-jackson")';
const GRADLE_QUARKUS_DEPS = `    implementation("io.quarkus:quarkus-jdbc-postgresql")
    implementation("io.quarkus:quarkus-flyway")
    implementation("org.flywaydb:flyway-database-postgresql")`;
const GRADLE_PROJECT_ANCHOR = 'implementation(project(":application:rest:contract"))';
const GRADLE_PROJECT_DEPS = `    implementation(project(":infrastructure:greeting-log:jdbc"))
    implementation(project(":infrastructure:unit-of-work:jta"))`;

const MAVEN_QUARKUS_ANCHOR = '<artifactId>quarkus-rest-jackson</artifactId>\n    </dependency>';
const MAVEN_QUARKUS_DEPS = `    <dependency>
      <groupId>io.quarkus</groupId>
      <artifactId>quarkus-jdbc-postgresql</artifactId>
    </dependency>
    <dependency>
      <groupId>io.quarkus</groupId>
      <artifactId>quarkus-flyway</artifactId>
    </dependency>
    <dependency>
      <groupId>org.flywaydb</groupId>
      <artifactId>flyway-database-postgresql</artifactId>
    </dependency>`;

const GRADLE_CORE_TEST_DEPS = `
dependencies {
    testImplementation(project(":infrastructure:clock:fake"))
    testImplementation(project(":infrastructure:greeting-log:fake"))
    testImplementation(project(":infrastructure:unit-of-work:fake"))
}
`;

const MAVEN_DEPENDENCIES_END = '  </dependencies>';

const PROPERTIES_GUARD = '--- persistence (installed by keel)';

const README_MARKER = '\n### Persistence\n';

const readmeSection = (): string =>
  `${README_MARKER}
The persistence slice: \`POST /greetings\` records a greeting durably
and \`GET /greetings?limit=…\` reads the log back, most recent first.
The domain owns two secondary ports — \`GreetingLog\` (the repository)
and \`UnitOfWork\` (the transactional boundary, a domain concept) —
with the real adapters (plain JDBC on the Agroal pool, JTA) under
\`infrastructure/\` beside their canonical fakes. Schema lives in
\`migrations/\` — its own deployment unit, see the Database section.
Prod datasource config is environment-only: \`DB_URL\`, \`DB_USERNAME\`,
\`DB_PASSWORD\`. Tests need a Docker daemon: the JDBC adapter's
contract test runs against a Testcontainers PostgreSQL, and
\`@QuarkusTest\` boots one via Dev Services.
`;

/** Answers the Quarkus REST bootstrap recorded at skeleton time. */
function bootstrapAnswers(manifest: ManifestV2): { basePackage: string; projectName: string } {
  const answers = manifest.answers[QUARKUS_REST_BOOTSTRAP_ID];
  const basePackage = answers?.basePackage;
  const projectName = answers?.projectName;
  if (!basePackage || !projectName) {
    throw new Error(
      `${QUARKUS_PERSISTENCE_ID}: requires '${QUARKUS_REST_BOOTSTRAP_ID}' to have run first; basePackage/projectName not in manifest`,
    );
  }
  return { basePackage, projectName };
}

/**
 * Builds the `application.properties` block: datasource + Flyway
 * profiles, plus JDBC telemetry when the observability vertical is
 * already installed. Exported for the vertical tests.
 */
export function persistencePropertiesBlock(database: string, telemetry: boolean): string {
  const engine = sqlEngine();
  const telemetryLines = telemetry
    ? `# JDBC spans join the traces the observability vertical exports.
quarkus.datasource.jdbc.telemetry=true
`
    : '';
  return `# ${PROPERTIES_GUARD} ---------------------------------
# PostgreSQL over JDBC (Agroal pool). Prod config is environment-only
# (12-factor): set DB_URL, DB_USERNAME, DB_PASSWORD. %dev targets the
# compose database (dev/compose.yaml); %test gets a throwaway
# PostgreSQL from Dev Services (Testcontainers — needs Docker).
quarkus.datasource.db-kind=postgresql
quarkus.datasource.devservices.image-name=${engine.image}
%prod.quarkus.datasource.jdbc.url=\${DB_URL}
%prod.quarkus.datasource.username=\${DB_USERNAME}
%prod.quarkus.datasource.password=\${DB_PASSWORD}
%dev.quarkus.datasource.jdbc.url=${engine.jdbcUrl('localhost', database)}
%dev.quarkus.datasource.username=app
%dev.quarkus.datasource.password=app
# Migrations are owned by the isolated runner (migrations/ — its own
# container, run against the database before the service deploys), so
# the service never migrates in prod. Dev and test apply the same SQL
# at startup for a tight local loop.
quarkus.flyway.migrate-at-start=false
%dev.quarkus.flyway.migrate-at-start=true
%dev.quarkus.flyway.locations=filesystem:../../../migrations/sql,filesystem:migrations/sql
%test.quarkus.flyway.migrate-at-start=true
%test.quarkus.flyway.locations=filesystem:../../../migrations/sql,filesystem:migrations/sql
# Pool health feeds the readiness probe (with the observability
# vertical's SmallRye Health); pool metrics feed telemetry.
quarkus.datasource.health.enabled=true
quarkus.datasource.metrics.enabled=true
${telemetryLines}`;
}

/**
 * Rewires the composition root: `mediator()` takes the persistence
 * ports as parameters (CDI injects the `PersistenceProducer` beans)
 * and registers the greeting-log handlers. Exported for the vertical
 * tests; throws when the anchors drifted so the user gets a precise
 * manual instruction instead of a silently unwired slice.
 */
export function patchMediatorProducer(basePackage: string): (existing: string) => string {
  const importAnchor = `import ${basePackage}.core.greet.GreetHandler;`;
  const imports = `import ${basePackage}.core.greetinglog.ListGreetingsHandler;
import ${basePackage}.core.greetinglog.RecordGreetingHandler;
import ${basePackage}.contract.Clock;
import ${basePackage}.contract.UnitOfWork;
import ${basePackage}.contract.greetinglog.GreetingLog;`;
  const methodAnchor = 'public Mediator mediator() {';
  const methodSignature =
    'public Mediator mediator(GreetingLog greetingLog, Clock clock, UnitOfWork unitOfWork) {';
  const listAnchor = '        List<Handler<?, ?>> handlers = List.of(new GreetHandler());';
  const listWiring = `        List<Handler<?, ?>> handlers = List.of(
                new GreetHandler(),
                new RecordGreetingHandler(greetingLog, clock, unitOfWork),
                new ListGreetingsHandler(greetingLog));`;
  return eolAware((existing) => {
    if (existing.includes('RecordGreetingHandler')) return existing;
    if (
      !existing.includes(importAnchor) ||
      !existing.includes(methodAnchor) ||
      !existing.includes(listAnchor)
    ) {
      throw new Error(
        `${QUARKUS_PERSISTENCE_ID}: MediatorProducer.java has drifted from the walking-skeleton shape — register RecordGreetingHandler and ListGreetingsHandler with the mediator manually (inject GreetingLog, Clock and UnitOfWork)`,
      );
    }
    return existing
      .replace(importAnchor, `${importAnchor}\n${imports}`)
      .replace(methodAnchor, methodSignature)
      .replace(listAnchor, listWiring);
  });
}

const appendGuarded = (target: string, guard: string, block: string): ContributionPatch => ({
  target,
  apply: eolAware((existing) => {
    if (existing.includes(guard)) return existing;
    return `${existing.trimEnd()}\n\n${block.trim()}\n`;
  }),
});

function gradlePatches(): readonly ContributionPatch[] {
  return [
    {
      target: GRADLE_SETTINGS_TARGET,
      apply: (existing) => {
        if (existing.includes('include(":infrastructure:greeting-log:jdbc")')) return existing;
        const eol = eolOf(existing);
        return `${existing.trimEnd()}${withEol(`\n${GRADLE_MODULE_INCLUDES}\n`, eol)}`;
      },
    },
    {
      target: GRADLE_EXECUTABLE_TARGET,
      apply: eolAware((existing) => {
        if (existing.includes(GRADLE_DEPS_GUARD)) return existing;
        return existing
          .replace(GRADLE_QUARKUS_ANCHOR, `${GRADLE_QUARKUS_ANCHOR}\n${GRADLE_QUARKUS_DEPS}`)
          .replace(GRADLE_PROJECT_ANCHOR, `${GRADLE_PROJECT_ANCHOR}\n${GRADLE_PROJECT_DEPS}`);
      }),
    },
    appendGuarded(GRADLE_CORE_TARGET, ':infrastructure:greeting-log:fake', GRADLE_CORE_TEST_DEPS),
  ];
}

function mavenPatches(basePackage: string): readonly ContributionPatch[] {
  const mavenProjectAnchor = `    <dependency>
      <groupId>${basePackage}</groupId>
      <artifactId>application-rest-contract</artifactId>
      <version>\${project.version}</version>
    </dependency>`;
  const mavenProjectDeps = `    <dependency>
      <groupId>${basePackage}</groupId>
      <artifactId>infrastructure-greeting-log-jdbc</artifactId>
      <version>\${project.version}</version>
    </dependency>
    <dependency>
      <groupId>${basePackage}</groupId>
      <artifactId>infrastructure-unit-of-work-jta</artifactId>
      <version>\${project.version}</version>
    </dependency>`;
  const coreTestDeps = `    <dependency>
      <groupId>${basePackage}</groupId>
      <artifactId>infrastructure-clock-fake</artifactId>
      <version>\${project.version}</version>
      <scope>test</scope>
    </dependency>
    <dependency>
      <groupId>${basePackage}</groupId>
      <artifactId>infrastructure-greeting-log-fake</artifactId>
      <version>\${project.version}</version>
      <scope>test</scope>
    </dependency>
    <dependency>
      <groupId>${basePackage}</groupId>
      <artifactId>infrastructure-unit-of-work-fake</artifactId>
      <version>\${project.version}</version>
      <scope>test</scope>
    </dependency>`;
  return [
    {
      target: MAVEN_ROOT_TARGET,
      apply: eolAware((existing) => {
        if (existing.includes('<module>infrastructure/greeting-log/jdbc</module>')) {
          return existing;
        }
        if (!existing.includes(MAVEN_MODULES_END)) {
          throw new Error(
            `${QUARKUS_PERSISTENCE_ID}: could not find the <modules> block in the root pom.xml — add the four infrastructure modules manually`,
          );
        }
        return existing.replace(MAVEN_MODULES_END, `${MAVEN_MODULES}\n${MAVEN_MODULES_END}`);
      }),
    },
    {
      target: MAVEN_EXECUTABLE_TARGET,
      apply: eolAware((existing) => {
        if (existing.includes(GRADLE_DEPS_GUARD)) return existing;
        return existing
          .replace(MAVEN_QUARKUS_ANCHOR, `${MAVEN_QUARKUS_ANCHOR}\n${MAVEN_QUARKUS_DEPS}`)
          .replace(mavenProjectAnchor, `${mavenProjectAnchor}\n${mavenProjectDeps}`);
      }),
    },
    {
      target: MAVEN_CORE_TARGET,
      apply: eolAware((existing) => {
        if (existing.includes('infrastructure-greeting-log-fake')) return existing;
        return existing.replace(
          MAVEN_DEPENDENCIES_END,
          `${coreTestDeps}\n${MAVEN_DEPENDENCIES_END}`,
        );
      }),
    },
  ];
}

export const quarkusPersistenceAdapter: Adapter = {
  id: QUARKUS_PERSISTENCE_ID,
  vertical: 'persistence',
  covers: ['datasource', 'unit-of-work', 'repository-example'],
  predicate: { requires: ['framework.quarkus', 'arch.server-http', 'lang.java'] },
  async contribute(ctx) {
    const { basePackage, projectName } = bootstrapAnswers(ctx.manifest);
    const vars = { basePackage, projectName, pkgPath: packageToPath(basePackage) };
    const buildSystem = jvmBuildSystem(ctx.manifest.tags);
    const [sources, build] = await Promise.all([
      ctx.templates.render(TEMPLATE_ID, '', vars),
      ctx.templates.render(`${BUILD_TEMPLATE_ROOT}/${buildSystem}`, '', vars),
    ]);
    const database = databaseName(ctx.manifest);
    const observability = ctx.manifest.verticals.some((v) => v.id === 'observability');
    const buildPatches = buildSystem === 'maven' ? mavenPatches(basePackage) : gradlePatches();
    return {
      files: [...sources, ...build],
      patches: [
        ...buildPatches,
        appendGuarded(
          PROPERTIES_TARGET,
          PROPERTIES_GUARD,
          persistencePropertiesBlock(database, observability),
        ),
        {
          target: `${MEDIATOR_PRODUCER_TARGET_ROOT}/${packageToPath(basePackage)}/rest/MediatorProducer.java`,
          apply: patchMediatorProducer(basePackage),
        },
        {
          target: 'README.md',
          apply: eolAware((existing) => {
            if (existing.includes(README_MARKER)) return existing;
            return `${existing.trimEnd()}\n${readmeSection()}`;
          }),
        },
      ],
      tagsAdd: [sqlEngine().tag],
    };
  },
};
