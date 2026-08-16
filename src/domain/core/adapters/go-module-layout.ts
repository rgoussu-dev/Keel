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
 * - **The seam is a second aperture, and Go needs it for the
 *   opposite reason the JVM does.** On the JVM and in Rust
 *   `user-side/service` *narrows* what a peer may reach. Go has no
 *   such lever: `internal/` is scoped to the project root, so every
 *   package under it may import every other, and this seam narrows
 *   nothing. What Go enforces is **placement** — greeting's domain
 *   sits behind `modules/greeting/internal/`, so its commands, its
 *   ports and its error values are unreachable from any other
 *   context, as a compile error rather than a convention. A peer can
 *   still reach the facade, and it cannot name one thing the facade
 *   returns. `userside/service` is the package that hands a peer
 *   types it *may* write down, and they are the context's own — so
 *   the seam is not a narrowing of a wide aperture but the only
 *   aperture a peer can usefully hold.
 *
 *   Verified on go1.24, because the sharper claim is false and worth
 *   not making: unnameability does not stop a peer *calling* through
 *   the facade. Go's assignability is structural for unnamed types,
 *   so `greeting.NewGreeter().Greet(struct{ Name string }{…})`
 *   compiles from a foreign context even though `greeting.Greeter`
 *   and `domain.GreetCommand` are both `undefined` there. What that
 *   buys a peer is coupling nothing declares, to a shape that breaks
 *   silently on the first added field — which is an argument for the
 *   seam, not a hole in it.
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
import {
  type ModuleLayout,
  moduleLayoutOf,
  PEER_MODULE,
  SKELETON_MODULE,
} from './module-layout.js';

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
  /**
   * The context's **peer seam**: the package a foreign context
   * imports, and the only thing of this context's it should. `null`
   * under `basic`, which is a single hexagon with no peer to meet.
   *
   * Go cannot enforce the "and only" — `internal/` is scoped to the
   * project root, so any package under it is importable from any
   * other, facade included. What Go enforces is where the domain
   * sits: behind `modules/<ctx>/internal/`, unreachable from any
   * other context. So a peer cannot name one type the facade
   * returns, and this is the package that hands it types it may
   * write down — the context's own.
   */
  readonly service: string | null;
  /** Package name of {@link service}, or `null` under `basic`. */
  readonly servicePkg: string | null;
  /** The context's contract face: commands, ports, factories. */
  readonly domain: string;
  /** The compiler-hidden core behind it. */
  readonly domainCore: string;
  /**
   * One compiler-hidden core package behind the contract face — the
   * pure functions of a single slice, e.g. `domainInternal('greet')`.
   * {@link domainCore} is the walking skeleton's own.
   */
  domainInternal(name: string): string;
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
  /**
   * The `../`-chain leading from a project directory back to the
   * project root, trailing slash included (`''` for the root itself).
   * Go source rarely needs it — imports are absolute — but a test that
   * reads a file out of the repo (the pgx contract test replaying
   * `migrations/sql/`) does, and its depth moves with the layout. This
   * is the `upToRoot` bug the JVM kept re-introducing; deriving it here
   * is what keeps a template from hand-counting `../`.
   */
  upToRoot(dir: string): string;
  /**
   * A gofmt-ordered import group for the project's own packages, ready
   * to splice into a template through `<%- %>`. Which of two paths
   * sorts first flips with the layout — under the modulith a context's
   * `infra/` sorts before its `internal/domain`, the reverse of the
   * flat tree — so no template may lay one out by hand.
   */
  importBlock(dirs: readonly string[]): string;
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
  const upToRoot = (dir: string): string => '../'.repeat(dir.split('/').length);
  const importBlock = (dirs: readonly string[]): string =>
    dirs
      .map((dir) => importPath(dir))
      .sort()
      .map((p) => `\t"${p}"`)
      .join('\n');
  if (layout === 'basic') {
    return {
      layout,
      facade: 'internal/domain',
      facadePkg: 'domain',
      service: null,
      servicePkg: null,
      domain: 'internal/domain',
      domainCore: 'internal/domain/internal/greet',
      domainInternal: (name) => `internal/domain/internal/${name}`,
      app: (name) => `internal/app/${name}`,
      infra: (name) => `internal/infra/${name}`,
      platform: (name) => `internal/infra/${name}`,
      crossCutting: (name) => `internal/app/${name}`,
      clockPort: 'internal/domain',
      clockPkg: 'domain',
      main: (typology) => goMain(tags, typology),
      importPath,
      upToRoot,
      importBlock,
    };
  }
  const context = `internal/modules/${SKELETON_MODULE}`;
  return {
    layout,
    facade: context,
    facadePkg: SKELETON_MODULE,
    service: `${context}/userside/service`,
    servicePkg: 'service',
    domain: `${context}/internal/domain`,
    domainCore: `${context}/internal/domain/internal/greet`,
    domainInternal: (name) => `${context}/internal/domain/internal/${name}`,
    app: (name) => `${context}/userside/${name}`,
    infra: (name) => `${context}/infra/${name}`,
    platform: (name) => `internal/platform/${name}`,
    crossCutting: (name) => `internal/platform/${name}`,
    clockPort: 'internal/platform/clock',
    clockPkg: 'clock',
    main: (typology) => goMain(tags, typology),
    importPath,
    upToRoot,
    importBlock,
  };
}

