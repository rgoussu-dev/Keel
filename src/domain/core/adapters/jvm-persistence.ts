/**
 * Shared machinery for the JVM persistence adapters.
 *
 * Every JVM persistence adapter — Quarkus, Spring, Micronaut, in
 * Java or Kotlin — layers the same slice onto the REST walking
 * skeleton: the `UnitOfWork` and `GreetingLog` secondary ports in
 * `domain/contract`, the greeting-log handlers in `domain/core`
 * (writes demarcated by the unit of work), the plain-JDBC repository
 * adapter (contract-tested against a Testcontainers PostgreSQL) and
 * the canonical fakes under `infrastructure/`, and the
 * `POST|GET /greetings` pair on the REST channel.
 *
 * What varies per framework is the transactional adapter behind the
 * `UnitOfWork` port (JTA on Quarkus, `TransactionTemplate` on
 * Spring, Micronaut's transaction operations), the runtime
 * configuration dialect, and the composition-root wiring — each
 * framework adapter owns those. This module owns everything the
 * frameworks share: the language-keyed template trees under
 * `assets/composition/persistence/jvm-persistence/`, the
 * build-registration patches (module includes, executable project
 * dependencies, `domain/core` test dependencies on the fakes), the
 * bootstrap-answer lookup, and the README section.
 */

import { jvmBuildSystem, type JvmBuildSystem } from './jvm-build-system.js';
import { eolAware, eolOf, packageToPath, withEol } from '../util.js';
import type {
  ContributionFile,
  ContributionPatch,
  Ctx,
  ManifestV2,
} from '../../contract/composition.js';

/** JVM frameworks the persistence vertical ships adapters for. */
export type JvmPersistenceFramework = 'quarkus' | 'spring' | 'micronaut';

/** Languages the shared template trees exist in. */
export type JvmPersistenceLanguage = 'java' | 'kotlin';

const SHARED_TEMPLATE_ROOT = 'composition/persistence/jvm-persistence';

/** The executable's Gradle build file — shared patch target. */
export const GRADLE_EXECUTABLE_TARGET = 'application/rest/executable/build.gradle.kts';

/** The executable's Maven pom — shared patch target. */
export const MAVEN_EXECUTABLE_TARGET = 'application/rest/executable/pom.xml';

/** The executable's runtime configuration — shared patch target. */
export const PROPERTIES_TARGET =
  'application/rest/executable/src/main/resources/application.properties';

const MAVEN_MODULES_END = '  </modules>';
const MAVEN_DEPENDENCIES_END = '  </dependencies>';

const README_MARKER = '\n### Persistence\n';

const readmeSection = (): string =>
  `${README_MARKER}
The persistence slice: \`POST /greetings\` records a greeting durably
and \`GET /greetings?limit=…\` reads the log back, most recent first.
The domain owns two secondary ports — \`GreetingLog\` (the repository)
and \`UnitOfWork\` (the transactional boundary, a domain concept) —
with the real adapters (plain JDBC on the pool, the framework's
transaction machinery) under \`infrastructure/\` beside their
canonical fakes. Schema lives in \`migrations/\` — its own deployment
unit, see the Database section. Prod datasource config is
environment-only: \`DB_URL\`, \`DB_USERNAME\`, \`DB_PASSWORD\`. Tests
need a Docker daemon: the JDBC adapter's contract test runs against
a Testcontainers PostgreSQL, and the REST test boots one too.
`;

/**
 * Reads the answers the matching REST bootstrap recorded at skeleton
 * time. Throws with the bootstrap's id when the walking skeleton has
 * not run.
 */
export function jvmPersistenceBootstrapAnswers(
  manifest: ManifestV2,
  adapterId: string,
  framework: JvmPersistenceFramework,
  language: JvmPersistenceLanguage,
): { basePackage: string; projectName: string } {
  const suffix = language === 'kotlin' ? '-rest-kotlin-bootstrap' : '-rest-bootstrap';
  const bootstrapId = `walking-skeleton/${framework}${suffix}`;
  const answers = manifest.answers[bootstrapId];
  const basePackage = answers?.basePackage;
  const projectName = answers?.projectName;
  if (!basePackage || !projectName) {
    throw new Error(
      `${adapterId}: requires '${bootstrapId}' to have run first; basePackage/projectName not in manifest`,
    );
  }
  return { basePackage, projectName };
}

/**
 * Renders the language-keyed shared sources plus the matching
 * build-system module files.
 */
export async function jvmSharedPersistenceFiles(
  ctx: Ctx,
  language: JvmPersistenceLanguage,
  vars: Readonly<Record<string, string>>,
): Promise<ContributionFile[]> {
  // The module build files are language-agnostic: the Kotlin roots
  // apply the Kotlin plugin (Gradle) / source directories (Maven) to
  // every subproject, so `java-library` modules compile Kotlin too.
  const [sources, build] = await Promise.all([
    ctx.templates.render(`${SHARED_TEMPLATE_ROOT}/${language}`, '', vars),
    ctx.templates.render(
      `${SHARED_TEMPLATE_ROOT}/build/${jvmBuildSystem(ctx.manifest.tags)}`,
      '',
      vars,
    ),
  ]);
  return [...sources, ...build];
}

