/**
 * Shared machinery for the JVM REST walking-skeleton e2e tests.
 *
 * Each e2e scaffolds a stack into a temp dir, runs the generated
 * wrapper's build (which executes the generated framework test
 * suite), boots the packaged application on a random port, and
 * drives `GET /greet` over the wire. The framework-specific bits —
 * stack id, jar location, the JVM flag that requests a random port,
 * and the log line announcing it — are parameters.
 *
 * **Both build systems.** A spec's `buildSystem` picks `./gradlew
 * build` or `./mvnw verify`, and everything downstream follows: which
 * wrapper must exist, which deferred action gets retried, where the
 * runnable jar lands (`build/` vs `target/`), and how the dependency
 * cache is isolated (`GRADLE_USER_HOME` vs `-Dmaven.repo.local`).
 * Without this the Maven half of every JVM stack was scaffolded but
 * never built, which is how two Maven-only defects reached `main`.
 *
 * Skip rules mirror `tests/e2e/walking-skeleton.test.ts`: skipped
 * when `gradle`/`java` are missing from PATH, skipped on CI unless
 * `KEEL_RUN_E2E=1`, opt out anywhere with `KEEL_SKIP_E2E=1`. Maven
 * specs carry an extra rule — see {@link skipJvmMavenE2E}.
 */

import path from 'node:path';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'fs-extra';
import { expect } from 'vitest';
import { runActions, type RunActionsInputs } from '../../src/domain/core/actions.js';
import { addVerticalCommand, newProjectCommand } from '../../src/domain/contract/commands.js';
import type { DeferredAction } from '../../src/domain/contract/composition.js';
import { expectOk, installMediator } from './factory.js';

export const E2E_TIMEOUT_MS = 20 * 60 * 1000;
const APP_START_TIMEOUT_MS = 60 * 1000;

const TRANSIENT_PATTERNS = [
  /Test of distribution url .* failed/,
  /Server returned HTTP response code: 5\d\d/,
  /HEAD request to .* failed: response code \(5\d\d\)/,
];

const isTransient = (blob: string): boolean => TRANSIENT_PATTERNS.some((re) => re.test(blob));

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

const startApp = (
  runJar: string,
  jvmFlags: readonly string[],
  announceRe: RegExp,
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<{ child: ChildProcess; port: number }> =>
  new Promise((resolve, reject) => {
    const child = spawn('java', [...jvmFlags, '-jar', runJar], { cwd, env });
    let output = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`app did not announce its port within 60s; output so far:\n${output}`));
    }, APP_START_TIMEOUT_MS);
    const onData = (chunk: Buffer): void => {
      output += chunk.toString();
      const m = announceRe.exec(output);
      if (m?.[1] !== undefined) {
        clearTimeout(timer);
        resolve({ child, port: Number(m[1]) });
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`app exited before announcing its port (exit ${code}):\n${output}`));
    });
  });

const stopApp = async (child: ChildProcess): Promise<void> => {
  if (child.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    child.once('exit', () => {
      resolve();
    });
    child.kill('SIGTERM');
    setTimeout(() => child.kill('SIGKILL'), 5000).unref();
  });
};

const optedIn = process.env.KEEL_RUN_E2E === '1';
const optedOut = process.env.KEEL_SKIP_E2E === '1';
const onCI = process.env.CI === 'true';
const toolingMissing = !onPath('gradle') || !onPath('java');

/** Whether the JVM REST e2e tests should be skipped in this run. */
export const skipJvmRestE2E = optedOut || toolingMissing || (onCI && !optedIn);

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
 * rule {@link skipJvmRestE2E} applies, plus `mvn` on PATH (the wrapper
 * is generated by `mvn -N wrapper:wrapper`) and a new enough
 * `JAVA_HOME`.
 */
export const skipJvmMavenE2E = skipJvmRestE2E || !onPath('mvn') || javaHomeMajor() < REQUIRED_JDK;

/**
 * Whether a Docker daemon answers. The persistence slice's own tests
 * need one — Testcontainers for the JDBC contract test, the
 * framework's throwaway database for the boot test — so without it
 * those two task paths are excluded and the build proves compilation
 * and wiring only.
 */
const dockerAvailable = (): boolean =>
  spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0;

/** Framework-specific parameters of one JVM REST e2e run. */
export interface JvmRestE2ESpec {
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
  /**
   * Path of the runnable jar under Maven, which packages into
   * `target/` where Gradle uses `build/`. Required for Maven specs.
   */
  readonly runJarMaven?: readonly string[];
  /** Path of the runnable jar relative to the project root. */
  readonly runJar: readonly string[];
  /** JVM flag that requests an ephemeral port. */
  readonly randomPortFlag: string;
  /** Log line announcing the bound port; group 1 is the port. */
  readonly announceRe: RegExp;
  /** The framework's liveness probe path. */
  readonly healthLivePath: string;
  /** The framework's readiness probe path. */
  readonly healthReadyPath: string;
  /**
   * Extra JVM flags for the boot — typically the framework's switch
   * that silences telemetry export (no collector runs in e2e).
   */
  readonly extraJvmFlags?: readonly string[];
}

