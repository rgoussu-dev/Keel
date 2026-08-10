/**
 * `walking-skeleton/wc-sample-port-fake` adapter — the browser
 * sibling of `sample-port-fake`. Emits a sample driven port
 * (`Clock`) into `domain/domain-api` plus an
 * `infrastructure/commons` workspace package holding the real
 * adapter (`systemClock`, wrapping `Date`) and its canonical fake
 * (`createFakeClock`) side by side, with a contract test for the
 * fake. Patches `domain/domain-api/src/index.ts` to re-export the
 * new port.
 *
 * Demonstrates the keel testing convention in the frontend
 * realization: domain code (would) depend only on the `Clock`
 * interface; the fake — not a mock — is the reference
 * implementation of the contract. Ubiquitous ports (clock, id
 * generation) sit together in `commons`, per the house frontend
 * reference.
 *
 * Reads `npmScope` from the bootstrap adapter's manifest answers —
 * the install orchestrator threads a running manifest snapshot
 * between adapters, so any answer the bootstrap recorded is visible
 * here without re-prompting the user.
 */

import type { Adapter } from '../../contract/composition.js';
import { tsWorkspaceVars } from './ts-workspace.js';
import { WC_SPA_BOOTSTRAP_ID } from './wc-spa-bootstrap.js';

export const WC_SAMPLE_PORT_FAKE_ID = 'walking-skeleton/wc-sample-port-fake';

const TEMPLATE_ID = 'composition/walking-skeleton/wc-sample-port-fake/templates';

const API_INDEX_TARGET = 'domain/domain-api/src/index.ts';
const CLOCK_EXPORT = "export * from './ports/clock';";

export const wcSamplePortFakeAdapter: Adapter = {
  id: WC_SAMPLE_PORT_FAKE_ID,
  vertical: 'walking-skeleton',
  covers: ['port-example'],
  predicate: { requires: ['framework.web-components', 'arch.spa', 'arch.hexagonal'] },
  after: [WC_SPA_BOOTSTRAP_ID],
  async contribute(ctx) {
    const npmScope = ctx.manifest.answers[WC_SPA_BOOTSTRAP_ID]?.npmScope;
    if (!npmScope) {
      throw new Error(
        `${WC_SAMPLE_PORT_FAKE_ID}: requires '${WC_SPA_BOOTSTRAP_ID}' to have run first; npmScope not in manifest`,
      );
    }
    const files = await ctx.templates.render(TEMPLATE_ID, '', {
      npmScope,
      ...tsWorkspaceVars(ctx.manifest.tags),
    });
    return {
      files,
      patches: [
        {
          target: API_INDEX_TARGET,
          apply: (existing) => {
            if (existing.includes(CLOCK_EXPORT)) return existing;
            return `${existing.trimEnd()}\n${CLOCK_EXPORT}\n`;
          },
        },
      ],
    };
  },
};
