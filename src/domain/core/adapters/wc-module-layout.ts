/**
 * The web-components half of the **module layout** dial: where each
 * layout puts a browser workspace's files, what the packages are
 * called, what each publishes — and the one thing no compiler will
 * ever check, the **custom-element tag prefix**.
 *
 * The dial itself is language-neutral and lives in
 * [`module-layout.ts`](./module-layout.ts). This is its
 * `web-components` resolver, a sibling of `tsLayout` — and it shares
 * that resolver's central ruling, because it is the same runtime:
 * **a bounded context is one workspace package**, and the `exports`
 * map is the only wall the toolchain enforces on its own.
 *
 * Three things are specific to the browser:
 *
 * - **A third entry point, `"./elements"`.** A context does not only
 *   export factories; it registers custom elements, and registration
 *   is a side effect the assembly must be able to order (definitions
 *   upgrade parsed markup and fire `connectedCallback` synchronously,
 *   so the context provider has to be listening first). Giving that
 *   its own subpath keeps `"."` importable from a DOM-less test.
 * - **`design-system` is not a context.** It stays a top-level
 *   package: it is domain-blind, every context consumes it, and it is
 *   the package the import map deduplicates. Folding it into a
 *   context would give that context ownership of everyone's buttons.
 * - **The tag prefix is a runtime string, and nothing checks it.**
 *   `<scope>-<context>-<element>` is spelled in the element's own
 *   registration, in the markup that instantiates it, and in the
 *   `HTMLElementTagNameMap` declaration. Get it wrong and the build
 *   is green, the typecheck is green, the tests are green, and the
 *   page renders an unknown element as an empty inline box. So it is
 *   derived here, once — and the emitted context carries a test that
 *   re-derives it from its own package name, which is the only way a
 *   typo in *this file* becomes a failure rather than a blank area of
 *   the page.
 */

import type { Tag } from '../../contract/composition.js';
import { type ModuleLayout, moduleLayoutOf, SKELETON_MODULE } from './module-layout.js';

export { moduleLayoutOf as wcModuleLayout } from './module-layout.js';

/**
 * Where each part of a `web-components` workspace lives, under which
 * package name, and behind which aperture. Directories are
 * project-relative with posix separators and point at the directory a
 * template tree renders into.
 */
export interface WcLayoutPaths {
  readonly layout: ModuleLayout;
  /** The npm scope, without the leading `@`. */
  readonly scope: string;

  /**
   * The design system: a top-level package under both layouts, and
   * the one the import map deduplicates.
   */
  readonly designSystemRoot: string;
  readonly designSystemPkg: string;

  /**
   * The WCCG Context protocol primitives. Under `basic` they are a
   * module of the deployment unit; under the modulith both the
   * contexts' elements and the assembly need them, so they become a
   * platform package owned by neither.
   */
  readonly contextProtocolDir: string;
  /** Specifier for the protocol, or `null` when it is app-local. */
  readonly contextProtocolPkg: string | null;

  /** The context's contract face: commands, ports, read models. */
  readonly contractSrc: string;
  /** Its barrel — the patch target every vertical extends. */
  readonly contractIndex: string;
  /** Specifier an outside consumer reaches the contract through. */
  readonly contractPkg: string;

  /** The compiler-hidden core. */
  readonly coreInternal: string;
  /** Package directory owning the domain (manifest + tsconfig). */
  readonly coreRoot: string;
  /** The domain package's public barrel — the facade under the modulith. */
  readonly coreIndex: string;
  /** Where the domain's tests land. */
  readonly coreTests: string;
  /** Specifier an outside consumer reaches the domain through. */
  readonly corePkg: string;

  /** Package directory of a driven adapter. */
  infraRoot(name: string): string;
  /** Its source directory. */
  infraSrc(name: string): string;
  /** Its tests. */
  infraTests(name: string): string;
  /** Specifier a consumer imports it through. */
  infraPkg(name: string): string;
  /** Whether a driven adapter is its own workspace package. */
  readonly infraIsPackage: boolean;

