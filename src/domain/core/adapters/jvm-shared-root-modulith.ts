/**
 * Shared root-file patches for the JVM walking-skeleton bootstraps
 * under the **modulith** module layout — the sibling of
 * [`jvm-shared-root.ts`](./jvm-shared-root.js), which does the same
 * job for `basic` and owns the seed builders both layouts share.
 *
 * The problem is the one that module documents: every entrypoint
 * bootstrap used to render a whole-file copy of the project's root
 * files, so a tag set carrying both `arch.cli` and `arch.server-http`
 * hit two whole-file writes on one path — a conflict per
 * {@link import('../apply.js').applyContribution} even when the bytes
 * match. The fix is the same shared-file upsert: one seed per root
 * file, shared by every entrypoint of a (framework, language, build
 * system) triple, plus an idempotent per-arch `apply`.
 *
 * What is *not* the same is the tree the seed describes, and this is
 * where the modulith earns its own module rather than a flag on the
 * other one:
 *
 * - **The seed is a bounded context, not a layer cake.** `basic`
 *   seeds the domain trisection (`domain/{kernel,contract,core}`) and
 *   each entrypoint appends its `application/…` modules. Here the
 *   seed is `platform/kernel` plus the skeleton context's own
 *   hexagon — `modules/greeting/domain/{contract,core}` and the
 *   `user-side/service` seam that makes the context extractable — and
 *   an entrypoint appends **two** things: its driving adapter
 *   *inside* the context (`user-side/cli`, or `user-side/api/…`) and
 *   its assembly under `application/`. The list is per-context, so it
 *   grows sideways as contexts are added rather than downwards as
 *   layers are.
 * - **The `archiveBaseName` block is unconditional.** Under `basic`
 *   it is a Spring/Micronaut concern that Quarkus's packaging dodges.
 *   Here every framework needs it: leaf project names repeat by
 *   construction (`contract` under both `domain/` and
 *   `user-side/api/`, `cli` under both `application/` and
 *   `user-side/`), and on Quarkus a colliding archive name puts an
 *   assembly's own jar among its dependencies.
 * - **The README describes a different project.** Not a layer listing
 *   plus a deployment unit, but a context with a seam, and the
 *   paragraph explaining how a *second* context reaches this one.
 *
 * Everything else — the reactor pom, the toolchain pins, the plugin
 * management, `gradle.properties` — is the same file either way, and
 * comes from the seed builders next door.
 */

import type { ContributionPatch } from '../../contract/composition.js';
import {
  appendMissingLines,
  appendReadmeSection,
  FRAMEWORKS,
  gradleBuildSeed,
  gradleIncludeLines,
  gradlePropertiesSeed,
  gradleSettingsSeed,
  insertModules,
  mavenPomSeed,
  type JvmRootArch,
  type JvmRootInputs,
} from './jvm-shared-root.js';
import { jvmLayout, MODULITH_LAYOUT_TAG, SKELETON_MODULE } from './jvm-module-layout.js';

const LAYOUT = jvmLayout([MODULITH_LAYOUT_TAG]);

/**
 * The modules every modulith entrypoint shares: the platform kernel
 * and the skeleton context's own hexagon, seam included. This is the
 * project with no entrypoint yet — a bounded context nothing drives.
 */
const SEED_MODULES: readonly string[] = [
  LAYOUT.kernel,
  LAYOUT.domainContract,
  LAYOUT.domainCore,
  // Non-null by construction: `service` is absent only under `basic`.
  LAYOUT.service as string,
];

/**
 * The CLI's driving adapter inside the context. `jvmLayout` names the
 * REST adapter modules and both assemblies but not this one — under
 * `basic` the CLI adapter and its assembly are the same module, so
 * there is nothing for a `cliAdapters` field to mean there.
 */
const CLI_ADAPTER = `modules/${SKELETON_MODULE}/user-side/cli`;

/**
 * What one arch adds to the seed: its driving adapter inside the
 * context, then the assembly that mounts it.
 */
const ARCH_MODULES: Readonly<Record<JvmRootArch, readonly string[]>> = {
  cli: [CLI_ADAPTER, LAYOUT.cliRuntime],
  rest: [LAYOUT.restContract, LAYOUT.restAdapters, LAYOUT.restRuntime],
};

/**
 * Reactor-root dependency management, per framework.
 *
 * Only Micronaut needs any, and only on Maven: its assembly parents
 * `micronaut-parent` to get the plugin and its dependency management,
 * every other module parents this reactor root instead, and Maven
 * allows one parent. Without the same platform BOM imported here,
 * those modules' `io.micronaut:*` coordinates carry no version and
 * the reactor cannot be read at all. Quarkus and Spring manage their
 * modules through BOM imports in the module poms themselves.
 */
