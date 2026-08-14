/**
 * `walking-skeleton/sample-port-fake` adapter — emits a sample
 * secondary port (`Clock`) into `domain/contract` plus a fake
 * implementation under `infrastructure/clock/fake` with a contract
 * test for the fake. Registers the new module with the build:
 * a `settings.gradle.kts` include under Gradle, a root `pom.xml`
 * `<module>` entry under Maven.
 *
 * Demonstrates the keel testing convention end to end: domain code
 * (would) depend only on the `Clock` interface; the test ships with
 * a fake (not a mock) that proves the contract holds.
 *
 * Reads `basePackage` from the bootstrap adapter's manifest answers
 * — the install orchestrator threads a running manifest snapshot
 * between adapters, so any answer the bootstrap recorded is visible
 * here without re-prompting the user. Framework-agnostic: the port,
 * the fake, and its Gradle module are plain Java, so the adapter
 * fires for every Java JVM bootstrap (`runtime.jvm + lang.java`);
 * the Kotlin sibling (`sample-port-fake-kotlin`) covers the same
 * dimension under `lang.kotlin`.
 */

import { jvmBuildSystem } from './jvm-build-system.js';
import { gradleProject, jvmLayout } from './jvm-module-layout.js';
import { eolOf, packageToPath, withEol } from '../util.js';
import type { Adapter, ContributionPatch } from '../../contract/composition.js';
import { MICRONAUT_CLI_BOOTSTRAP_ID } from './micronaut-cli-bootstrap.js';
import { MICRONAUT_REST_BOOTSTRAP_ID } from './micronaut-rest-bootstrap.js';
import { QUARKUS_CLI_BOOTSTRAP_ID } from './quarkus-cli-bootstrap.js';
import { QUARKUS_REST_BOOTSTRAP_ID } from './quarkus-rest-bootstrap.js';
import { SPRING_CLI_BOOTSTRAP_ID } from './spring-cli-bootstrap.js';
import { SPRING_REST_BOOTSTRAP_ID } from './spring-rest-bootstrap.js';

export const SAMPLE_PORT_FAKE_ID = 'walking-skeleton/sample-port-fake';

const TEMPLATE_ID = 'composition/walking-skeleton/sample-port-fake/templates';
const BUILD_TEMPLATE_ROOT = 'composition/walking-skeleton/sample-port-fake/build';

const MAVEN_MODULES_END = '  </modules>';

const BOOTSTRAP_IDS = [
  QUARKUS_CLI_BOOTSTRAP_ID,
  QUARKUS_REST_BOOTSTRAP_ID,
  SPRING_CLI_BOOTSTRAP_ID,
  SPRING_REST_BOOTSTRAP_ID,
  MICRONAUT_CLI_BOOTSTRAP_ID,
  MICRONAUT_REST_BOOTSTRAP_ID,
] as const;

export const samplePortFakeAdapter: Adapter = {
  id: SAMPLE_PORT_FAKE_ID,
  vertical: 'walking-skeleton',
  covers: ['port-example'],
  predicate: { requires: ['runtime.jvm', 'arch.hexagonal', 'lang.java'] },
  after: [...BOOTSTRAP_IDS],
  async contribute(ctx) {
    const bootstrap = BOOTSTRAP_IDS.map((id) => ctx.manifest.answers[id]).find(
      (answers) => answers?.basePackage,
    );
    const basePackage = bootstrap?.basePackage;
    const projectName = bootstrap?.projectName;
    if (!basePackage || !projectName) {
      throw new Error(
        `${SAMPLE_PORT_FAKE_ID}: requires a walking-skeleton bootstrap (one of ${BOOTSTRAP_IDS.join(', ')}) to have run first; basePackage/projectName not in manifest`,
      );
    }
    const vars = {
      basePackage,
      projectName,
      pkgPath: packageToPath(basePackage),
    };
    const buildSystem = jvmBuildSystem(ctx.manifest.tags);
    const layout = jvmLayout(ctx.manifest.tags);
    const suffix = layout.layout === 'modulith' ? '-modulith' : '';
    const fakeModule = layout.infra('clock/fake');
    const [sources, build] = await Promise.all([
      ctx.templates.render(`${TEMPLATE_ID}${suffix}`, '', vars),
      ctx.templates.render(`${BUILD_TEMPLATE_ROOT}${suffix}/${buildSystem}`, '', vars),
    ]);
    return {
      files: [...sources, ...build],
      patches: [
        buildSystem === 'maven' ? mavenModulePatch(fakeModule) : gradleIncludePatch(fakeModule),
      ],
    };
  },
};

function gradleIncludePatch(fakeModule: string): ContributionPatch {
  const include = `include("${gradleProject(fakeModule)}")`;
  return {
    target: 'settings.gradle.kts',
    apply: (existing) => {
      if (existing.includes(include)) return existing;
      const eol = eolOf(existing);
      return `${existing.trimEnd()}${withEol(`\n${include}\n`, eol)}`;
    },
  };
}

function mavenModulePatch(fakeModule: string): ContributionPatch {
  const moduleEntry = `<module>${fakeModule}</module>`;
  return {
    target: 'pom.xml',
    apply: (existing) => {
      if (existing.includes(moduleEntry)) return existing;
      if (!existing.includes(MAVEN_MODULES_END)) {
        throw new Error(
          `${SAMPLE_PORT_FAKE_ID}: could not find the <modules> block in the root pom.xml — add ${moduleEntry} manually`,
        );
      }
      return existing.replace(
        MAVEN_MODULES_END,
        `    ${moduleEntry}${eolOf(existing)}${MAVEN_MODULES_END}`,
      );
    },
  };
}
