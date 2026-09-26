/**
 * `walking-skeleton/go-peer-context` and its wiring adapters — scaffold
 * the **second bounded context** under the Go modulith, opted into with
 * `keel new --with-peer-context`.
 *
 * With one context the modulith's central claim — that contexts meet
 * only at the peer seam — is asserted rather than exercised: nothing
 * in the emitted project consumes `userside/service`, so nothing
 * proves it holds. `guestbook` is the consumer that does. It needs a
 * welcome to record, `greeting` is the context that composes one, and
 * the only edge between them runs through a **gateway package** under
 * `modules/guestbook/infra/` whose import block names greeting's seam
 * and nothing else of greeting's.
 *
 * **What the gateway proves in Go is not what it proves in Rust.**
 * There the claim is "the consumer depends only on the seam crate",
 * held by the crate graph. Go has no such lever: `internal/` is
 * scoped to the project root, so every package under it may import
 * every other and no declaration narrows that. What Go enforces is
 * *placement* — greeting's domain sits behind
 * `modules/greeting/internal/`, so the gateway naming a greeting
 * domain type does not compile at all. On that one point Go's wall is
 * stronger than Rust's, where a domain type can still *flow* across
 * the seam because inference supplies the name the consumer cannot
 * write. Here there is nothing to flow: the package is unreachable.
 *
 * **Binding is Go's other difference, and it removes a patch rather
 * than adding one.** Rust's peer-context wiring adapters patch
 * `mod guestbook;` into each assembly root and the JVM family tells
 * its container to scan the new package, because both languages can
 * emit a context that compiles and is wired into nothing. A file in a
 * `cmd/` directory joins that directory's package by existing, so
 * there is no declaration to forget and these adapters emit **no
 * patch at all**. The equivalent Go mistake is landing the wiring
 * somewhere that is not the assembly, and that is what the emitted
 * test and `tests/e2e/modulith-go-peer-context.test.ts` assert
 * instead.
 *
 * **A shell, and one wiring adapter per entrypoint.** The shell writes
 * the context — its contract face and core, its facade, the gateway
 * and `userside/signing` — none of which an entrypoint shapes;
 * `go-peer-context-cli` and `go-peer-context-http` each write one
 * assembly's `guestbook.go` and its test, and require that
 * entrypoint's tag. A project carrying both matches both, so which
 * assemblies the context is wired into is read off the predicates,
 * never off the tags inside `contribute()`, and `keel add entrypoint`
 * wires it into the new assembly by installing the one that newly
 * matches (roadmap R.3a).
 *
 * Five packages, one more than the Rust peer's four: the context's
 * contract face and core, its facade, the gateway under `infra/`, and
 * a `userside/signing` driving adapter. That last one is not padding.
 * A `cmd/` main cannot name `domain.SignCommand` — the context's
 * domain is behind its own `internal/` — so something inside the
 * context has to turn the assembly's primitives into the context's
 * command, exactly as `userside/cli` does for greeting.
 */

import { GO_BOOTSTRAP_ID, goBootstrapAnswers } from './go-bootstrap.js';
import { GO_CLI_BOOTSTRAP_ID } from './go-cli-bootstrap.js';
import { GO_HTTP_BOOTSTRAP_ID } from './go-http-bootstrap.js';
import { goLayout, goPeerPackages, type GoLayoutPaths } from './go-module-layout.js';
import { MODULITH_LAYOUT_TAG, PEER_CONTEXT_TAG } from './module-layout.js';
import type { Adapter, ManifestV2, Tag } from '../../contract/composition.js';

export const GO_PEER_CONTEXT_ID = 'walking-skeleton/go-peer-context';
/** The adapter wiring the guestbook context into the CLI's assembly. */
export const GO_PEER_CONTEXT_CLI_ID = 'walking-skeleton/go-peer-context-cli';
/** The adapter wiring the guestbook context into the HTTP server's assembly. */
export const GO_PEER_CONTEXT_HTTP_ID = 'walking-skeleton/go-peer-context-http';

const TEMPLATE_ROOT = 'composition/walking-skeleton/go-peer-context/templates';

/**
 * The alias the gateway and its test import greeting's seam under.
 *
 * Every context's seam is `package service`, so a file reaching two
 * of them must alias at least one — the hazard `goLayout`'s module
 * doc names. Aliasing here rather than waiting for a third context
 * keeps the emitted code honest about it from the start, and reads
 * better besides: `greetingservice.Greeting` says whose DTO crossed.
 */
const SEAM_ALIAS = 'greetingservice';

