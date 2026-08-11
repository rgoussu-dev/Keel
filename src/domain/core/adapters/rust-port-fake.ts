/**
 * `walking-skeleton/rust-port-fake` adapter — emits the sample
 * secondary port for the Rust skeleton: the `Clock` trait as a
 * `domain` submodule (ports live with their consumer) and its
 * canonical fake in `src/infra/clock_fake.rs` with a contract test
 * proving the fake honours the port.
 *
 * Demonstrates the keel testing convention end to end in Rust:
 * domain code (would) depend only on the `Clock` trait; the fake —
 * not a mock — is the reference implementation tests wire in.
 *
 * Because Rust modules are declared, not discovered, the new files
 * are stitched in with patches: `src/domain.rs` gains
 * `pub mod clock;` (+ a `Clock` re-export on the contract face) and
 * `src/lib.rs` gains `pub mod infra;`. Both patches are idempotent.
 */

import { RUST_BOOTSTRAP_ID } from './rust-bootstrap.js';
import type { Adapter } from '../../contract/composition.js';
import { eolOf, withEol } from '../util.js';

export const RUST_PORT_FAKE_ID = 'walking-skeleton/rust-port-fake';

const TEMPLATE_ID = 'composition/walking-skeleton/rust-port-fake/templates';

const DOMAIN_MARKER = 'pub mod clock;';
const LIB_MARKER = 'pub mod infra;';

export const rustPortFakeAdapter: Adapter = {
  id: RUST_PORT_FAKE_ID,
  vertical: 'walking-skeleton',
  covers: ['port-example'],
  predicate: { requires: ['lang.rust', 'arch.hexagonal'] },
  after: [RUST_BOOTSTRAP_ID],
  async contribute(ctx) {
    const files = await ctx.templates.render(TEMPLATE_ID, '', {});
    return {
      files,
      patches: [
        {
          target: 'src/domain.rs',
          apply: (existing) => {
            if (existing.includes(DOMAIN_MARKER)) return existing;
            const eol = eolOf(existing);
            return `${existing.trimEnd()}${withEol(`\n\n${DOMAIN_MARKER}\npub use clock::Clock;\n`, eol)}`;
          },
        },
        {
          target: 'src/lib.rs',
          apply: (existing) => {
            if (existing.includes(LIB_MARKER)) return existing;
            const eol = eolOf(existing);
            return `${existing.trimEnd()}${withEol(`\n\n${LIB_MARKER}\n`, eol)}`;
          },
        },
      ],
    };
  },
};
