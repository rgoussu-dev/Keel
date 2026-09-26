/**
 * `walking-skeleton/ts-peer-context` and its wiring adapters — scaffold
 * the **second bounded context** under the TypeScript modulith
 * (`ts-http` and `ts-cli` alike), opted into with
 * `keel new --with-peer-context`.
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
 * **A shell, and one wiring adapter per entrypoint.** The shell writes
 * the guestbook package, which no entrypoint shapes;
 * `ts-peer-context-cli` and `ts-peer-context-http` each write one
 * assembly's `src/guestbook.ts` and its wiring test, patch that
 * assembly, and require that entrypoint's tag. A project carrying both
 * matches both, so which assemblies the context is wired into is read
 * off the predicates, never off the tags inside `contribute()`, and
 * `keel add entrypoint` wires it into the new assembly by installing
 * the one that newly matches (roadmap R.3c).
 *
 * **Two patches per assembly, and both are load-bearing.** Each
 * assembly's manifest gains the peer as a dependency, and its `main.ts`
 * gains the wiring — an unimported TypeScript module is never loaded,
 * so without the second patch the context would typecheck, lint, and
 * run in nothing. That is the JVM failure this adapter family exists
 * to prevent, and here it is one anchored replacement rather than a
 * container registration.
 */

import { tsBootstrapAnswers, TS_CLI_BOOTSTRAP_ID, TS_HTTP_BOOTSTRAP_ID } from './ts-bootstrap.js';
import {
  tsAssembly,
  tsLayout,
  tsPeerPackage,
  type TsAssemblyPaths,
  type TsLayoutPaths,
  type TsUnit,
} from './ts-module-layout.js';
import { tsWorkspaceVars } from './ts-workspace.js';
import { MODULITH_LAYOUT_TAG, PEER_CONTEXT_TAG } from './module-layout.js';
import type { Adapter, ContributionPatch, ManifestV2, Tag } from '../../contract/composition.js';
import { eolAware } from '../util.js';

export const TS_PEER_CONTEXT_ID = 'walking-skeleton/ts-peer-context';
/** The adapter wiring the guestbook context into the CLI's assembly. */
export const TS_PEER_CONTEXT_CLI_ID = 'walking-skeleton/ts-peer-context-cli';
/** The adapter wiring the guestbook context into the HTTP server's assembly. */
export const TS_PEER_CONTEXT_HTTP_ID = 'walking-skeleton/ts-peer-context-http';

const TEMPLATE_ROOT = 'composition/walking-skeleton/ts-peer-context/templates';

/**
 * The line both bootstraps emit, and the one the wiring adapters
 * rewrite. Anchoring on it rather than on `createRegistryMediator(` is
 * deliberate: the observability vertical also patches `main.ts`, and it
 * wraps the *server* rather than the mediator, so this line is the one
 * thing in that file no other adapter touches before the peer is wired.
 * A context `keel add module` adds splices its handler into the array
 * as it finds it, after which the line is gone — so the peer is wired
 * first: `walking-skeleton` installs it beside the bootstrap that wrote
 * the line, under `keel new` and `keel add entrypoint` alike.
 */
const MEDIATOR_LINE = 'const mediator = createRegistryMediator([createGreetHandler()]);';

/** The shell: the guestbook context's workspace package. */
export const tsPeerContextAdapter: Adapter = {
  id: TS_PEER_CONTEXT_ID,
  vertical: 'walking-skeleton',
  covers: [],
  predicate: {
    requires: ['lang.typescript', 'runtime.node', MODULITH_LAYOUT_TAG, PEER_CONTEXT_TAG],
  },
  // Both entrypoint bootstraps listed because either may be the one
  // present, and each renders the workspace this package joins.
  after: [TS_HTTP_BOOTSTRAP_ID, TS_CLI_BOOTSTRAP_ID],
  async contribute(ctx) {
    const { vars } = peerOf(ctx.manifest, TS_PEER_CONTEXT_ID);
    return { files: await ctx.templates.render(`${TEMPLATE_ROOT}/context`, '', vars) };
  },
};

/** Wires the guestbook context into the CLI's assembly, `application/cli`. */
export const tsPeerContextCliAdapter: Adapter = wiringAdapter(
  TS_PEER_CONTEXT_CLI_ID,
  'cli',
  'arch.cli',
  TS_CLI_BOOTSTRAP_ID,
);

