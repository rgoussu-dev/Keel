/**
 * Shared root-file patches for the JVM walking-skeleton bootstraps
 * under the **basic** module layout — the modulith sibling is
 * [`jvm-shared-root-modulith.ts`](./jvm-shared-root-modulith.js).
 *
 * Every JVM entrypoint bootstrap (`quarkus-cli-bootstrap`,
 * `quarkus-rest-bootstrap`, …) used to render its own whole-file copy
 * of the project's root files — `settings.gradle.kts`/`pom.xml`,
 * `build.gradle.kts`, `gradle.properties`, `README.md` — with the
 * entrypoint's own module baked in. That made two entrypoints
 * (`arch.cli` + `arch.server-http` both present) a hard conflict: two
 * whole-file writes to the same path, even with identical bytes, are
 * a conflict per {@link import('../apply.js').applyContribution}.
 *
 * This module is the fix, mirrored on the pattern `go-cli-bootstrap`
 * already uses for `README.md` (an idempotent marker-based patch) and
 * generalized to every root file: each entrypoint adapter contributes
 * a `patches` entry per root file, all sharing the same **seed** (the
 * project as it looks with *no* entrypoint yet — just the domain
 * modules), and each patch's `apply` idempotently ensures its own
 * entrypoint's module/section is present. Whichever entrypoint
 * resolves first creates the file from the seed; the other composes
 * onto it. `gradle.properties` and `build.gradle.kts` need no
 * per-entrypoint content at all (same seed, identity `apply`) because
 * the seed already uses the collision-safe (path-derived Gradle
 * group, `<module>`-per-entrypoint Maven) shape every framework's
 * REST variant already had.
 *
 * The seed builders are exported rather than private because the two
 * layouts emit the *same root files* — a `settings.gradle.kts` with a
 * `rootProject.name` and a module list, one `build.gradle.kts`
 * configuring every subproject, a reactor `pom.xml` — and differ only
 * in which modules seed them and what the README says. So the
 * builders live here and the modulith module supplies its own module
 * lists, comments and README bodies; nothing a layout does not share
 * leaves its own module.
 */

import type { ContributionPatch } from '../../contract/composition.js';
import type { JvmBuildSystem } from './jvm-build-system.js';
import { eolOf, withEol } from '../util.js';

/** JVM frameworks the walking-skeleton bootstraps cover. */
export type JvmFramework = 'quarkus' | 'spring' | 'micronaut';

/** Entrypoint shapes a JVM bootstrap may contribute. */
export type JvmRootArch = 'cli' | 'rest';

/** Languages the JVM bootstraps scaffold. */
export type JvmRootLanguage = 'java' | 'kotlin';

/** Inputs shared by every root-file patch of one bootstrap install. */
export interface JvmRootInputs {
  readonly framework: JvmFramework;
  readonly arch: JvmRootArch;
  readonly language: JvmRootLanguage;
  readonly buildSystem: JvmBuildSystem;
  readonly basePackage: string;
  readonly projectName: string;
}

export interface FrameworkMeta {
  readonly label: string;
  /** Inner lines of the root `gradle.properties`. */
  readonly gradleProperties: readonly string[];
  /** Inner lines of the root Maven `<properties>` block. */
  readonly mavenProperties: readonly string[];
  /**
   * Whether the **basic** layout's root `build.gradle.kts` needs the
   * `archiveBaseName` block: Spring's boot jar and Micronaut's shadow
   * jar both pack by file name, so `application/rest/contract` and
   * `domain/contract` colliding on `contract-<version>.jar` is a real
   * clash; Quarkus's own packaging does not hit it.
   */
  readonly archiveBaseName: boolean;
  /** The Gradle `plugins {}` id(s) that apply Kotlin for this framework. */
  readonly kotlinGradlePlugins: readonly string[];
}

/** The Kotlin toolchain every JVM template pins. */
export const KOTLIN_VERSION = '2.4.10';

