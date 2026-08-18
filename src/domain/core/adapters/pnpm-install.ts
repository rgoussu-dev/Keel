/**
 * `walking-skeleton/pnpm-install` adapter — installs the workspace's
 * dependencies with pnpm, the strict-layout sibling of
 * `npm-install`. The adapter's whole job is a deferred
 * `pnpm install` that runs (through the ProcessRunner port) after
 * the bootstrap files have landed on disk. A friendly error fires if
 * `pnpm` is not on PATH, pointing at Corepack.
 *
 * Composition:
 *   - covers `build-tool` of the `walking-skeleton` vertical;
 *   - predicate: `pkg.pnpm` — fires for any pnpm-workspace project;
 *   - runs after whichever TypeScript bootstrap fired so the
 *     package manifests exist before `pnpm install` runs.
 */

import path from 'node:path';
import type { DeferredAction, DeferredActionEnv, Adapter } from '../../contract/composition.js';
import type { Logger } from '../../contract/ports/logger.js';
import type { ProcessResult, ProcessRunner } from '../../contract/ports/process-runner.js';
import { TS_CLI_BOOTSTRAP_ID, TS_HTTP_BOOTSTRAP_ID } from './ts-bootstrap.js';
import { WC_SPA_BOOTSTRAP_ID } from './wc-spa-bootstrap.js';

export const PNPM_INSTALL_ID = 'walking-skeleton/pnpm-install';

export const pnpmInstallAdapter: Adapter = {
  id: PNPM_INSTALL_ID,
  vertical: 'walking-skeleton',
  covers: ['build-tool'],
  predicate: { requires: ['pkg.pnpm'] },
  after: [WC_SPA_BOOTSTRAP_ID, TS_HTTP_BOOTSTRAP_ID, TS_CLI_BOOTSTRAP_ID],
  contribute() {
    const action: DeferredAction = {
      id: PNPM_INSTALL_ID,
      description: 'pnpm install',
      run: ({ cwd, logger, processes }: DeferredActionEnv) => {
        runPnpmInstall(path.resolve(cwd), logger, processes);
        return Promise.resolve();
      },
    };
    return { actions: [action] };
  },
};

function runPnpmInstall(cwd: string, logger: Logger, processes: ProcessRunner): void {
  logger.info('pnpm: installing workspace dependencies');
  const r = processes.run('pnpm', ['install'], { cwd });
  if (r.startFailure?.code === 'ENOENT') {
    throw new Error(
      "pnpm-install: 'pnpm' is not on PATH — enable it with `corepack enable pnpm` (Node 22+ ships Corepack), then run `pnpm install` in the project",
    );
  }
  if (r.status !== 0) {
    throw new Error(`pnpm-install: 'pnpm install' failed: ${describeFailure(r)}`);
  }
  logger.success('pnpm: workspace dependencies installed');
}

function describeFailure(r: ProcessResult): string {
  if (r.startFailure) return r.startFailure.message;
  const parts = [r.stderr.trim(), r.stdout.trim()].filter((s) => s.length > 0);
  if (parts.length > 0) return parts.join('\n');
  if (r.status === null) return 'pnpm did not run';
  return `exit ${r.status}`;
}
