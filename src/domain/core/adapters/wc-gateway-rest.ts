/**
 * `gateway/wc-gateway-rest` adapter — gives the web-components
 * frontend a REST gateway to a sibling backend, selected by the peer
 * tag `peer.api.rest` (recorded by a composite `keel new` or by
 * `keel link`).
 *
 * Contributes:
 *   - the `GreetGateway` driven port on the contract face
 *     (re-exported from its barrel) — DOM-free, so the domain keeps
 *     compiling without the browser;
 *   - the fetch adapter (`createRestGreetGateway`) and its canonical
 *     fake, the fake behind its own `./fake` subpath under `basic` so
 *     domain tests can depend on it without dragging `fetch` into
 *     their DOM-less programs;
 *   - a Vite dev-server proxy (`/api` → `http://localhost:8080`) and
 *     the `vite-env.d.ts` reference that types
 *     `import.meta.env.VITE_API_BASE_URL` (12-factor: config via env);
 *   - rewrites of the greet slice so the walking skeleton is
 *     end-to-end across services: `greet-service` now publishes what
 *     the gateway returns (with an offline fallback), the assembly
 *     constructs the gateway, and the domain test drives the slice
 *     through the fake.
 *
 * Every destination and every specifier comes from `wcLayout`. Under
 * `basic` the adapter is its own `infrastructure/gateway-rest`
 * package; under the modulith it is a directory inside the context,
 * the assembly reaches it through the facade, and the Vite config it
 * rewrites has to keep the design system external — dropping that
 * plugin would silently re-inline an element-defining package.
 *
 * The rewrites replace whole files the wc bootstrap emitted; on the
 * greenfield composite path they were staged moments earlier in the
 * same install, and on the brownfield path (`keel link` + `keel add
 * gateway`) they overwrite the local-only greet slice by design —
 * that is what wiring a backend means for this walking skeleton.
 */

import type { Adapter, ContributionFile, ContributionPatch } from '../../contract/composition.js';
import { eolOf, withEol } from '../util.js';
import { tsWorkspaceVars } from './ts-workspace.js';
import { wcLayout, type WcLayoutPaths } from './wc-module-layout.js';
import { WC_SPA_BOOTSTRAP_ID, wcLayoutVars } from './wc-spa-bootstrap.js';

export const WC_GATEWAY_REST_ID = 'gateway/wc-gateway-rest';

const TEMPLATE_ROOT = 'composition/gateway/wc-gateway-rest';

const GATEWAY_EXPORT = "export * from './ports/greet-gateway';";

export const wcGatewayRestAdapter: Adapter = {
  id: WC_GATEWAY_REST_ID,
  vertical: 'gateway',
  covers: [],
  predicate: { requires: ['framework.web-components', 'arch.spa', 'peer.api.rest'] },
  async contribute(ctx) {
    const npmScope = ctx.manifest.answers[WC_SPA_BOOTSTRAP_ID]?.npmScope;
    if (!npmScope) {
      throw new Error(
        `${WC_GATEWAY_REST_ID}: requires '${WC_SPA_BOOTSTRAP_ID}' to have run first; npmScope not in manifest`,
      );
    }
    const layout = wcLayout(ctx.manifest.tags, npmScope);
    const ws = tsWorkspaceVars(ctx.manifest.tags);
    const adapterDir = layout.infraSrc('gateway-rest');
    const testDir = layout.infraTests('gateway-rest');
    const fakeFile = `${adapterDir}/fake.ts`;
    // Under `basic` the fake is published on its own `./fake` subpath;
    // inside the context there is no subpath to publish it on, and a
    // sibling file names it relatively.
    const fakeSpec = layout.infraIsPackage
      ? `${layout.infraPkg('gateway-rest')}/fake`
      : layout.specifierFrom(layout.coreTests, fakeFile);
    const shared = { npmScope, ...ws, ...wcLayoutVars(layout) };
    const renders: (readonly [string, string, Readonly<Record<string, string>>])[] = [
      ['port', `${layout.contractSrc}/ports`, {}],
      ['app', layout.appSrc, {}],
      [
        'adapter/src',
        adapterDir,
        { contractSpec: layout.specifierFrom(adapterDir, layout.contractIndex) },
      ],
      [
        'adapter/tests',
        testDir,
        {
          contractSpec: layout.specifierFrom(testDir, layout.contractIndex),
          fakeSpec: layout.infraIsPackage
            ? `${layout.infraPkg('gateway-rest')}/fake`
            : layout.specifierFrom(testDir, fakeFile),
        },
      ],
    ];
    if (layout.infraIsPackage) {
      renders.push(
        [
          'adapter/manifest',
          layout.infraRoot('gateway-rest'),
          { gatewayPkg: layout.infraPkg('gateway-rest'), contractPkg: layout.contractPkg },
        ],
        // Under `basic` the app has no Vite config yet; under the
        // modulith the bootstrap already emitted one (the design
        // system's externalisation lives in it), so there it is a
        // rewrite instead — the same file, contributed two different
        // ways because the layout decided whether it exists.
        ['app-config', layout.appRoot, {}],
      );
    }
    // Three trees replace files the bootstrap already emitted — the
    // greet slice becomes backend-backed — so they are contributed as
    // patches. The engine refuses a file that would overwrite one, and
    // rightly: "I meant to clobber that" has to be said out loud.
    const suffix = layout.layout === 'modulith' ? '-modulith' : '';
    const overwrites: (readonly [string, string, Readonly<Record<string, string>>])[] = [
      [`assembly${suffix}`, layout.appSrc, {}],
      [
        'core',
        layout.coreInternal,
        { contractSpec: layout.specifierFrom(layout.coreInternal, layout.contractIndex) },
      ],
      ['core-tests', layout.coreTests, { greetTestImports: greetTestImports(layout, fakeSpec) }],
    ];
    if (!layout.infraIsPackage) {
      overwrites.push(['app-config-modulith', layout.appRoot, {}]);
    }
    const [rendered, rewritten] = await Promise.all([
      Promise.all(
        renders.map(([tree, dest, vars]) =>
          ctx.templates.render(`${TEMPLATE_ROOT}/${tree}`, dest, { ...shared, ...vars }),
        ),
      ),
      Promise.all(
        overwrites.map(([tree, dest, vars]) =>
          ctx.templates.render(`${TEMPLATE_ROOT}/${tree}`, dest, { ...shared, ...vars }),
        ),
      ),
    ]);
    const rewrites = rewritten.flat();
    return {
      files: rendered.flat(),
      patches: [
        {
          target: layout.contractIndex,
          apply: (existing) => {
            if (existing.includes(GATEWAY_EXPORT)) return existing;
            const eol = eolOf(existing);
            return `${existing.trimEnd()}${withEol(`\n${GATEWAY_EXPORT}\n`, eol)}`;
          },
        },
        ...packagePatches(layout, ws.workspaceDep),
        ...facadePatch(layout),
        ...rewrites.map((file: ContributionFile) => ({
          target: file.path,
          apply: () =>
            typeof file.content === 'string' ? file.content : file.content.toString('utf8'),
        })),
      ],
    };
  },
};