/** Per-framework facts both module layouts' root files are built from. */
export const FRAMEWORKS: Readonly<Record<JvmFramework, FrameworkMeta>> = {
  quarkus: {
    label: 'Quarkus',
    gradleProperties: ['quarkus.platform.version=3.38.2'],
    mavenProperties: [
      '<quarkus.platform.group-id>io.quarkus.platform</quarkus.platform.group-id>',
      '<quarkus.platform.version>3.38.2</quarkus.platform.version>',
    ],
    archiveBaseName: false,
    kotlinGradlePlugins: [`kotlin("plugin.allopen") version "${KOTLIN_VERSION}" apply false`],
  },
  spring: {
    label: 'Spring Boot',
    gradleProperties: [],
    mavenProperties: ['<spring-boot.version>4.1.0</spring-boot.version>'],
    archiveBaseName: true,
    kotlinGradlePlugins: [`kotlin("plugin.spring") version "${KOTLIN_VERSION}" apply false`],
  },
  micronaut: {
    label: 'Micronaut',
    gradleProperties: [],
    mavenProperties: ['<micronaut.version>5.1.1</micronaut.version>'],
    archiveBaseName: true,
    kotlinGradlePlugins: [`id("com.google.devtools.ksp") version "2.3.11" apply false`],
  },
};

/**
 * Module paths every basic-layout entrypoint shares — the domain
 * trisection, which is the project as it looks with no entrypoint yet.
 */
const SEED_MODULES: readonly string[] = ['domain/kernel', 'domain/contract', 'domain/core'];

/** Maven/Gradle module paths one arch's entrypoint contributes. */
const ARCH_MODULES: Readonly<Record<JvmRootArch, readonly string[]>> = {
  cli: ['application/cli'],
  rest: ['application/rest/contract', 'application/rest/executable'],
};

/**
 * Why the basic layout derives each subproject's Gradle group from its
 * path. Passed to {@link gradleBuildSeed} rather than baked into it —
 * the modulith hits the same clash for a different reason and says so
 * in its own words.
 */
const GROUP_NOTE = `    // "contract" exists under both domain/ and application/rest/, and
    // Gradle conflict-resolves subprojects that share module
    // coordinates (group:name) into a single module — so derive each
    // group from the project path to keep every module's coordinates
    // unique.`;

/** Why the archives are named after their path, where they must be. */
const ARCHIVE_NOTE = `    // Archive file names must be unique for the same reason: a boot/
    // shadow jar (and any flat lib/ layout) packs libraries by file
    // name, so domain/contract and application/rest/contract both
    // producing contract-<version>.jar would collide — so every
    // module's archive is named after its full path, matching the
    // Maven artifactIds these builds already carry.`;

/**
 * The root-file patches one JVM entrypoint bootstrap contributes,
 * under the basic module layout. Every entrypoint bootstrap for the
 * same (framework, buildSystem) pair supplies the identical seed for
 * each target, so whichever resolves first creates the file and the
 * rest compose onto it in adapter-resolution order.
 */
export function jvmSharedRootPatches(inputs: JvmRootInputs): readonly ContributionPatch[] {
  return inputs.buildSystem === 'gradle' ? gradlePatches(inputs) : mavenPatches(inputs);
}

function gradlePatches(inputs: JvmRootInputs): readonly ContributionPatch[] {
  const meta = FRAMEWORKS[inputs.framework];
  return [
    {
      target: 'settings.gradle.kts',
      seed: gradleSettingsSeed(inputs.projectName, SEED_MODULES),
      apply: (existing) =>
        appendMissingLines(existing, gradleIncludeLines(ARCH_MODULES[inputs.arch])),
    },
    {
      target: 'build.gradle.kts',
      seed: gradleBuildSeed({
        framework: inputs.framework,
        language: inputs.language,
        basePackage: inputs.basePackage,
        groupNote: GROUP_NOTE,
        archiveNote: meta.archiveBaseName ? ARCHIVE_NOTE : null,
      }),
      apply: (existing) => existing,
    },
    {
      target: 'gradle.properties',
      seed: gradlePropertiesSeed(inputs.framework),
      apply: (existing) => existing,
    },
    {
      target: 'README.md',
      seed: readmeSeed(meta.label, inputs.projectName, './gradlew test'),
      apply: (existing) => appendReadmeSection(existing, gradleReadmeSection(inputs)),
    },
  ];
}

