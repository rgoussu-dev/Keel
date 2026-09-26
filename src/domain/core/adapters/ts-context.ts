/**
 * `bounded-context/ts-context` and its wiring adapters — the context
 * `keel add module <name>` emits under the TypeScript modulith
 * (`ts-http` and `ts-cli` alike), and the gateway `--consumes <other>`
 * adds to it.
 *
 * **One workspace package, plus a `./service` export the peer context
 * has not got.** `tsLayout` rules that a bounded context is a single
 * package, so an added one costs one manifest and one `exports` map
 * against Rust's four crates. The entry that is new here is
 * `./service`: the `--with-peer-context` context publishes none —
 * nothing consumes it — and an added context always does, so
 * `keel add module <other> --consumes <name>` has an entry point to
 * import.
 *
 * **The wall is a lint, and saying so beats implying parity.** The
 * `exports` map is real enforcement for *depth*: a deep import of
 * `@<scope>/<name>/src/domain/…` is a `TS2307` from tsc and an
 * `ERR_PACKAGE_PATH_NOT_EXPORTED` from Node. It is no help for the
 * *peer* rule, because a context's facade legitimately publishes its
 * contract face and nothing stops a gateway importing the package
 * whole — an undeclared workspace dependency resolves anyway under
 * npm's hoisting. So the peer rule is
 * `peers-meet-at-the-service-seam` in the emitted
 * `.dependency-cruiser.cjs`, whose `pathNot` backreference
 * (`^modules/($1/|[^/]+/src/service\.ts$)`) is written over `[^/]+`
 * and therefore holds for any number of contexts — asserted with
 * three rather than assumed, since two is all it had ever seen.
 *
 * **A shell, and one wiring adapter per entrypoint.** The shell writes
 * the context's package and its gateway, which no entrypoint shapes,
 * and asks for the install that links the package; `ts-context-cli`
 * and `ts-context-http` each write one assembly's wiring module,
 * declare the context on that assembly's manifest and add it to that
 * assembly's mediator, and require that entrypoint's tag. A project
 * carrying both matches both. What each writes is the same module in
 * another assembly, so which assemblies a context is wired into is
 * read off the predicates, never off the tags inside `contribute()` —
 * and `keel add entrypoint` wires every context into the new assembly
 * by installing the one wiring adapter that newly matches (roadmap
 * R.3c).
 *
 * **The mediator patch has to be repeatable, and the peer's is not.**
 * `ts-peer-context`'s wiring replaces the whole
 * `createRegistryMediator([createGreetHandler()])` line with a
 * two-entry version; run that twice and the second run finds no match.
 * `keel add module` runs once per context, so this one splices a new
 * entry in before the closing bracket and returns the file unchanged
 * when its entry is already there. The peer is wired first — beside
 * the bootstrap, before any context is added — so its anchor is
 * always the bootstrap's own line.
 *
 * **The skeleton's seam method is `greet`.** Every added context
 * publishes `<name>For(subject)`, so a gateway computes the call from
 * the name; the skeleton predates the convention with an agent verb no
 * rule derives. Hence {@link TS_SKELETON_SEAM_METHOD}, one constant
 * rather than a table. Rust and Go need no equivalent — their
 * skeleton seams are already the shape an added context follows.
 *
 * **It also installs.** A workspace package the root manifest now
 * lists but the store has never seen is not resolvable — nothing
 * symlinks it into `node_modules`, so every import of it is a
 * `TS2307` and the project keel just reported as ready does not
 * typecheck. `keel new` gets the install for free from the walking
 * skeleton's own `npm-install` adapter running last; a context layered
 * onto a live project has to ask for it, exactly as `ts-persistence`
 * does when it adds its packages.
 */

import type { Adapter, ContributionPatch, ManifestV2, Tag } from '../../contract/composition.js';
import { addedContext, CONTEXT_TAG, type AddedContext } from './added-context.js';
import { MODULITH_LAYOUT_TAG, SKELETON_MODULE } from './module-layout.js';
import { tsBootstrapAnswers, TS_CLI_BOOTSTRAP_ID, TS_HTTP_BOOTSTRAP_ID } from './ts-bootstrap.js';
import {
  tsAssembly,
  tsContextPackage,
  tsLayout,
  tsSeamPackage,
  TS_MEDIATOR_ANCHOR,
  TS_SKELETON_HANDLER_FACTORY,
  TS_SKELETON_SEAM_METHOD,
  type TsAssemblyPaths,
  type TsContextPaths,
  type TsLayoutPaths,
  type TsUnit,
} from './ts-module-layout.js';
import { tsWorkspaceVars, workspaceInstall, type TsWorkspaceVars } from './ts-workspace.js';
import { beforeFirstImport, codeOnly, eolAware } from '../util.js';
import { PathConflictError } from '../../contract/refusal.js';

