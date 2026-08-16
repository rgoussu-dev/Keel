/**
 * `bounded-context/wc-context` adapter — the context
 * `keel add module <name>` emits under the `web-components` modulith,
 * and the gateway `--consumes <other>` adds to it.
 *
 * **Three entry points where the peer publishes two.** The facade and
 * `./elements`, plus the `./service` seam the `--with-peer-context`
 * context has not got — it is the consumer of that pair, and a seam
 * exists to be reached.
 *
 * **Two spellings here that no compiler checks, and both take the
 * context name as a segment.** The element tag
 * `<scope>-<context>-view` and the context key
 * `<scope>.<context>.<port>`. Without the context segment two
 * contexts collide, and the two collisions fail differently: a
 * duplicate tag renders an unknown element as an empty inline box with
 * every build green, while a duplicate context key raises
 * `NotSupportedError` from `createContext` — which aborts the rest of
 * that bundle's registrations and leaves a half-rendered page. The
 * emitted `tests/element-tags.test.ts` re-derives the tag from the
 * package name so a typo fails rather than renders.
 *
 * **The wiring returns ports and seam from one call.** `guestbook`'s
 * wiring returns ports only, which is right for a context nothing
 * consumes. An added context may be consumed, and building its seam
 * separately would put the page's state and the peer's in two
 * different store instances — a bug that renders correctly right up
 * until it does not. So `create<Name>Wiring()` returns both, over one
 * store.
 *
 * **Every patch here splices; none replaces a known line.**
 * `wc-peer-context` anchors on `[greetingsContext, greetings],\n]);`,
 * which is exactly the text its own edit destroys — correct once, and
 * this command runs once per context. So the ports entry goes in
 * before the map's closing bracket, found by scanning, and each patch
 * returns the file unchanged when its own mark is already present.
 */

import type { Adapter, ContributionPatch, ManifestV2 } from '../../contract/composition.js';
import { addedContext, CONTEXT_TAG } from './added-context.js';
import { MODULITH_LAYOUT_TAG, SKELETON_MODULE } from './module-layout.js';
import { tsWorkspaceVars } from './ts-workspace.js';
import { WC_SPA_BOOTSTRAP_ID } from './wc-spa-bootstrap.js';
import {
  wcContextPackage,
  wcLayout,
  wcSeamPackage,
  WC_SKELETON_SEAM_METHOD,
  type WcLayoutPaths,
} from './wc-module-layout.js';
import { beforeFirstImport, eolAware } from '../util.js';

export const WC_CONTEXT_ID = 'bounded-context/wc-context';

const TEMPLATE_ROOT = 'composition/bounded-context/wc-context/templates';

/** The element name every context's view is registered under. */
const VIEW = 'view';

/**
 * The skeleton's driving port and read-model type names.
 *
 * `Greet` and `GreetingReadModel` — an agent verb and a noun that is
 * not the context's own name. An added context exports `<Name>` and
 * `<Name>ReadModel`, both derivable; these two are the pair that
 * predate the convention, so they are written down rather than
 * computed. Same exception as `TS_SKELETON_SEAM_METHOD`, one family
 * over.
 */
const SKELETON_PORT = 'Greet';
const SKELETON_READ_MODEL = 'Greeting';

/**
 * What the emitted assembly calls the skeleton's two ports.
 *
 * `greet` and `greetings`, which is what `wc-spa-bootstrap` writes
 * into `main.ts`. An added context's wiring is reached through the one
 * `const <name> = create<Name>Wiring(...)` this adapter declares, so
 * its variable name is derivable; the skeleton's two predate that and
 * are read off the file by name.
 */
const SKELETON_PORT_VAR = 'greet';
const SKELETON_READ_MODEL_VAR = 'greetings';