const MAVEN_DEPENDENCY_MANAGEMENT: Readonly<Record<JvmRootInputs['framework'], string>> = {
  quarkus: '',
  spring: '',
  micronaut: `
  <!-- The assembly parents \`micronaut-parent\` and inherits its
       dependency management from there; every other module parents
       this reactor root instead, and Maven allows only one parent. So
       the root imports the same platform BOM those modules need, or
       their \`io.micronaut:*\` coordinates carry no version and the
       reactor cannot even be read. Gradle needs no equivalent — the
       Micronaut plugin applies the platform to each project it is
       applied to. -->
  <dependencyManagement>
    <dependencies>
      <dependency>
        <groupId>io.micronaut.platform</groupId>
        <artifactId>micronaut-platform</artifactId>
        <version>\${micronaut.version}</version>
        <type>pom</type>
        <scope>import</scope>
      </dependency>
    </dependencies>
  </dependencyManagement>
`,
};

const GROUP_NOTE = `    // Leaf project names repeat across the modulith — \`contract\` under
    // both domain/ and user-side/api/, \`cli\` under both application/
    // and user-side/ — and Gradle conflict-resolves subprojects sharing
    // module coordinates (group:name) into a single module. Derive each
    // group from the project path so every module's coordinates stay
    // unique.`;

const ARCHIVE_NOTE = `    // Archive *file* names must be unique for the same reason: flat
    // lib/ layouts (boot jars, application dists) pack libraries by
    // file name, and Quarkus resolves its application model by
    // artifact — a colliding name puts the assembly's own jar among
    // its dependencies and the task graph goes circular. Name each
    // archive after its project path.`;

/**
 * The root-file patches one JVM entrypoint bootstrap contributes
 * under the modulith layout. Every entrypoint of the same
 * (framework, language, build system) triple supplies the identical
 * seed for each target, so whichever resolves first creates the file
 * and the rest compose onto it in adapter-resolution order.
 */
export function jvmModulithRootPatches(inputs: JvmRootInputs): readonly ContributionPatch[] {
  return inputs.buildSystem === 'gradle' ? gradlePatches(inputs) : mavenPatches(inputs);
}

function gradlePatches(inputs: JvmRootInputs): readonly ContributionPatch[] {
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
        archiveNote: ARCHIVE_NOTE,
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
      seed: readmeSeed(inputs, './gradlew test'),
      apply: (existing) => appendReadmeSection(existing, gradleReadmeSection(inputs)),
    },
  ];
}

function mavenPatches(inputs: JvmRootInputs): readonly ContributionPatch[] {
  return [
    {
      target: 'pom.xml',
      seed: mavenPomSeed({
        language: inputs.language,
        basePackage: inputs.basePackage,
        projectName: inputs.projectName,
        frameworkProperties: FRAMEWORKS[inputs.framework].mavenProperties,
        modules: SEED_MODULES,
        dependencyManagement: MAVEN_DEPENDENCY_MANAGEMENT[inputs.framework],
      }),
      apply: (existing) => insertModules(existing, ARCH_MODULES[inputs.arch]),
    },
    {
      target: 'README.md',
      seed: readmeSeed(inputs, './mvnw test'),
      apply: (existing) => appendReadmeSection(existing, mavenReadmeSection(inputs)),
    },
  ];
}

/**
 * The README with no entrypoint yet: the platform, the context, and
 * how a second context would reach it. Each entrypoint appends its
 * own driving adapter and assembly under a `### <arch>` marker.
 */
function readmeSeed(inputs: JvmRootInputs, testCmd: string): string {
  return `# ${inputs.projectName}

${FRAMEWORKS[inputs.framework].label} modulith walking skeleton scaffolded by keel — hexagonal, mediator-driven.

## Layout

\`\`\`
platform/
  kernel/        — Command, Handler, Mediator, RegistryMediator and the
                   @DomainHandler marker; depends on nothing
modules/
  ${SKELETON_MODULE}/      — one bounded context, one whole hexagon
    domain/
      contract/  — the public surface: GreetCommand + GreetRejected
                   (+ driven ports as they appear)
      core/      — the GreetCommand handler; entities live here too
    user-side/   — driving adapters, each a library an assembly mounts
      service/   — the in-process API a PEER MODULE consumes; the seam
                   that makes carving this context out cheap
    infra/       — driven adapters (arrives with the first real port)
application/     — one runnable assembly per entrypoint, below
\`\`\`

Adding a second bounded context is a sibling under \`modules/\`. It reaches
this one by declaring a driven port in *its own* vocabulary and
implementing that port in *its own* \`infra/\` over
\`${SKELETON_MODULE}/user-side/service\` — the only dependency edge allowed between
modules, and the one that becomes a remote call the day the context moves
out into its own service.

## Test

\`\`\`sh
${testCmd}
\`\`\`
`;
}

