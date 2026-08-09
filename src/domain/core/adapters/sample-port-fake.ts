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
 * here without re-prompting the user.
 */

import { packageToPath } from '../util.js';
import type { Adapter } from '../../contract/composition.js';
import { QUARKUS_CLI_BOOTSTRAP_ID } from './quarkus-cli-bootstrap.js';

export const SAMPLE_PORT_FAKE_ID = 'walking-skeleton/sample-port-fake';

const TEMPLATE_ID = 'composition/walking-skeleton/sample-port-fake/templates';

const FAKE_MODULE_INCLUDE = 'include(":infrastructure:clock:fake")';

// The REST sibling's id, referenced ahead of the adapter landing —
// absent ids in `after` are dropped by the resolver, and the answers
// lookup simply finds nothing until a REST bootstrap has run.
const QUARKUS_REST_BOOTSTRAP_ID = 'walking-skeleton/quarkus-rest-bootstrap';

const BOOTSTRAP_IDS = [QUARKUS_CLI_BOOTSTRAP_ID, QUARKUS_REST_BOOTSTRAP_ID] as const;

export const samplePortFakeAdapter: Adapter = {
  id: SAMPLE_PORT_FAKE_ID,
  vertical: 'walking-skeleton',
  covers: ['port-example'],
  predicate: { requires: ['framework.quarkus', 'arch.hexagonal'] },
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
