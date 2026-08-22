/**
 * Shared machinery for the **composed-entrypoint** TypeScript e2e
 * cells — `ts-cli-http`, the stack whose tag set carries both
 * `arch.cli` and `arch.server-http`, so one workspace ships two
 * assembly points.
 *
 * The JVM's combo harness builds and then runs two jars. There is no
 * build step here — Node runs the emitted sources directly — so what
 * replaces it is the install the scaffold performs and the emitted
 * `typecheck`/`test` scripts, and what "runtime entrypoint check"
 * means is running `application/cli/src/main.ts` and
 * `application/rest/src/main.ts` for real, off one `node_modules`.
 *
 * **What only a combo cell can see.** `ts-shared-root.ts` merges each
 * entrypoint's `start:*` scripts into a root `package.json` the
 * sibling may already have written, and appends each one's README
 * section under a sentinel. The regression that guards against is a
 * second entrypoint clobbering the first's scripts or its workspace
 * glob — after which the project still installs and still
 * typechecks, and one of its two assemblies has no way to be
 * started. Both are asserted here before anything is run, then
 * proved by running both.
 */

import net from 'node:net';
import path from 'node:path';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'fs-extra';
import { expect } from 'vitest';
import { runStep, scaffold, type PackageManager } from './web-e2e.js';

export { E2E_TIMEOUT_MS, mkTempDir, skipWebE2E } from './web-e2e.js';
export type { PackageManager } from './web-e2e.js';

const SERVER_START_TIMEOUT_MS = 30 * 1000;

/** A port nothing is listening on, borrowed and handed straight back. */
const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as net.AddressInfo;
      probe.close(() => {
        resolve(port);
      });
    });
  });

/**
 * Starts the REST assembly on `port` and resolves once it says it is
 * listening.
 *
 * The emitted `main.ts` logs the port it was *asked* for rather than
 * the one it bound, which is why the harness picks a free port itself
 * instead of passing `PORT=0` and parsing the announcement back out.
 */
const startServer = (cwd: string, port: number): Promise<ChildProcess> =>
  new Promise((resolve, reject) => {
    const child = spawn('node', ['application/rest/src/main.ts'], {
      cwd,
      env: { ...process.env, PORT: String(port) },
    });
    let output = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`server did not start within 30s; output so far:\n${output}`));
    }, SERVER_START_TIMEOUT_MS);
    const onData = (chunk: Buffer): void => {
      output += chunk.toString();
      if (output.includes('listening on')) {
        clearTimeout(timer);
        resolve(child);
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
      reject(new Error(`server exited before listening (exit ${code}):\n${output}`));
    });
  });

const stopServer = async (child: ChildProcess): Promise<void> => {
  if (child.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    child.once('exit', () => {
      resolve();
    });
    child.kill('SIGTERM');
    setTimeout(() => child.kill('SIGKILL'), 5000).unref();
  });
};

/** One cell of the TypeScript composed-entrypoint grid. */
export interface TsComboCell {
  /** Package manager to install and run the workspace with. */
  readonly pm: PackageManager;
  /** Module layout the cell covers. */
  readonly moduleLayout: 'basic' | 'modulith';
}

/**
 * Scaffolds one `ts-cli-http` cell, runs the emitted checks, then
 * proves **both** assembly points off the one workspace the install
 * produced: the CLI greets on stdout and refuses a blank name with
 * exit code 2, and the REST server answers `/greet` on the wire.
 *
 * `lint` runs only under `modulith`: it is the layout that carries a
 * dependency-cruiser config and a script to run it, and `basic` has
 * neither.
 */
export async function runTsComboE2E(cell: TsComboCell, cwd: string): Promise<void> {
  const { pm, moduleLayout } = cell;
  await scaffold(
    {
      stack: 'ts-cli-http',
      projectName: 'walking-skeleton-e2e',
      buildSystem: pm,
      moduleLayout,
      ...(moduleLayout === 'modulith' ? { withPeerContext: true } : {}),
    },
    cwd,
  );

  // Both entrypoints wrote to one root manifest, and the merge is the
  // thing that used to be a whole-file clobber. A missing script is a
  // deployment unit with no way to start.
  const pkg = JSON.parse(await fs.readFile(path.join(cwd, 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>;
  };
  for (const script of ['start:cli', 'start:rest', 'dev:rest']) {
    expect(pkg.scripts?.[script], `root package.json is missing ${script}`).toBeDefined();
  }

  // …and to one README, whose per-arch sections are appended under a
  // sentinel rather than each rewriting the file.
  const readme = await fs.readFile(path.join(cwd, 'README.md'), 'utf8');
  expect(readme).toContain('### cli');
  expect(readme).toContain('### rest');

  runStep(cwd, `${pm} run typecheck`, pm, ['run', 'typecheck']);
  runStep(cwd, `${pm} test`, pm, ['test']);
  if (moduleLayout === 'modulith') runStep(cwd, `${pm} run lint`, pm, ['run', 'lint']);

  // The CLI assembly runs: the greeting on stdout, and the domain's
  // no as exit code 2 — the CLI counterpart of a 400 on the wire.
  const greeted = spawnSync('node', ['application/cli/src/main.ts', '--name', 'E2E'], {
    cwd,
    encoding: 'utf8',
  });
  expect(greeted.status, greeted.stderr).toBe(0);
  expect(greeted.stdout).toBe('Hello, E2E!\n');
  const refused = spawnSync('node', ['application/cli/src/main.ts', '--name', '  '], {
    cwd,
    encoding: 'utf8',
  });
  expect(refused.status).toBe(2);
  expect(refused.stderr).toContain('name must not be blank');

  // The REST assembly runs, off the same domain, in the same
  // workspace, without the CLI having been rebuilt or reinstalled.
  const port = await freePort();
  const server = await startServer(cwd, port);
  try {
    const ok = await fetch(`http://127.0.0.1:${port}/greet?name=E2E`);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ greeting: 'Hello, E2E!' });

    const rejected = await fetch(`http://127.0.0.1:${port}/greet?name=%20%20`);
    expect(rejected.status).toBe(400);
    expect(rejected.headers.get('content-type')).toContain('application/problem+json');
    const problem = (await rejected.json()) as Record<string, unknown>;
    expect(problem.detail).toBe('name must not be blank');
  } finally {
    await stopServer(server);
  }
}
