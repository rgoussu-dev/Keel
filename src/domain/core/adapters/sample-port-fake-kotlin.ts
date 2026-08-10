/**
 * `walking-skeleton/sample-port-fake-kotlin` adapter — the Kotlin
 * sibling of `sample-port-fake`: emits the sample secondary port
 * (`Clock`) into `domain/contract` plus a fake implementation under
 * `infrastructure/clock/fake` with a contract test for the fake,
 * all as idiomatic Kotlin, and patches the root
 * `settings.gradle.kts` to include the new module.
 *
 * Framework-agnostic like its Java twin: the port, the fake, and
 * its Gradle module are plain Kotlin, so the adapter fires for
 * every Kotlin JVM bootstrap (`runtime.jvm + lang.kotlin`) and the
 * resolver keeps exactly one of the pair by language predicate.
 */

import { packageToPath } from '../util.js';
import type { Adapter } from '../../contract/composition.js';
import { MICRONAUT_CLI_KOTLIN_BOOTSTRAP_ID } from './micronaut-cli-kotlin-bootstrap.js';
import { MICRONAUT_REST_KOTLIN_BOOTSTRAP_ID } from './micronaut-rest-kotlin-bootstrap.js';
import { QUARKUS_CLI_KOTLIN_BOOTSTRAP_ID } from './quarkus-cli-kotlin-bootstrap.js';
import { QUARKUS_REST_KOTLIN_BOOTSTRAP_ID } from './quarkus-rest-kotlin-bootstrap.js';
import { SPRING_CLI_KOTLIN_BOOTSTRAP_ID } from './spring-cli-kotlin-bootstrap.js';
import { SPRING_REST_KOTLIN_BOOTSTRAP_ID } from './spring-rest-kotlin-bootstrap.js';

export const SAMPLE_PORT_FAKE_KOTLIN_ID = 'walking-skeleton/sample-port-fake-kotlin';

const TEMPLATE_ID = 'composition/walking-skeleton/sample-port-fake-kotlin/templates';

const FAKE_MODULE_INCLUDE = 'include(":infrastructure:clock:fake")';

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
    const basePackage = BOOTSTRAP_IDS.map((id) => ctx.manifest.answers[id]?.basePackage).find(
      Boolean,
    );
    if (!basePackage) {
      throw new Error(
        `${SAMPLE_PORT_FAKE_KOTLIN_ID}: requires a walking-skeleton bootstrap (one of ${BOOTSTRAP_IDS.join(', ')}) to have run first; basePackage not in manifest`,
      );
    }
    const files = await ctx.templates.render(TEMPLATE_ID, '', {
      basePackage,
      pkgPath: packageToPath(basePackage),
    });
    return {
      files,
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
