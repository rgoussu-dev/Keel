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
 * onto it, its modules and its README section each at their rank
 * (`rank.ts`), so an entrypoint a later run brings lands where one
 * run puts it. `gradle.properties` and `build.gradle.kts` need no
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
import type { Tag } from '../../contract/tags.js';
import { placeReadmeSection, rankedIndex } from '../rank.js';
import { readmeUpsert } from './adopted-files.js';
import type { JvmBuildSystem } from './jvm-build-system.js';
import { codeOnly, eolOf, withEol } from '../util.js';

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
  /** The project's tags, which rank its README section among the others. */
  readonly tags: readonly Tag[];
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
 * The modules a layout's root build file lists by what brings them —
 * which is what ranks them there ({@link placeIncludes},
 * {@link placeModules}).
 */
export interface RootModules {
  /** The modules the seed lists: the project as it looks with no entrypoint yet. */
  readonly seed: readonly string[];
  /** The modules each entrypoint adds. */
  readonly arch: Readonly<Record<JvmRootArch, readonly string[]>>;
}

/**
 * The basic layout's modules: the domain trisection seeds every
 * entrypoint, and each adds its `application/…` modules.
 */
const MODULES: RootModules = {
  seed: ['domain/kernel', 'domain/contract', 'domain/core'],
  arch: {
    cli: ['application/cli'],
    rest: ['application/rest/contract', 'application/rest/executable'],
  },
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
 * rest compose onto it, each entry at its rank.
 */
export function jvmSharedRootPatches(inputs: JvmRootInputs): readonly ContributionPatch[] {
  return inputs.buildSystem === 'gradle' ? gradlePatches(inputs) : mavenPatches(inputs);
}

function gradlePatches(inputs: JvmRootInputs): readonly ContributionPatch[] {
  const meta = FRAMEWORKS[inputs.framework];
  return [
    {
      target: 'settings.gradle.kts',
      seed: gradleSettingsSeed(inputs.projectName, MODULES.seed),
      apply: (existing) => placeIncludes(existing, MODULES, inputs.arch),
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
    readmeUpsert(readmeSeed(meta.label, inputs.projectName, './gradlew test'), (existing) =>
      addReadmeSection(existing, gradleReadmeSection(inputs), inputs.tags),
    ),
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
        modules: MODULES.seed,
      }),
      apply: (existing) => placeModules(existing, MODULES, inputs.arch),
    },
    readmeUpsert(readmeSeed(meta.label, inputs.projectName, './mvnw test'), (existing) =>
      addReadmeSection(existing, mavenReadmeSection(inputs), inputs.tags),
    ),
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
function gradleIncludeLines(modules: readonly string[]): readonly string[] {
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
 * A module's rank in its layout's root list (`rank.ts`): its place in
 * the order one run writes — the seed's modules, then the CLI's, then
 * REST's, as `ENTRYPOINTS` lists them, each entrypoint's in its own
 * order — or after all of them for any other, whatever brings it: the
 * port fake, the peer context, persistence, an added context, the
 * user's own. Ranked one by one, a module the user deleted from an
 * entrypoint's several goes back beside its siblings where it was.
 */
function moduleRank(modules: RootModules, path: string): number {
  const order = [...modules.seed, ...modules.arch.cli, ...modules.arch.rest];
  const at = order.indexOf(path);
  return at === -1 ? order.length : at;
}

/**
 * Adds whichever of one entrypoint's `include(…)` lines
 * `settings.gradle.kts` lacks, each at its rank ({@link moduleRank}):
 * before the first include ranked above it, or appended where none is,
 * as they always were. So an entrypoint arriving in a later run — the
 * CLI's on a REST project, REST's after the port fake — lands where
 * one run puts it. An include is a line holding one `include("…")` and
 * nothing else; one in a comment or a string, as `util.ts`'s
 * `codeOnly` reads the file, ranks nothing. Idempotent, so the second
 * entrypoint to resolve composes onto the first's list.
 */
export function placeIncludes(existing: string, modules: RootModules, arch: JvmRootArch): string {
  return modules.arch[arch].reduce((text, module) => placeInclude(text, modules, module), existing);
}

function placeInclude(existing: string, modules: RootModules, module: string): string {
  const [include] = gradleIncludeLines([module]) as [string];
  if (existing.includes(include)) return existing;
  const lines = existing.split('\n');
  const code = codeOnly(existing).code.split('\n');
  const at = rankedIndex(
    lines.map((line, index) => {
      const path = (code[index] as string).trim() === '' ? undefined : INCLUDE.exec(line)?.[1];
      return path === undefined ? undefined : moduleRank(modules, path.replace(/:/g, '/'));
    }),
    moduleRank(modules, module),
  );
  if (at !== -1) return insertBeforeLine(existing, at, `${include}\n`);
  return `${existing.replace(/\s*$/, '')}${withEol(`\n${include}\n`, eolOf(existing))}`;
}

/** A line holding one `include("…")`, its module path in Gradle's notation. */
const INCLUDE = /^\s*include\(\s*":?([^"]+)"\s*\)\s*$/;

/**
 * Adds whichever of one entrypoint's modules the reactor root does
 * not already list, each at its rank ({@link moduleRank}): before the
 * first `<module>` ranked above it, or immediately before the
 * `</modules>` close where none is, as they always were. Only the
 * root's own list ranks — the lines before its first `</modules>`,
 * none inside an XML comment — so a profile's modules below it, or one
 * the user commented out, never draw an entry. Idempotent, so the
 * second entrypoint to resolve composes onto the first's list.
 */
export function placeModules(existing: string, modules: RootModules, arch: JvmRootArch): string {
  return modules.arch[arch].reduce((text, module) => placeModule(text, modules, module), existing);
}

function placeModule(existing: string, modules: RootModules, module: string): string {
  if (existing.includes(`<module>${module}</module>`)) return existing;
  const entry = `    <module>${module}</module>\n`;
  const lines = existing.split('\n');
  const comments = blockCommented(lines, '<!--', '-->');
  const end = lines.findIndex((line) => line.includes('</modules>'));
  const at = rankedIndex(
    lines.map((line, index) => {
      const path = end !== -1 && index > end ? undefined : MODULE.exec(line)?.[1];
      return path === undefined || comments[index] === true ? undefined : moduleRank(modules, path);
    }),
    moduleRank(modules, module),
  );
  if (at !== -1) return insertBeforeLine(existing, at, entry);
  const marker = withEol('  </modules>', eolOf(existing));
  return existing.replace(marker, `${withEol(entry, eolOf(existing))}${marker}`);
}

/** A line holding one `<module>…</module>`, its path. */
const MODULE = /^\s*<module>([^<]+)<\/module>\s*$/;

/**
 * Whether each of `lines` is inside a block comment between `open`
 * and `close`, the lines holding either counted in, so that no entry
 * is read in one.
 */
function blockCommented(lines: readonly string[], open: string, close: string): boolean[] {
  let inside = false;
  return lines.map((line) => {
    const touched = inside || line.includes(open);
    const opened = line.lastIndexOf(open);
    const closed = line.lastIndexOf(close);
    if (opened > closed) inside = true;
    else if (closed > opened) inside = false;
    return touched;
  });
}

/**
 * `existing` with `block`, LF-authored whole lines, inserted
 * immediately before its line `index`, in the file's own line
 * endings; every byte already there is kept.
 */
function insertBeforeLine(existing: string, index: number, block: string): string {
  const offset = existing
    .split('\n')
    .slice(0, index)
    .reduce((sum, line) => sum + line.length + 1, 0);
  return `${existing.slice(0, offset)}${withEol(block, eolOf(existing))}${existing.slice(offset)}`;
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
 * Adds one entrypoint's README section at its rank among the others
 * (`rank.ts`), unless its marker is already there — the idempotence
 * the shared-file upsert needs. The marker is matched in the file's
 * own line endings, so a README checked out as CRLF still has its
 * section and a reapply adds nothing.
 */
export function addReadmeSection(
  existing: string,
  section: { arch: JvmRootArch; body: string },
  tags: readonly Tag[],
): string {
  const marker = readmeMarker(section.arch);
  if (existing.includes(withEol(marker, eolOf(existing)))) return existing;
  return placeReadmeSection(existing, `${marker}${section.body}`, tags);
}

function gradleReadmeSection(inputs: JvmRootInputs): { arch: JvmRootArch; body: string } {
  if (inputs.arch === 'cli') {
    const run =
      inputs.framework === 'spring'
        ? `./gradlew :application:cli:bootRun --args="hello --name World"`
        : inputs.framework === 'micronaut'
          ? `./gradlew :application:cli:run --args="hello --name World"`
          : `./gradlew :application:cli:quarkusDev --quarkus-args="hello --name World"\n# or once built:\njava -jar application/cli/build/quarkus-app/quarkus-run.jar hello --name World`;
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
          : `./mvnw -am -pl application/cli quarkus:dev -Dquarkus.args="hello --name World"\n# or once built:\njava -jar application/cli/target/quarkus-app/quarkus-run.jar hello --name World`;
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