function mavenPatches(inputs: JvmRootInputs): readonly ContributionPatch[] {
  const meta = FRAMEWORKS[inputs.framework];
  return [
    {
      target: 'pom.xml',
      seed: mavenPomSeed({
        language: inputs.language,
        basePackage: inputs.basePackage,
        projectName: inputs.projectName,
        frameworkProperties: meta.mavenProperties,
        modules: SEED_MODULES,
      }),
      apply: (existing) => insertModules(existing, ARCH_MODULES[inputs.arch]),
    },
    {
      target: 'README.md',
      seed: readmeSeed(meta.label, inputs.projectName, './mvnw test'),
      apply: (existing) => appendReadmeSection(existing, mavenReadmeSection(inputs)),
    },
  ];
}

/**
 * The root `settings.gradle.kts` as it looks with no entrypoint yet:
 * the toolchain resolver, the project name, and the modules every
 * entrypoint of this layout shares.
 */
export function gradleSettingsSeed(projectName: string, modules: readonly string[]): string {
  return `plugins {
    // Auto-provisions the pinned Java toolchain (JDK 25) when the
    // machine's installed JDK does not match.
    id("org.gradle.toolchains.foojay-resolver-convention") version "1.0.0"
}

rootProject.name = "${projectName}"

${gradleIncludeLines(modules).join('\n')}
`;
}

/** `include(…)` lines for a set of `a/b/c` module paths. */
export function gradleIncludeLines(modules: readonly string[]): readonly string[] {
  return modules.map((m) => `include(":${m.replace(/\//g, ':')}")`);
}

/** The root `gradle.properties`, identical for every entrypoint. */
export function gradlePropertiesSeed(framework: JvmFramework): string {
  return `${['org.gradle.parallel=true', 'org.gradle.caching=true', ...FRAMEWORKS[framework].gradleProperties].join('\n')}\n`;
}

/** What {@link gradleBuildSeed} needs beyond the framework facts. */
export interface GradleBuildSeedInputs {
  readonly framework: JvmFramework;
  readonly language: JvmRootLanguage;
  readonly basePackage: string;
  /**
   * The comment above the path-derived `group`, already indented as
   * emitted. Both layouts derive the group for the same mechanical
   * reason and hit it through different module names, so each says
   * why in its own terms.
   */
  readonly groupNote: string;
  /**
   * The comment above the `archiveBaseName` block, indented as
   * emitted — or `null` where the layout needs no such block.
   */
  readonly archiveNote: string | null;
}

/**
 * The root `build.gradle.kts`, identical for every entrypoint of a
 * given (framework, language) pair — including the collision-safe,
 * path-derived Gradle group every framework's REST variant already
 * carried (`application/rest/contract` and `domain/contract` would
 * otherwise share group:name coordinates). Adopting it
 * unconditionally is what lets `cli` and `rest` share one seed with
 * an identity `apply`.
 */
export function gradleBuildSeed(inputs: GradleBuildSeedInputs): string {
  const { framework, language, basePackage } = inputs;
  const meta = FRAMEWORKS[framework];
  const plugins =
    language === 'java'
      ? '    java'
      : [`kotlin("jvm") version "${KOTLIN_VERSION}" apply false`, ...meta.kotlinGradlePlugins]
          .map((p) => `    ${p}`)
          .join('\n');
  const applyPlugin =
    language === 'java' ? 'apply(plugin = "java")' : 'apply(plugin = "org.jetbrains.kotlin.jvm")';
  const languageBlock =
    language === 'java'
      ? `java {
        toolchain {
            languageVersion = JavaLanguageVersion.of(25)
        }
    }`
      : `// The Kotlin compiler derives its jvmTarget from the Java
    // toolchain, so this one pin covers both compilers.
    extensions.configure<JavaPluginExtension> {
        toolchain {
            languageVersion = JavaLanguageVersion.of(25)
        }
    }`;
  const archiveBaseNameBlock =
    inputs.archiveNote === null
      ? ''
      : `

${inputs.archiveNote}
    tasks.withType<Jar>().configureEach {
        archiveBaseName.set(project.path.removePrefix(":").replace(':', '-'))
    }`;
  return `plugins {
${plugins}
}

allprojects {
    group = "${basePackage}"
    version = "0.1.0-SNAPSHOT"

    repositories {
        mavenCentral()
    }
}

subprojects {
    ${applyPlugin}

${inputs.groupNote}
    group = "${basePackage}" + path.substringBeforeLast(':').replace(':', '.')${archiveBaseNameBlock}

    ${languageBlock}

    dependencies {
        // Required at test runtime since Gradle 9; the platform
        // launcher used to be auto-provided by \`useJUnitPlatform()\`
        // but is now an explicit dependency.
        "testRuntimeOnly"("org.junit.platform:junit-platform-launcher")
    }

    tasks.withType<Test> {
        useJUnitPlatform()
    }
}
`;
}

