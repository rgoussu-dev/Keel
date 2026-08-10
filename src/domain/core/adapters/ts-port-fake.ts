/**
 * `walking-skeleton/ts-port-fake` adapter — the Node sibling of
 * `sample-port-fake` and `wc-sample-port-fake`. Emits a sample
 * driven port (`Clock`) into `domain/contract` plus an
 * `infrastructure/clock` workspace package holding the real adapter
 * (`systemClock`, wrapping `Date`) and its canonical fake
 * (`createFakeClock`) side by side, with a contract test for the
 * fake. Patches `domain/contract/src/index.ts` to re-export the new
 * port.
 *
 * Reads `npmScope` from the bootstrap adapter's manifest answers —
 * the install orchestrator threads a running manifest snapshot
 * between adapters, so any answer the bootstrap recorded is visible
 * here without re-prompting the user.
 */

import type { Adapter } from '../../contract/composition.js';
import { TS_HTTP_BOOTSTRAP_ID } from './ts-http-bootstrap.js';
import { tsWorkspaceVars } from './ts-workspace.js';

export const TS_PORT_FAKE_ID = 'walking-skeleton/ts-port-fake';

const TEMPLATE_ID = 'composition/walking-skeleton/ts-port-fake/templates';

const CONTRACT_INDEX_TARGET = 'domain/contract/src/index.ts';
const CLOCK_EXPORT = "export * from './clock.ts';";

export const tsPortFakeAdapter: Adapter = {
  id: TS_PORT_FAKE_ID,
  vertical: 'walking-skeleton',
  covers: ['port-example'],
  predicate: { requires: ['lang.typescript', 'runtime.node', 'arch.hexagonal'] },
  after: [TS_HTTP_BOOTSTRAP_ID],
  async contribute(ctx) {
    const npmScope = ctx.manifest.answers[TS_HTTP_BOOTSTRAP_ID]?.npmScope;
    if (!npmScope) {
      throw new Error(
        `${TS_PORT_FAKE_ID}: requires '${TS_HTTP_BOOTSTRAP_ID}' to have run first; npmScope not in manifest`,
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
          target: CONTRACT_INDEX_TARGET,
          apply: (existing) => {
            if (existing.includes(CLOCK_EXPORT)) return existing;
            return `${existing.trimEnd()}\n${CLOCK_EXPORT}\n`;
          },
        },
      ],
    };
  },
};
