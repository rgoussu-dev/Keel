/**
 * Shared machinery for the **composed-entrypoint** JVM e2e cells —
 * the stacks whose tag set carries both `arch.cli` and
 * `arch.server-http`, so one hexagon ships two deployment units.
 *
 * Everything a single-entrypoint cell does, this does twice over one
 * project: scaffold, build once, then run the CLI assembly's jar and
 * boot the REST assembly's. The two drive steps are not written here
 * — they are {@link driveCliJar} and {@link driveRestJar}, lifted out
 * of the CLI and REST harnesses for this file to call. That is
 * deliberate and it is the point: a combo cell must assert the *same*
 * stdout contract and the *same* `/greet` wire contract its
 * single-entrypoint siblings do, or "both entrypoints still work"
 * degrades into "both entrypoints do something".
 *
 * **What only a combo cell can see.** The composed path exists
 * because two bootstraps used to render whole-file copies of the same
 * root files and collided on them — the defect
 * `jvm-shared-root.ts` fixed for `basic` and
 * `jvm-shared-root-modulith.ts` for `modulith`. The failure modes
 * that survive a scaffold are all downstream of that: a module
 * registered twice (Gradle fails to configure, Maven builds it
 * twice), a module registered under only one entrypoint's list (the
 * other assembly's jar is missing a dependency it compiles against),
 * or one identity answer winning over the other so every `<parent>`
 * names an artifactId the reactor root does not have. None of them
 * is visible to a test that reads emitted files and stops; every one
 * of them is loud here.
 *
 * **One project, one build, two runs.** The build is `./gradlew
 * build` / `./mvnw verify` exactly once — both assemblies are modules
 * of it, so a second invocation would prove nothing and cost a
 * second cold resolve. Suites share their dependency home across
 * cases from `beforeAll`, per `AGENTS.md` §9.
 */

import path from 'node:path';
import fs from 'fs-extra';
import { expect } from 'vitest';
import { buildProject, scaffold, skipJvmE2E, type JvmProjectSpec } from './jvm-e2e.js';
import { driveCliJar, type JvmCliContract } from './jvm-cli-e2e.js';
import { driveRestJar, type JvmRestContract } from './jvm-rest-e2e.js';

export { E2E_TIMEOUT_MS, skipJvmMavenE2E } from './jvm-e2e.js';

/** Whether the composed-entrypoint JVM e2e cells should be skipped. */
export const skipJvmComboE2E = skipJvmE2E;

/** The version every emitted JVM assembly packages under. */
const VERSION = '0.1.0-SNAPSHOT';

/** The two module layouts a combo stack ships under. */
export type ComboLayout = 'basic' | 'modulith';

/** The two build systems a combo stack ships under. */
export type ComboBuild = 'gradle' | 'maven';

/**
 * Where each entrypoint's assembly lives, per layout.
 *
 * The CLI assembly is `application/cli` either way; the REST one
 * moves. Under `basic` the REST entrypoint is a two-module pair whose
 * runnable half is `application/rest/executable`, because its wire
 * types are published separately from the process that serves them.
 * Under `modulith` those wire types have already moved *inside* the
 * bounded context (`modules/greeting/user-side/api/contract`), so
 * what is left at the top is one assembly, `application/api`.
 */
const ASSEMBLIES: Readonly<Record<ComboLayout, { cli: string[]; rest: string[] }>> = {
  basic: { cli: ['application', 'cli'], rest: ['application', 'rest', 'executable'] },
  modulith: { cli: ['application', 'cli'], rest: ['application', 'api'] },
};

/**
 * How a framework names the runnable jar its build produces, given
 * the assembly's module path.
 *
 * Three shapes, and the differences are not cosmetic: Quarkus
 * packages a run-jar plus a `lib/` tree under a fixed directory name,
 * Spring packages one fat jar named after the module, and Micronaut
 * appends `-all` to its shadow jar — but only on Gradle, its Maven
 * packaging producing the plain name.
 */
