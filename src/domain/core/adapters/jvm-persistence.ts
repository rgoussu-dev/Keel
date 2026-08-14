/**
 * Shared machinery for the JVM persistence adapters.
 *
 * Every JVM persistence adapter — Quarkus, Spring, Micronaut, in
 * Java or Kotlin — layers the same slice onto the REST walking
 * skeleton: the `UnitOfWork` and `GreetingLog` secondary ports in the
 * hexagon's contract face, the greeting-log handlers in its
 * implementation face (writes demarcated by the unit of work), the
 * plain-JDBC repository adapter (contract-tested against a
 * Testcontainers PostgreSQL) and the canonical fakes beside it, and
 * the `POST|GET /greetings` pair on the REST channel.
 *
 * What varies per framework is the transactional adapter behind the
 * `UnitOfWork` port (JTA on Quarkus, `TransactionTemplate` on
 * Spring, Micronaut's transaction operations), the runtime
 * configuration dialect, and the composition-root wiring — each
 * framework adapter owns those. This module owns everything the
 * frameworks share: the language-keyed template trees under
 * `assets/composition/persistence/jvm-persistence/`, the
 * build-registration patches (module includes, assembly project
 * dependencies, domain-core test dependencies on the fakes), the
 * bootstrap-answer lookup, and the README section.
 *
 * Nothing here names a directory: every path, package and patch
 * anchor is read off {@link jvmLayout}, so the same code serves the
 * flat trisection and the modulith. Where the emitted *content*
 * differs — package declarations, module dependencies, Maven
 * coordinates — a `*-modulith` sibling template tree carries it.
 */

import { jvmBuildSystem, type JvmBuildSystem } from './jvm-build-system.js';
import type { JvmLayoutPaths } from './jvm-module-layout.js';
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

/**
 * Template-tree suffix selecting the layout's sibling tree — empty
 * under the flat trisection, `-modulith` under the modulith.
 */
export function layoutSuffix(layout: JvmLayoutPaths): string {
  return layout.layout === 'modulith' ? '-modulith' : '';
}

/**
 * The Gradle build file of the runnable HTTP assembly — the shared
 * patch target for framework dependencies.
 */
export const gradleAssemblyTarget = (layout: JvmLayoutPaths): string =>
  `${layout.restRuntime}/build.gradle.kts`;

/** The Maven pom of the runnable HTTP assembly — same target, Maven. */
export const mavenAssemblyTarget = (layout: JvmLayoutPaths): string =>
  `${layout.restRuntime}/pom.xml`;

/** The assembly's runtime configuration — shared patch target. */
export const propertiesTarget = (layout: JvmLayoutPaths): string =>
  `${layout.restRuntime}/src/main/resources/application.properties`;

/**
 * The `filesystem:` prefix Flyway needs to reach `migrations/sql`
 * from the assembly's working directory, which sits at a different
 * depth under each layout.
 */
export const migrationsLocations = (layout: JvmLayoutPaths): string =>
  `filesystem:${layout.upToRoot(layout.restRuntime)}migrations/sql,filesystem:migrations/sql`;

const MAVEN_MODULES_END = '  </modules>';
const MAVEN_DEPENDENCIES_END = '  </dependencies>';

const README_MARKER = '\n### Persistence\n';

