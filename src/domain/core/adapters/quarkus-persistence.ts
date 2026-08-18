/**
 * `persistence/quarkus-persistence` adapter — the service side of the
 * SQL persistence vertical for the Quarkus REST skeleton (Java):
 *
 *   - **datasource**: the dialed engine's JDBC driver + Agroal pool
 *     wired through `application.properties` — prod config is
 *     env-only (12-factor `DB_URL`/`DB_USERNAME`/`DB_PASSWORD`),
 *     `%dev` targets the compose database, `%test` gets a throwaway
 *     database from Quarkus Dev Services (Testcontainers). Pool
 *     health feeds the readiness probe and pool metrics + JDBC spans
 *     feed telemetry when the observability vertical is installed.
 *   - **unit-of-work**: the `UnitOfWork` secondary port in the
 *     hexagon's contract face with the JTA adapter in its
 *     `unit-of-work/jta` driven module — Quarkus's idiomatic
 *     transaction machinery; connections drawn from Agroal enlist
 *     automatically — and the canonical fake.
 *   - **repository-example**: the `GreetingLog` port with a plain-JDBC
 *     adapter and its fake, plus the earned slice up to
 *     `POST|GET /greetings`.
 *
 * Both module layouts are served: paths and patch anchors come from
 * `jvmLayout`, and the `-modulith` template trees put the driven
 * adapters under `modules/<context>/infra/`, the REST resource in the
 * module's `user-side/api/adapters`, and the datasource wiring in the
 * `application/api` assembly.
 *
 * The shared JVM trees and build-registration patches come from
 * {@link ../adapters/jvm-persistence.js}; this adapter owns the
 * Quarkus specifics: the JTA unit-of-work module, the framework
 * dependencies, and the `application.properties` dialect. The
 * composition root needs no rewiring — the greeting-log handlers
 * carry `@DomainHandler` and their ports are beans the
 * `PersistenceProducer` already produces, so ArC discovers the slice.
 * Every patch is guarded so re-installing is a no-op; migrations are
 * owned by the sibling `persistence/flyway-migrations` adapter.
 */

import { jvmBuildSystem } from './jvm-build-system.js';
import { jvmLayout, type JvmLayoutPaths } from './jvm-module-layout.js';
import {
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
  observabilityInstalled,
  persistenceReadmePatch,
  propertiesTarget,
} from './jvm-persistence.js';
import {
  databaseName,
  PERSISTENCE_DIALS_ID,
  sqlEngine,
  type SqlEngineSpec,
} from './persistence-engine.js';
import { eolAware } from '../util.js';
import type { Adapter, ContributionPatch } from '../../contract/composition.js';

export const QUARKUS_PERSISTENCE_ID = 'persistence/quarkus-persistence';

/** Adapter id of the Kotlin twin. */
export const QUARKUS_PERSISTENCE_KOTLIN_ID = 'persistence/quarkus-persistence-kotlin';

const TEMPLATE_ID = 'composition/persistence/quarkus-persistence/templates';
const BUILD_TEMPLATE_ROOT = 'composition/persistence/quarkus-persistence/build';

const UOW_MODULE = 'jta';

// Prefix-shaped so the guard holds whichever engine the dial picked.
const DEPS_GUARD = 'quarkus-jdbc-';
const GRADLE_QUARKUS_ANCHOR = 'implementation("io.quarkus:quarkus-rest-jackson")';
const gradleQuarkusDeps = (engine: SqlEngineSpec): string =>
  `    implementation("io.quarkus:quarkus-jdbc-${engine.quarkusDbKind}")
    implementation("io.quarkus:quarkus-flyway")
    implementation("${engine.flywayModule.groupId}:${engine.flywayModule.artifactId}")`;
const MAVEN_QUARKUS_ANCHOR = '<artifactId>quarkus-rest-jackson</artifactId>\n    </dependency>';
const mavenQuarkusDeps = (engine: SqlEngineSpec): string =>
  `    <dependency>
      <groupId>io.quarkus</groupId>
      <artifactId>quarkus-jdbc-${engine.quarkusDbKind}</artifactId>
    </dependency>
    <dependency>
      <groupId>io.quarkus</groupId>
      <artifactId>quarkus-flyway</artifactId>
    </dependency>
    <dependency>
      <groupId>${engine.flywayModule.groupId}</groupId>
      <artifactId>${engine.flywayModule.artifactId}</artifactId>
    </dependency>`;

const PROPERTIES_GUARD = '--- persistence (installed by keel)';

/**
 * Builds the `application.properties` block: datasource + Flyway
 * profiles, plus JDBC telemetry when the observability vertical is
 * already installed. Exported for the vertical tests.
 */
