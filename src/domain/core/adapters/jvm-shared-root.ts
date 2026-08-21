/**
 * Shared root-file patches for the JVM walking-skeleton bootstraps
 * (basic module layout only).
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

interface FrameworkMeta {
  readonly label: string;
  /** Inner lines of the root `gradle.properties`. */
  readonly gradleProperties: readonly string[];
  /** Inner lines of the root Maven `<properties>` block. */
  readonly mavenProperties: readonly string[];
  /**
   * Whether the root `build.gradle.kts`/`pom.xml` needs the
   * `archiveBaseName` block: Spring's boot jar and Micronaut's shadow
   * jar both pack by file name, so `application/rest/contract` and
   * `domain/contract` colliding on `contract-<version>.jar` is a real
   * clash; Quarkus's own packaging does not hit it.
   */
  readonly archiveBaseName: boolean;
  /** The Gradle `plugins {}` id(s) that apply Kotlin for this framework. */
  readonly kotlinGradlePlugins: readonly string[];
}

const KOTLIN_VERSION = '2.4.10';

const FRAMEWORKS: Readonly<Record<JvmFramework, FrameworkMeta>> = {
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

/** Maven/Gradle module paths one arch's entrypoint contributes. */
const ARCH_MODULES: Readonly<Record<JvmRootArch, readonly string[]>> = {
  cli: ['application/cli'],
  rest: ['application/rest/contract', 'application/rest/executable'],
};

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
      seed: gradleSettingsSeed(inputs.projectName),
      apply: (existing) => appendMissingLines(existing, gradleIncludeLines(inputs.arch)),
    },
    {
      target: 'build.gradle.kts',
      seed: gradleBuildSeed(inputs.framework, inputs.language, inputs.basePackage),
      apply: (existing) => existing,
    },
    {
      target: 'gradle.properties',
      seed: `${['org.gradle.parallel=true', 'org.gradle.caching=true', ...meta.gradleProperties].join('\n')}\n`,
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
      seed: mavenPomSeed(
        inputs.language,
        inputs.basePackage,
        inputs.projectName,
        meta.mavenProperties,
      ),
      apply: (existing) => insertModules(existing, ARCH_MODULES[inputs.arch]),
    },
    {
      target: 'README.md',
      seed: readmeSeed(meta.label, inputs.projectName, './mvnw test'),
      apply: (existing) => appendReadmeSection(existing, mavenReadmeSection(inputs)),
    },
  ];
}

function gradleSettingsSeed(projectName: string): string {
  return `plugins {
    // Auto-provisions the pinned Java toolchain (JDK 25) when the
    // machine's installed JDK does not match.
    id("org.gradle.toolchains.foojay-resolver-convention") version "1.0.0"
}

rootProject.name = "${projectName}"

include(":domain:kernel")
include(":domain:contract")
include(":domain:core")
`;
}

function gradleIncludeLines(arch: JvmRootArch): readonly string[] {
  return ARCH_MODULES[arch].map((m) => `include(":${m.replace(/\//g, ':')}")`);
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
function gradleBuildSeed(
  framework: JvmFramework,
  language: JvmRootLanguage,
  basePackage: string,
): string {
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
  const archiveBaseNameBlock = meta.archiveBaseName
    ? `

    // Archive file names must be unique for the same reason: a boot/
    // shadow jar (and any flat lib/ layout) packs libraries by file
    // name, so two modules both producing contract-<version>.jar
    // would collide.
    tasks.withType<Jar>().configureEach {
        archiveBaseName.set(project.path.removePrefix(":").replace(':', '-'))
    }`
    : '';
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

    // "contract" exists under both domain/ and application/rest/, and
    // Gradle conflict-resolves subprojects that share module
    // coordinates (group:name) into a single module — so derive each
    // group from the project path to keep every module's coordinates
    // unique.
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

function mavenPomSeed(
  language: JvmRootLanguage,
  basePackage: string,
  projectName: string,
  frameworkProperties: readonly string[],
): string {
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
    <module>domain/kernel</module>
    <module>domain/contract</module>
    <module>domain/core</module>
  </modules>

  <properties>
${propsBlock}
  </properties>
${kotlin?.dependencies ?? ''}
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

function insertModules(existing: string, modules: readonly string[]): string {
  const missing = modules.filter((m) => !existing.includes(`<module>${m}</module>`));
  if (missing.length === 0) return existing;
  const eol = eolOf(existing);
  const lines = missing.map((m) => withEol(`    <module>${m}</module>\n`, eol)).join('');
  const marker = withEol('  </modules>', eol);
  return existing.replace(marker, `${lines}${marker}`);
}

function appendMissingLines(existing: string, lines: readonly string[]): string {
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

function appendReadmeSection(
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
          ? `./gradlew build\njava -jar application/cli/build/libs/cli-0.1.0-SNAPSHOT.jar hello --name World`
          : `./gradlew build\njava -jar application/cli/build/libs/cli-0.1.0-SNAPSHOT-all.jar hello --name World`;
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
