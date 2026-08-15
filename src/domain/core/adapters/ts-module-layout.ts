/**
 * The TypeScript half of the **module layout** dial: where each layout
 * puts a Node workspace's files, what the package holding them is
 * *called*, and — the half that decides whether any of it is enforced
 * — what that package's `exports` map lets through.
 *
 * The dial itself is language-neutral and lives in
 * [`module-layout.ts`](./module-layout.ts). This is its `ts-http`
 * resolver, a sibling of `jvmLayout` and `goLayout`.
 *
 * Under **`basic`** the tree is exactly what keel has always emitted:
 * `domain/kernel`, `domain/contract` and `domain/core` as three
 * workspace packages, one `infrastructure/<tech>` package per driven
 * adapter, and an `application/rest` deployment unit.
 *
 * Under **`modulith`** a bounded context is **one workspace package**,
 * not one per (context × layer). `@<scope>/<ctx>` owns
 * `src/domain/{contract,core}`, `src/user-side/…` and `src/infra/…` as
 * plain directories, and publishes exactly two entry points. Three
 * things settled that shape, and the third is why the first two are
 * not merely a matter of taste:
 *
 * - **The package graph enforces nothing here.** An undeclared
 *   workspace dependency resolves anyway — npm hoists every member
 *   into the root `node_modules` — and TypeScript project references
 *   do not restrict which projects a project may import; the same
 *   undeclared import builds clean under `tsc -b --force`. So
 *   splitting a context into four packages buys four manifests and no
 *   wall.
 * - **The `exports` map is the one real wall.** `"."` reaches the
 *   facade and `"./service"` the peer seam, while
 *   `@<scope>/<ctx>/src/domain/core/internal/…` is rejected by tsc
 *   (`TS2307`) *and* by Node (`ERR_PACKAGE_PATH_NOT_EXPORTED`). One
 *   package per context keeps all of it, at 1 manifest instead of 3.5.
 *   That is why {@link TsLayoutPaths.exportsMap} lives here: the
 *   aperture is a layout decision, not a per-package detail.
 * - **The map is coupled to the build mode**, which is the trap. With
 *   no build step — `ts-http`, where Node runs the sources directly —
 *   the map points at `./src/index.ts` and every import specifier ends
 *   in `.ts`. An emitting build needs `./dist/index.js`, a `types`
 *   condition, and `.js` specifiers. Mixing the two typechecks and
 *   then fails at runtime, so the map and the specifier convention are
 *   decided together, here.
 *
 * What the `exports` map cannot see is a **relative path** into another
 * package's tree, and the intra-context layering (`domain` never
 * imports `user-side`/`infra`). Both are dependency-cruiser rules, and
 * the modulith emits the config for them — with
 * `enhancedResolveOptions`, without which dependency-cruiser resolves
 * every `@scope/*` import to a bare specifier and reports zero
 * violations over a tree that is in violation.
 */

import type { Tag } from '../../contract/composition.js';
import { type ModuleLayout, moduleLayoutOf, SKELETON_MODULE } from './module-layout.js';

export { moduleLayoutOf as tsModuleLayout } from './module-layout.js';

/** An entry point a package publishes through its `exports` map. */
export interface TsEntryPoint {
  /** Subpath as written in the map, e.g. `.` or `./service`. */
  readonly subpath: string;
  /** Package-relative target, e.g. `./src/index.ts`. */
  readonly target: string;
}

/**
 * Where each part of a `ts-http` workspace lives, under which package
 * name, and behind which aperture. Directories are project-relative
 * with posix separators and point at the directory a template tree
 * renders into (so they include `src`/`tests` where those exist).
 */
export interface TsLayoutPaths {
  readonly layout: ModuleLayout;
  /** The npm scope, without the leading `@`. */
  readonly scope: string;

  /** Package directory of the dispatch vocabulary. */
  readonly kernelRoot: string;
  /** Source directory inside it. */
  readonly kernelSrc: string;
  /** Specifier a consumer imports the vocabulary through. */
  readonly kernelPkg: string;

  /**
   * Directory the registry mediator's source lands in. Under `basic`
   * it is an implementation detail of `domain/core`; under the
   * modulith the mediator belongs to no context, so it joins the
   * kernel — the same move the JVM modulith makes.
   */
  readonly mediatorDir: string;
  /** Specifier the assembly imports `createRegistryMediator` through. */
  readonly mediatorPkg: string;
  /**
   * How the mediator's own source names the vocabulary: a package
   * specifier when it lives in another package, a relative one once it
   * has moved into the kernel itself.
   */
  readonly mediatorKernelSpec: string;

  /** The context's contract face: commands, ports, domain errors. */
  readonly contractSrc: string;
  /** Its barrel — the patch target every vertical extends. */
  readonly contractIndex: string;
  /** Specifier an *outside* consumer reaches the contract through. */
  readonly contractPkg: string;

