/**
 * `walking-skeleton/gradle-wrapper` adapter — emits the Gradle Wrapper
 * (gradlew, gradlew.bat, gradle/wrapper/gradle-wrapper.jar,
 * gradle/wrapper/gradle-wrapper.properties) so the project is runnable
 * with `./gradlew` out of the box.
 *
 * The wrapper is generated, not committed: invoking the canonical
 * `gradle wrapper` task against the project shell is the only path
 * Gradle endorses. The adapter therefore emits a deferred action that
 * runs the system `gradle` (through the ProcessRunner port) after the
 * bootstrap files have landed on disk. A friendly error fires if
 * `gradle` is not on PATH.
 *
 * Composition:
 *   - covers `build-tool` of the `walking-skeleton` vertical;
 *   - predicate: `pkg.gradle` — fires for any Gradle project;
 *   - runs after `walking-skeleton/quarkus-cli-bootstrap` so the
 *     settings and build files exist before `gradle wrapper` runs.
 */

import path from 'node:path';
import type { DeferredAction, DeferredActionEnv, Adapter } from '../../contract/composition.js';
import type { Logger } from '../../contract/ports/logger.js';
import type { ProcessResult, ProcessRunner } from '../../contract/ports/process-runner.js';
import { QUARKUS_CLI_BOOTSTRAP_ID } from './quarkus-cli-bootstrap.js';

export const GRADLE_WRAPPER_ID = 'walking-skeleton/gradle-wrapper';

const GRADLE_VERSION = '9.4.1';

export const gradleWrapperAdapter: Adapter = {
  id: GRADLE_WRAPPER_ID,
  vertical: 'walking-skeleton',
  covers: ['build-tool'],
  predicate: { requires: ['pkg.gradle'] },
  after: [QUARKUS_CLI_BOOTSTRAP_ID],
  contribute() {
    const action: DeferredAction = {
      id: GRADLE_WRAPPER_ID,
      description: `gradle wrapper --gradle-version=${GRADLE_VERSION}`,
      run: ({ cwd, logger, processes }: DeferredActionEnv) => {
        runWrapperTask(path.resolve(cwd), GRADLE_VERSION, logger, processes);
        return Promise.resolve();
      },
    };
    return { actions: [action] };
  },
};

function runWrapperTask(
  cwd: string,
  gradleVersion: string,
  logger: Logger,
  processes: ProcessRunner,
): void {
  logger.info(`gradle: generating wrapper at version ${gradleVersion}`);
  const r = processes.run(
    'gradle',
    ['wrapper', `--gradle-version=${gradleVersion}`, '--distribution-type=bin'],
    { cwd },
  );
  if (r.startFailure?.code === 'ENOENT') {
    throw new Error(
      "gradle-wrapper: 'gradle' is not on PATH — install Gradle locally to generate the wrapper, then commit the result",
    );
  }
  if (r.status !== 0) {
    throw new Error(`gradle-wrapper: 'gradle wrapper' failed: ${describeFailure(r)}`);
  }
  logger.success(`gradle: wrapper generated at version ${gradleVersion}`);
}

function describeFailure(r: ProcessResult): string {
  if (r.startFailure) return r.startFailure.message;
  // Gradle prints task failures (`Test of distribution url ... failed`,
  // `BUILD FAILED in Ns`, the stack trace under `--stacktrace`) on
  // stdout, not stderr — without surfacing it the caller is left with
  // a context-free `exit N` message and no clue what went wrong.
  const parts = [r.stderr.trim(), r.stdout.trim()].filter((s) => s.length > 0);
  if (parts.length > 0) return parts.join('\n');
  if (r.status === null) return 'gradle did not run';
  return `exit ${r.status}`;
}
