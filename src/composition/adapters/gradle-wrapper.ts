/**
 * `walking-skeleton/gradle-wrapper` adapter — emits the Gradle Wrapper
 * (gradlew, gradlew.bat, gradle/wrapper/gradle-wrapper.jar,
 * gradle/wrapper/gradle-wrapper.properties) so the project is runnable
 * with `./gradlew` out of the box.
 *
 * The wrapper is generated, not committed: invoking the canonical
 * `gradle wrapper` task against the project shell is the only path
 * Gradle endorses. The adapter therefore emits a deferred Action that
 * shells out to the system `gradle` after the bootstrap files have
 * landed on disk. A friendly error fires if `gradle` is not on PATH.
 *
 * Composition:
 *   - covers `build-tool` of the `walking-skeleton` vertical;
 *   - predicate: `pkg.gradle` — fires for any Gradle project;
 *   - runs after `walking-skeleton/quarkus-cli-bootstrap` so the
 *     settings and build files exist before `gradle wrapper` runs.
 */

import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { Action, ActionEnv, Adapter } from '../types.js';
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
    const action: Action = {
      id: GRADLE_WRAPPER_ID,
      description: `gradle wrapper --gradle-version=${GRADLE_VERSION}`,
      run: ({ cwd, logger }: ActionEnv) => {
        runWrapperTask(path.resolve(cwd), GRADLE_VERSION, logger);
        return Promise.resolve();
      },
    };
    return { actions: [action] };
  },
};

function runWrapperTask(cwd: string, gradleVersion: string, logger: ActionEnv['logger']): void {
  logger.info(`gradle: generating wrapper at version ${gradleVersion}`);
  const r = spawnSync(
    'gradle',
    ['wrapper', `--gradle-version=${gradleVersion}`, '--distribution-type=bin'],
    { cwd, encoding: 'utf8' },
  );
  if (r.error && (r.error as NodeJS.ErrnoException).code === 'ENOENT') {
    throw new Error(
      "gradle-wrapper: 'gradle' is not on PATH — install Gradle locally to generate the wrapper, then commit the result",
    );
  }
  if (r.status !== 0) {
    throw new Error(`gradle-wrapper: 'gradle wrapper' failed: ${describeFailure(r)}`);
  }
  logger.success(`gradle: wrapper generated at version ${gradleVersion}`);
}

function describeFailure(r: ReturnType<typeof spawnSync>): string {
  if (r.error) return r.error.message;
  // Gradle prints task failures (`Test of distribution url ... failed`,
  // `BUILD FAILED in Ns`, the stack trace under `--stacktrace`) on
  // stdout, not stderr — without surfacing it the caller is left with
  // a context-free `exit N` message and no clue what went wrong.
  const parts = [(r.stderr ?? '').toString().trim(), (r.stdout ?? '').toString().trim()].filter(
    (s) => s.length > 0,
  );
  if (parts.length > 0) return parts.join('\n');
  if (r.status === null) return 'gradle did not run';
  return `exit ${r.status}`;
}