  /** The compiler-hidden core's directory. */
  readonly coreInternal: string;
  /** Package directory owning the domain (manifest + tsconfig). */
  readonly coreRoot: string;
  /**
   * The domain package's public barrel. Under `basic` it is
   * `domain/core`'s index; under the modulith it is the context's
   * facade, one level up from its layers.
   */
  readonly coreIndex: string;
  /** Where the domain's tests land. */
  readonly coreTests: string;
  /** Specifier an outside consumer reaches the domain through. */
  readonly corePkg: string;
  /**
   * A module-relative specifier for something under {@link coreInternal},
   * as the public barrel must spell it — `./internal/x.ts` under
   * `basic`, `./domain/core/internal/x.ts` under the modulith, because
   * the barrel moved but the core did not.
   */
  coreExport(module: string): string;

  /** Package directory of a driven adapter. */
  infraRoot(name: string): string;
  /** Its source directory. */
  infraSrc(name: string): string;
  /** Its tests. */
  infraTests(name: string): string;
  /** Specifier a consumer imports it through. */
  infraPkg(name: string): string;
  /**
   * Whether a driven adapter is its own workspace package. False
   * under the modulith, where it is a directory inside the context —
   * which is the whole "1 manifest per context instead of 3.5" claim.
   */
  readonly infraIsPackage: boolean;

  /** The runnable HTTP assembly: package dir, sources, tests. */
  readonly restRoot: string;
  readonly restSrc: string;
  readonly restTests: string;
  readonly restPkg: string;

  /**
   * The peer seam's source file, and the specifier a peer context
   * imports it through. Both absent under `basic`, which has no peers
   * to compose with.
   */
  readonly serviceFile: string | null;
  readonly servicePkg: string | null;

  /** Workspace member globs, in the order the manifests list them. */
  readonly workspaceGlobs: readonly string[];

  /**
   * The `exports` map of a package, rendered as the JSON body between
   * its braces and indented to sit inside a `package.json`. Splice it
   * with `<%-`: it carries quotes, and `<%=` would HTML-escape them.
   */
  exportsMap(pkg: 'kernel' | 'domain'): string;

  /**
   * How a source file in `fromDir` names the module at `toFile`.
   *
   * This is the derivation the layout most reliably flips, and the
   * rule is the aperture rather than the directory: a file that some
   * package **publishes** is named by that package's specifier, and
   * anything else by a relative path. Under `basic` a driven adapter
   * and the contract it implements are two packages, and the contract
   * publishes its barrel — so the import is `@scope/domain-contract`.
   * Under the modulith the same two files are directories inside one
   * package and the contract face is published by nothing, so the
   * import has to become `../../domain/contract/index.ts`. Spell
   * either in a template and the other layout breaks.
   */
  specifierFrom(fromDir: string, toFile: string): string;

  /**
   * How a source file in `fromDir` names `toFile` when both belong to
   * the same package — a relative path — falling back to the published
   * specifier when they do not.
   *
   * The difference from {@link specifierFrom} is which spelling wins
   * for a file its own package publishes, and both spellings are
   * already in the emitted trees: the clock's contract test imports
   * `@scope/infrastructure-clock` (through the aperture, as a consumer
   * would), while the greeting log's imports `../src/index.ts`. Where
   * a template already picked one, the resolver has to be able to keep
   * it — a layout dial is not licence to reformat the tree it is
   * dialling.
   */
  internalSpecifierFrom(fromDir: string, toFile: string): string;

  /**
   * The `../`-chain from a project directory back to the project root,
   * trailing slash included. Only a file that *reads* another file
   * needs it — the pgx-equivalent contract test replaying
   * `migrations/sql/` — and its depth moves with the layout while
   * every import around it stays absolute. That asymmetry is what
   * makes it easy to hand-count and get wrong.
   */
  upToRoot(dir: string): string;
}

const CONTEXT_ROOT = `modules/${SKELETON_MODULE}`;

/**
 * The workspace package a project path belongs to. Every member glob
 * either layout declares is `<area>/*`, so a package root is the first
 * two segments — which is what makes {@link TsLayoutPaths.specifierFrom}
 * a two-line comparison rather than a lookup table.
 */
function packageRootOf(path: string): string {
  return path.split('/').slice(0, 2).join('/');
}

/** Posix-relative specifier from a directory to a file, `./`-anchored. */
function relativeSpecifier(fromDir: string, toFile: string): string {
  const from = fromDir.split('/').filter(Boolean);
  const to = toFile.split('/').filter(Boolean);
  let shared = 0;
  while (shared < from.length && shared < to.length - 1 && from[shared] === to[shared]) shared += 1;
  const up = '../'.repeat(from.length - shared);
  const down = to.slice(shared).join('/');
  return up === '' ? `./${down}` : `${up}${down}`;
}

/**
 * Resolves the layout-dependent directories, package names and
 * entry points from a manifest tag set and the project's npm scope.
 * Every TypeScript adapter that writes or patches outside its own
 * template tree goes through this rather than naming a path.
 */
