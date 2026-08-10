/**
 * `walking-skeleton/maven-wrapper` adapter — generates the Maven
 * Wrapper (mvnw, mvnw.cmd, .mvn/wrapper/maven-wrapper.properties) so
 * the project is runnable with `./mvnw` out of the box, the Maven
 * sibling of `gradle-wrapper`.
 *
 * The wrapper is generated, not committed: invoking the canonical
 * `wrapper:wrapper` goal against the project shell is the path Maven
 * endorses. The adapter therefore emits a deferred action that runs
 * the system `mvn` (through the ProcessRunner port) after the
 * bootstrap files have landed on disk. A friendly error fires if
 * `mvn` is not on PATH.
 *
 * Composition:
 *   - covers `build-tool` of the `walking-skeleton` vertical;
 *   - predicate: `pkg.maven` — fires for any Maven project;
 *   - runs after whichever bootstrap fired (CLI or REST) so the
 *     root pom exists before `mvn wrapper:wrapper` runs; ids absent
 *     from the resolved set are dropped by the resolver.
 */

import path from 'node:path';
import type { DeferredAction, DeferredActionEnv, Adapter } from '../../contract/composition.js';
import type { Logger } from '../../contract/ports/logger.js';
import type { ProcessResult, ProcessRunner } from '../../contract/ports/process-runner.js';
import { MICRONAUT_CLI_BOOTSTRAP_ID } from './micronaut-cli-bootstrap.js';
import { MICRONAUT_CLI_KOTLIN_BOOTSTRAP_ID } from './micronaut-cli-kotlin-bootstrap.js';
import { MICRONAUT_REST_BOOTSTRAP_ID } from './micronaut-rest-bootstrap.js';
import { MICRONAUT_REST_KOTLIN_BOOTSTRAP_ID } from './micronaut-rest-kotlin-bootstrap.js';
import { QUARKUS_CLI_BOOTSTRAP_ID } from './quarkus-cli-bootstrap.js';
import { QUARKUS_CLI_KOTLIN_BOOTSTRAP_ID } from './quarkus-cli-kotlin-bootstrap.js';
import { QUARKUS_REST_BOOTSTRAP_ID } from './quarkus-rest-bootstrap.js';
import { QUARKUS_REST_KOTLIN_BOOTSTRAP_ID } from './quarkus-rest-kotlin-bootstrap.js';
import { SPRING_CLI_BOOTSTRAP_ID } from './spring-cli-bootstrap.js';
import { SPRING_CLI_KOTLIN_BOOTSTRAP_ID } from './spring-cli-kotlin-bootstrap.js';
import { SPRING_REST_BOOTSTRAP_ID } from './spring-rest-bootstrap.js';
import { SPRING_REST_KOTLIN_BOOTSTRAP_ID } from './spring-rest-kotlin-bootstrap.js';

export const MAVEN_WRAPPER_ID = 'walking-skeleton/maven-wrapper';

const MAVEN_VERSION = '3.9.16';

export const mavenWrapperAdapter: Adapter = {
  id: MAVEN_WRAPPER_ID,
  vertical: 'walking-skeleton',
  covers: ['build-tool'],
  predicate: { requires: ['pkg.maven'] },
  after: [
    QUARKUS_CLI_BOOTSTRAP_ID,
    QUARKUS_REST_BOOTSTRAP_ID,
    QUARKUS_CLI_KOTLIN_BOOTSTRAP_ID,
    QUARKUS_REST_KOTLIN_BOOTSTRAP_ID,
    SPRING_CLI_BOOTSTRAP_ID,
    SPRING_REST_BOOTSTRAP_ID,
    SPRING_CLI_KOTLIN_BOOTSTRAP_ID,
    SPRING_REST_KOTLIN_BOOTSTRAP_ID,
    MICRONAUT_CLI_BOOTSTRAP_ID,
    MICRONAUT_REST_BOOTSTRAP_ID,
    MICRONAUT_CLI_KOTLIN_BOOTSTRAP_ID,
    MICRONAUT_REST_KOTLIN_BOOTSTRAP_ID,
  ],
  contribute() {
    const action: DeferredAction = {
      id: MAVEN_WRAPPER_ID,
      description: `mvn -N wrapper:wrapper -Dmaven=${MAVEN_VERSION}`,
      run: ({ cwd, logger, processes }: DeferredActionEnv) => {
        runWrapperGoal(path.resolve(cwd), MAVEN_VERSION, logger, processes);
        return Promise.resolve();
      },
    };
    return { actions: [action] };
  },
};

function runWrapperGoal(
  cwd: string,
  mavenVersion: string,
  logger: Logger,
  processes: ProcessRunner,
): void {
  logger.info(`maven: generating wrapper at version ${mavenVersion}`);
  const r = processes.run('mvn', ['-N', 'wrapper:wrapper', `-Dmaven=${mavenVersion}`], { cwd });
  if (r.startFailure?.code === 'ENOENT') {
    throw new Error(
      "maven-wrapper: 'mvn' is not on PATH — install Maven locally to generate the wrapper, then commit the result",
    );
  }
  if (r.status !== 0) {
    throw new Error(`maven-wrapper: 'mvn wrapper:wrapper' failed: ${describeFailure(r)}`);
  }
  logger.success(`maven: wrapper generated at version ${mavenVersion}`);
}

function describeFailure(r: ProcessResult): string {
  if (r.startFailure) return r.startFailure.message;
  // Maven reports goal failures on stdout — without surfacing it the
  // caller is left with a context-free `exit N` message.
  const parts = [r.stderr.trim(), r.stdout.trim()].filter((s) => s.length > 0);
  if (parts.length > 0) return parts.join('\n');
  if (r.status === null) return 'mvn did not run';
  return `exit ${r.status}`;
}