const readmeSection = (layout: JvmLayoutPaths): string =>
  `${README_MARKER}
The persistence slice: \`POST /greetings\` records a greeting durably
and \`GET /greetings?limit=…\` reads the log back, most recent first.
The domain owns two secondary ports — \`GreetingLog\` (the repository)
and \`UnitOfWork\` (the transactional boundary, a domain concept) — in
\`${layout.domainContract}/\`, with the real adapters (plain JDBC on the
pool, the framework's transaction machinery) under
\`${layout.infra('greeting-log')}/\` and \`${layout.infra('unit-of-work')}/\`
beside their canonical fakes. Schema lives in \`migrations/\` — its own
deployment unit, see the Database section. Prod datasource config is
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
 * build-system module files, both from the layout's tree.
 */
export async function jvmSharedPersistenceFiles(
  ctx: Ctx,
  language: JvmPersistenceLanguage,
  layout: JvmLayoutPaths,
  vars: Readonly<Record<string, string>>,
): Promise<ContributionFile[]> {
  // The module build files are language-agnostic: the Kotlin roots
  // apply the Kotlin plugin (Gradle) / source directories (Maven) to
  // every subproject, so `java-library` modules compile Kotlin too.
  const suffix = layoutSuffix(layout);
  const [sources, build] = await Promise.all([
    ctx.templates.render(`${SHARED_TEMPLATE_ROOT}/${language}${suffix}`, '', vars),
    ctx.templates.render(
      `${SHARED_TEMPLATE_ROOT}/build${suffix}/${jvmBuildSystem(ctx.manifest.tags)}`,
      '',
      vars,
    ),
  ]);
  return [...sources, ...build];
}

/** The persistence modules, with the framework's unit-of-work impl. */
const moduleNames = (layout: JvmLayoutPaths, uowModule: string): readonly string[] => [
  layout.infra('greeting-log/jdbc'),
  layout.infra('greeting-log/fake'),
  layout.infra(`unit-of-work/${uowModule}`),
  layout.infra('unit-of-work/fake'),
];

/**
 * Registers the four persistence modules with the build: a
 * `settings.gradle.kts` include block under Gradle, `<module>`
 * entries in the root pom under Maven.
 */
export function moduleRegistrationPatch(
  buildSystem: JvmBuildSystem,
  adapterId: string,
  uowModule: string,
  layout: JvmLayoutPaths,
): ContributionPatch {
  const modules = moduleNames(layout, uowModule);
  const guardModule = layout.infra('greeting-log/jdbc');
  if (buildSystem === 'maven') {
    const entries = modules.map((m) => `    <module>${m}</module>`).join('\n');
    return {
      target: 'pom.xml',
      apply: eolAware((existing) => {
        if (existing.includes(`<module>${guardModule}</module>`)) return existing;
        if (!existing.includes(MAVEN_MODULES_END)) {
          throw new Error(
            `${adapterId}: could not find the <modules> block in the root pom.xml — add the four ${layout.infra('')} modules manually`,
          );
        }
        return existing.replace(MAVEN_MODULES_END, `${entries}\n${MAVEN_MODULES_END}`);
      }),
    };
  }
  const includes = modules.map((m) => `include("${layout.gradleProject(m)}")`).join('\n');
  return {
    target: 'settings.gradle.kts',
    apply: (existing) => {
      if (existing.includes(`include("${layout.gradleProject(guardModule)}")`)) return existing;
      const eol = eolOf(existing);
      return `${existing.trimEnd()}${withEol(`\n${includes}\n`, eol)}`;
    },
  };
}

const mavenDependency = (basePackage: string, artifactId: string, scope?: string): string =>
  `    <dependency>
      <groupId>${basePackage}</groupId>
      <artifactId>${artifactId}</artifactId>
      <version>\${project.version}</version>${scope === undefined ? '' : `\n      <scope>${scope}</scope>`}
    </dependency>`;

/**
 * Adds the assembly's project dependencies on the JDBC repository
 * and the framework's unit-of-work adapter. The anchor is the
 * dependency on the REST transport contract that every assembly
 * declares — `application/rest/contract` under the flat trisection,
 * the module's `user-side/api/contract` under the modulith.
 */
export function executableProjectDepsPatch(
  buildSystem: JvmBuildSystem,
  basePackage: string,
  uowModule: string,
  layout: JvmLayoutPaths,
): ContributionPatch {
  const jdbcModule = layout.infra('greeting-log/jdbc');
  const uowModuleDir = layout.infra(`unit-of-work/${uowModule}`);
  if (buildSystem === 'maven') {
    const guard = layout.mavenArtifact(jdbcModule);
    const anchor = mavenDependency(basePackage, layout.mavenArtifact(layout.restContract));
    const deps = [
      mavenDependency(basePackage, guard),
      mavenDependency(basePackage, layout.mavenArtifact(uowModuleDir)),
    ].join('\n');
    return {
      target: mavenAssemblyTarget(layout),
      apply: eolAware((existing) => {
        if (existing.includes(guard)) return existing;
        return existing.replace(anchor, `${anchor}\n${deps}`);
      }),
    };
  }
  const guard = layout.gradleProject(jdbcModule);
  const anchor = `implementation(project("${layout.gradleProject(layout.restContract)}"))`;
  const deps = `    implementation(project("${guard}"))
    implementation(project("${layout.gradleProject(uowModuleDir)}"))`;
  return {
    target: gradleAssemblyTarget(layout),
    apply: eolAware((existing) => {
      if (existing.includes(guard)) return existing;
      return existing.replace(anchor, `${anchor}\n${deps}`);
    }),
  };
}

/** The canonical fakes the greeting-log handler tests compile against. */
const fakeModules = (layout: JvmLayoutPaths): readonly string[] => [
  layout.infra('clock/fake'),
  layout.infra('greeting-log/fake'),
  layout.infra('unit-of-work/fake'),
];

/**
 * Adds the domain-core module's test dependencies on the canonical
 * fakes so the greeting-log handler tests compile.
 */
export function coreTestDepsPatch(
  buildSystem: JvmBuildSystem,
  basePackage: string,
  layout: JvmLayoutPaths,
): ContributionPatch {
  const modules = fakeModules(layout);
  const guardModule = layout.infra('greeting-log/fake');
  if (buildSystem === 'maven') {
    const guard = layout.mavenArtifact(guardModule);
    const deps = modules
      .map((m) => mavenDependency(basePackage, layout.mavenArtifact(m), 'test'))
      .join('\n');
    return {
      target: `${layout.domainCore}/pom.xml`,
      apply: eolAware((existing) => {
        if (existing.includes(guard)) return existing;
        return existing.replace(MAVEN_DEPENDENCIES_END, `${deps}\n${MAVEN_DEPENDENCIES_END}`);
      }),
    };
  }
  const guard = layout.gradleProject(guardModule);
  const block = `dependencies {
${modules.map((m) => `    testImplementation(project("${layout.gradleProject(m)}"))`).join('\n')}
}`;
  return {
    target: `${layout.domainCore}/build.gradle.kts`,
    apply: eolAware((existing) => {
      if (existing.includes(guard)) return existing;
      return `${existing.trimEnd()}\n\n${block}\n`;
    }),
  };
}

/** The guarded `### Persistence` README section, shared verbatim. */
export function persistenceReadmePatch(layout: JvmLayoutPaths): ContributionPatch {
  return {
    target: 'README.md',
    apply: eolAware((existing) => {
      if (existing.includes(README_MARKER)) return existing;
      return `${existing.trimEnd()}\n${readmeSection(layout)}`;
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
 * sub-packages, so each new core aggregate package must be named —
 * the one framework where a vertical still edits the composition
 * root. Throws when the anchor drifted so the user gets a precise
 * manual instruction instead of a silently unwired slice.
 */
export function patchMicronautImportPackages(
  adapterId: string,
  basePackage: string,
  layout: JvmLayoutPaths,
): (existing: string) => string {
  const corePkg = `${basePackage}.${layout.domainCorePkg}`;
  const anchor = `    packages = "${corePkg}.greet",`;
  const wiring = `    packages = {"${corePkg}.greet", "${corePkg}.greetinglog"},`;
  return eolAware((existing) => {
    if (existing.includes(`${corePkg}.greetinglog`)) return existing;
    if (!existing.includes(anchor)) {
      throw new Error(
        `${adapterId}: the composition root has drifted from the walking-skeleton shape — add "${corePkg}.greetinglog" to the @Import packages on MediatorFactory so the greeting-log handlers are discovered`,
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
 * processor over the domain's implementation face — and the
 * `@Import` escape hatch its Java sibling uses is documented as
 * Java-only. Throws when the anchors drifted so the user gets a
 * precise manual instruction instead of a silently unwired slice.
 */
export function patchKotlinCompositionRoot(
  adapterId: string,
  basePackage: string,
  layout: JvmLayoutPaths,
): (existing: string) => string {
  const corePkg = `${basePackage}.${layout.domainCorePkg}`;
  const contractPkg = `${basePackage}.${layout.domainContractPkg}`;
  const importAnchor = `import ${corePkg}.greet.GreetHandler`;
  const imports = `import ${corePkg}.greetinglog.ListGreetingsHandler
import ${corePkg}.greetinglog.RecordGreetingHandler
import ${contractPkg}.Clock
import ${contractPkg}.UnitOfWork
import ${contractPkg}.greetinglog.GreetingLog`;
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

/**
 * The source root of the assembly's own composition-root package,
 * where each framework's persistence wiring and boot tests land.
 */
export function assemblySourceRoot(
  layout: JvmLayoutPaths,
  language: JvmPersistenceLanguage,
  basePackage: string,
  scope: 'main' | 'test',
): string {
  return `${layout.restRuntime}/src/${scope}/${language}/${packageToPath(basePackage)}/${packageToPath(layout.restRuntimePkg)}`;
}

/** Template vars every JVM persistence tree renders with. */
export function jvmPersistenceVars(
  basePackage: string,
  projectName: string,
): Readonly<Record<string, string>> {
  return { basePackage, projectName, pkgPath: packageToPath(basePackage) };
}
