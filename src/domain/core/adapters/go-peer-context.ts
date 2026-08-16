/**
 * `walking-skeleton/go-peer-context` adapter — scaffolds the **second
 * bounded context** under the Go modulith, opted into with
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
 * than adding one.** `rust-peer-context` patches `mod guestbook;`
 * into the assembly root and the JVM family tells its container to
 * scan the new package, because both languages can emit a context
 * that compiles and is wired into nothing. A file in a `cmd/`
 * directory joins that directory's package by existing, so there is
 * no declaration to forget and this adapter emits **no patch at
 * all**. The equivalent Go mistake is landing the wiring somewhere
 * that is not the assembly, and that is what the emitted test and
 * `tests/e2e/modulith-go-peer-context.test.ts` assert instead.
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
import type { Adapter } from '../../contract/composition.js';

export const GO_PEER_CONTEXT_ID = 'walking-skeleton/go-peer-context';

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

export const goPeerContextAdapter: Adapter = {
  id: GO_PEER_CONTEXT_ID,
  vertical: 'walking-skeleton',
  covers: [],
  predicate: {
    requires: ['lang.go', MODULITH_LAYOUT_TAG, PEER_CONTEXT_TAG],
  },
  // Both entrypoints listed because either may be the one present,
  // and a project carrying both needs its assemblies emitted before
  // the wiring lands beside them.
  after: [GO_BOOTSTRAP_ID, GO_CLI_BOOTSTRAP_ID, GO_HTTP_BOOTSTRAP_ID],
  async contribute(ctx) {
    const { modulePath } = goBootstrapAnswers(ctx.manifest, GO_PEER_CONTEXT_ID);
    const layout = goLayout(ctx.manifest.tags, modulePath);
    const peer = goPeerPackages();
    const seam = layout.service;
    if (seam === null) {
      throw new Error(
        `${GO_PEER_CONTEXT_ID}: the greeting context has no peer seam under layout '${layout.layout}'`,
      );
    }

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
      ...assembliesOf(ctx.manifest.tags).map((typology) =>
        ctx.templates.render(`${TEMPLATE_ROOT}/wiring`, dirOf(layout.main(typology)), {
          facadePkg: layout.facadePkg,
          peerFacadePkg: peer.facadePkg,
          gatewayPkg: peer.gatewayPkg,
          projectImports: imports([layout.facade, seam, peer.facade, peer.gateway, peer.userSide]),
        }),
      ),
    ]);

    return { files: rendered.flat() };
  },
};

/** Which assemblies this project has, from the stack's arch tags. */
function assembliesOf(tags: readonly string[]): readonly string[] {
  const typologies: string[] = [];
  if (tags.includes('arch.cli')) typologies.push('cli');
  if (tags.includes('arch.server-http')) typologies.push('http');
  return typologies;
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
