/**
 * `walking-skeleton/sample-port-fake-kotlin` adapter — the Kotlin
 * sibling of `sample-port-fake`: emits the sample secondary port
 * (`Clock`) into `domain/contract` plus a fake implementation under
 * `infrastructure/clock/fake` with a contract test for the fake,
 * all as idiomatic Kotlin. Registers the new module with the build:
 * a `settings.gradle.kts` include under Gradle, a root `pom.xml`
 * `<module>` entry under Maven.
 *
 * Framework-agnostic like its Java twin: the port, the fake, and
 * its Gradle module are plain Kotlin, so the adapter fires for
 * every Kotlin JVM bootstrap (`runtime.jvm + lang.kotlin`) and the
 * resolver keeps exactly one of the pair by language predicate.
 */

import { jvmBuildSystem } from './jvm-build-system.js';
import { eolOf, packageToPath, withEol } from '../util.js';
import type { Adapter, ContributionPatch } from '../../contract/composition.js';
import { MICRONAUT_CLI_KOTLIN_BOOTSTRAP_ID } from './micronaut-cli-kotlin-bootstrap.js';
import { MICRONAUT_REST_KOTLIN_BOOTSTRAP_ID } from './micronaut-rest-kotlin-bootstrap.js';
import { QUARKUS_CLI_KOTLIN_BOOTSTRAP_ID } from './quarkus-cli-kotlin-bootstrap.js';
import { QUARKUS_REST_KOTLIN_BOOTSTRAP_ID } from './quarkus-rest-kotlin-bootstrap.js';
import { SPRING_CLI_KOTLIN_BOOTSTRAP_ID } from './spring-cli-kotlin-bootstrap.js';
import { SPRING_REST_KOTLIN_BOOTSTRAP_ID } from './spring-rest-kotlin-bootstrap.js';

export const SAMPLE_PORT_FAKE_KOTLIN_ID = 'walking-skeleton/sample-port-fake-kotlin';

const TEMPLATE_ID = 'composition/walking-skeleton/sample-port-fake-kotlin/templates';
const BUILD_TEMPLATE_ROOT = 'composition/walking-skeleton/sample-port-fake-kotlin/build';

const FAKE_MODULE_INCLUDE = 'include(":infrastructure:clock:fake")';

const MAVEN_MODULE = '<module>infrastructure/clock/fake</module>';
const MAVEN_MODULES_END = '  </modules>';

const BOOTSTRAP_IDS = [
  QUARKUS_CLI_KOTLIN_BOOTSTRAP_ID,
  QUARKUS_REST_KOTLIN_BOOTSTRAP_ID,
  SPRING_CLI_KOTLIN_BOOTSTRAP_ID,
  SPRING_REST_KOTLIN_BOOTSTRAP_ID,
  MICRONAUT_CLI_KOTLIN_BOOTSTRAP_ID,
  MICRONAUT_REST_KOTLIN_BOOTSTRAP_ID,
] as const;

export const samplePortFakeKotlinAdapter: Adapter = {
  id: SAMPLE_PORT_FAKE_KOTLIN_ID,
  vertical: 'walking-skeleton',
  covers: ['port-example'],
  predicate: { requires: ['runtime.jvm', 'arch.hexagonal', 'lang.kotlin'] },
  after: [...BOOTSTRAP_IDS],
  async contribute(ctx) {
    const bootstrap = BOOTSTRAP_IDS.map((id) => ctx.manifest.answers[id]).find(
      (answers) => answers?.basePackage,
    );
    const basePackage = bootstrap?.basePackage;
    const projectName = bootstrap?.projectName;
    if (!basePackage || !projectName) {
      throw new Error(
        `${SAMPLE_PORT_FAKE_KOTLIN_ID}: requires a walking-skeleton bootstrap (one of ${BOOTSTRAP_IDS.join(', ')}) to have run first; basePackage/projectName not in manifest`,
      );
    }
    const vars = {
      basePackage,
      projectName,
      pkgPath: packageToPath(basePackage),
    };
    const buildSystem = jvmBuildSystem(ctx.manifest.tags);
    const [sources, build] = await Promise.all([
      ctx.templates.render(TEMPLATE_ID, '', vars),
      ctx.templates.render(`${BUILD_TEMPLATE_ROOT}/${buildSystem}`, '', vars),
    ]);
    return {
      files: [...sources, ...build],
      patches: [buildSystem === 'maven' ? mavenModulePatch() : gradleIncludePatch()],
    };
  },
};

function gradleIncludePatch(): ContributionPatch {
  return {
    target: 'settings.gradle.kts',
    apply: (existing) => {
      if (existing.includes(FAKE_MODULE_INCLUDE)) return existing;
      const eol = eolOf(existing);
      return `${existing.trimEnd()}${withEol(`\n${FAKE_MODULE_INCLUDE}\n`, eol)}`;
    },
  };
}

function mavenModulePatch(): ContributionPatch {
  return {
    target: 'pom.xml',
    apply: (existing) => {
      if (existing.includes(MAVEN_MODULE)) return existing;
      if (!existing.includes(MAVEN_MODULES_END)) {
        throw new Error(
          `${SAMPLE_PORT_FAKE_KOTLIN_ID}: could not find the <modules> block in the root pom.xml — add ${MAVEN_MODULE} manually`,
        );
      }
      return existing.replace(
        MAVEN_MODULES_END,
        `    ${MAVEN_MODULE}${eolOf(existing)}${MAVEN_MODULES_END}`,
      );
    },
  };
}
