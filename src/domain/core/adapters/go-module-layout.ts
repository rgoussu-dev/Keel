/**
 * The Go half of the **module layout** dial: where each layout puts a
 * Go project's packages, and — the half that bites in Go — what each
 * one's *import path* is.
 *
 * The dial itself is language-neutral and lives in
 * [`module-layout.ts`](./module-layout.ts). This is its Go resolver,
 * a sibling of `jvmLayout`.
 *
 * Under **`basic`** the tree is exactly what keel has always emitted:
 * one `internal/domain` contract face over a compiler-hidden
 * `internal/domain/internal/greet` core, driving adapters under
 * `internal/app/`, driven adapters under `internal/infra/`, and one
 * `cmd/<typology>/` per deployment unit.
 *
 * Under **`modulith`** each bounded context is a directory under
 * `internal/modules/`, and three placements are load-bearing — each
 * one settled by a compiler rather than by taste:
 *
 * - **The context's core hides behind its own `internal/`.**
 *   `internal/modules/greeting/internal/domain` is importable from
 *   anywhere under `internal/modules/greeting/` and from nowhere
 *   else. That is the wall.
 * - **Adapters live beside that wall, not behind it.** Driven
 *   adapters are at `internal/modules/<ctx>/infra/<tech>` and driving
 *   adapters at `internal/modules/<ctx>/userside/<name>` — inside the
 *   context's directory (so they may name its ports) but outside its
 *   `internal/` (so `cmd/` can construct them). Put either behind the
 *   wall and the assembly cannot reach it.
 * - **The facade re-exports nothing.** `internal/modules/<ctx>` is
 *   the aperture: it exports factories and no type aliases, so a
 *   consumer can hold what a context returns but cannot *name* it —
 *   and therefore cannot declare its own implementation of the
 *   context's ports. `:=` supplies the type the consumer may not
 *   write. Adding one convenience alias here quietly turns that
 *   compile error back into a code-review rule.
 * - **Ubiquitous ports leave the contexts.** A `Clock` belongs to no
 *   bounded context, so it sits at `internal/platform/`, importable
 *   by all of them.
 *
 * Go has no relative imports, so every import line in every template
 * is `<modulePath>` × layout depth × context name concatenated. That
 * derivation lives here and only here: templates receive finished
 * import paths as variables and never build one. The same goes for
 * the **alias rule** — `internal/modules/ordering` and
 * `internal/modules/billing/gateway/ordering` both declare `package
 * ordering`, so a file importing both must alias one, and generated
 * code that forgets compiles fine until a second context appears.
 */

import type { Tag } from '../../contract/composition.js';
import { type ModuleLayout, moduleLayoutOf, SKELETON_MODULE } from './module-layout.js';

export { moduleLayoutOf as goModuleLayout } from './module-layout.js';

/**
 * Where each part of a Go project lives, and under which import path.
 * Directories are project-relative with posix separators.
 */
export interface GoLayoutPaths {
  readonly layout: ModuleLayout;
  /**
   * The package a deployment unit imports to reach the context —
   * `internal/domain` under `basic` (contract face and aperture are
   * the same package there), the context directory itself under the
   * modulith.
   */
  readonly facade: string;
  /** Package name of {@link facade}: `domain` or the context's name. */
  readonly facadePkg: string;
  /** The context's contract face: commands, ports, factories. */
  readonly domain: string;
  /** The compiler-hidden core behind it. */
  readonly domainCore: string;
  /** A driving (primary) adapter, e.g. `app('resthttp')`. */
  app(name: string): string;
  /** A driven (secondary) adapter, e.g. `infra('postgres')`. */
  infra(name: string): string;
  /**
   * A driven adapter no bounded context owns — the system clock, the
   * clock fake. Under `basic` it is an ordinary secondary adapter;
   * under the modulith it sits outside every context.
   */
  platform(name: string): string;
  /**
   * A cross-cutting package that belongs to the deployment unit
   * rather than to any context — logging, probes, request context.
   * Under `basic` it sits with the primary adapters it wraps; under
   * the modulith it joins the rest of the context-less code in
   * `internal/platform/`, because putting it inside `modules/<ctx>/`
   * would make one context own everyone's telemetry.
   */
  crossCutting(name: string): string;
  /**
   * Directory holding the ubiquitous `Clock` port, and the package
   * name that qualifies it. Under `basic` the port sits in the one
   * domain package (`domain.Clock`); under the modulith it belongs to
   * no context, so it gets its own platform package (`clock.Clock`).
   * The type's *name* changes with the layout, which is exactly the
   * derivation Go makes easy to get wrong by hand.
   */
  readonly clockPort: string;
  readonly clockPkg: string;
  /** The deployment unit's assembly point, e.g. `main('http')`. */
  main(typology: string): string;
  /** Import path of a project directory. */
  importPath(dir: string): string;
}

/**
 * The assembly point of one deployment unit, resolved from tags
 * alone. Both layouts put it at `cmd/<typology>/main.go` today, but
 * an adapter that only patches the assembly — `go-cors` — should not
 * have to know that, and should not have to read the bootstrap's
 * answers for a module path it has no other use for.
 */
export function goMain(tags: readonly Tag[], typology: string): string {
  return `cmd/${typology}/main.go`;
}

/**
 * Resolves the layout-dependent package directories and import paths
 * from a manifest tag set and the project's module path. Every Go
 * adapter that writes or patches outside its own template tree goes
 * through this rather than naming a directory.
 */
export function goLayout(tags: readonly Tag[], modulePath: string): GoLayoutPaths {
  const layout = moduleLayoutOf(tags);
  const importPath = (dir: string): string => `${modulePath}/${dir}`;
  if (layout === 'basic') {
    return {
      layout,
      facade: 'internal/domain',
      facadePkg: 'domain',
      domain: 'internal/domain',
      domainCore: 'internal/domain/internal/greet',
      app: (name) => `internal/app/${name}`,
      infra: (name) => `internal/infra/${name}`,
      platform: (name) => `internal/infra/${name}`,
      crossCutting: (name) => `internal/app/${name}`,
      clockPort: 'internal/domain',
      clockPkg: 'domain',
      main: (typology) => goMain(tags, typology),
      importPath,
    };
  }
  const context = `internal/modules/${SKELETON_MODULE}`;
  return {
    layout,
    facade: context,
    facadePkg: SKELETON_MODULE,
    domain: `${context}/internal/domain`,
    domainCore: `${context}/internal/domain/internal/greet`,
    app: (name) => `${context}/userside/${name}`,
    infra: (name) => `${context}/infra/${name}`,
    platform: (name) => `internal/platform/${name}`,
    crossCutting: (name) => `internal/platform/${name}`,
    clockPort: 'internal/platform/clock',
    clockPkg: 'clock',
    main: (typology) => goMain(tags, typology),
    importPath,
  };
}

/**
 * The import paths shared by every Go template tree, ready to
 * interpolate. Templates never concatenate a module path with a
 * directory — that is what makes the layout a one-line change here
 * rather than a sweep through the trees.
 *
 * Adapters with their own vocabulary (a persistence pool, an
 * observability middleware) add to this from the same resolver
 * rather than spelling a path out.
 */
export function goTemplateVars(paths: GoLayoutPaths): Readonly<Record<string, string>> {
  return {
    facadeImport: paths.importPath(paths.facade),
    facadePkg: paths.facadePkg,
    domainImport: paths.importPath(paths.domain),
    cliImport: paths.importPath(paths.app('cli')),
    restImport: paths.importPath(paths.app('resthttp')),
    clockFakeImport: paths.importPath(paths.platform('clockfake')),
  };
}
