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

import path from 'node:path';
import { paths } from '../../util/paths.js';
import { renderTemplateFiles } from '../render.js';
import { packageToPath } from '../util.js';
import type { Adapter } from '../../domain/contract/composition.js';
import { QUARKUS_CLI_BOOTSTRAP_ID } from './quarkus-cli-bootstrap.js';

export const SAMPLE_PORT_FAKE_ID = 'walking-skeleton/sample-port-fake';

const FAKE_MODULE_INCLUDE = 'include(":infrastructure:clock:fake")';

export const samplePortFakeAdapter: Adapter = {
  id: SAMPLE_PORT_FAKE_ID,
  vertical: 'walking-skeleton',
  covers: ['port-example'],
  predicate: { requires: ['framework.quarkus', 'arch.cli', 'arch.hexagonal'] },
  after: [QUARKUS_CLI_BOOTSTRAP_ID],
  async contribute(ctx) {
    const basePackage = ctx.manifest.answers[QUARKUS_CLI_BOOTSTRAP_ID]?.basePackage;
    if (!basePackage) {
      throw new Error(
        `${SAMPLE_PORT_FAKE_ID}: requires '${QUARKUS_CLI_BOOTSTRAP_ID}' to have run first; basePackage not in manifest`,
      );
    }
    const templateRoot = path.join(
      paths.asset('composition'),
      'walking-skeleton',
      'sample-port-fake',
      'templates',
    );
    const files = await renderTemplateFiles(templateRoot, '', {
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