/** The `modules/…` + `application/…` listing one arch contributes. */
function layoutBlock(arch: JvmRootArch, framework: JvmRootInputs['framework']): string {
  if (arch === 'cli') {
    return `\`\`\`
modules/${SKELETON_MODULE}/user-side/
  cli/           — the picocli subcommand mapping args → a command
application/
  cli/           — the runnable CLI assembly: entry point, composition
                   roots, runtime configuration
\`\`\``;
  }
  const resource =
    framework === 'quarkus'
      ? 'the Jakarta REST resource'
      : framework === 'spring'
        ? 'the Spring MVC controller'
        : 'the Micronaut controller';
  return `\`\`\`
modules/${SKELETON_MODULE}/user-side/
  api/
    contract/    — transport DTOs (GreetResponse, ProblemDetails);
                   the artifact a downstream client consumes
    adapters/    — ${resource} and the domain-error →
                   RFC 9457 Problem Details mapper
application/
  api/           — the runnable HTTP assembly: main class, composition
                   roots, runtime configuration
\`\`\``;
}

/** Assembles one arch's README section from its run/build commands. */
function section(
  inputs: JvmRootInputs,
  run: string,
  buildHeading: string,
  build: string,
): { arch: JvmRootArch; body: string } {
  const then =
    inputs.arch === 'rest' ? `\n# then:\ncurl 'http://localhost:8080/greet?name=World'` : '';
  return {
    arch: inputs.arch,
    body: `${layoutBlock(inputs.arch, inputs.framework)}

#### Run

\`\`\`sh
${run}${then}
\`\`\`

#### ${buildHeading}

\`\`\`sh
${build}
\`\`\`
`,
  };
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
    return section(
      inputs,
      run,
      inputs.framework === 'quarkus' ? 'Build a native binary' : 'Build',
      build,
    );
  }
  const run =
    inputs.framework === 'spring'
      ? `./gradlew :application:api:bootRun`
      : inputs.framework === 'micronaut'
        ? `./gradlew :application:api:run`
        : `./gradlew :application:api:quarkusDev`;
  const build =
    inputs.framework === 'quarkus'
      ? `./gradlew build\njava -jar application/api/build/quarkus-app/quarkus-run.jar`
      : inputs.framework === 'spring'
        ? `./gradlew build\njava -jar application/api/build/libs/application-api-0.1.0-SNAPSHOT.jar`
        : `./gradlew build\njava -jar application/api/build/libs/application-api-0.1.0-SNAPSHOT-all.jar`;
  return section(inputs, run, 'Build', build);
}

function mavenReadmeSection(inputs: JvmRootInputs): { arch: JvmRootArch; body: string } {
  if (inputs.arch === 'cli') {
    const jar = `java -jar application/cli/target/application-cli-0.1.0-SNAPSHOT.jar hello --name World`;
    const run =
      inputs.framework === 'spring'
        ? `./mvnw -am -pl application/cli spring-boot:run -Dspring-boot.run.arguments="hello --name World"`
        : inputs.framework === 'micronaut'
          ? `./mvnw package\n${jar}`
          : `./mvnw -am -pl application/cli quarkus:dev\n# or once built:\njava -jar application/cli/target/quarkus-app/quarkus-run.jar hello --name World`;
    const build =
      inputs.framework === 'quarkus'
        ? `./mvnw -am -pl application/cli package -Dnative`
        : `./mvnw package\n${jar}`;
    return section(
      inputs,
      run,
      inputs.framework === 'quarkus' ? 'Build a native binary' : 'Build',
      build,
    );
  }
  const run =
    inputs.framework === 'spring'
      ? `./mvnw -am -pl application/api spring-boot:run`
      : inputs.framework === 'micronaut'
        ? `./mvnw -am -pl application/api mn:run`
        : `./mvnw -am -pl application/api quarkus:dev`;
  const build =
    inputs.framework === 'quarkus'
      ? `./mvnw package\njava -jar application/api/target/quarkus-app/quarkus-run.jar`
      : `./mvnw package\njava -jar application/api/target/application-api-0.1.0-SNAPSHOT.jar`;
  return section(inputs, run, 'Build', build);
}
