/**
 * `walking-skeleton/go-port-fake` adapter — emits the sample
 * secondary port for the Go skeleton: the `Clock` interface in
 * `internal/domain` (ports live with their consumer, per the Go
 * idiom) and its canonical fake in `internal/infra/clockfake` with a
 * contract test proving the fake honours the port.
 *
 * Demonstrates the keel testing convention end to end in Go: domain
 * code (would) depend only on the `Clock` interface; the fake — not a
 * mock — is the reference implementation tests wire in.
 *
 * Reads `modulePath` from the bootstrap adapter's manifest answers —
 * the install orchestrator threads a running manifest snapshot
 * between adapters, so the answer is visible here without
 * re-prompting the user.
 */

import { GO_BOOTSTRAP_ID, goBootstrapAnswers } from './go-bootstrap.js';
import { goLayout } from './go-module-layout.js';
import type { Adapter } from '../../contract/composition.js';

export const GO_PORT_FAKE_ID = 'walking-skeleton/go-port-fake';

const TEMPLATE_ROOT = 'composition/walking-skeleton/go-port-fake';

export const goPortFakeAdapter: Adapter = {
  id: GO_PORT_FAKE_ID,
  vertical: 'walking-skeleton',
  covers: ['port-example'],
  predicate: { requires: ['lang.go', 'arch.hexagonal'] },
  after: [GO_BOOTSTRAP_ID],
  async contribute(ctx) {
    const { modulePath } = goBootstrapAnswers(ctx.manifest, GO_PORT_FAKE_ID);
    const layout = goLayout(ctx.manifest.tags, modulePath);
    const suffix = layout.layout === 'modulith' ? '-modulith' : '';
    const fakeDir = layout.platform('clockfake');
    const [port, fake] = await Promise.all([
      ctx.templates.render(`${TEMPLATE_ROOT}/templates${suffix}/port`, layout.clockPort, {
        modulePath,
      }),
      ctx.templates.render(`${TEMPLATE_ROOT}/templates/fake`, fakeDir, {
        modulePath,
        clockPkg: layout.clockPkg,
        projectImports: layout.importBlock([layout.clockPort, fakeDir]),
      }),
    ]);
    return { files: [...port, ...fake] };
  },
};
