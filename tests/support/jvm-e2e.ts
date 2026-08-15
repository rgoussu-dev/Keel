/**
 * The machinery every JVM end-to-end test shares, whatever the
 * entrypoint shape it goes on to drive.
 *
 * A JVM e2e is three steps before it becomes interesting: scaffold a
 * stack into a temp directory through the real mediator, run the
 * generated wrapper's build (which runs the generated test suite), and
 * find the runnable jar the build produced. Only the fourth step
 * differs — a REST suite boots the jar and drives it over the wire
 * (`jvm-rest-e2e.ts`), a CLI suite runs it once and reads its stdout
 * (`jvm-cli-e2e.ts`). This file is the first three, and
 * {@link JvmProjectSpec} is what they are parameterised by.
 *
 * **Both build systems.** A spec's `buildSystem` picks `./gradlew
 * build` or `./mvnw verify`, and everything downstream follows: which
 * wrapper must exist, which deferred action gets retried, where the
 * runnable jar lands (`build/` vs `target/`), and how the dependency
 * cache is isolated (`GRADLE_USER_HOME` vs `-Dmaven.repo.local`).
 * Without this the Maven half of every JVM stack was scaffolded but
 * never built, which is how two Maven-only defects reached `main`.
 *
 * **Skip rules.** Skipped when `gradle`/`java` are missing from PATH,
 * skipped on CI unless `KEEL_RUN_E2E=1`, opt out anywhere with
 * `KEEL_SKIP_E2E=1`. Maven specs carry an extra rule — see
 * {@link skipJvmMavenE2E}.
 */

import path from 'node:path';
import { spawnSync } from 'node:child_process';
import fs from 'fs-extra';
import { expect } from 'vitest';
import { runActions, type RunActionsInputs } from '../../src/domain/core/actions.js';
import { addVerticalCommand, newProjectCommand } from '../../src/domain/contract/commands.js';
import type { DeferredAction } from '../../src/domain/contract/composition.js';
import { expectOk, installMediator } from './factory.js';

/** How long a JVM e2e may take: a cold cache downloads a toolchain. */
export const E2E_TIMEOUT_MS = 20 * 60 * 1000;

/**
 * Well-known flake modes from the Gradle distribution CDN that we want
 * to retry past — `Test of distribution url ... failed` (the `gradle
 * wrapper` task's HEAD probe) and `Server returned HTTP response code:
 * 5xx` (the wrapper's first-run download). Both surface 5xx responses
 * from release-assets.githubusercontent.com and are unrelated to keel;
 * without retry the suites are unreliable on cold caches.
 */
const TRANSIENT_PATTERNS = [
  /Test of distribution url .* failed/,
  /Server returned HTTP response code: 5\d\d/,
  /HEAD request to .* failed: response code \(5\d\d\)/,
];

const isTransient = (blob: string): boolean => TRANSIENT_PATTERNS.some((re) => re.test(blob));

/**
 * Rewrites the action list before handing it to the real runner:
 *   - actions in `stubbed` become no-ops (the git/CI fakes);
 *   - actions in `retried` keep their behaviour but are wrapped in a
 *     retry loop that swallows the transient HTTP flakes above.
 */
const rewriteActions =
  (config: { stubbed: ReadonlySet<string>; retried: ReadonlySet<string> }) =>
  (inputs: RunActionsInputs): Promise<void> => {
    const rewritten = inputs.actions.map((a): DeferredAction => {
      if (config.stubbed.has(a.id)) {
        return {
          id: a.id,
          description: `${a.description} [faked: no-op]`,
          run: () => Promise.resolve(),
        };
      }
      if (config.retried.has(a.id)) {
        return {
          id: a.id,
          description: a.description,
          run: (env) => withRetry(() => a.run(env)),
        };
      }
      return a;
    });
    return runActions({ ...inputs, actions: rewritten });
  };

const withRetry = async (fn: () => Promise<void>, attempts = 3): Promise<void> => {
  let last: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      await fn();
      return;
    } catch (err) {
      last = err;
      const blob = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
      if (!isTransient(blob)) throw err;
    }
  }
  throw last;
};

const onPath = (cmd: string): boolean => {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  return spawnSync(probe, [cmd], { stdio: 'ignore' }).status === 0;
};

