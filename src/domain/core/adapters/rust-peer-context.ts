/**
 * `walking-skeleton/rust-peer-context` and its wiring adapters —
 * scaffold the **second bounded context** under the Rust modulith,
 * opted into with `keel new --with-peer-context`.
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
 *
 * **A shell, and one wiring adapter per entrypoint.** The shell writes
 * the three crates and adds them to the workspace's `members`, none of
 * which an entrypoint shapes; `rust-peer-context-cli` and
 * `rust-peer-context-http` each write one assembly's `guestbook.rs`,
 * declare it in that assembly's `main.rs` and add the peer's crates to
 * that assembly's `Cargo.toml`, and require that entrypoint's tag. A
 * project carrying both matches both, so which assemblies the context
 * is wired into is read off the predicates, never off the tags inside
 * `contribute()`, and `keel add entrypoint` wires it into the new
 * assembly by installing the one that newly matches (roadmap R.3b).
 */

import { RUST_BOOTSTRAP_ID, rustBootstrapAnswers } from './rust-bootstrap.js';
import { RUST_CLI_BOOTSTRAP_ID } from './rust-cli-bootstrap.js';
import { RUST_HTTP_BOOTSTRAP_ID } from './rust-http-bootstrap.js';
import type { Adapter, ContributionPatch, Tag } from '../../contract/composition.js';
import { eolOf, withEol } from '../util.js';
import { MODULITH_LAYOUT_TAG, PEER_CONTEXT_TAG } from './module-layout.js';
import {
  addWorkspaceMembers,
  rustLayout,
  rustPeerCrates,
  type RustLayoutPaths,
  type RustUnit,
} from './rust-module-layout.js';

export const RUST_PEER_CONTEXT_ID = 'walking-skeleton/rust-peer-context';
/** The adapter wiring the guestbook context into the CLI's assembly. */
export const RUST_PEER_CONTEXT_CLI_ID = 'walking-skeleton/rust-peer-context-cli';
/** The adapter wiring the guestbook context into the HTTP server's assembly. */
export const RUST_PEER_CONTEXT_HTTP_ID = 'walking-skeleton/rust-peer-context-http';

const TEMPLATE_ROOT = 'composition/walking-skeleton/rust-peer-context/templates';

const WIRING_MARKER = 'mod guestbook;';

/** The shell: the guestbook context's crates and their workspace membership. */
export const rustPeerContextAdapter: Adapter = {
  id: RUST_PEER_CONTEXT_ID,
  vertical: 'walking-skeleton',
  covers: [],
  predicate: {
    requires: ['lang.rust', MODULITH_LAYOUT_TAG, PEER_CONTEXT_TAG],
  },
  // The workspace manifest it adds the crates to is the base
  // bootstrap's.
  after: [RUST_BOOTSTRAP_ID],
  async contribute(ctx) {
    const { projectName } = rustBootstrapAnswers(ctx.manifest, RUST_PEER_CONTEXT_ID);
    const peer = rustPeerCrates(rustLayout(ctx.manifest.tags, projectName));
    const memberDirs = [peer.contract, peer.core, peer.gateway].map((u) => u.crate.dir);
    return {
      files: await ctx.templates.render(`${TEMPLATE_ROOT}/context`, 'modules', {}),
      patches: [
        {
          target: 'Cargo.toml',
          apply: (existing) => addWorkspaceMembers(existing, memberDirs),
        },
      ],
    };
  },
};

/** Wires the guestbook context into the CLI's assembly, `application/cli`. */
export const rustPeerContextCliAdapter: Adapter = wiringAdapter(
  RUST_PEER_CONTEXT_CLI_ID,
  'cli',
  'arch.cli',
  RUST_CLI_BOOTSTRAP_ID,
);

/** Wires the guestbook context into the HTTP server's assembly, `application/http`. */
export const rustPeerContextHttpAdapter: Adapter = wiringAdapter(
  RUST_PEER_CONTEXT_HTTP_ID,
  'http',
  'arch.server-http',
  RUST_HTTP_BOOTSTRAP_ID,
);

/**
 * The adapter that wires the guestbook context into the assembly of
 * the deployment unit `unit` — `src/guestbook.rs`, its `mod` line in
 * `main.rs`, and the peer's crates in that assembly's `Cargo.toml` —
 * on a project carrying `entrypoint`, after the shell and that
 * entrypoint's bootstrap, whose assembly it lands in.
 */
function wiringAdapter(id: string, unit: string, entrypoint: Tag, bootstrap: string): Adapter {
  return {
    id,
    vertical: 'walking-skeleton',
    covers: [],
    predicate: {
      requires: ['lang.rust', MODULITH_LAYOUT_TAG, PEER_CONTEXT_TAG, entrypoint],
    },
    after: [RUST_PEER_CONTEXT_ID, bootstrap],
    async contribute(ctx) {
      const { projectName } = rustBootstrapAnswers(ctx.manifest, id);
      const layout = rustLayout(ctx.manifest.tags, projectName);
      const assembly = layout.assembly(unit);
      const dir = assembly.rootFile.slice(0, assembly.rootFile.lastIndexOf('/'));
      return {
        files: await ctx.templates.render(`${TEMPLATE_ROOT}/wiring`, dir, {}),
        patches: [
          assemblyDepsPatch(
            id,
            assembly.crate.manifest,
            peerDeps(layout, rustPeerCrates(layout), assembly),
          ),
          assemblyModulePatch(assembly.rootFile),
        ],
      };
    },
  };
}

/**
 * The dependency lines an assembly needs to wire the peer. The
 * greeting **seam** is listed, and the greeting domain deliberately
 * is not: an assembly may legitimately name both contexts, but the
 * wiring module is written against the seam so that copying it into a
 * gateway does not carry a domain edge along with it.
 */
function peerDeps(
  layout: RustLayoutPaths,
  peer: ReturnType<typeof rustPeerCrates>,
  assembly: RustUnit,
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

/**
 * Prepends the peer's crates to an assembly manifest's `[dependencies]`,
 * once, for the adapter `id`.
 */
function assemblyDepsPatch(id: string, target: string, deps: string): ContributionPatch {
  return {
    target,
    apply: (existing) => {
      if (existing.includes('guestbook-domain-contract')) return existing;
      const marker = '[dependencies]';
      if (!existing.includes(marker)) {
        throw new Error(`${id}: no [dependencies] table in '${target}' to add the peer context to`);
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