/**
 * The root Kotlin block Maven poms share verbatim across every
 * framework: the reactor-wide `kotlin-stdlib` dependency, the
 * `src/main/kotlin` source roots, and the `kotlin-maven-plugin`
 * bound to the `compile`/`test-compile` goals.
 */
function mavenKotlinBlock(): {
  properties: readonly string[];
  dependencies: string;
  build: string;
} {
  return {
    properties: [`<kotlin.version>${KOTLIN_VERSION}</kotlin.version>`],
    dependencies: `
  <!-- Inherited by every module: the whole reactor is Kotlin. -->
  <dependencies>
    <dependency>
      <groupId>org.jetbrains.kotlin</groupId>
      <artifactId>kotlin-stdlib</artifactId>
      <version>\${kotlin.version}</version>
    </dependency>
  </dependencies>
`,
    build: `    <sourceDirectory>\${project.basedir}/src/main/kotlin</sourceDirectory>
    <testSourceDirectory>\${project.basedir}/src/test/kotlin</testSourceDirectory>
`,
  };
}

/** What {@link mavenPomSeed} needs to render one reactor root. */
export interface MavenPomSeedInputs {
  readonly language: JvmRootLanguage;
  readonly basePackage: string;
  readonly projectName: string;
  /** Inner lines of the framework's `<properties>` contribution. */
  readonly frameworkProperties: readonly string[];
  /** The modules every entrypoint of this layout shares. */
  readonly modules: readonly string[];
  /**
   * A `<dependencyManagement>` block for the reactor root, rendered
   * verbatim between `</properties>` and the Kotlin reactor
   * dependencies — leading and trailing newline included, as the
   * surrounding template expects. Empty where the framework's own
   * parent pom already manages every module's versions.
   */
  readonly dependencyManagement?: string;
}

/**
 * The reactor `pom.xml` as it looks with no entrypoint yet. Only the
 * seeded `<modules>` list moves with the layout; everything else —
 * the coordinates, the release/encoding properties, the Kotlin
 * reactor block, the pinned plugins — is the same file either way.
 */
