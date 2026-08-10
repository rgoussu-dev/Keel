/**
 * End-to-end test for the `fullstack-rust` composite stack — the real
 * cross-service smoke: it scaffolds the monorepo, verifies the Rust
 * backend (test, build), then boots it and drives the wire the
 * frontend's gateway encodes — `{"greeting": …}` for a named and an
 * absent-name request, the RFC 9457 rejection, and the CORS header
 * the `rust-cors` decoration added for the SPA's dev origin.
 *
 * The frontend's own npm gates are exercised by the quarkus-pair
 * fullstack e2e (the frontend is identical); here `npm install` is
 * no-op'd alongside `git init` and the deferred `cargo check` (the
 * explicit `cargo test` + `cargo build` below verify strictly more).
 * The backend pulls axum from crates.io, so this test needs network
 * access. Skip rules: skipped when `cargo` is missing from PATH;
 * skipped on CI unless `KEEL_RUN_E2E=1`; opt out locally with
 * `KEEL_SKIP_E2E=1`.
 */

import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runActions, type RunActionsInputs } from '../../src/domain/core/actions.js';
import { newProjectCommand } from '../../src/domain/contract/commands.js';
import type { DeferredAction } from '../../src/domain/contract/composition.js';
import { expectOk, installMediator } from '../support/factory.js';

const E2E_TIMEOUT_MS = 5 * 60 * 1000;

const EXE = process.platform === 'win32' ? '.exe' : '';

const stubActions =
  (stubbed: ReadonlySet<string>) =>
  (inputs: RunActionsInputs): Promise<void> => {
    const rewritten = inputs.actions.map((a): DeferredAction => {
      if (!stubbed.has(a.id)) return a;
      return {
        id: a.id,
        description: `${a.description} [faked: no-op]`,
        run: () => Promise.resolve(),
      };
    });
    return runActions({ ...inputs, actions: rewritten });
  };

const onPath = (cmd: string): boolean => {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  return spawnSync(probe, [cmd], { stdio: 'ignore' }).status === 0;
};

const optedIn = process.env.KEEL_RUN_E2E === '1';
const optedOut = process.env.KEEL_SKIP_E2E === '1';
const onCI = process.env.CI === 'true';
const skipE2E = optedOut || !onPath('cargo') || (onCI && !optedIn);

let cwd: string;
let cargoHome: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-fsrust-e2e-'));
  cargoHome = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-fsrust-e2e-cargo-'));
});

afterEach(async () => {
  await fs.remove(cwd);
  await fs.remove(cargoHome);
});

const cargoRun = (backend: string, args: readonly string[]): void => {
  const r = spawnSync('cargo', args, {
    cwd: backend,
    env: { ...process.env, CARGO_HOME: cargoHome },
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    throw new Error(`cargo ${args.join(' ')} failed (exit ${r.status})\n${r.stdout}\n${r.stderr}`);
  }
};

describe.skipIf(skipE2E)('fullstack-rust e2e (monorepo)', () => {
  it(
    'scaffolds a product whose Rust backend serves the wire the frontend gateway encodes',
    async () => {
      const mediator = installMediator({
        keelVersion: '0.0.0-e2e',
        runDeferred: stubActions(
          new Set([
            'vcs/git-init',
            'walking-skeleton/npm-install',
            'walking-skeleton/rust-bootstrap',
          ]),
        ),
      });
      expectOk(
        await mediator.dispatch(
          newProjectCommand({
            cwd,
            stack: 'fullstack-rust',
            answers: {
              'walking-skeleton/rust-bootstrap': { projectName: 'backend' },
            },
            interactive: false,
            dryRun: false,
          }),
        ),
      );

      const backend = path.join(cwd, 'backend');
      expect(await fs.pathExists(path.join(cwd, 'frontend', 'package.json'))).toBe(true);
      expect(await fs.pathExists(path.join(backend, 'contract', 'greet.openapi.yaml'))).toBe(true);

      cargoRun(backend, ['test']);
      cargoRun(backend, ['build']);

      const server = spawn(path.join(backend, 'target', 'debug', `backend-http${EXE}`), [], {
        cwd: backend,
        env: { ...process.env, PORT: '0' },
      });
      try {
        const port = await new Promise<string>((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error('server never announced its port')),
            15_000,
          );
          const settle = (outcome: () => void): void => {
            clearTimeout(timer);
            outcome();
          };
          let buffered = '';
          const sniff = (chunk: Buffer): void => {
            buffered += chunk.toString();
            const match = /listening on .*:(\d+)/.exec(buffered);
            if (match?.[1]) {
              const found = match[1];
              settle(() => resolve(found));
            }
          };
          server.stdout.on('data', sniff);
          server.stderr.on('data', sniff);
          server.on('error', (err) => settle(() => reject(err)));
          server.on('exit', (code) =>
            settle(() => reject(new Error(`server exited early (${code}): ${buffered}`))),
          );
        });
        const base = `http://127.0.0.1:${port}`;

        // The wire the frontend gateway encodes, per the contract.
        const named = await fetch(`${base}/greet?name=E2E`);
        expect(named.status).toBe(200);
        expect(await named.json()).toEqual({ greeting: 'Hello, E2E!' });
        expect(named.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');

        const defaulted = await fetch(`${base}/greet`);
        expect(defaulted.status).toBe(200);
        expect(await defaulted.json()).toEqual({ greeting: 'Hello, world!' });

        const rejected = await fetch(`${base}/greet?name=`);
        expect(rejected.status).toBe(400);
        expect(rejected.headers.get('content-type')).toBe('application/problem+json');
      } finally {
        server.removeAllListeners('exit');
        server.kill();
      }
    },
    E2E_TIMEOUT_MS,
  );
});