export function persistencePropertiesBlock(
  database: string,
  telemetry: boolean,
  layout: JvmLayoutPaths,
  engine: SqlEngineSpec,
): string {
  const locations = migrationsLocations(layout);
  const telemetryLines = telemetry
    ? `# JDBC spans join the traces the observability vertical exports.
quarkus.datasource.jdbc.telemetry=true
`
    : '';
  return `# ${PROPERTIES_GUARD} ---------------------------------
# ${engine.name} over JDBC (Agroal pool). Prod config is environment-only
# (12-factor): set DB_URL, DB_USERNAME, DB_PASSWORD. %dev targets the
# compose database (dev/compose.yaml); %test gets a throwaway
# ${engine.name} from Dev Services (Testcontainers — needs Docker).
quarkus.datasource.db-kind=${engine.quarkusDbKind}
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
%dev.quarkus.flyway.locations=${locations}
%test.quarkus.flyway.migrate-at-start=true
%test.quarkus.flyway.locations=${locations}
# Pool health feeds the readiness probe (with the observability
# vertical's SmallRye Health); pool metrics feed telemetry.
quarkus.datasource.health.enabled=true
quarkus.datasource.metrics.enabled=true
${telemetryLines}`;
}

function frameworkDepsPatch(
  buildSystem: 'gradle' | 'maven',
  layout: JvmLayoutPaths,
  engine: SqlEngineSpec,
): ContributionPatch {
  if (buildSystem === 'maven') {
    return {
      target: mavenAssemblyTarget(layout),
      apply: eolAware((existing) => {
        if (existing.includes(DEPS_GUARD)) return existing;
        return existing.replace(
          MAVEN_QUARKUS_ANCHOR,
          `${MAVEN_QUARKUS_ANCHOR}\n${mavenQuarkusDeps(engine)}`,
        );
      }),
    };
  }
  return {
    target: gradleAssemblyTarget(layout),
    apply: eolAware((existing) => {
      if (existing.includes(DEPS_GUARD)) return existing;
      return existing.replace(
        GRADLE_QUARKUS_ANCHOR,
        `${GRADLE_QUARKUS_ANCHOR}\n${gradleQuarkusDeps(engine)}`,
      );
    }),
  };
}

function makeQuarkusPersistenceAdapter(language: 'java' | 'kotlin'): Adapter {
  const kotlin = language === 'kotlin';
  const id = kotlin ? QUARKUS_PERSISTENCE_KOTLIN_ID : QUARKUS_PERSISTENCE_ID;
  const templateId = kotlin ? `${TEMPLATE_ID}-kotlin` : TEMPLATE_ID;
  return {
    id,
    vertical: 'persistence',
    covers: ['datasource', 'unit-of-work', 'repository-example'],
    predicate: { requires: ['framework.quarkus', 'arch.server-http', `lang.${language}`] },
    // The dials adapter must have asked its questions before this one
    // reads them through sqlEngine().
    after: [PERSISTENCE_DIALS_ID],
    async contribute(ctx) {
      const { basePackage, projectName } = jvmPersistenceBootstrapAnswers(
        ctx.manifest,
        id,
        'quarkus',
        language,
      );
      const engine = sqlEngine(ctx.manifest);
      const layout = jvmLayout(ctx.manifest.tags);
      const vars = jvmPersistenceVars(basePackage, projectName, layout, engine);
      const buildSystem = jvmBuildSystem(ctx.manifest.tags);
      const suffix = layoutSuffix(layout);
      const [shared, sources, build] = await Promise.all([
        jvmSharedPersistenceFiles(ctx, language, layout, vars),
        ctx.templates.render(`${templateId}${suffix}`, '', vars),
        ctx.templates.render(`${BUILD_TEMPLATE_ROOT}${suffix}/${buildSystem}`, '', vars),
      ]);
      const database = databaseName(ctx.manifest);
      return {
        files: [...shared, ...sources, ...build],
        patches: [
          moduleRegistrationPatch(buildSystem, id, UOW_MODULE, layout),
          frameworkDepsPatch(buildSystem, layout, engine),
          executableProjectDepsPatch(buildSystem, basePackage, UOW_MODULE, layout),
          coreTestDepsPatch(buildSystem, basePackage, layout),
          {
            target: propertiesTarget(layout),
            apply: eolAware((existing) => {
              if (existing.includes(PROPERTIES_GUARD)) return existing;
              return `${existing.trimEnd()}\n\n${persistencePropertiesBlock(
                database,
                observabilityInstalled(ctx.manifest),
                layout,
                engine,
              ).trim()}\n`;
            }),
          },
          persistenceReadmePatch(layout, engine),
        ],
        tagsAdd: [engine.tag],
      };
    },
  };
}

export const quarkusPersistenceAdapter: Adapter = makeQuarkusPersistenceAdapter('java');

/** The Kotlin twin — same slice, Kotlin trees and patchers. */
export const quarkusPersistenceKotlinAdapter: Adapter = makeQuarkusPersistenceAdapter('kotlin');