const JAR: Readonly<Record<string, (assembly: readonly string[], build: ComboBuild) => string[]>> =
  {
    quarkus: (assembly, build) => [
      ...assembly,
      build === 'maven' ? 'target' : 'build',
      'quarkus-app',
      'quarkus-run.jar',
    ],
    spring: (assembly, build) =>
      build === 'maven'
        ? [...assembly, 'target', `${assembly.join('-')}-${VERSION}.jar`]
        : [...assembly, 'build', 'libs', `${assembly.join('-')}-${VERSION}.jar`],
    micronaut: (assembly, build) =>
      build === 'maven'
        ? [...assembly, 'target', `${assembly.join('-')}-${VERSION}.jar`]
        : [...assembly, 'build', 'libs', `${assembly.join('-')}-${VERSION}-all.jar`],
  };

/** How one framework's two entrypoints announce themselves. */
interface ComboFramework {
  /** Which {@link JAR} naming scheme the framework's packaging uses. */
  readonly packaging: keyof typeof JAR;
  /** Bootstrap adapter ids the two entrypoints record answers under. */
  readonly bootstrapIds: readonly string[];
  /** What running the CLI assembly's jar must print. */
  readonly cli: JvmCliContract;
  /** What booting the REST assembly's jar must answer. */
  readonly rest: JvmRestContract;
}

const GREET_ARGV = ['hello', '--name', 'E2E'] as const;
const GREET_STDOUT = 'Hello, E2E!';

const FRAMEWORKS: Readonly<Record<string, ComboFramework>> = {
  quarkus: {
    packaging: 'quarkus',
    bootstrapIds: [
      'walking-skeleton/quarkus-cli-bootstrap',
      'walking-skeleton/quarkus-rest-bootstrap',
    ],
    cli: { argv: GREET_ARGV, expectedStdout: GREET_STDOUT },
    rest: {
      randomPortFlag: '-Dquarkus.http.port=0',
      announceRe: /Listening on: https?:\/\/[^:\s]+:(\d+)/,
      healthLivePath: '/q/health/live',
      healthReadyPath: '/q/health/ready',
      extraJvmFlags: ['-Dquarkus.otel.sdk.disabled=true'],
    },
  },
  spring: {
    packaging: 'spring',
    bootstrapIds: [
      'walking-skeleton/spring-cli-bootstrap',
      'walking-skeleton/spring-rest-bootstrap',
    ],
    cli: { argv: GREET_ARGV, expectedStdout: GREET_STDOUT },
    rest: {
      randomPortFlag: '-Dserver.port=0',
      announceRe: /Tomcat started on port(?:\(s\))?:? (\d+)/,
      healthLivePath: '/actuator/health/liveness',
      healthReadyPath: '/actuator/health/readiness',
      extraJvmFlags: [
        '-Dmanagement.tracing.enabled=false',
        '-Dmanagement.otlp.tracing.export.enabled=false',
        '-Dmanagement.otlp.metrics.export.enabled=false',
      ],
    },
  },
  micronaut: {
    packaging: 'micronaut',
    bootstrapIds: [
      'walking-skeleton/micronaut-cli-bootstrap',
      'walking-skeleton/micronaut-rest-bootstrap',
    ],
    cli: { argv: GREET_ARGV, expectedStdout: GREET_STDOUT },
    rest: {
      randomPortFlag: '-Dmicronaut.server.port=0',
      announceRe: /Server Running: https?:\/\/[^:\s]+:(\d+)/,
      healthLivePath: '/health/liveness',
      healthReadyPath: '/health/readiness',
      extraJvmFlags: ['-Dmicronaut.metrics.export.otlp.enabled=false'],
    },
  },
};

/**
 * The six JVM stacks that compose both entrypoints, mapped to the
 * framework whose packaging and probes they inherit.
 *
 * Language is not an axis of {@link FRAMEWORKS} on purpose: Kotlin
 * changes the sources, the Gradle plugins and the Maven reactor
 * block, and none of the three reaches the jar's name or the line the
 * server prints when it binds. It is very much an axis of the *grid*
 * — each of these six is its own set of cells — just not of this
 * table.
 */
const COMBO_STACKS: Readonly<Record<string, keyof typeof FRAMEWORKS>> = {
  'quarkus-cli-rest': 'quarkus',
  'quarkus-cli-rest-kotlin': 'quarkus',
  'spring-cli-rest': 'spring',
  'spring-cli-rest-kotlin': 'spring',
  'micronaut-cli-rest': 'micronaut',
  'micronaut-cli-rest-kotlin': 'micronaut',
};