  /**
   * Where the port-bound custom elements live. Under `basic` they are
   * components of the deployment unit; under the modulith they are
   * the context's driving adapters and move inside it.
   */
  readonly elementsDir: string;
  /**
   * The module whose `define…Elements()` registers them, and the
   * specifier the assembly calls it through. Both `null` under
   * `basic`, where the assembly defines each element itself.
   */
  readonly elementsFile: string | null;
  readonly elementsPkg: string | null;

  /** The peer seam's source file and specifier; absent under `basic`. */
  readonly serviceFile: string | null;
  readonly servicePkg: string | null;

  /** The deployment unit: package dir, sources, and its markup. */
  readonly appRoot: string;
  readonly appSrc: string;
  readonly appIndexHtml: string;
  readonly appPkg: string;

  /** Workspace member globs, in the order the manifests list them. */
  readonly workspaceGlobs: readonly string[];

  /**
   * The custom-element tag for `name`. `<scope>-<element>` under
   * `basic`, `<scope>-<context>-<element>` under the modulith, where a
   * second context could otherwise collide on the same short name.
   */
  elementTag(name: string): string;

  /**
   * The `exports` map of a package, rendered as the JSON body between
   * its braces and indented to sit inside a `package.json`. Splice it
   * with `<%-`: it carries quotes, and `<%=` would HTML-escape them.
   */
  exportsMap(pkg: 'plain' | 'context'): string;

  /**
   * How a source file in `fromDir` names the module at `toFile`: the
   * publishing package's specifier when there is one, a relative path
   * otherwise. Same rule, and same reason, as `tsLayout`'s.
   */
  specifierFrom(fromDir: string, toFile: string): string;
}

const CONTEXT_ROOT = `modules/${SKELETON_MODULE}`;

/** The workspace package a project path belongs to. */
function packageRootOf(path: string): string {
  const segments = path.split('/');
  // `design-system` is the one single-segment member either layout
  // declares; everything else is `<area>/<name>`.
  return segments[0] === 'design-system' ? 'design-system' : segments.slice(0, 2).join('/');
}

/**
 * Posix-relative specifier from a directory to a file, `./`-anchored
 * and **extensionless**.
 *
 * That last part is the browser stack's own spelling and not a style
 * choice: `ts-http` sets `allowImportingTsExtensions` because Node
 * runs its sources and the specifier survives to runtime, while this
 * workspace is bundled by Vite and the same `.ts` suffix is a
 * `TS5097`. Two stacks, two conventions, one place that knows which.
 */
function relativeSpecifier(fromDir: string, toFile: string): string {
  const from = fromDir.split('/').filter(Boolean);
  const to = toFile.replace(/\.ts$/, '').split('/').filter(Boolean);
  let shared = 0;
  while (shared < from.length && shared < to.length - 1 && from[shared] === to[shared]) shared += 1;
  const up = '../'.repeat(from.length - shared);
  const down = to.slice(shared).join('/');
  return up === '' ? `./${down}` : `${up}${down}`;
}

/**
 * Resolves the layout-dependent directories, package names, entry
 * points and element tags from a manifest tag set and the project's
 * npm scope. Every web-components adapter that writes or patches
 * outside its own template tree goes through this rather than naming
 * a path — or, more dangerously here, a tag.
 */
