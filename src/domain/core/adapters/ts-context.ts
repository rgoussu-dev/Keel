/**
 * `bounded-context/ts-context` adapter — the context
 * `keel add module <name>` emits under the `ts-http` modulith, and the
 * gateway `--consumes <other>` adds to it.
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
 * **The mediator patch has to be repeatable, and the peer's is not.**
 * `ts-peer-context` replaces the whole
 * `createRegistryMediator([createGreetHandler()])` line with a
 * two-entry version; run that twice and the second run finds no match.
 * `keel add module` runs once per context, so this one splices a new
 * entry in before the closing bracket and returns the file unchanged
 * when its entry is already there.
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

import type { Adapter, ContributionPatch, ManifestV2 } from '../../contract/composition.js';
import { addedContext, CONTEXT_TAG } from './added-context.js';
import { MODULITH_LAYOUT_TAG, SKELETON_MODULE } from './module-layout.js';
import { TS_HTTP_BOOTSTRAP_ID } from './ts-http-bootstrap.js';
import {
  tsContextPackage,
  tsLayout,
  tsSeamPackage,
  TS_SKELETON_HANDLER_FACTORY,
  TS_SKELETON_SEAM_METHOD,
  type TsLayoutPaths,
} from './ts-module-layout.js';
import { tsWorkspaceVars, workspaceInstall } from './ts-workspace.js';
import { beforeFirstImport, eolAware } from '../util.js';

export const TS_CONTEXT_ID = 'bounded-context/ts-context';

const TEMPLATE_ROOT = 'composition/bounded-context/ts-context/templates';

export const tsContextAdapter: Adapter = {
  id: TS_CONTEXT_ID,
  vertical: 'bounded-context',
  covers: [],
  predicate: {
    requires: [
      'lang.typescript',
      'runtime.node',
      'arch.server-http',
      MODULITH_LAYOUT_TAG,
      CONTEXT_TAG,
    ],
  },
  after: [TS_HTTP_BOOTSTRAP_ID],
  async contribute(ctx) {
    const added = addedContext(ctx.manifest, TS_CONTEXT_ID);
    const layout = tsLayout(ctx.manifest.tags, bootstrapScope(ctx.manifest));
    const pkg = tsContextPackage(layout, added.name, added.consumes);
    if (pkg === null) {
      throw new Error(
        `${TS_CONTEXT_ID}: no peer seam under layout '${layout.layout}' — the flat trisection has a single hexagon`,
      );
    }
    const { pm, workspaceDep } = tsWorkspaceVars(ctx.manifest.tags);
    const consumesIsSkeleton = added.consumes === SKELETON_MODULE;

    const vars = {
      pm,
      workspaceDep,
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
    };

    const rendered = await Promise.all([
      ctx.templates.render(`${TEMPLATE_ROOT}/context`, '', vars),
      ctx.templates.render(`${TEMPLATE_ROOT}/assembly`, layout.restRoot, vars),
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
      patches: [
        dependencyPatch(layout, pkg.pkg, workspaceDep),
        ...(added.consumes === null || !consumesIsSkeleton
          ? []
          : [dependencyPatch(layout, `@${layout.scope}/${added.consumes}`, workspaceDep)]),
        wiringPatch(layout, added.name),
      ],
      actions: [
        workspaceInstall(TS_CONTEXT_ID, pm, `link the new ${added.name} workspace package`),
      ],
    };
  },
};

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

/** The npm scope the bootstrap recorded, or a hard failure. */
function bootstrapScope(manifest: ManifestV2): string {
  const scope = manifest.answers[TS_HTTP_BOOTSTRAP_ID]?.npmScope;
  if (!scope) {
    throw new Error(
      `${TS_CONTEXT_ID}: requires '${TS_HTTP_BOOTSTRAP_ID}' to have run first; npmScope not in manifest`,
    );
  }
  return scope;
}

/**
 * Declares a package on the assembly's manifest, once.
 *
 * Under npm this changes no resolution — hoisting would have found it
 * anyway — and it is emitted regardless, because pnpm genuinely needs
 * it and because a manifest that omits what its source imports is
 * wrong even where it happens to work.
 */
function dependencyPatch(
  layout: TsLayoutPaths,
  pkg: string,
  workspaceDep: string,
): ContributionPatch {
  const target = `${layout.restRoot}/package.json`;
  return {
    target,
    apply: (existing) => {
      if (existing.includes(`"${pkg}"`)) return existing;
      const anchor = `"${layout.corePkg}": "${workspaceDep}"`;
      if (!existing.includes(anchor)) {
        throw new Error(
          `${TS_CONTEXT_ID}: no '${layout.corePkg}' dependency in '${target}' to add '${pkg}' beside`,
        );
      }
      return existing.replace(anchor, `${anchor},\n    "${pkg}": "${workspaceDep}"`);
    },
  };
}

/**
 * Wires the context into the assembly: one import and one array
 * entry, which is exactly what the emitted `main.ts` promises adding a
 * bounded context costs.
 *
 * Splices into the mediator's argument list rather than replacing a
 * known line. `ts-peer-context` can replace, because it runs at most
 * once and knows what the bootstrap wrote; this adapter runs once per
 * context and would find its own previous edit in the way.
 *
 * This patch is what binds the context. An unimported TypeScript
 * module is never loaded — the context would typecheck, lint and run
 * in nothing — which is the JVM failure this adapter family exists to
 * prevent.
 */
function wiringPatch(layout: TsLayoutPaths, context: string): ContributionPatch {
  const target = `${layout.restSrc}/main.ts`;
  const factory = `create${pascal(context)}ContextHandler`;
  const wiringImport = `import { ${factory} } from './${context}.ts';`;
  const open = 'createRegistryMediator([';
  return {
    target,
    apply: eolAware((existing) => {
      if (existing.includes(wiringImport)) return existing;
      const start = existing.indexOf(open);
      if (start === -1) {
        throw new Error(
          `${TS_CONTEXT_ID}: could not find the mediator assembly call in '${target}' — the context would be emitted and loaded by nothing`,
        );
      }
      const close = existing.indexOf('])', start);
      if (close === -1) {
        throw new Error(`${TS_CONTEXT_ID}: unterminated mediator assembly call in '${target}'`);
      }
      const withEntry = `${existing.slice(0, close)}, ${factory}()${existing.slice(close)}`;
      return beforeFirstImport(withEntry, wiringImport);
    }),
  };
}

/** The context name as a TypeScript type prefix. */
function pascal(name: string): string {
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}