/**
 * The rewritten domain test's imports. Under `basic` it names three
 * packages — the contract, the core, the gateway's `./fake` subpath —
 * and under the modulith the first two collapse into the context
 * while the third has no subpath to be published on at all. Same
 * three names, three different specifiers, and no template can guess
 * which.
 */
function greetTestImports(layout: WcLayoutPaths, fakeSpec: string): string {
  if (layout.infraIsPackage) {
    return `import type { Greet, Greeting, GreetingReadModel } from '${layout.contractPkg}';
import { createGreet, createGreetingStore } from '${layout.corePkg}';
import { createFakeGreetGateway, type FakeGreetGateway } from '${fakeSpec}';`;
  }
  return `import {
  createGreet,
  createGreetingStore,
  type Greet,
  type Greeting,
  type GreetingReadModel,
} from '${layout.corePkg}';
import { createFakeGreetGateway, type FakeGreetGateway } from '${fakeSpec}';`;
}

/**
 * The assembly cannot reach into a context, so under the modulith the
 * gateway it constructs has to be published by the context's facade —
 * the same constraint the persistence slice meets on `ts-http` and in
 * Go. Under `basic` the adapter is a package the assembly depends on
 * directly and the facade stays as it was.
 */
function facadePatch(layout: WcLayoutPaths): readonly ContributionPatch[] {
  if (layout.infraIsPackage) return [];
  const block = "export { createRestGreetGateway } from './infra/gateway-rest/index';";
  return [
    {
      target: layout.coreIndex,
      apply: (existing) => {
        if (existing.includes(block)) return existing;
        const eol = eolOf(existing);
        return `${existing.trimEnd()}${withEol(`\n${block}\n`, eol)}`;
      },
    },
  ];
}

/**
 * Manifest edits, which exist only where the adapter is a package of
 * its own. Inside the context there is no edge to declare: the
 * sources that use it are in the same package.
 */
function packagePatches(layout: WcLayoutPaths, workspaceDep: string): readonly ContributionPatch[] {
  if (!layout.infraIsPackage) return [];
  const gatewayPkg = layout.infraPkg('gateway-rest');
  return [
    {
      target: `${layout.appRoot}/package.json`,
      apply: (existing) => addPackageDependency(existing, 'dependencies', gatewayPkg, workspaceDep),
    },
    {
      target: `${layout.coreRoot}/package.json`,
      apply: (existing) =>
        addPackageDependency(existing, 'devDependencies', gatewayPkg, workspaceDep),
    },
  ];
}

/**
 * Adds one dependency entry to a package manifest, preserving the
 * 2-space formatting the templates emit. Parsing instead of string
 * surgery keeps the patch correct under either workspace protocol
 * (`*` for npm, `workspace:*` for pnpm) and idempotent on re-runs.
 */
function addPackageDependency(
  existing: string,
  section: 'dependencies' | 'devDependencies',
  name: string,
  version: string,
): string {
  const pkg = JSON.parse(existing) as Record<string, unknown>;
  const deps = { ...((pkg[section] as Record<string, string> | undefined) ?? {}) };
  if (deps[name] !== undefined) return existing;
  deps[name] = version;
  pkg[section] = deps;
  return withEol(`${JSON.stringify(pkg, null, 2)}\n`, eolOf(existing));
}