/** Wires the guestbook context into the HTTP server's assembly, `application/rest`. */
export const tsPeerContextHttpAdapter: Adapter = wiringAdapter(
  TS_PEER_CONTEXT_HTTP_ID,
  'rest',
  'arch.server-http',
  TS_HTTP_BOOTSTRAP_ID,
);

/**
 * The adapter that wires the guestbook context into the assembly of
 * the deployment unit `unit` — `src/guestbook.ts` and its wiring test,
 * the peer on the assembly's manifest, and its handler on `main.ts`'s
 * mediator — on a project carrying `entrypoint`, after the shell and
 * that entrypoint's bootstrap, whose assembly it lands in.
 */
function wiringAdapter(id: string, unit: TsUnit, entrypoint: Tag, bootstrap: string): Adapter {
  return {
    id,
    vertical: 'walking-skeleton',
    covers: [],
    predicate: {
      requires: [
        'lang.typescript',
        'runtime.node',
        MODULITH_LAYOUT_TAG,
        PEER_CONTEXT_TAG,
        entrypoint,
      ],
    },
    after: [TS_PEER_CONTEXT_ID, bootstrap],
    async contribute(ctx) {
      const { layout, peerPkg, workspaceDep, vars } = peerOf(ctx.manifest, id);
      const assembly = tsAssembly(layout, unit);
      return {
        files: await ctx.templates.render(`${TEMPLATE_ROOT}/assembly`, assembly.root, vars),
        patches: [
          assemblyDependencyPatch(id, layout, assembly, peerPkg, workspaceDep),
          assemblyWiringPatch(id, layout, assembly),
        ],
      };
    },
  };
}

/**
 * What the shell and each wiring adapter read: the layout, the peer's
 * package, the workspace protocol, and the template variables — the
 * same values for the package and for each assembly's wiring.
 */
function peerOf(
  manifest: ManifestV2,
  requesterId: string,
): {
  readonly layout: TsLayoutPaths;
  readonly peerPkg: string;
  readonly workspaceDep: string;
  readonly vars: Readonly<Record<string, string>>;
} {
  const { npmScope } = tsBootstrapAnswers(manifest, requesterId);
  const layout = tsLayout(manifest.tags, npmScope);
  const peer = tsPeerPackage(layout);
  const servicePkg = layout.servicePkg;
  if (peer === null || servicePkg === null) {
    throw new Error(
      `${requesterId}: no peer seam under layout '${layout.layout}' — the flat trisection has a single hexagon`,
    );
  }
  const { pm, workspaceDep } = tsWorkspaceVars(manifest.tags);
  return {
    layout,
    peerPkg: peer.pkg,
    workspaceDep,
    vars: {
      pm,
      workspaceDep,
      peerPkg: peer.pkg,
      kernelPkg: layout.kernelPkg,
      contextPkg: layout.corePkg,
      servicePkg,
    },
  };
}

/**
 * Declares the peer on the assembly's manifest, for the wiring adapter
 * `id`.
 *
 * Under npm this changes no resolution — hoisting would have found
 * the package anyway — and it is emitted regardless, because pnpm
 * genuinely needs it and because a manifest that omits what its
 * source imports is wrong even where it happens to work.
 */
function assemblyDependencyPatch(
  id: string,
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
          `${id}: no '${layout.corePkg}' dependency in '${target}' to add the peer beside`,
        );
      }
      return existing.replace(anchor, `${anchor},\n    "${peerPkg}": "${workspaceDep}"`);
    },
  };
}

/**
 * Wires the peer into the assembly, for the wiring adapter `id`: one
 * import and one array entry, which is exactly what the emitted
 * `main.ts` promises adding a bounded context costs.
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
function assemblyWiringPatch(
  id: string,
  layout: TsLayoutPaths,
  assembly: TsAssemblyPaths,
): ContributionPatch {
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
          `${id}: could not find the context import in '${target}' to anchor the peer's wiring import on`,
        );
      }
      if (!existing.includes(MEDIATOR_LINE)) {
        throw new Error(
          `${id}: could not find the mediator assembly line in '${target}' — the peer context would be emitted and loaded by nothing`,
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