interface RunResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

const runWithRetry = (
  cmd: string,
  args: readonly string[],
  options: Parameters<typeof spawnSync>[2],
  attempts = 3,
): RunResult => {
  let last: RunResult = { status: null, stdout: '', stderr: '' };
  for (let i = 0; i < attempts; i += 1) {
    const r = spawnSync(cmd, args, options);
    last = { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
    if (last.status === 0) return last;
    if (!isTransient(`${last.stdout}\n${last.stderr}`)) return last;
  }
  return last;
};

const optedIn = process.env.KEEL_RUN_E2E === '1';
const optedOut = process.env.KEEL_SKIP_E2E === '1';
const onCI = process.env.CI === 'true';
const toolingMissing = !onPath('gradle') || !onPath('java');

/** Whether the JVM e2e tests should be skipped in this run. */
export const skipJvmE2E = optedOut || toolingMissing || (onCI && !optedIn);

/**
 * The JDK `JAVA_HOME` points at, or 0 when it cannot be determined.
 *
 * Maven needs this and Gradle does not: the emitted projects target
 * release 25, and `settings.gradle.kts` carries the foojay resolver so
 * Gradle provisions a matching toolchain by itself. Maven compiles
 * with whatever JDK runs it, so on a JDK-21 `JAVA_HOME` a Maven e2e
 * dies with `release version 25 not supported` — an environment
 * failure that would read as a keel bug.
 */
const javaHomeMajor = (): number => {
  const home = process.env.JAVA_HOME;
  const probe = spawnSync(home ? path.join(home, 'bin', 'javac') : 'javac', ['-version'], {
    encoding: 'utf8',
  });
  const version = `${probe.stdout ?? ''}${probe.stderr ?? ''}`;
  return Number(/javac (\d+)/.exec(version)?.[1] ?? 0);
};

/** The release the generated JVM projects compile against. */
const REQUIRED_JDK = 25;

/**
 * Whether the Maven-flavoured JVM e2e tests should be skipped: every
 * rule {@link skipJvmE2E} applies, plus `mvn` on PATH (the wrapper is
 * generated by `mvn -N wrapper:wrapper`) and a new enough `JAVA_HOME`.
 */
export const skipJvmMavenE2E = skipJvmE2E || !onPath('mvn') || javaHomeMajor() < REQUIRED_JDK;

/**
 * Whether a Docker daemon answers. The persistence slice's own tests
 * need one — Testcontainers for the JDBC contract test, the
 * framework's throwaway database for the boot test — so without it
 * those two task paths are excluded and the build proves compilation
 * and wiring only.
 */
export const dockerAvailable = (): boolean =>
  spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0;

/** What it takes to scaffold and build one emitted JVM project. */
export interface JvmProjectSpec {
  /** Stack preset to scaffold. */
  readonly stack: string;
  /** Bootstrap adapter id the sticky answers are recorded under. */
  readonly bootstrapId: string;
  /** Module layout to scaffold; the stack's default when omitted. */
  readonly moduleLayout?: string;
  /** Build system to scaffold and build with; Gradle when omitted. */
  readonly buildSystem?: 'gradle' | 'maven';
  /** Also scaffold the peer bounded context (modulith only). */
  readonly withPeerContext?: boolean;
  /** Path of the runnable jar relative to the project root. */
  readonly runJar: readonly string[];
  /**
   * Path of the runnable jar under Maven, which packages into
   * `target/` where Gradle uses `build/`. Required for Maven specs.
   */
  readonly runJarMaven?: readonly string[];
}

/** Scaffolds `spec.stack` into `cwd` through the real mediator. */
export async function scaffold(spec: JvmProjectSpec, cwd: string): Promise<void> {
  const maven = spec.buildSystem === 'maven';
  const mediator = installMediator({
    keelVersion: '0.0.0-e2e',
    runDeferred: rewriteActions({
      stubbed: new Set(['vcs/git-init']),
      retried: new Set([
        maven ? 'walking-skeleton/maven-wrapper' : 'walking-skeleton/gradle-wrapper',
      ]),
    }),
  });
  expectOk(
    await mediator.dispatch(
      newProjectCommand({
        cwd,
        stack: spec.stack,
        answers: {
          [spec.bootstrapId]: {
            basePackage: 'com.acme.e2e',
            projectName: `walking-skeleton-${spec.stack}-e2e`,
          },
          'vcs/git-init': { remote: '', defaultBranch: 'main' },
        },
        interactive: false,
        dryRun: false,
        ...(spec.moduleLayout !== undefined ? { moduleLayout: spec.moduleLayout } : {}),
        ...(spec.buildSystem !== undefined ? { buildSystem: spec.buildSystem } : {}),
        ...(spec.withPeerContext === true ? { withPeerContext: true } : {}),
      }),
    ),
  );
  await expect(fs.pathExists(path.join(cwd, maven ? 'mvnw' : 'gradlew'))).resolves.toBe(true);
}

/** Layers `vertical` onto the project already scaffolded in `cwd`. */
export async function addVertical(vertical: string, cwd: string): Promise<void> {
  const mediator = installMediator({ keelVersion: '0.0.0-e2e' });
  expectOk(
    await mediator.dispatch(
      addVerticalCommand({ cwd, vertical, answers: {}, interactive: false, dryRun: false }),
    ),
  );
}

/**
 * The environment a generated project's build runs its tests in.
 *
 * `QUARKUS_HTTP_TEST_PORT=0` is the load-bearing entry, and it belongs
 * here rather than in the emitted `application.properties`: a
 * scaffolded project is perfectly correct binding the default 8081,
 * and only *this harness* runs several Quarkus test JVMs at once —
 * vitest executes e2e files in parallel, so two suites reach for the
 * same port and the loser dies with `QuarkusBindException`. Nothing a
 * keel user would ever hit, so nothing a keel user should have to
 * carry in their config. Quarkus injects the port it actually bound
 * into RestAssured, so the emitted tests need no change either.
 */
export function jvmTestEnv(): NodeJS.ProcessEnv {
  return { ...process.env, QUARKUS_HTTP_TEST_PORT: '0' };
}

/**
 * Runs the generated wrapper's build for whichever build system the
 * spec asked for, failing loudly with its output. Gradle's `build`
 * and Maven's `verify` are the equivalent lifecycle points: both
 * compile every module and run every generated test.
 */
export function buildProject(
  spec: JvmProjectSpec,
  cwd: string,
  cache: string,
  extraArgs: readonly string[],
): void {
  if (spec.buildSystem === 'maven') {
    mavenBuild(cwd, cache);
    return;
  }
  gradleBuild(cwd, { ...jvmTestEnv(), GRADLE_USER_HOME: cache }, extraArgs);
}

/**
 * Runs `./mvnw verify` against an isolated local repository, so a run
 * never reads or writes the developer's own `~/.m2`.
 */
function mavenBuild(cwd: string, repoLocal: string): void {
  const build = runWithRetry(
    path.join(cwd, 'mvnw'),
    ['-B', '-ntp', `-Dmaven.repo.local=${repoLocal}`, 'verify'],
    { cwd, env: jvmTestEnv(), encoding: 'utf8' },
  );
  if (build.status !== 0) {
    throw new Error(
      `./mvnw verify failed (exit ${build.status})\n` +
        `${build.stdout ?? ''}\n${build.stderr ?? ''}`,
    );
  }
}

/** Runs the generated wrapper's `build`, failing loudly with its output. */
function gradleBuild(cwd: string, env: NodeJS.ProcessEnv, extraArgs: readonly string[]): void {
  const build = runWithRetry(
    path.join(cwd, 'gradlew'),
    ['--no-daemon', '--stacktrace', 'build', ...extraArgs],
    { cwd, env, encoding: 'utf8' },
  );
  if (build.status !== 0) {
    throw new Error(
      `./gradlew build ${extraArgs.join(' ')} failed (exit ${build.status})\n` +
        `stdout:\n${build.stdout}\nstderr:\n${build.stderr}`,
    );
  }
}

/**
 * Absolute path of the runnable jar the build just produced, taking
 * the Maven location when the spec asked for Maven.
 */
export function runnableJar(spec: JvmProjectSpec, cwd: string): string {
  const jarPath = spec.buildSystem === 'maven' ? (spec.runJarMaven ?? spec.runJar) : spec.runJar;
  return path.join(cwd, ...jarPath);
}