/**
 * Splices `dirs` into a Go file's project-import group and returns the
 * group re-sorted, so a vertical adds packages to an assembly without
 * guessing where they belong.
 *
 * Insertion-by-anchor is what the naive version does — replace the one
 * import line you know is there with three — and it breaks twice: the
 * line you anchored on moves with the layout, and a vertical that ran
 * before you has already added lines your new ones must sort among.
 * Rewriting the whole group from the paths actually present is immune
 * to both.
 *
 * Throws when the file has no project imports at all: that is a file
 * which has drifted past recognition, and the caller's drift guard
 * should surface it rather than a silently unwired install.
 */
export function addProjectImports(
  existing: string,
  layout: GoLayoutPaths,
  dirs: readonly string[],
): string {
  const prefix = `\t"${layout.importPath('')}`;
  const lines = existing.split('\n');
  const at = lines.flatMap((line, i) => (line.startsWith(prefix) ? [i] : []));
  const first = at[0];
  const last = at[at.length - 1];
  if (first === undefined || last === undefined || last - first !== at.length - 1) {
    throw new Error('no contiguous project-import group to extend');
  }
  const group = [
    ...new Set([
      ...at.map((i) => lines[i]?.trim() ?? ''),
      ...dirs.map((dir) => `"${layout.importPath(dir)}"`),
    ]),
  ]
    .sort()
    .map((spec) => `\t${spec}`);
  return [...lines.slice(0, first), ...group, ...lines.slice(last + 1)].join('\n');
}

/**
 * The peer context's packages, filed the way the skeleton's are.
 *
 * The peer exists to make the seam *demonstrable* rather than merely
 * present: `guestbook` needs a welcome to record, `greeting` is the
 * context that composes one, and the only edge between them runs
 * through a gateway under `modules/guestbook/infra/`. That gateway's
 * import block is the file a reviewer checks — it must name
 * greeting's seam package and nothing else of greeting's.
 *
 * Every name here is a *package* name as well as a directory, which
 * is the Go-specific trap: `greetinggateway` runs together because a
 * Go package name may not carry a dash, and a directory whose last
 * segment does not match its package clause compiles but reads as a
 * different package at every import site.
 */
