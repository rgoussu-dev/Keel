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
 * Everything up to and including the build is shared with the CLI
 * suites and lives in [`jvm-e2e.ts`](./jvm-e2e.ts): the scaffold, both
 * build systems, the transient-flake retries and the skip rules. This
 * file is what happens once there is a jar — boot it, wait for the
 * port it announces, and drive the wire contract.
 */

import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'fs-extra';
import { expect } from 'vitest';
import {
  addVertical,
  buildProject,
  dockerAvailable,
  runnableJar,
  scaffold,
  skipJvmE2E,
  type JvmRunnableSpec,
} from './jvm-e2e.js';

export { E2E_TIMEOUT_MS, skipJvmMavenE2E } from './jvm-e2e.js';

/** Whether the JVM REST e2e tests should be skipped in this run. */
export const skipJvmRestE2E = skipJvmE2E;

const APP_START_TIMEOUT_MS = 60 * 1000;

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

/** Framework-specific parameters of one JVM REST e2e run. */
export interface JvmRestE2ESpec extends JvmRunnableSpec {
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

  const runJar = runnableJar(spec, cwd);
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
