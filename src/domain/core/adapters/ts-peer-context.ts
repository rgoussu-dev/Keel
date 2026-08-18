/**
 * `walking-skeleton/ts-peer-context` adapter — scaffolds the **second
 * bounded context** under the TypeScript modulith (`ts-http` and
 * `ts-cli` alike), opted into with `keel new --with-peer-context`.
 *
 * With one context the modulith's central claim — that contexts meet
 * only at `./service` — is asserted rather than exercised: nothing in
 * the emitted workspace consumes the seam, so nothing proves it
 * holds. `guestbook` is the consumer that does. It needs a welcome to
 * record, `greeting` is the context that composes one, and the only
 * edge between them runs through a **gateway** at
 * `modules/guestbook/src/infra/greeting-gateway/` that imports
 * `@<scope>/greeting/service` and nothing else of greeting's.
 *
 * **One package, not four.** A bounded context is a single workspace
 * package here — the ruling `tsLayout` records — so the peer costs
 * one manifest and one `exports` map against Rust's four crates.
 *
 * **What holds the wall is a lint, and the docs say so.** The
 * `exports` map is real enforcement for *depth*: a deep import of
 * `@<scope>/greeting/src/domain/…` is a `TS2307` from tsc and an
 * `ERR_PACKAGE_PATH_NOT_EXPORTED` from Node. It is no help at all for
 * the *peer* rule, because greeting's facade legitimately publishes
 * its contract face and nothing stops the gateway importing
 * `@<scope>/greeting` whole — an undeclared workspace dependency
 * resolves anyway under hoisting, and project references restrict
 * nothing. So the peer rule is `peers-meet-at-the-service-seam` in
 * the emitted `.dependency-cruiser.cjs`, which the bootstrap already
 * ships and `npm run lint` already runs. TypeScript's seam is
 * therefore weaker than the JVM's and Go's in exactly the way Rust's
 * is, and for a different reason; stating that beats implying parity.
 *
 * **Two patches per assembly, and both are load-bearing.** Which
 * assemblies exist follows the arch tags (`tsAssemblies`), exactly as
 * the Rust and Go peer contexts decide it. Each assembly's manifest
 * gains the peer as a dependency, and its `main.ts` gains the wiring —
 * an unimported TypeScript module is never loaded, so without the
 * second patch the context would typecheck, lint, and run in nothing.
 * That is the JVM failure this adapter family exists to prevent, and
 * here it is one anchored replacement rather than a container
 * registration.
 */

import { tsBootstrapAnswers, TS_CLI_BOOTSTRAP_ID, TS_HTTP_BOOTSTRAP_ID } from './ts-bootstrap.js';
import {
  tsAssemblies,
  tsLayout,
  tsPeerPackage,
  type TsAssemblyPaths,
  type TsLayoutPaths,
} from './ts-module-layout.js';
import { tsWorkspaceVars } from './ts-workspace.js';
import { MODULITH_LAYOUT_TAG, PEER_CONTEXT_TAG } from './module-layout.js';
import type { Adapter, ContributionPatch } from '../../contract/composition.js';
import { eolAware } from '../util.js';

export const TS_PEER_CONTEXT_ID = 'walking-skeleton/ts-peer-context';

const TEMPLATE_ROOT = 'composition/walking-skeleton/ts-peer-context/templates';

/**
 * The line `ts-http-bootstrap` emits, and the one this adapter
 * rewrites. Anchoring on it rather than on `createRegistryMediator(`
 * is deliberate: the observability vertical also patches `main.ts`,
 * and it wraps the *server* rather than the mediator, so this line is
 * the one thing in that file no other adapter touches.
 */
const MEDIATOR_LINE = 'const mediator = createRegistryMediator([createGreetHandler()]);';