/** The persistence modules, with the framework's unit-of-work impl. */
const moduleNames = (uowModule: string): readonly string[] => [
  'infrastructure/greeting-log/jdbc',
  'infrastructure/greeting-log/fake',
  `infrastructure/unit-of-work/${uowModule}`,
  'infrastructure/unit-of-work/fake',
];

const gradlePath = (module: string): string => `:${module.replace(/\//g, ':')}`;

/**
 * Registers the four persistence modules with the build: a
 * `settings.gradle.kts` include block under Gradle, `<module>`
 * entries in the root pom under Maven.
 */
export function moduleRegistrationPatch(
  buildSystem: JvmBuildSystem,
  adapterId: string,
  uowModule: string,
): ContributionPatch {
  const modules = moduleNames(uowModule);
  const guardModule = 'infrastructure/greeting-log/jdbc';
  if (buildSystem === 'maven') {
    const entries = modules.map((m) => `    <module>${m}</module>`).join('\n');
    return {
      target: 'pom.xml',
      apply: eolAware((existing) => {
        if (existing.includes(`<module>${guardModule}</module>`)) return existing;
        if (!existing.includes(MAVEN_MODULES_END)) {
          throw new Error(
            `${adapterId}: could not find the <modules> block in the root pom.xml — add the four infrastructure modules manually`,
          );
        }
        return existing.replace(MAVEN_MODULES_END, `${entries}\n${MAVEN_MODULES_END}`);
      }),
    };
  }
  const includes = modules.map((m) => `include("${gradlePath(m)}")`).join('\n');
  return {
    target: 'settings.gradle.kts',
    apply: (existing) => {
      if (existing.includes(`include("${gradlePath(guardModule)}")`)) return existing;
      const eol = eolOf(existing);
      return `${existing.trimEnd()}${withEol(`\n${includes}\n`, eol)}`;
    },
  };
}

/**
 * Adds the executable's project dependencies on the JDBC repository
 * and the framework's unit-of-work adapter. The anchor is the
 * `application/rest/contract` dependency every REST executable
 * declares.
 */
export function executableProjectDepsPatch(
  buildSystem: JvmBuildSystem,
  basePackage: string,
  uowModule: string,
): ContributionPatch {
  if (buildSystem === 'maven') {
    const anchor = `    <dependency>
      <groupId>${basePackage}</groupId>
      <artifactId>application-rest-contract</artifactId>
      <version>\${project.version}</version>
    </dependency>`;
    const deps = `    <dependency>
      <groupId>${basePackage}</groupId>
      <artifactId>infrastructure-greeting-log-jdbc</artifactId>
      <version>\${project.version}</version>
    </dependency>
    <dependency>
      <groupId>${basePackage}</groupId>
      <artifactId>infrastructure-unit-of-work-${uowModule}</artifactId>
      <version>\${project.version}</version>
    </dependency>`;
    return {
      target: MAVEN_EXECUTABLE_TARGET,
      apply: eolAware((existing) => {
        if (existing.includes('infrastructure-greeting-log-jdbc')) return existing;
        return existing.replace(anchor, `${anchor}\n${deps}`);
      }),
    };
  }
  const anchor = 'implementation(project(":application:rest:contract"))';
  const deps = `    implementation(project(":infrastructure:greeting-log:jdbc"))
    implementation(project(":infrastructure:unit-of-work:${uowModule}"))`;
  return {
    target: GRADLE_EXECUTABLE_TARGET,
    apply: eolAware((existing) => {
      if (existing.includes(':infrastructure:greeting-log:jdbc')) return existing;
      return existing.replace(anchor, `${anchor}\n${deps}`);
    }),
  };
}

/**
 * Adds `domain/core`'s test dependencies on the canonical fakes so
 * the greeting-log handler tests compile.
 */
export function coreTestDepsPatch(
  buildSystem: JvmBuildSystem,
  basePackage: string,
): ContributionPatch {
  if (buildSystem === 'maven') {
    const deps = [
      'infrastructure-clock-fake',
      'infrastructure-greeting-log-fake',
      'infrastructure-unit-of-work-fake',
    ]
      .map(
        (artifact) => `    <dependency>
      <groupId>${basePackage}</groupId>
      <artifactId>${artifact}</artifactId>
      <version>\${project.version}</version>
      <scope>test</scope>
    </dependency>`,
      )
      .join('\n');
    return {
      target: 'domain/core/pom.xml',
      apply: eolAware((existing) => {
        if (existing.includes('infrastructure-greeting-log-fake')) return existing;
        return existing.replace(MAVEN_DEPENDENCIES_END, `${deps}\n${MAVEN_DEPENDENCIES_END}`);
      }),
    };
  }
  const block = `dependencies {
    testImplementation(project(":infrastructure:clock:fake"))
    testImplementation(project(":infrastructure:greeting-log:fake"))
    testImplementation(project(":infrastructure:unit-of-work:fake"))
}`;
  return {
    target: 'domain/core/build.gradle.kts',
    apply: eolAware((existing) => {
      if (existing.includes(':infrastructure:greeting-log:fake')) return existing;
      return `${existing.trimEnd()}\n\n${block}\n`;
    }),
  };
}