export function tsLayout(tags: readonly Tag[], scope: string): TsLayoutPaths {
  const layout = moduleLayoutOf(tags);
  const pkg = (name: string): string => `@${scope}/${name}`;
  const exportsMap = (entries: readonly TsEntryPoint[]): string =>
    entries.map((e) => `    ${JSON.stringify(e.subpath)}: ${JSON.stringify(e.target)}`).join(',\n');
  const packageNameOf = (root: string): string =>
    layout === 'modulith' && root.startsWith('modules/')
      ? pkg(root.slice('modules/'.length))
      : pkg(root.split('/').join('-'));
  const publishedAs = (file: string): string | null => {
    const root = packageRootOf(file);
    const inside = file.slice(root.length + 1);
    if (inside === 'src/index.ts') return packageNameOf(root);
    if (layout === 'modulith' && inside === 'src/service.ts')
      return `${packageNameOf(root)}/service`;
    return null;
  };
  const specifierFrom = (fromDir: string, toFile: string): string =>
    publishedAs(toFile) ?? relativeSpecifier(fromDir, toFile);
  const internalSpecifierFrom = (fromDir: string, toFile: string): string =>
    packageRootOf(fromDir) === packageRootOf(toFile)
      ? relativeSpecifier(fromDir, toFile)
      : specifierFrom(fromDir, toFile);
  const upToRoot = (dir: string): string => '../'.repeat(dir.split('/').length);
  if (layout === 'basic') {
    return {
      layout,
      scope,
      kernelRoot: 'domain/kernel',
      kernelSrc: 'domain/kernel/src',
      kernelPkg: pkg('domain-kernel'),
      mediatorDir: 'domain/core/src/internal',
      mediatorPkg: pkg('domain-core'),
      mediatorKernelSpec: pkg('domain-kernel'),
      contractSrc: 'domain/contract/src',
      contractIndex: 'domain/contract/src/index.ts',
      contractPkg: pkg('domain-contract'),
      coreInternal: 'domain/core/src/internal',
      coreRoot: 'domain/core',
      coreIndex: 'domain/core/src/index.ts',
      coreTests: 'domain/core/tests',
      corePkg: pkg('domain-core'),
      coreExport: (module) => `./internal/${module}`,
      infraRoot: (name) => `infrastructure/${name}`,
      infraSrc: (name) => `infrastructure/${name}/src`,
      infraTests: (name) => `infrastructure/${name}/tests`,
      infraPkg: (name) => pkg(`infrastructure-${name}`),
      infraIsPackage: true,
      restRoot: 'application/rest',
      restSrc: 'application/rest/src',
      restTests: 'application/rest/tests',
      restPkg: pkg('application-rest'),
      serviceFile: null,
      servicePkg: null,
      workspaceGlobs: ['domain/*', 'application/*', 'infrastructure/*'],
      exportsMap: () => exportsMap([{ subpath: '.', target: './src/index.ts' }]),
      specifierFrom,
      internalSpecifierFrom,
      upToRoot,
    };
  }
  const context = pkg(SKELETON_MODULE);
  return {
    layout,
    scope,
    kernelRoot: 'platform/kernel',
    kernelSrc: 'platform/kernel/src',
    kernelPkg: pkg('platform-kernel'),
    mediatorDir: 'platform/kernel/src',
    mediatorPkg: pkg('platform-kernel'),
    mediatorKernelSpec: './index.ts',
    contractSrc: `${CONTEXT_ROOT}/src/domain/contract`,
    contractIndex: `${CONTEXT_ROOT}/src/domain/contract/index.ts`,
    contractPkg: context,
    coreInternal: `${CONTEXT_ROOT}/src/domain/core/internal`,
    coreRoot: CONTEXT_ROOT,
    coreIndex: `${CONTEXT_ROOT}/src/index.ts`,
    coreTests: `${CONTEXT_ROOT}/tests`,
    corePkg: context,
    coreExport: (module) => `./domain/core/internal/${module}`,
    infraRoot: () => CONTEXT_ROOT,
    infraSrc: (name) => `${CONTEXT_ROOT}/src/infra/${name}`,
    infraTests: () => `${CONTEXT_ROOT}/tests`,
    infraPkg: () => context,
    infraIsPackage: false,
    restRoot: 'application/rest',
    restSrc: 'application/rest/src',
    restTests: 'application/rest/tests',
    restPkg: pkg('application-rest'),
    serviceFile: `${CONTEXT_ROOT}/src/service.ts`,
    servicePkg: `${context}/service`,
    workspaceGlobs: ['platform/*', 'modules/*', 'application/*'],
    exportsMap: (which) =>
      exportsMap(
        which === 'kernel'
          ? [{ subpath: '.', target: './src/index.ts' }]
          : [
              { subpath: '.', target: './src/index.ts' },
              { subpath: './service', target: './src/service.ts' },
            ],
      ),
    specifierFrom,
    internalSpecifierFrom,
    upToRoot,
  };
}