export const tsPeerContextAdapter: Adapter = {
  id: TS_PEER_CONTEXT_ID,
  vertical: 'walking-skeleton',
  covers: [],
  predicate: {
    requires: ['lang.typescript', 'runtime.node', MODULITH_LAYOUT_TAG, PEER_CONTEXT_TAG],
  },
  // Both entrypoint bootstraps listed because either may be the one
  // present, and a project carrying both must have its assemblies
  // emitted before this wires into them.
  after: [TS_HTTP_BOOTSTRAP_ID, TS_CLI_BOOTSTRAP_ID],
  async contribute(ctx) {
    const { npmScope } = tsBootstrapAnswers(ctx.manifest, TS_PEER_CONTEXT_ID);
    const layout = tsLayout(ctx.manifest.tags, npmScope);
    const peer = tsPeerPackage(layout);
    const servicePkg = layout.servicePkg;
    if (peer === null || servicePkg === null) {
      throw new Error(
        `${TS_PEER_CONTEXT_ID}: no peer seam under layout '${layout.layout}' — the flat trisection has a single hexagon`,
      );
    }
    const { pm, workspaceDep } = tsWorkspaceVars(ctx.manifest.tags);

    const vars = {
      pm,
      workspaceDep,
      peerPkg: peer.pkg,
      kernelPkg: layout.kernelPkg,
      contextPkg: layout.corePkg,
      servicePkg,
    };
    const assemblies = tsAssemblies(ctx.manifest.tags, layout);
    if (assemblies.length === 0) {
      throw new Error(
        `${TS_PEER_CONTEXT_ID}: no assembly in this tag set to wire the peer context into`,
      );
    }
    const rendered = await Promise.all([
      ctx.templates.render(`${TEMPLATE_ROOT}/context`, '', vars),
      ...assemblies.map((assembly) =>
        ctx.templates.render(`${TEMPLATE_ROOT}/assembly`, assembly.root, vars),
      ),
    ]);

    return {
      files: rendered.flat(),
      patches: assemblies.flatMap((assembly) => [
        assemblyDependencyPatch(layout, assembly, peer.pkg, workspaceDep),
        assemblyWiringPatch(layout, assembly),
      ]),
    };
  },
};

/**
 * Declares the peer on the assembly's manifest.
 *
 * Under npm this changes no resolution — hoisting would have found
 * the package anyway — and it is emitted regardless, because pnpm
 * genuinely needs it and because a manifest that omits what its
 * source imports is wrong even where it happens to work.
 */
function assemblyDependencyPatch(
  layout: TsLayoutPaths,
  assembly: TsAssemblyPaths,
  peerPkg: string,
  workspaceDep: string,
): ContributionPatch {
  const target = `${assembly.root}/package.json`;
  return {
    target,
    apply: (existing) => {
      if (existing.includes(`"${peerPkg}"`)) return existing;
      const anchor = `"${layout.corePkg}": "${workspaceDep}"`;
      if (!existing.includes(anchor)) {
        throw new Error(
          `${TS_PEER_CONTEXT_ID}: no '${layout.corePkg}' dependency in '${target}' to add the peer beside`,
        );
      }
      return existing.replace(anchor, `${anchor},\n    "${peerPkg}": "${workspaceDep}"`);
    },
  };
}

/**
 * Wires the peer into the assembly: one import and one array entry,
 * which is exactly what the emitted `main.ts` promises adding a
 * bounded context costs.
 *
 * The wiring itself lives in `src/guestbook.ts` beside it rather than
 * inline, for the reason Rust puts it in its own module: something has
 * to be callable from a test if "the contexts are actually wired to
 * each other" is to be more than an assertion about file contents.
 * `createGuestbookHandler()` is that something, and it is the same
 * function `main.ts` calls rather than a copy of it.
 *
 * This patch is what binds the context. An unimported TypeScript
 * module is never loaded — the peer would typecheck, lint and run in
 * nothing — which is the JVM failure this adapter family exists to
 * prevent.
 */
function assemblyWiringPatch(layout: TsLayoutPaths, assembly: TsAssemblyPaths): ContributionPatch {
  const target = `${assembly.src}/main.ts`;
  const importAnchor = `import { createGreetHandler } from '${layout.corePkg}';`;
  const wiringImport = "import { createGuestbookHandler } from './guestbook.ts';";
  return {
    target,
    // Two splices into one file, so the whole apply runs on LF text
    // and converts back once rather than per fragment.
    apply: eolAware((existing) => {
      if (existing.includes(wiringImport)) return existing;
      if (!existing.includes(importAnchor)) {
        throw new Error(
          `${TS_PEER_CONTEXT_ID}: could not find the context import in '${target}' to anchor the peer's wiring import on`,
        );
      }
      if (!existing.includes(MEDIATOR_LINE)) {
        throw new Error(
          `${TS_PEER_CONTEXT_ID}: could not find the mediator assembly line in '${target}' — the peer context would be emitted and loaded by nothing`,
        );
      }
      return existing
        .replace(importAnchor, `${importAnchor}\n${wiringImport}`)
        .replace(
          MEDIATOR_LINE,
          'const mediator = createRegistryMediator([createGreetHandler(), createGuestbookHandler()]);',
        );
    }),
  };
}