/** The guarded `### Persistence` README section, shared verbatim. */
export function persistenceReadmePatch(): ContributionPatch {
  return {
    target: 'README.md',
    apply: eolAware((existing) => {
      if (existing.includes(README_MARKER)) return existing;
      return `${existing.trimEnd()}\n${readmeSection()}`;
    }),
  };
}

/**
 * Names a new domain package in a Micronaut composition root's
 * `@Import` list.
 *
 * Quarkus and Spring need no patch at all: their handlers carry
 * `@DomainHandler` and their ports are already container beans, so
 * discovery picks the greeting-log slice up untouched. Micronaut
 * resolves DI at compile time and `@Import` does not scan
 * sub-packages, so each new `core.<aggregate>` must be named — the
 * one framework where a vertical still edits the composition root.
 * Throws when the anchor drifted so the user gets a precise manual
 * instruction instead of a silently unwired slice.
 */
export function patchMicronautImportPackages(
  adapterId: string,
  basePackage: string,
): (existing: string) => string {
  const anchor = `    packages = "${basePackage}.core.greet",`;
  const wiring = `    packages = {"${basePackage}.core.greet", "${basePackage}.core.greetinglog"},`;
  return eolAware((existing) => {
    if (existing.includes(`${basePackage}.core.greetinglog`)) return existing;
    if (!existing.includes(anchor)) {
      throw new Error(
        `${adapterId}: the composition root has drifted from the walking-skeleton shape — add "${basePackage}.core.greetinglog" to the @Import packages on MediatorFactory so the greeting-log handlers are discovered`,
      );
    }
    return existing.replace(anchor, wiring);
  });
}

/**
 * Rewires the Micronaut Kotlin composition root: `mediator()` takes
 * the persistence ports as parameters and registers the greeting-log
 * handlers by hand.
 *
 * This is the only composition root still rewired. Micronaut Kotlin
 * cannot discover `@DomainHandler` — that would need its KSP
 * processor over `domain/core` — and the `@Import` escape hatch its
 * Java sibling uses is documented as Java-only. Throws when the
 * anchors drifted so the user gets a precise manual instruction
 * instead of a silently unwired slice.
 */
export function patchKotlinCompositionRoot(
  adapterId: string,
  basePackage: string,
): (existing: string) => string {
  const importAnchor = `import ${basePackage}.core.greet.GreetHandler`;
  const imports = `import ${basePackage}.core.greetinglog.ListGreetingsHandler
import ${basePackage}.core.greetinglog.RecordGreetingHandler
import ${basePackage}.contract.Clock
import ${basePackage}.contract.UnitOfWork
import ${basePackage}.contract.greetinglog.GreetingLog`;
  const bodyAnchor = '    fun mediator(): Mediator = RegistryMediator(listOf(GreetHandler()))';
  const bodyWiring = `    fun mediator(greetingLog: GreetingLog, clock: Clock, unitOfWork: UnitOfWork): Mediator =
        RegistryMediator(
            listOf(
                GreetHandler(),
                RecordGreetingHandler(greetingLog, clock, unitOfWork),
                ListGreetingsHandler(greetingLog),
            ),
        )`;
  return eolAware((existing) => {
    if (existing.includes('RecordGreetingHandler')) return existing;
    if (!existing.includes(importAnchor) || !existing.includes(bodyAnchor)) {
      throw new Error(
        `${adapterId}: the composition root has drifted from the walking-skeleton shape — register RecordGreetingHandler and ListGreetingsHandler with the mediator manually (inject GreetingLog, Clock and UnitOfWork)`,
      );
    }
    return existing
      .replace(importAnchor, `${importAnchor}\n${imports}`)
      .replace(bodyAnchor, bodyWiring);
  });
}

/** True when the observability vertical is recorded on the manifest. */
export function observabilityInstalled(manifest: ManifestV2): boolean {
  return manifest.verticals.some((v) => v.id === 'observability');
}

/** Template vars every JVM persistence tree renders with. */
export function jvmPersistenceVars(
  basePackage: string,
  projectName: string,
): Readonly<Record<string, string>> {
  return { basePackage, projectName, pkgPath: packageToPath(basePackage) };
}