export const wcContextAdapter: Adapter = {
  id: WC_CONTEXT_ID,
  vertical: 'bounded-context',
  covers: [],
  predicate: {
    requires: ['lang.typescript', 'arch.spa', MODULITH_LAYOUT_TAG, CONTEXT_TAG],
  },
  after: [WC_SPA_BOOTSTRAP_ID],
  async contribute(ctx) {
    const added = addedContext(ctx.manifest, WC_CONTEXT_ID);
    const scope = bootstrapScope(ctx.manifest);
    const layout = wcLayout(ctx.manifest.tags, scope);
    const pkg = wcContextPackage(layout, added.name, added.consumes);
    if (pkg === null || layout.contextProtocolPkg === null) {
      throw new Error(
        `${WC_CONTEXT_ID}: no peer seam under layout '${layout.layout}' — the flat trisection has a single hexagon`,
      );
    }
    const { pm, workspaceDep } = tsWorkspaceVars(ctx.manifest.tags);
    const consumesIsSkeleton = added.consumes === SKELETON_MODULE;
    const viewTag = pkg.elementTag(VIEW);

    const vars = {
      pm,
      scope,
      workspaceDep,
      viewTag,
      module: added.name,
      Module: pascal(added.name),
      MODULE: added.name.toUpperCase(),
      consumes: added.consumes ?? '',
      Consumes: added.consumes === null ? '' : pascal(added.consumes),
      hasConsumes: added.consumes === null ? '' : '1',
      consumesIsSkeleton: consumesIsSkeleton ? '1' : '',
      Skeleton: SKELETON_READ_MODEL,
      SkeletonPort: SKELETON_PORT,
      SkeletonReadModelVar: SKELETON_READ_MODEL_VAR,
      handleKey: pkg.contextKey(added.name),
      recordsKey: pkg.contextKey(`${added.name}-records`),
      contextPkg: pkg.pkg,
      seamPkg: pkg.seamPkg,
      elementsPkg: pkg.elementsPkg,
      contextProtocolPkg: layout.contextProtocolPkg,
      designSystemPkg: layout.designSystemPkg,
      consumesPkg: added.consumes === null ? '' : `@${scope}/${added.consumes}`,
      consumesSeamPkg: added.consumes === null ? '' : wcSeamPackage(layout, added.consumes),
      consumesSeamMethod:
        added.consumes === null
          ? ''
          : consumesIsSkeleton
            ? WC_SKELETON_SEAM_METHOD
            : `${added.consumes}For`,
    };

    const rendered = await Promise.all([
      ctx.templates.render(`${TEMPLATE_ROOT}/context`, '', vars),
      ctx.templates.render(`${TEMPLATE_ROOT}/assembly`, layout.appRoot, vars),
      ...(pkg.gatewaySrc === null
        ? []
        : [ctx.templates.render(`${TEMPLATE_ROOT}/gateway`, `${pkg.root}/src/infra`, vars)]),
    ]);

    return {
      files: rendered.flat(),
      patches: [
        appDependencyPatch(layout, pkg.pkg, workspaceDep),
        appWiringPatch(
          layout,
          added.name,
          pkg.elementsPkg,
          wiringArgs(added.consumes, consumesIsSkeleton),
        ),
        markupPatch(layout, viewTag),
      ],
    };
  },
};

/** What `create<Name>Wiring` is called with, in the assembly. */
function wiringArgs(consumes: string | null, isSkeleton: boolean): string {
  if (consumes === null) return '';
  // The skeleton's seam is built from its assembled ports, which the
  // assembly already holds; an added context hands over its own built
  // seam, so only one argument crosses.
  if (isSkeleton) return `${SKELETON_PORT_VAR}, ${SKELETON_READ_MODEL_VAR}`;
  return `${consumes}.service`;
}

/** The npm scope the bootstrap recorded, or a hard failure. */
function bootstrapScope(manifest: ManifestV2): string {
  const scope = manifest.answers[WC_SPA_BOOTSTRAP_ID]?.npmScope;
  if (!scope) {
    throw new Error(
      `${WC_CONTEXT_ID}: requires '${WC_SPA_BOOTSTRAP_ID}' to have run first; npmScope not in manifest`,
    );
  }
  return scope;
}

/**
 * Declares the context on the deployment unit's manifest, and makes
 * sure that package has a `test` script.
 *
 * The script is not incidental. The assembly is the only place allowed
 * to name two contexts, so a test that drives a cross-context call
 * with no fakes has to live there — the same test inside
 * `modules/<name>/` would import the peer's facade and fail
 * `peers-meet-at-the-service-seam`. `wc-peer-context` adds the script
 * too; both check before adding, so whichever runs first wins and the
 * other is a no-op.
 */