export function wcLayout(tags: readonly Tag[], scope: string): WcLayoutPaths {
  const layout = moduleLayoutOf(tags);
  const pkg = (name: string): string => `@${scope}/${name}`;
  const entries = (map: Readonly<Record<string, string>>): string =>
    Object.entries(map)
      .map(([subpath, target]) => `    ${JSON.stringify(subpath)}: ${JSON.stringify(target)}`)
      .join(',\n');
  const shared = {
    scope,
    designSystemRoot: 'design-system',
    designSystemPkg: pkg('design-system'),
    appRoot: 'application/web-app',
    appSrc: 'application/web-app/src',
    appIndexHtml: 'application/web-app/index.html',
    appPkg: pkg('web-app'),
  };
  if (layout === 'basic') {
    const publishedAs = (file: string): string | null => {
      const root = packageRootOf(file);
      return file === `${root}/src/index.ts` ? pkg(root.split('/').pop() ?? root) : null;
    };
    return {
      ...shared,
      layout,
      contextProtocolDir: 'application/web-app/src',
      contextProtocolPkg: null,
      contractSrc: 'domain/domain-api/src',
      contractIndex: 'domain/domain-api/src/index.ts',
      contractPkg: pkg('domain-api'),
      coreInternal: 'domain/domain-core/src/internal',
      coreRoot: 'domain/domain-core',
      coreIndex: 'domain/domain-core/src/index.ts',
      coreTests: 'domain/domain-core/tests',
      corePkg: pkg('domain-core'),
      infraRoot: (name) => `infrastructure/${name}`,
      infraSrc: (name) => `infrastructure/${name}/src`,
      infraTests: (name) => `infrastructure/${name}/tests`,
      infraPkg: (name) => pkg(name),
      infraIsPackage: true,
      elementsDir: 'application/web-app/src/components',
      elementsFile: null,
      elementsPkg: null,
      serviceFile: null,
      servicePkg: null,
      workspaceGlobs: ['design-system', 'domain/*', 'application/*', 'infrastructure/*'],
      elementTag: (name) => `${scope}-${name}`,
      exportsMap: () => entries({ '.': './src/index.ts' }),
      specifierFrom: (fromDir, toFile) => publishedAs(toFile) ?? relativeSpecifier(fromDir, toFile),
    };
  }
  const context = pkg(SKELETON_MODULE);
  const publishedAs = (file: string): string | null => {
    const root = packageRootOf(file);
    const inside = file.slice(root.length + 1);
    const name = root.startsWith('modules/')
      ? root.slice('modules/'.length)
      : root.split('/').pop();
    if (inside === 'src/index.ts') return pkg(name ?? root);
    if (root.startsWith('modules/') && inside === 'src/service.ts')
      return `${pkg(name ?? root)}/service`;
    if (root.startsWith('modules/') && inside === 'src/elements.ts') {
      return `${pkg(name ?? root)}/elements`;
    }
    return null;
  };
  return {
    ...shared,
    layout,
    contextProtocolDir: 'platform/context/src',
    contextProtocolPkg: pkg('platform-context'),
    contractSrc: `${CONTEXT_ROOT}/src/domain/contract`,
    contractIndex: `${CONTEXT_ROOT}/src/domain/contract/index.ts`,
    contractPkg: context,
    coreInternal: `${CONTEXT_ROOT}/src/domain/core/internal`,
    coreRoot: CONTEXT_ROOT,
    coreIndex: `${CONTEXT_ROOT}/src/index.ts`,
    coreTests: `${CONTEXT_ROOT}/tests`,
    corePkg: context,
    infraRoot: () => CONTEXT_ROOT,
    infraSrc: (name) => `${CONTEXT_ROOT}/src/infra/${name}`,
    infraTests: () => `${CONTEXT_ROOT}/tests`,
    infraPkg: () => context,
    infraIsPackage: false,
    elementsDir: `${CONTEXT_ROOT}/src/user-side/elements`,
    elementsFile: `${CONTEXT_ROOT}/src/elements.ts`,
    elementsPkg: `${context}/elements`,
    serviceFile: `${CONTEXT_ROOT}/src/service.ts`,
    servicePkg: `${context}/service`,
    workspaceGlobs: ['design-system', 'platform/*', 'modules/*', 'application/*'],
    elementTag: (name) => `${scope}-${SKELETON_MODULE}-${name}`,
    exportsMap: (which) =>
      entries(
        which === 'plain'
          ? { '.': './src/index.ts' }
          : {
              '.': './src/index.ts',
              './elements': './src/elements.ts',
              './service': './src/service.ts',
            },
      ),
    specifierFrom: (fromDir, toFile) => publishedAs(toFile) ?? relativeSpecifier(fromDir, toFile),
  };
}