export function mavenPomSeed(inputs: MavenPomSeedInputs): string {
  const { language, basePackage, projectName, frameworkProperties } = inputs;
  const kotlin = language === 'kotlin' ? mavenKotlinBlock() : null;
  const propsBlock = ['<maven.compiler.release>25</maven.compiler.release>']
    .concat('<project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>')
    .concat(kotlin?.properties ?? [])
    .concat(frameworkProperties)
    .map((line) => `    ${line}`)
    .join('\n');
  const kotlinMavenPlugin =
    language === 'kotlin'
      ? `
    <plugins>
      <plugin>
        <groupId>org.jetbrains.kotlin</groupId>
        <artifactId>kotlin-maven-plugin</artifactId>
        <version>\${kotlin.version}</version>
        <executions>
          <execution>
            <id>compile</id>
            <goals>
              <goal>compile</goal>
            </goals>
          </execution>
          <execution>
            <id>test-compile</id>
            <goals>
              <goal>test-compile</goal>
            </goals>
          </execution>
        </executions>
        <configuration>
          <jvmTarget>25</jvmTarget>
        </configuration>
      </plugin>
    </plugins>
`
      : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>

  <groupId>${basePackage}</groupId>
  <artifactId>${projectName}</artifactId>
  <version>0.1.0-SNAPSHOT</version>
  <packaging>pom</packaging>

  <modules>
${inputs.modules.map((m) => `    <module>${m}</module>`).join('\n')}
  </modules>

  <properties>
${propsBlock}
  </properties>
${inputs.dependencyManagement ?? ''}${kotlin?.dependencies ?? ''}
  <build>
${kotlin?.build ?? ''}    <pluginManagement>
      <plugins>
        <plugin>
          <groupId>org.apache.maven.plugins</groupId>
          <artifactId>maven-compiler-plugin</artifactId>
          <version>3.15.0</version>
        </plugin>
        <plugin>
          <groupId>org.apache.maven.plugins</groupId>
          <artifactId>maven-surefire-plugin</artifactId>
          <version>3.5.6</version>
        </plugin>
      </plugins>
    </pluginManagement>${kotlinMavenPlugin}
  </build>
</project>
`;
}

/**
 * Adds any of `modules` the reactor root does not already list,
 * immediately before the `</modules>` close. Idempotent, so the
 * second entrypoint to resolve composes onto the first's list.
 */
export function insertModules(existing: string, modules: readonly string[]): string {
  const missing = modules.filter((m) => !existing.includes(`<module>${m}</module>`));
  if (missing.length === 0) return existing;
  const eol = eolOf(existing);
  const lines = missing.map((m) => withEol(`    <module>${m}</module>\n`, eol)).join('');
  const marker = withEol('  </modules>', eol);
  return existing.replace(marker, `${lines}${marker}`);
}

/** Appends whichever of `lines` the file does not already carry. */
export function appendMissingLines(existing: string, lines: readonly string[]): string {
  const missing = lines.filter((l) => !existing.includes(l));
  if (missing.length === 0) return existing;
  const eol = eolOf(existing);
  return `${existing.replace(/\s*$/, '')}${withEol(`\n${missing.join('\n')}\n`, eol)}`;
}

function readmeSeed(frameworkLabel: string, projectName: string, testCmd: string): string {
  return `# ${projectName}

${frameworkLabel} walking skeleton scaffolded by keel — hexagonal, mediator-driven.

## Layout

\`\`\`
domain/
  kernel/      — Command, Handler, Mediator bases; depends on nothing
  contract/    — the public surface: GreetCommand + GreetRejected
                 (+ ports as they appear)
  core/        — RegistryMediator + the GreetCommand handler
infrastructure/  — driven adapters (arrives with the first real port)
\`\`\`

## Test

\`\`\`sh
${testCmd}
\`\`\`
`;
}

/** README section marker for one entrypoint, mirroring go-cli-bootstrap. */
function readmeMarker(arch: JvmRootArch): string {
  return `\n### ${arch}\n`;
}

/**
 * Appends one entrypoint's README section unless its marker is
 * already there — the idempotence the shared-file upsert needs.
 */
export function appendReadmeSection(
  existing: string,
  section: { arch: JvmRootArch; body: string },
): string {
  const marker = readmeMarker(section.arch);
  if (existing.includes(marker)) return existing;
  const eol = eolOf(existing);
  return `${existing.trimEnd()}${withEol(`\n${marker}${section.body}`, eol)}`;
}

function gradleReadmeSection(inputs: JvmRootInputs): { arch: JvmRootArch; body: string } {
  if (inputs.arch === 'cli') {
    const run =
      inputs.framework === 'spring'
        ? `./gradlew :application:cli:bootRun --args="hello --name World"`
        : inputs.framework === 'micronaut'
          ? `./gradlew :application:cli:run --args="hello --name World"`
          : `./gradlew :application:cli:quarkusDev\n# or once built:\n./gradlew :application:cli:run --args="hello --name World"`;
    const build =
      inputs.framework === 'quarkus'
        ? `./gradlew :application:cli:build -Dquarkus.package.type=native`
        : inputs.framework === 'spring'
          ? `./gradlew build\njava -jar application/cli/build/libs/application-cli-0.1.0-SNAPSHOT.jar hello --name World`
          : `./gradlew build\njava -jar application/cli/build/libs/application-cli-0.1.0-SNAPSHOT-all.jar hello --name World`;
    const buildHeading = inputs.framework === 'quarkus' ? 'Build a native binary' : 'Build';
    return {
      arch: 'cli',
      body: `\`\`\`
application/
  cli/         — picocli + ${FRAMEWORKS[inputs.framework].label}: maps flags to
                 commands, dispatches via the mediator, and hosts the
                 composition root
\`\`\`

#### Run

\`\`\`sh
${run}
\`\`\`

#### ${buildHeading}

\`\`\`sh
${build}
\`\`\`
`,
    };
  }

  const run =
    inputs.framework === 'spring'
      ? `./gradlew :application:rest:executable:bootRun`
      : inputs.framework === 'micronaut'
        ? `./gradlew :application:rest:executable:run`
        : `./gradlew :application:rest:executable:quarkusDev`;
  const build =
    inputs.framework === 'quarkus'
      ? `./gradlew build\njava -jar application/rest/executable/build/quarkus-app/quarkus-run.jar`
      : inputs.framework === 'spring'
        ? `./gradlew build\njava -jar application/rest/executable/build/libs/application-rest-executable-0.1.0-SNAPSHOT.jar`
        : `./gradlew build\njava -jar application/rest/executable/build/libs/application-rest-executable-0.1.0-SNAPSHOT-all.jar`;
  return {
    arch: 'rest',
    body: `\`\`\`
application/
  rest/
    contract/    — transport DTOs (GreetResponse, ProblemDetails);
                   zero business logic
    executable/  — ${
      inputs.framework === 'quarkus'
        ? 'Jakarta REST resource'
        : inputs.framework === 'spring'
          ? 'Spring MVC controller'
          : 'Micronaut controller'
    }, the domain-error → RFC 9457
                   Problem Details mapper, and the composition root
\`\`\`

#### Run

\`\`\`sh
${run}
# then:
curl 'http://localhost:8080/greet?name=World'
\`\`\`

#### Build

\`\`\`sh
${build}
\`\`\`
`,
  };
}

