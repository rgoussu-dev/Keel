/**
 * `walking-skeleton/sample-port-fake` adapter — emits a sample
 * secondary port (`Clock`) into `domain/contract` plus a fake
 * implementation under `infrastructure/clock/fake` with a contract
 * test for the fake. Patches the root `settings.gradle.kts` to
 * include the new module.
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
import { packageToPath } from '../util.js';
import type { Adapter } from '../../contract/composition.js';
import { MICRONAUT_CLI_BOOTSTRAP_ID } from './micronaut-cli-bootstrap.js';
import { MICRONAUT_REST_BOOTSTRAP_ID } from './micronaut-rest-bootstrap.js';
import { QUARKUS_CLI_BOOTSTRAP_ID } from './quarkus-cli-bootstrap.js';
import { QUARKUS_REST_BOOTSTRAP_ID } from './quarkus-rest-bootstrap.js';
import { SPRING_CLI_BOOTSTRAP_ID } from './spring-cli-bootstrap.js';
import { SPRING_REST_BOOTSTRAP_ID } from './spring-rest-bootstrap.js';

export const SAMPLE_PORT_FAKE_ID = 'walking-skeleton/sample-port-fake';

const TEMPLATE_ID = 'composition/walking-skeleton/sample-port-fake/templates';
const BUILD_TEMPLATE_ROOT = 'composition/walking-skeleton/sample-port-fake/build';

const FAKE_MODULE_INCLUDE = 'include(":infrastructure:clock:fake")';

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
    const basePackage = BOOTSTRAP_IDS.map((id) => ctx.manifest.answers[id]?.basePackage).find(
      Boolean,
    );
    if (!basePackage) {
      throw new Error(
        `${SAMPLE_PORT_FAKE_ID}: requires a walking-skeleton bootstrap (one of ${BOOTSTRAP_IDS.join(', ')}) to have run first; basePackage not in manifest`,
      );
    }
    const vars = {
      basePackage,
      pkgPath: packageToPath(basePackage),
    };
    const [sources, build] = await Promise.all([
      ctx.templates.render(TEMPLATE_ID, '', vars),
      ctx.templates.render(`${BUILD_TEMPLATE_ROOT}/${jvmBuildSystem(ctx.manifest.tags)}`, '', vars),
    ]);
    return {
      files: [...sources, ...build],
      patches: [
        {
          target: 'settings.gradle.kts',
          apply: (existing) => {
            if (existing.includes(FAKE_MODULE_INCLUDE)) return existing;
            return `${existing.trimEnd()}\n${FAKE_MODULE_INCLUDE}\n`;
          },
        },
      ],
    };
  },
};