export const TS_CONTEXT_ID = 'bounded-context/ts-context';
/** The adapter wiring an added context into the CLI's assembly. */
export const TS_CONTEXT_CLI_ID = 'bounded-context/ts-context-cli';
/** The adapter wiring an added context into the HTTP server's assembly. */
export const TS_CONTEXT_HTTP_ID = 'bounded-context/ts-context-http';

const TEMPLATE_ROOT = 'composition/bounded-context/ts-context/templates';

/**
 * The shell: the context's package, its gateway under `--consumes`,
 * and the install that links the package into the workspace.
 */
export const tsContextAdapter: Adapter = {
  id: TS_CONTEXT_ID,
  vertical: 'bounded-context',
  covers: [],
  predicate: {
    requires: ['lang.typescript', 'runtime.node', MODULITH_LAYOUT_TAG, CONTEXT_TAG],
  },
  async contribute(ctx) {
    const { added, pkg, ws, vars } = contextOf(ctx.manifest, TS_CONTEXT_ID);
    const rendered = await Promise.all([
      ctx.templates.render(`${TEMPLATE_ROOT}/context`, '', vars),
      // A separate render root rather than a subtree of `context`,
      // because the tree is copied wholesale: left inside it, a
      // context with no `--consumes` would emit `src/infra/-gateway/`
      // from the unsubstituted path token.
      ...(pkg.gatewaySrc === null
        ? []
        : [ctx.templates.render(`${TEMPLATE_ROOT}/gateway`, `${pkg.root}/src/infra`, vars)]),
    ]);
    return {
      files: rendered.flat(),
      actions: [
        workspaceInstall(TS_CONTEXT_ID, ws.pm, `link the new ${added.name} workspace package`),
      ],
    };
  },
};

/** Wires the context into the CLI's assembly, `application/cli`. */
export const tsContextCliAdapter: Adapter = wiringAdapter(
  TS_CONTEXT_CLI_ID,
  'cli',
  'arch.cli',
  TS_CLI_BOOTSTRAP_ID,
);

/** Wires the context into the HTTP server's assembly, `application/rest`. */
export const tsContextHttpAdapter: Adapter = wiringAdapter(
  TS_CONTEXT_HTTP_ID,
  'rest',
  'arch.server-http',
  TS_HTTP_BOOTSTRAP_ID,
);

/**
 * The adapter that wires the context into the assembly of the
 * deployment unit `unit` — `src/<name>.ts`, the context on the
 * assembly's manifest, and its handler on `main.ts`'s mediator — on a
 * project carrying `entrypoint`, after the shell and that entrypoint's
 * bootstrap. The skeleton a context may consume needs no entry of its
 * own: it is the assembly's core package, the one the bootstrap
 * declares and `dependencyPatch` anchors on.
 */
function wiringAdapter(id: string, unit: TsUnit, entrypoint: Tag, bootstrap: string): Adapter {
  return {
    id,
    vertical: 'bounded-context',
    covers: [],
    predicate: {
      requires: ['lang.typescript', 'runtime.node', MODULITH_LAYOUT_TAG, CONTEXT_TAG, entrypoint],
    },
    after: [TS_CONTEXT_ID, bootstrap],
    async contribute(ctx) {
      const { added, layout, pkg, ws, vars } = contextOf(ctx.manifest, id);
      const assembly = tsAssembly(layout, unit);
      return {
        files: await ctx.templates.render(`${TEMPLATE_ROOT}/assembly`, assembly.root, vars),
        patches: [
          dependencyPatch(id, layout, assembly, pkg.pkg, ws.workspaceDep),
          wiringPatch(id, assembly, added.name),
        ],
      };
    },
  };
}

/**
 * The context an add-module run emits, and what its adapters read: the
 * layout, the context's package, the workspace's package manager, and
 * the template variables — the same values for the shell and for each
 * assembly's wiring.
 */
function contextOf(
  manifest: ManifestV2,
  requesterId: string,
): {
  readonly added: AddedContext;
  readonly layout: TsLayoutPaths;
  readonly pkg: TsContextPaths;
  readonly ws: TsWorkspaceVars;
  readonly vars: Readonly<Record<string, string>>;
} {
  const added = addedContext(manifest, requesterId);
  const { npmScope } = tsBootstrapAnswers(manifest, requesterId);
  const layout = tsLayout(manifest.tags, npmScope);
  const pkg = tsContextPackage(layout, added.name, added.consumes);
  if (pkg === null) {
    throw new Error(
      `${requesterId}: no peer seam under layout '${layout.layout}' — the flat trisection has a single hexagon`,
    );
  }
  const ws = tsWorkspaceVars(manifest.tags);
  const consumesIsSkeleton = added.consumes === SKELETON_MODULE;
  return {
    added,
    layout,
    pkg,
    ws,
    vars: {
      pm: ws.pm,
      workspaceDep: ws.workspaceDep,
      module: added.name,
      Module: pascal(added.name),
      MODULE: added.name.toUpperCase(),
      consumes: added.consumes ?? '',
      Consumes: added.consumes === null ? '' : pascal(added.consumes),
      CONSUMES: added.consumes === null ? '' : added.consumes.toUpperCase(),
      hasConsumes: added.consumes === null ? '' : '1',
      consumesIsSkeleton: consumesIsSkeleton ? '1' : '',
      kernelPkg: layout.kernelPkg,
      contextPkg: pkg.pkg,
      seamPkg: pkg.seamPkg,
      consumesPkg: added.consumes === null ? '' : `@${layout.scope}/${added.consumes}`,
      consumesSeamPkg: added.consumes === null ? '' : tsSeamPackage(layout, added.consumes),
      consumesSeamMethod:
        added.consumes === null
          ? ''
          : consumesIsSkeleton
            ? TS_SKELETON_SEAM_METHOD
            : `${added.consumes}For`,
      consumesSeamExpr: consumesSeamExpr(added.consumes, consumesIsSkeleton),
      consumesHandlerFactory: consumesIsSkeleton ? TS_SKELETON_HANDLER_FACTORY : '',
    },
  };
}

