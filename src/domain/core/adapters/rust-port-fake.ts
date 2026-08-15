/**
 * `walking-skeleton/rust-port-fake` adapter — emits the sample
 * secondary port for the Rust skeleton: the `Clock` trait and its
 * canonical fake, with a contract test proving the fake honours the
 * port.
 *
 * Demonstrates the keel testing convention end to end in Rust:
 * domain code (would) depend only on the `Clock` trait; the fake —
 * not a mock — is the reference implementation tests wire in.
 *
 * **Where a clock lives is a layout question**, and it is the one
 * `goLayout.platform` already answers for Go. Under `basic` there is
 * a single hexagon, so the port is a `domain` submodule (ports live
 * with their consumer) and the fake an ordinary secondary adapter
 * under `src/infra/`. Under the modulith a `Clock` belongs to no
 * bounded context — putting it in `modules/<ctx>/` would make one
 * context own everybody's time — so both port and fake join
 * `platform-kernel`, which every context already depends on.
 *
 * Because Rust modules are declared rather than discovered, the new
 * files are stitched in with patches on whichever module root the
 * layout put them under. Every patch is idempotent.
 */

import { RUST_BOOTSTRAP_ID } from './rust-bootstrap.js';
import { rustBootstrapAnswers } from './rust-bootstrap.js';
import type { Adapter, ContributionPatch } from '../../contract/composition.js';
import { eolOf, withEol } from '../util.js';
import { rustLayout } from './rust-module-layout.js';

export const RUST_PORT_FAKE_ID = 'walking-skeleton/rust-port-fake';

const TEMPLATE_ROOT = 'composition/walking-skeleton/rust-port-fake/templates';

const CLOCK_MARKER = 'pub mod clock;';
const FAKE_MARKER = 'pub mod clock_fake;';
const LIB_MARKER = 'pub mod infra;';

export const rustPortFakeAdapter: Adapter = {
  id: RUST_PORT_FAKE_ID,
  vertical: 'walking-skeleton',
  covers: ['port-example'],
  predicate: { requires: ['lang.rust', 'arch.hexagonal'] },
  after: [RUST_BOOTSTRAP_ID],
  async contribute(ctx) {
    const { projectName } = rustBootstrapAnswers(ctx.manifest, RUST_PORT_FAKE_ID);
    const layout = rustLayout(ctx.manifest.tags, projectName);
    // Both port and fake are context-free, so both go through
    // `platform()`; only the fake needs to name the port, and the
    // spelling of that name is what moves with the layout.
    const port = layout.platform('clock');
    const fake = layout.platform('clock_fake');
    const clockUse = layout.layout === 'basic' ? 'crate::domain' : 'crate::clock';
    const [portFiles, fakeFiles] = await Promise.all([
      ctx.templates.render(`${TEMPLATE_ROOT}/port`, dirOf(portHome(layout, port.rootFile)), {}),
      ctx.templates.render(`${TEMPLATE_ROOT}/fake`, dirOf(fake.rootFile), { clockUse }),
    ]);
    if (layout.layout === 'basic') {
      const infra = await ctx.templates.render(`${TEMPLATE_ROOT}/basic-infra`, 'src', {});
      return {
        files: [...portFiles, ...fakeFiles, ...infra],
        patches: [
          declare('src/domain.rs', `${CLOCK_MARKER}\npub use clock::Clock;`, CLOCK_MARKER),
          declare('src/lib.rs', LIB_MARKER, LIB_MARKER),
        ],
      };
    }
    const kernelRoot = layout.kernel.rootFile;
    return {
      files: [...portFiles, ...fakeFiles],
      patches: [
        declare(kernelRoot, `${CLOCK_MARKER}\npub use clock::Clock;`, CLOCK_MARKER),
        declare(kernelRoot, FAKE_MARKER, FAKE_MARKER),
      ],
    };
  },
};

/**
 * Under `basic` the port is a `domain` submodule rather than a
 * secondary adapter — ports live with their consumer, and the single
 * hexagon's consumer is `domain`. Under the modulith `platform()`
 * has already put it in the kernel and this is the identity.
 */
function portHome(layout: ReturnType<typeof rustLayout>, platformFile: string): string {
  return layout.layout === 'basic' ? layout.contract.moduleFile('clock') : platformFile;
}

function dirOf(file: string): string {
  return file.slice(0, file.lastIndexOf('/'));
}

/**
 * Appends a module declaration to a module root, once. Rust will not
 * compile a file nobody declared, so a dropped patch is a compile
 * error rather than dead code — but an appended duplicate is one too,
 * hence the marker check.
 */
function declare(target: string, text: string, marker: string): ContributionPatch {
  return {
    target,
    apply: (existing) => {
      if (existing.includes(marker)) return existing;
      return `${existing.trimEnd()}${withEol(`\n\n${text}\n`, eolOf(existing))}`;
    },
  };
}