/** Scaffolds `spec.stack` into `cwd` through the real mediator. */
async function scaffold(spec: JvmRestE2ESpec, cwd: string): Promise<void> {
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
async function addVertical(vertical: string, cwd: string): Promise<void> {
  const mediator = installMediator({ keelVersion: '0.0.0-e2e' });
  expectOk(
    await mediator.dispatch(
      addVerticalCommand({ cwd, vertical, answers: {}, interactive: false, dryRun: false }),
    ),
  );
}

/**
 * Runs the generated wrapper's build for whichever build system the
 * spec asked for, failing loudly with its output. Gradle's `build`
 * and Maven's `verify` are the equivalent lifecycle points: both
 * compile every module and run every generated test.
 */
function buildProject(
  spec: JvmRestE2ESpec,
  cwd: string,
  cache: string,
  extraArgs: readonly string[],
): void {
  if (spec.buildSystem === 'maven') {
    mavenBuild(cwd, cache);
    return;
  }
  gradleBuild(cwd, { ...process.env, GRADLE_USER_HOME: cache }, extraArgs);
}

/**
 * Runs `./mvnw verify` against an isolated local repository, so a run
 * never reads or writes the developer's own `~/.m2`.
 */
function mavenBuild(cwd: string, repoLocal: string): void {
  const build = runWithRetry(
    path.join(cwd, 'mvnw'),
    ['-B', '-ntp', `-Dmaven.repo.local=${repoLocal}`, 'verify'],
    { cwd, env: process.env, encoding: 'utf8' },
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
 * Scaffolds `spec.stack`, layers the `persistence` vertical onto it,
 * and builds — the proof that the slice's module graph compiles and
 * wires under `spec.moduleLayout`.
 *
 * The generated persistence suite needs a database: the JDBC contract
 * test takes one from Testcontainers and the framework's boot test
 * from its own dev-services equivalent — and the boot test *fails*
 * rather than skips without one, because a context carrying a
 * datasource cannot start. Both are therefore excluded when no Docker
 * daemon answers, so the run still proves compilation and wiring on a
 * machine without one. Their `testClasses` are then requested by name:
 * excluding a `test` task would otherwise take its test compilation
 * with it, and the assembly's test sources are exactly where a
 * cross-module reference goes wrong under the modulith.
 */
export async function runJvmPersistenceE2E(
  spec: JvmRestE2ESpec,
  cwd: string,
  depCache: string,
): Promise<void> {
  await scaffold(spec, cwd);
  await addVertical('persistence', cwd);

  const dockerBound = [':modules:greeting:infra:greeting-log:jdbc', ':application:api'];
  const withoutDocker = [
    ...dockerBound.map((p) => `${p}:testClasses`),
    ...dockerBound.flatMap((p) => ['-x', `${p}:test`]),
  ];
  buildProject(spec, cwd, depCache, dockerAvailable() ? [] : withoutDocker);

  // The port and its handlers belong to the bounded context; only the
  // datasource wiring belongs to the assembly.
  const inModule = 'modules/greeting/domain/contract/src/main/java/com/acme/e2e/greeting/domain';
  await expect(fs.pathExists(path.join(cwd, inModule, 'contract/UnitOfWork.java'))).resolves.toBe(
    true,
  );
  await expect(
    fs.pathExists(
      path.join(
        cwd,
        'application/api/src/main/java/com/acme/e2e/application/api/PersistenceProducer.java',
      ),
    ),
  ).resolves.toBe(true);
}

/**
 * Scaffolds `spec.stack` into `cwd`, builds it with the generated
 * wrapper (running the generated test suite transitively), boots the
 * packaged jar, and asserts the `/greet` wire contract — named,
 * defaulted, and rejected requests.
 */
export async function runJvmRestE2E(
  spec: JvmRestE2ESpec,
  cwd: string,
  depCache: string,
): Promise<void> {
  await scaffold(spec, cwd);

  const env = { ...process.env, GRADLE_USER_HOME: depCache };
  buildProject(spec, cwd, depCache, []);

  const jarPath = spec.buildSystem === 'maven' ? (spec.runJarMaven ?? spec.runJar) : spec.runJar;
  const runJar = path.join(cwd, ...jarPath);
  expect(await fs.pathExists(runJar), `missing ${runJar}`).toBe(true);

  const { child, port } = await startApp(
    runJar,
    [spec.randomPortFlag, ...(spec.extraJvmFlags ?? [])],
    spec.announceRe,
    cwd,
    env,
  );
  try {
    const ok = await fetch(`http://127.0.0.1:${port}/greet?name=E2E`);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ greeting: 'Hello, E2E!' });

    const rejected = await fetch(`http://127.0.0.1:${port}/greet?name=%20%20`);
    expect(rejected.status).toBe(400);
    expect(rejected.headers.get('content-type')).toContain('application/problem+json');
    const problem = (await rejected.json()) as Record<string, unknown>;
    expect(problem.title).toBe('Greeting rejected');
    expect(problem.status).toBe(400);
    expect(problem.detail).toBe('name must not be blank');

    // Observability seam: both probes answer, and the correlation id
    // round-trips (echoed when supplied, minted when absent).
    const live = await fetch(`http://127.0.0.1:${port}${spec.healthLivePath}`);
    expect(live.status, spec.healthLivePath).toBe(200);
    const readyProbe = await fetch(`http://127.0.0.1:${port}${spec.healthReadyPath}`);
    expect(readyProbe.status, spec.healthReadyPath).toBe(200);

    const correlated = await fetch(`http://127.0.0.1:${port}/greet?name=E2E`, {
      headers: { 'X-Correlation-Id': 'corr-e2e' },
    });
    expect(correlated.headers.get('x-correlation-id')).toBe('corr-e2e');
    const minted = await fetch(`http://127.0.0.1:${port}/greet?name=E2E`);
    expect(minted.headers.get('x-correlation-id')).toBeTruthy();
  } finally {
    await stopApp(child);
  }
}