function appDependencyPatch(
  layout: WcLayoutPaths,
  pkg: string,
  workspaceDep: string,
): ContributionPatch {
  const target = `${layout.appRoot}/package.json`;
  return {
    target,
    apply: eolAware((existing) => {
      let next = existing;
      if (!next.includes(`"${pkg}"`)) {
        const dependency = `"${layout.corePkg}": "${workspaceDep}"`;
        if (!next.includes(dependency)) {
          throw new Error(
            `${WC_CONTEXT_ID}: no '${layout.corePkg}' dependency in '${target}' to add '${pkg}' beside`,
          );
        }
        next = next.replace(dependency, `${dependency},\n    "${pkg}": "${workspaceDep}"`);
      }
      if (!next.includes('"test":')) {
        const scripts = '"typecheck": "tsc --noEmit"';
        if (next.includes(scripts)) {
          next = next.replace(scripts, `${scripts},\n    "test": "vitest run"`);
        }
      }
      if (!next.includes('"vitest":')) {
        const devDeps = '"typescript": "^5.9.0"';
        if (next.includes(devDeps)) {
          next = next.replace(devDeps, `${devDeps},\n    "vitest": "^3.2.0"`);
        }
      }
      return next;
    }),
  };
}

/**
 * Wires the context into the assembly: its wiring call, its ports onto
 * the context map, and its element registration after the provider is
 * listening.
 *
 * Order is the whole reason registration is appended rather than
 * spliced. Defining an element upgrades already-parsed markup and
 * fires `connectedCallback` synchronously, so a `define…Elements()`
 * above the `context-request` listener would have the view ask for
 * ports nobody is answering yet — and the emitted element throws
 * exactly that error rather than rendering empty.
 */
function appWiringPatch(
  layout: WcLayoutPaths,
  context: string,
  elementsPkg: string,
  args: string,
): ContributionPatch {
  const target = `${layout.appSrc}/main.ts`;
  const Context = pascal(context);
  const wiringImport = `import { create${Context}Wiring } from './${context}';`;
  const elementsImport = `import { define${Context}Elements } from '${elementsPkg}';`;
  const mapOpen = 'const ports = new Map<Context<unknown>, unknown>([';
  return {
    target,
    apply: eolAware((existing) => {
      if (existing.includes(wiringImport)) return existing;
      const open = existing.indexOf(mapOpen);
      if (open === -1) {
        throw new Error(
          `${WC_CONTEXT_ID}: could not find the context-port map in '${target}' — the context would be emitted and provided to nothing`,
        );
      }
      const close = existing.indexOf(']);', open);
      if (close === -1) {
        throw new Error(`${WC_CONTEXT_ID}: unterminated context-port map in '${target}'`);
      }
      const withPorts = `${existing.slice(0, close)}  ...${context}.ports,\n${existing.slice(close)}`;
      const declared = withPorts.replace(
        mapOpen,
        `const ${context} = create${Context}Wiring(${args});\n\n${mapOpen}`,
      );
      const imported = beforeFirstImport(declared, `${wiringImport}\n${elementsImport}`);
      return `${imported.trimEnd()}\ndefine${Context}Elements();\n`;
    }),
  };
}

/**
 * Puts the context's view on the page, after the skeleton's.
 *
 * Anchored on the *skeleton's* tag rather than on the previous added
 * context's, because the skeleton's is the one element that is always
 * there whatever else has been added — each new view lands directly
 * after it, and the guard on this context's own tag keeps a re-run
 * from doubling it.
 */
function markupPatch(layout: WcLayoutPaths, viewTag: string): ContributionPatch {
  const target = layout.appIndexHtml;
  const anchor = `<${layout.elementTag(VIEW)}></${layout.elementTag(VIEW)}>`;
  return {
    target,
    apply: eolAware((existing) => {
      if (existing.includes(`<${viewTag}>`)) return existing;
      if (!existing.includes(anchor)) {
        throw new Error(
          `${WC_CONTEXT_ID}: could not find '${anchor}' in '${target}' to place the context's element beside`,
        );
      }
      return existing.replace(anchor, `${anchor}\n        <${viewTag}></${viewTag}>`);
    }),
  };
}

/** The context name as a TypeScript type prefix. */
function pascal(name: string): string {
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}