/** One cell of the composed-entrypoint grid. */
export interface JvmComboCell {
  /** Combo stack preset to scaffold; a key of {@link COMBO_STACKS}. */
  readonly stack: string;
  /** Module layout the cell covers. */
  readonly moduleLayout: ComboLayout;
  /** Build system the cell covers. */
  readonly buildSystem: ComboBuild;
}

/**
 * Every module the root build file must register, exactly once.
 *
 * This is the assertion the composed path exists for. Each entrypoint
 * bootstrap contributes its own modules to a list the other one also
 * writes to, and the upsert that merges them is idempotent by
 * construction rather than by accident — so a regression shows up as
 * a duplicate `include(…)` or a missing one, both of which this
 * catches before a minutes-long build has to.
 */
const registeredModules = (layout: ComboLayout): readonly string[] =>
  layout === 'modulith'
    ? [
        'platform/kernel',
        'modules/greeting/domain/contract',
        'modules/greeting/domain/core',
        'modules/greeting/user-side/service',
        'modules/greeting/user-side/cli',
        'application/cli',
        'modules/greeting/user-side/api/contract',
        'modules/greeting/user-side/api/adapters',
        'application/api',
      ]
    : [
        'domain/kernel',
        'domain/contract',
        'domain/core',
        'application/cli',
        'application/rest/contract',
        'application/rest/executable',
      ];

/**
 * Asserts the root build file names each module of the composed
 * project exactly once, in whichever syntax the build system uses.
 */
async function expectOneModuleList(cell: JvmComboCell, cwd: string): Promise<void> {
  const maven = cell.buildSystem === 'maven';
  const file = maven ? 'pom.xml' : 'settings.gradle.kts';
  const root = await fs.readFile(path.join(cwd, file), 'utf8');
  for (const module of registeredModules(cell.moduleLayout)) {
    const entry = maven
      ? `<module>${module}</module>`
      : `include(":${module.split('/').join(':')}")`;
    expect(root, `${file} is missing ${entry}`).toContain(entry);
    expect(root.split(entry), `${file} registers ${entry} more than once`).toHaveLength(2);
  }
}

/**
 * Scaffolds one combo cell, builds it once with the generated
 * wrapper, then proves **both** entrypoints off the artefacts that
 * build produced: the CLI assembly's jar greets on stdout, and the
 * REST assembly's jar boots and answers the whole `/greet` wire
 * contract.
 *
 * `withPeerContext` rides along under `modulith`, for the same reason
 * the single-entrypoint modulith cells carry it: the peer-context
 * adapter resolves its target assembly by reading the `arch.cli` tag,
 * and a combo tag set is the only input where that read is a genuine
 * choice between two assemblies that both exist.
 */
export async function runJvmComboE2E(
  cell: JvmComboCell,
  cwd: string,
  depCache: string,
): Promise<void> {
  const framework = FRAMEWORKS[COMBO_STACKS[cell.stack] as string] as ComboFramework;
  const spec: JvmProjectSpec = {
    stack: cell.stack,
    bootstrapId: framework.bootstrapIds,
    moduleLayout: cell.moduleLayout,
    buildSystem: cell.buildSystem,
    ...(cell.moduleLayout === 'modulith' ? { withPeerContext: true } : {}),
  };

  await scaffold(spec, cwd);
  await expectOneModuleList(cell, cwd);

  const env = { ...process.env, GRADLE_USER_HOME: depCache };
  buildProject(spec, cwd, depCache, []);

  const assemblies = ASSEMBLIES[cell.moduleLayout];
  const naming = JAR[framework.packaging] as (
    assembly: readonly string[],
    build: ComboBuild,
  ) => string[];
  const cliJar = path.join(cwd, ...naming(assemblies.cli, cell.buildSystem));
  const restJar = path.join(cwd, ...naming(assemblies.rest, cell.buildSystem));
  expect(await fs.pathExists(cliJar), `missing ${cliJar}`).toBe(true);
  expect(await fs.pathExists(restJar), `missing ${restJar}`).toBe(true);

  driveCliJar(cliJar, framework.cli, cwd, env);
  await driveRestJar(restJar, framework.rest, cwd, env);
}
