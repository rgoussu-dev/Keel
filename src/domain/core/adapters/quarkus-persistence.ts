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
 *     `domain/contract` with the JTA adapter
 *     (`infrastructure/unit-of-work/jta`) — Quarkus's idiomatic
 *     transaction machinery; connections drawn from Agroal enlist
 *     automatically — and the canonical fake.
 *   - **repository-example**: the `GreetingLog` port with a plain-JDBC
 *     adapter and its fake, plus the earned slice up to
 *     `POST|GET /greetings`.
 *
 * The shared JVM trees and build-registration patches come from
 * {@link ../adapters/jvm-persistence.js}; this adapter owns the
 * Quarkus specifics: the JTA unit-of-work module, the framework
 * dependencies, the `application.properties` dialect, and the
 * `MediatorProducer` rewiring. Every patch is guarded so
 * re-installing is a no-op; migrations are owned by the sibling
 * `persistence/flyway-migrations` adapter.
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
  observabilityInstalled,
  persistenceReadmePatch,
  PROPERTIES_TARGET,
} from './jvm-persistence.js';
import { databaseName, sqlEngine } from './persistence-engine.js';
import { eolAware, packageToPath } from '../util.js';
import type { Adapter, ContributionPatch } from '../../contract/composition.js';

export const QUARKUS_PERSISTENCE_ID = 'persistence/quarkus-persistence';

const TEMPLATE_ID = 'composition/persistence/quarkus-persistence/templates';
const BUILD_TEMPLATE_ROOT = 'composition/persistence/quarkus-persistence/build';

const UOW_MODULE = 'jta';

const DEPS_GUARD = 'quarkus-jdbc-postgresql';
const GRADLE_QUARKUS_ANCHOR = 'implementation("io.quarkus:quarkus-rest-jackson")';
const GRADLE_QUARKUS_DEPS = `    implementation("io.quarkus:quarkus-jdbc-postgresql")
    implementation("io.quarkus:quarkus-flyway")
    implementation("org.flywaydb:flyway-database-postgresql")`;
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

const PROPERTIES_GUARD = '--- persistence (installed by keel)';

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

function frameworkDepsPatch(buildSystem: 'gradle' | 'maven'): ContributionPatch {
  if (buildSystem === 'maven') {
    return {
      target: MAVEN_EXECUTABLE_TARGET,
      apply: eolAware((existing) => {
        if (existing.includes(DEPS_GUARD)) return existing;
        return existing.replace(
          MAVEN_QUARKUS_ANCHOR,
          `${MAVEN_QUARKUS_ANCHOR}\n${MAVEN_QUARKUS_DEPS}`,
        );
      }),
    };
  }
  return {
    target: GRADLE_EXECUTABLE_TARGET,
    apply: eolAware((existing) => {
      if (existing.includes(DEPS_GUARD)) return existing;
      return existing.replace(GRADLE_QUARKUS_ANCHOR, `${GRADLE_QUARKUS_ANCHOR}\n${GRADLE_QUARKUS_DEPS}`);
    }),
  };
}

export const quarkusPersistenceAdapter: Adapter = {
  id: QUARKUS_PERSISTENCE_ID,
  vertical: 'persistence',
  covers: ['datasource', 'unit-of-work', 'repository-example'],
  predicate: { requires: ['framework.quarkus', 'arch.server-http', 'lang.java'] },
  async contribute(ctx) {
    const { basePackage, projectName } = jvmPersistenceBootstrapAnswers(
      ctx.manifest,
      QUARKUS_PERSISTENCE_ID,
      'quarkus',
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
    return {
      files: [...shared, ...sources, ...build],
      patches: [
        moduleRegistrationPatch(buildSystem, QUARKUS_PERSISTENCE_ID, UOW_MODULE),
        frameworkDepsPatch(buildSystem),
        executableProjectDepsPatch(buildSystem, basePackage, UOW_MODULE),
        coreTestDepsPatch(buildSystem, basePackage),
        {
          target: PROPERTIES_TARGET,
          apply: eolAware((existing) => {
            if (existing.includes(PROPERTIES_GUARD)) return existing;
            return `${existing.trimEnd()}\n\n${persistencePropertiesBlock(
              database,
              observabilityInstalled(ctx.manifest),
            ).trim()}\n`;
          }),
        },
        {
          target: `application/rest/executable/src/main/java/${packageToPath(basePackage)}/rest/MediatorProducer.java`,
          apply: patchMediatorProducer(basePackage),
        },
        persistenceReadmePatch(),
      ],
      tagsAdd: [sqlEngine().tag],
    };
  },
};
