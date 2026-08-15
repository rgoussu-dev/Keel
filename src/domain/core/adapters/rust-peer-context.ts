/**
 * `walking-skeleton/rust-peer-context` adapter — scaffolds the
 * **second bounded context** under the Rust modulith, opted into with
 * `keel new --with-peer-context`.
 *
 * With one context the modulith's central claim — that contexts meet
 * only at `user-side/service` — is asserted rather than exercised:
 * nothing in the emitted project consumes the seam, so nothing proves
 * it holds. `guestbook` is the consumer that does. It needs a welcome
 * to record, `greeting` is the context that composes one, and the
 * only edge between them runs through a **gateway crate** whose
 * `Cargo.toml` lists `greeting-user-side-service` and deliberately
 * does not list `greeting-domain-contract`.
 *
 * That gateway is also where Rust's seam is at its weakest, and the
 * templates say so where it matters. The crate graph stops the
 * gateway *naming* the peer's domain crate; it does not stop a domain
 * type *flowing* through the seam, because inference supplies what
 * the consumer cannot write. Verified on rustc 1.94.1: a gateway with
 * no edge to `greeting-domain-contract` can hold a value that crate
 * declares and read its fields, with no error and no warning. So the
 * seam crate carries only its own DTOs by convention, stated in its
 * module doc, and `cargo tree -p <consumer>` names the one crate a
 * reviewer must look at.
 *
 * Three crates, mirroring the JVM peer: the context's contract face
 * and core, plus the gateway under its `infra/`. The assembly gains a
 * `guestbook` module that wires them and a test proving the wiring
 * really reaches across the seam.
 */

import { RUST_BOOTSTRAP_ID, rustBootstrapAnswers } from './rust-bootstrap.js';
import { RUST_CLI_BOOTSTRAP_ID } from './rust-cli-bootstrap.js';
import { RUST_HTTP_BOOTSTRAP_ID } from './rust-http-bootstrap.js';
import type { Adapter, ContributionPatch } from '../../contract/composition.js';
import { eolOf, withEol } from '../util.js';
import { MODULITH_LAYOUT_TAG, PEER_CONTEXT_TAG } from './module-layout.js';
import { addWorkspaceMembers, rustLayout, rustPeerCrates } from './rust-module-layout.js';

export const RUST_PEER_CONTEXT_ID = 'walking-skeleton/rust-peer-context';

const TEMPLATE_ROOT = 'composition/walking-skeleton/rust-peer-context/templates';

const WIRING_MARKER = 'mod guestbook;';

export const rustPeerContextAdapter: Adapter = {
  id: RUST_PEER_CONTEXT_ID,
  vertical: 'walking-skeleton',
  covers: [],
  predicate: {
    requires: ['lang.rust', MODULITH_LAYOUT_TAG, PEER_CONTEXT_TAG],
  },
  // Both entrypoints listed because either may be the one present,
  // and a project carrying both must have its assemblies emitted
  // before this wires into them.
  after: [RUST_BOOTSTRAP_ID, RUST_CLI_BOOTSTRAP_ID, RUST_HTTP_BOOTSTRAP_ID],
  async contribute(ctx) {
    const { projectName } = rustBootstrapAnswers(ctx.manifest, RUST_PEER_CONTEXT_ID);
    const layout = rustLayout(ctx.manifest.tags, projectName);
    const peer = rustPeerCrates(layout);
    const context = await ctx.templates.render(`${TEMPLATE_ROOT}/context`, 'modules', {});

    const typologies = assembliesOf(ctx.manifest.tags);
    const wirings = await Promise.all(
      typologies.map((typology) => {
        const assembly = layout.assembly(typology);
        const dir = assembly.rootFile.slice(0, assembly.rootFile.lastIndexOf('/'));
        return ctx.templates.render(`${TEMPLATE_ROOT}/wiring`, dir, {});
      }),
    );

    const memberDirs = [peer.contract, peer.core, peer.gateway].map((u) => u.crate.dir);
    const patches: ContributionPatch[] = [
      {
        target: 'Cargo.toml',
        apply: (existing) => addWorkspaceMembers(existing, memberDirs),
      },
    ];
    for (const typology of typologies) {
      const assembly = layout.assembly(typology);
      patches.push(assemblyDepsPatch(assembly.crate.manifest, peerDeps(layout, peer, assembly)));
      patches.push(assemblyModulePatch(assembly.rootFile));
    }
    return { files: [...context, ...wirings.flat()], patches };
  },
};

/** Which assemblies this project has, from the stack's arch tags. */
function assembliesOf(tags: readonly string[]): readonly string[] {
  const typologies: string[] = [];
  if (tags.includes('arch.cli')) typologies.push('cli');
  if (tags.includes('arch.server-http')) typologies.push('http');
  return typologies;
}

/**
 * The dependency lines an assembly needs to wire the peer. The
 * greeting **seam** is listed, and the greeting domain deliberately
 * is not: an assembly may legitimately name both contexts, but the
 * wiring module is written against the seam so that copying it into a
 * gateway does not carry a domain edge along with it.
 */
function peerDeps(
  layout: ReturnType<typeof rustLayout>,
  peer: ReturnType<typeof rustPeerCrates>,
  assembly: ReturnType<ReturnType<typeof rustLayout>['assembly']>,
): string {
  const entries: readonly (readonly [string, string])[] = [
    ['platform-kernel', layout.kernel.crate.pathFrom(assembly.crate)],
    [peer.contract.crate.name, peer.contract.crate.pathFrom(assembly.crate)],
    [peer.core.crate.name, peer.core.crate.pathFrom(assembly.crate)],
    [peer.gateway.crate.name, peer.gateway.crate.pathFrom(assembly.crate)],
    [layout.service.crate.name, layout.service.crate.pathFrom(assembly.crate)],
  ];
  return entries.map(([name, path]) => `${name} = { path = "${path}" }`).join('\n');
}

/** Appends the peer's crates to an assembly manifest, once. */
function assemblyDepsPatch(target: string, deps: string): ContributionPatch {
  return {
    target,
    apply: (existing) => {
      if (existing.includes('guestbook-domain-contract')) return existing;
      const marker = '[dependencies]';
      if (!existing.includes(marker)) {
        throw new Error(
          `${RUST_PEER_CONTEXT_ID}: no [dependencies] table in '${target}' to add the peer context to`,
        );
      }
      return existing.replace(marker, `${marker}${withEol(`\n${deps}`, eolOf(existing))}`);
    },
  };
}

/**
 * Declares the wiring module in the assembly's root. Rust will not
 * compile a file nobody declared, so omitting this leaves the peer
 * context emitted, compiled as a workspace member, and wired into
 * nothing — which is exactly the JVM failure this adapter's e2e
 * asserts against.
 */
function assemblyModulePatch(target: string): ContributionPatch {
  return {
    target,
    apply: (existing) => {
      if (existing.includes(WIRING_MARKER)) return existing;
      const anchor = existing.indexOf('\n\n');
      if (anchor === -1) {
        return `${existing.trimEnd()}${withEol(`\n\n${WIRING_MARKER}\n`, eolOf(existing))}`;
      }
      return `${existing.slice(0, anchor)}\n${WIRING_MARKER}${existing.slice(anchor)}`;
    },
  };
}
