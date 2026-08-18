/**
 * `walking-skeleton/npm-install` adapter — installs the workspace's
 * dependencies so the scaffolded project is runnable out of the box,
 * the npm counterpart of `gradle-wrapper` for JVM projects.
 *
 * npm ships with Node itself, so unlike Gradle there is no wrapper
 * to generate — the adapter's whole job is a deferred `npm install`
 * that runs (through the ProcessRunner port) after the bootstrap
 * files have landed on disk. A friendly error fires if `npm` is not
 * on PATH.
 *
 * Composition:
 *   - covers `build-tool` of the `walking-skeleton` vertical;
 *   - predicate: `pkg.npm` — fires for any npm-workspace project;
 *   - runs after whichever TypeScript bootstrap fired so the
 *     package manifests exist before `npm install` runs.
 */

import path from 'node:path';
import type { DeferredAction, DeferredActionEnv, Adapter } from '../../contract/composition.js';
import type { Logger } from '../../contract/ports/logger.js';
import type { ProcessResult, ProcessRunner } from '../../contract/ports/process-runner.js';
import { TS_CLI_BOOTSTRAP_ID, TS_HTTP_BOOTSTRAP_ID } from './ts-bootstrap.js';
import { WC_SPA_BOOTSTRAP_ID } from './wc-spa-bootstrap.js';

export const NPM_INSTALL_ID = 'walking-skeleton/npm-install';

const NPM_ARGS = ['install', '--no-fund', '--no-audit'] as const;

export const npmInstallAdapter: Adapter = {
  id: NPM_INSTALL_ID,
  vertical: 'walking-skeleton',
  covers: ['build-tool'],
  predicate: { requires: ['pkg.npm'] },
  after: [WC_SPA_BOOTSTRAP_ID, TS_HTTP_BOOTSTRAP_ID, TS_CLI_BOOTSTRAP_ID],
  contribute() {
    const action: DeferredAction = {
      id: NPM_INSTALL_ID,
      description: `npm ${NPM_ARGS.join(' ')}`,
      run: ({ cwd, logger, processes }: DeferredActionEnv) => {
        runNpmInstall(path.resolve(cwd), logger, processes);
        return Promise.resolve();
      },
    };
    return { actions: [action] };
  },
};

function runNpmInstall(cwd: string, logger: Logger, processes: ProcessRunner): void {
  logger.info('npm: installing workspace dependencies');
  const r = processes.run('npm', [...NPM_ARGS], { cwd });
  if (r.startFailure?.code === 'ENOENT') {
    throw new Error(
      "npm-install: 'npm' is not on PATH — install Node.js 22+ (which bundles npm), then run `npm install` in the project",
    );
  }
  if (r.status !== 0) {
    throw new Error(`npm-install: 'npm install' failed: ${describeFailure(r)}`);
  }
  logger.success('npm: workspace dependencies installed');
}

function describeFailure(r: ProcessResult): string {
  if (r.startFailure) return r.startFailure.message;
  const parts = [r.stderr.trim(), r.stdout.trim()].filter((s) => s.length > 0);
  if (parts.length > 0) return parts.join('\n');
  if (r.status === null) return 'npm did not run';
  return `exit ${r.status}`;
}