export function goPeerPackages(): {
  readonly facade: string;
  readonly facadePkg: string;
  readonly domain: string;
  readonly domainCore: string;
  readonly userSide: string;
  readonly userSidePkg: string;
  readonly gateway: string;
  readonly gatewayPkg: string;
} {
  const context = `internal/modules/${PEER_MODULE}`;
  return {
    facade: context,
    facadePkg: PEER_MODULE,
    domain: `${context}/internal/domain`,
    domainCore: `${context}/internal/domain/internal/sign`,
    userSide: `${context}/userside/signing`,
    userSidePkg: 'signing',
    gateway: `${context}/infra/${SKELETON_MODULE}gateway`,
    gatewayPkg: `${SKELETON_MODULE}gateway`,
  };
}

/**
 * The packages of any bounded context added by `keel add module`.
 *
 * The generalisation of {@link goPeerPackages}, which is now the
 * `guestbook` special case with its name written in. Two differences
 * beyond the name, and both follow from what an *added* context is
 * for:
 *
 * - **It publishes a seam.** The `--with-peer-context` context is a
 *   pure consumer and has none; an added one always does, so
 *   `keel add module <other> --consumes <name>` has something to bind
 *   to.
 * - **It has no driving adapter.** `guestbook` needs `userside/signing`
 *   because the emitted `cmd/` main drives it, and a main cannot name
 *   `domain.SignCommand`. Nothing drives an added context until the
 *   user decides how, so keel emits no adapter for a decision it has
 *   not been told.
 *
 * `gateway` is null without `consumes`: a context that reaches nobody
 * declares no edge.
 */
export function goContextPackages(
  context: string,
  consumes: string | null,
): {
  readonly facade: string;
  readonly facadePkg: string;
  readonly domain: string;
  readonly domainCore: string;
  readonly seam: string;
  readonly seamPkg: string;
  readonly gateway: string | null;
  readonly gatewayPkg: string | null;
} {
  const root = `internal/modules/${context}`;
  return {
    facade: root,
    facadePkg: context,
    domain: `${root}/internal/domain`,
    domainCore: `${root}/internal/domain/internal/core`,
    seam: `${root}/userside/service`,
    seamPkg: 'service',
    gateway: consumes === null ? null : `${root}/infra/${consumes}gateway`,
    gatewayPkg: consumes === null ? null : `${consumes}gateway`,
  };
}

/**
 * The skeleton context's facade factory, spelled out because it
 * cannot be derived.
 *
 * Every added context exports `New<Name>` — `ordering.NewOrdering` —
 * so a consumer can compute it from the name alone. The skeleton
 * exports `NewGreeter`: an *agent* noun, which reads far better than
 * `NewGreeting` would and is exactly the thing no rule can produce
 * from the string "greeting". So the one context whose factory is not
 * derivable has its name written down here, once, beside the constant
 * that names the context itself.
 */
export const SKELETON_FACADE_FACTORY = 'NewGreeter';

/**
 * The seam package of an existing context — what a gateway imports.
 *
 * The skeleton's lives where its layout resolver puts it; every other
 * context's is `modules/<name>/userside/service`, because that is
 * where {@link goContextPackages} put it when the context was added.
 */
export function goSeamPackage(layout: GoLayoutPaths, context: string): string {
  if (context === SKELETON_MODULE) {
    if (layout.service === null) {
      throw new Error(`goSeamPackage: the skeleton has no seam under layout '${layout.layout}'`);
    }
    return layout.service;
  }
  return goContextPackages(context, null).seam;
}

/**
 * The template variables every Go tree needs: the package name the
 * assembly calls the context through, and the import path of the
 * contract face its adapters are written against. Templates never
 * concatenate a module path with a directory — that is what makes the
 * layout a one-line change here rather than a sweep through the trees.
 *
 * Import *blocks* are not here, deliberately: which packages a given
 * file imports is that file's business, not the layout's. What the
 * layout does own is their *order* — see {@link GoLayoutPaths.importBlock},
 * which each adapter calls with its own list.
 */
export function goTemplateVars(paths: GoLayoutPaths): Readonly<Record<string, string>> {
  return {
    facadePkg: paths.facadePkg,
    domainImport: paths.importPath(paths.domain),
  };
}