function mavenReadmeSection(inputs: JvmRootInputs): { arch: JvmRootArch; body: string } {
  if (inputs.arch === 'cli') {
    const run =
      inputs.framework === 'spring'
        ? `./mvnw -am -pl application/cli spring-boot:run -Dspring-boot.run.arguments="hello --name World"`
        : inputs.framework === 'micronaut'
          ? `./mvnw package\njava -jar application/cli/target/application-cli-0.1.0-SNAPSHOT.jar hello --name World`
          : `./mvnw -am -pl application/cli quarkus:dev\n# or once built:\njava -jar application/cli/target/quarkus-app/quarkus-run.jar hello --name World`;
    const buildHeading = inputs.framework === 'quarkus' ? 'Build a native binary' : 'Build';
    const build =
      inputs.framework === 'quarkus'
        ? `./mvnw -am -pl application/cli package -Dnative`
        : inputs.framework === 'spring'
          ? `./mvnw package\njava -jar application/cli/target/application-cli-0.1.0-SNAPSHOT.jar hello --name World`
          : `./mvnw package\njava -jar application/cli/target/application-cli-0.1.0-SNAPSHOT.jar hello --name World`;
    return {
      arch: 'cli',
      body: `\`\`\`
application/
  cli/         — picocli + ${FRAMEWORKS[inputs.framework].label}: maps flags to
                 commands, dispatches via the mediator, and hosts the
                 composition root
\`\`\`

#### Run

\`\`\`sh
${run}
\`\`\`

#### ${buildHeading}

\`\`\`sh
${build}
\`\`\`
`,
    };
  }

  const run =
    inputs.framework === 'spring'
      ? `./mvnw -am -pl application/rest/executable spring-boot:run`
      : inputs.framework === 'micronaut'
        ? `./mvnw -am -pl application/rest/executable mn:run`
        : `./mvnw -am -pl application/rest/executable quarkus:dev`;
  const build =
    inputs.framework === 'quarkus'
      ? `./mvnw package\njava -jar application/rest/executable/target/quarkus-app/quarkus-run.jar`
      : `./mvnw package\njava -jar application/rest/executable/target/application-rest-executable-0.1.0-SNAPSHOT.jar`;
  return {
    arch: 'rest',
    body: `\`\`\`
application/
  rest/
    contract/    — transport DTOs (GreetResponse, ProblemDetails);
                   zero business logic
    executable/  — ${
      inputs.framework === 'quarkus'
        ? 'Jakarta REST resource'
        : inputs.framework === 'spring'
          ? 'Spring MVC controller'
          : 'Micronaut controller'
    }, the domain-error → RFC 9457
                   Problem Details mapper, and the composition root
\`\`\`

#### Run

\`\`\`sh
${run}
# then:
curl 'http://localhost:8080/greet?name=World'
\`\`\`

#### Build

\`\`\`sh
${build}
\`\`\`
`,
  };
}