/** The shell: the guestbook context, its gateway and its driving adapter. */
export const goPeerContextAdapter: Adapter = {
  id: GO_PEER_CONTEXT_ID,
  vertical: 'walking-skeleton',
  covers: [],
  predicate: {
    requires: ['lang.go', MODULITH_LAYOUT_TAG, PEER_CONTEXT_TAG],
  },
  // The module path is the base bootstrap's answer.
  after: [GO_BOOTSTRAP_ID],
  async contribute(ctx) {
    const { layout, seam } = peerOf(ctx.manifest, GO_PEER_CONTEXT_ID);
    const peer = goPeerPackages();
    const imports = (dirs: readonly string[]): string => importBlock(layout, seam, dirs);
    const rendered = await Promise.all([
      ctx.templates.render(`${TEMPLATE_ROOT}/context`, 'internal/modules', {
        peerDomainImport: layout.importPath(peer.domain),
        peerCoreImport: layout.importPath(peer.domainCore),
      }),
      ctx.templates.render(`${TEMPLATE_ROOT}/userside`, peer.userSide, {
        peerDomainImport: layout.importPath(peer.domain),
        projectImports: imports([peer.domain, peer.userSide]),
      }),
      ctx.templates.render(`${TEMPLATE_ROOT}/gateway`, peer.gateway, {
        gatewayPkg: peer.gatewayPkg,
        sourceImports: imports([peer.domain, seam]),
        testImports: imports([peer.gateway, seam]),
      }),
    ]);
    return { files: rendered.flat() };
  },
};

/** Wires the guestbook context into the CLI's assembly, `cmd/cli`. */
export const goPeerContextCliAdapter: Adapter = wiringAdapter(
  GO_PEER_CONTEXT_CLI_ID,
  'cli',
  'arch.cli',
  GO_CLI_BOOTSTRAP_ID,
);

/** Wires the guestbook context into the HTTP server's assembly, `cmd/http`. */
export const goPeerContextHttpAdapter: Adapter = wiringAdapter(
  GO_PEER_CONTEXT_HTTP_ID,
  'http',
  'arch.server-http',
  GO_HTTP_BOOTSTRAP_ID,
);

/**
 * The adapter that wires the guestbook context into the assembly of
 * the deployment unit `unit` — `cmd/<unit>/guestbook.go` and its test
 * — on a project carrying `entrypoint`, after the shell and that
 * entrypoint's bootstrap, whose assembly it lands in.
 */
function wiringAdapter(id: string, unit: string, entrypoint: Tag, bootstrap: string): Adapter {
  return {
    id,
    vertical: 'walking-skeleton',
    covers: [],
    predicate: {
      requires: ['lang.go', MODULITH_LAYOUT_TAG, PEER_CONTEXT_TAG, entrypoint],
    },
    after: [GO_PEER_CONTEXT_ID, bootstrap],
    async contribute(ctx) {
      const { layout, seam } = peerOf(ctx.manifest, id);
      const peer = goPeerPackages();
      return {
        files: await ctx.templates.render(`${TEMPLATE_ROOT}/wiring`, dirOf(layout.main(unit)), {
          facadePkg: layout.facadePkg,
          peerFacadePkg: peer.facadePkg,
          gatewayPkg: peer.gatewayPkg,
          projectImports: importBlock(layout, seam, [
            layout.facade,
            seam,
            peer.facade,
            peer.gateway,
            peer.userSide,
          ]),
        }),
      };
    },
  };
}

/** The project's layout, and greeting's seam the guestbook reaches it through. */
function peerOf(
  manifest: ManifestV2,
  requesterId: string,
): { readonly layout: GoLayoutPaths; readonly seam: string } {
  const { modulePath } = goBootstrapAnswers(manifest, requesterId);
  const layout = goLayout(manifest.tags, modulePath);
  const seam = layout.service;
  if (seam === null) {
    throw new Error(
      `${requesterId}: the greeting context has no peer seam under layout '${layout.layout}'`,
    );
  }
  return { layout, seam };
}

/** The directory holding a `cmd/<typology>/main.go`. */
function dirOf(mainFile: string): string {
  return mainFile.slice(0, mainFile.lastIndexOf('/'));
}

/**
 * A gofmt-ordered project-import group with greeting's seam aliased.
 *
 * The order comes from `goLayout.importBlock` and the alias is
 * applied afterwards, in that order and not the other way round:
 * gofmt sorts by import *path*, never by the name a file calls it,
 * so deriving first and decorating second is what keeps the emitted
 * block and gofmt agreeing.
 */
function importBlock(layout: GoLayoutPaths, seam: string, dirs: readonly string[]): string {
  const seamLine = `"${layout.importPath(seam)}"`;
  return layout
    .importBlock(dirs)
    .split('\n')
    .map((line) => (line.includes(seamLine) ? line.replace('"', `${SEAM_ALIAS} "`) : line))
    .join('\n');
}