/**
 * How the assembly gets hold of the consumed context's seam.
 *
 * The skeleton's is built from its own handler —
 * `createGreetingService(createRegistryMediator([createGreetHandler()]))`
 * — because greeting's handler takes no arguments. An added context's
 * handler may itself hold a gateway to a third context, so the only
 * thing that knows how to build one is that context's own wiring
 * module, which sits beside this one in the assembly.
 */
function consumesSeamExpr(consumes: string | null, isSkeleton: boolean): string {
  if (consumes === null) return '';
  const Consumes = pascal(consumes);
  if (isSkeleton) {
    return `create${Consumes}Service(createRegistryMediator([${TS_SKELETON_HANDLER_FACTORY}()]))`;
  }
  return `create${Consumes}ContextService()`;
}

/**
 * Declares a package on the assembly's manifest, once, for the wiring
 * adapter `id`.
 *
 * Under npm this changes no resolution — hoisting would have found it
 * anyway — and it is emitted regardless, because pnpm genuinely needs
 * it and because a manifest that omits what its source imports is
 * wrong even where it happens to work.
 */
function dependencyPatch(
  id: string,
  layout: TsLayoutPaths,
  assembly: TsAssemblyPaths,
  pkg: string,
  workspaceDep: string,
): ContributionPatch {
  const target = `${assembly.root}/package.json`;
  return {
    target,
    apply: (existing) => {
      if (existing.includes(`"${pkg}"`)) return existing;
      const anchor = `"${layout.corePkg}": "${workspaceDep}"`;
      if (!existing.includes(anchor)) {
        throw new Error(
          `${id}: no '${layout.corePkg}' dependency in '${target}' to add '${pkg}' beside`,
        );
      }
      return existing.replace(anchor, `${anchor},\n    "${pkg}": "${workspaceDep}"`);
    },
  };
}

/**
 * Wires the context into the assembly, for the wiring adapter `id`:
 * one import and one array entry, which is exactly what the emitted
 * `main.ts` promises adding a bounded context costs.
 *
 * Splices into the mediator's argument list rather than replacing a
 * known line. The peer's wiring can replace, because it runs once per
 * assembly, beside the bootstrap, and knows what that wrote; this runs
 * once per context and would find its own previous edit in the way.
 * Where the entry goes turns on the array's last token, comments and
 * literals aside (`codeOnly`): after a trailing comma — persistence's
 * list, one entry a line, ends on one — or into an empty array, it gets
 * a line of its own before the close, and otherwise it follows the last
 * entry, ahead of any comment after it. Spliced in after that comma, or
 * after a comment, as `, x()` it would leave a hole in the array. A
 * `main.ts` with no mediator call is a file in the way, refused naming
 * it.
 *
 * This patch is what binds the context. An unimported TypeScript
 * module is never loaded — the context would typecheck, lint and run
 * in nothing — which is the JVM failure this adapter family exists to
 * prevent.
 */
function wiringPatch(id: string, assembly: TsAssemblyPaths, context: string): ContributionPatch {
  const target = `${assembly.src}/main.ts`;
  const factory = `create${pascal(context)}ContextHandler`;
  const wiringImport = `import { ${factory} } from './${context}.ts';`;
  const open = 'createRegistryMediator([';
  return {
    target,
    apply: eolAware((existing) => {
      if (existing.includes(wiringImport)) return existing;
      const { code } = codeOnly(existing);
      const start = code.indexOf(open);
      const close = start === -1 ? -1 : code.indexOf('])', start);
      if (close === -1) {
        throw new PathConflictError(target, id, TS_MEDIATOR_ANCHOR);
      }
      const last = code.slice(0, close).trimEnd();
      const [at, entry] = /[,[]$/.test(last)
        ? [close, `  ${factory}(),\n`]
        : [last.length, `, ${factory}()`];
      const spliced = `${existing.slice(0, at)}${entry}${existing.slice(at)}`;
      return beforeFirstImport(spliced, wiringImport);
    }),
  };
}

/** The context name as a TypeScript type prefix. */
function pascal(name: string): string {
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}
