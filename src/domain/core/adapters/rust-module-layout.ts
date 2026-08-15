/**
 * The Rust half of the **module layout** dial: where each layout puts
 * a Rust project's code, and — the half that bites in Rust — what
 * each unit's *crate* is called, in each of the three spellings the
 * same crate answers to.
 *
 * The dial itself is language-neutral and lives in
 * [`module-layout.ts`](./module-layout.ts). This is its Rust
 * resolver, a sibling of `jvmLayout` and `goLayout`.
 *
 * Under **`basic`** the project is a single crate, exactly what keel
 * has always emitted: `src/domain.rs` is the contract face over a
 * private `src/domain/greet.rs` core, driven adapters under
 * `src/infra/`, and one `src/bin/<typology>/` directory per
 * deployment unit, registered as an explicit `[[bin]]`.
 *
 * Under **`modulith`** the project is a Cargo **workspace**, and the
 * wall is the crate graph rather than module privacy. Each bounded
 * context is a directory under `modules/`, and the split into crates
 * is what makes a dependency a compile error instead of a review
 * comment:
 *
 * - **`<ctx>-domain-core` is private to its context.** Only
 *   `<ctx>-domain-contract` depends on it, so no assembly and no
 *   foreign context can name a core type. That is the wall, and it
 *   is the same wall `mod greet;` builds under `basic` — bought here
 *   at the price of a manifest, and paying back a smaller rebuild
 *   blast radius.
 * - **`<ctx>-user-side-service` is its own crate, and this is the
 *   one that is not obvious.** Whatever crate owns the peer API
 *   hands its consumers everything else that crate exports, so
 *   folding the seam into `<ctx>-domain-contract` would give every
 *   gateway a legal edge to the peer's whole domain. Splitting it
 *   out means a consumer depends on the seam and gets *only* the
 *   seam.
 * - **`platform-kernel` is load-bearing in a way it is not on the
 *   JVM.** Native `async fn` in traits is still not dyn-compatible
 *   on rustc 1.94, so a port trait declared `async fn` produces a
 *   skeleton that stops compiling the moment a second adapter is
 *   wired as `Arc<dyn Port>`. The kernel ships a `BoxFuture` alias
 *   and every port returns one.
 *
 * **What Rust's seam does *not* hold**, and the templates say so at
 * the point it would be violated: the crate graph stops a consumer
 * *naming* a crate it has no edge to, but not domain types *flowing*
 * across the seam. A gateway with no dependency on
 * `<ctx>-domain-contract` can hold a domain value returned through
 * the service crate's public API and read its fields — inference
 * supplies the type the consumer cannot write. The rule "the seam
 * carries only the service crate's own DTOs" is therefore a
 * convention here, not a compiler guarantee, unlike the JVM (where
 * build scope holds it) or Go (where unnameability does). The
 * upgrade path is two lines the day `public-dependency` stabilises;
 * see `docs/stacks/rust.md`.
 *
 * **Three spellings, one derivation.** A crate directory
 * `modules/ordering/user-side/service` is the package
 * `ordering-user-side-service` in the workspace member list and in a
 * `[dependencies]` key, and the identifier
 * `ordering_user_side_service` in a `use` statement. Templates
 * receive all three finished and never derive one — the same
 * discipline `goLayout` applies to import paths, for the same reason.
 *
 * **And one relative depth.** Every `[dependencies]` entry in a path
 * workspace carries a `path = "../../.."` chain whose length is a
 * function of both crates' depths. That is the JVM's `upToRoot` bug
 * with a new spelling; {@link RustCrate.pathFrom} derives it, and the
 * unit tests pin it, so no template ever counts `../` by hand.
 */

import path from 'node:path';
import type { Tag } from '../../contract/composition.js';
import {
  type ModuleLayout,
  moduleLayoutOf,
  PEER_CONTEXT_TAG,
  PEER_MODULE,
  SKELETON_MODULE,
} from './module-layout.js';

export { moduleLayoutOf as rustModuleLayout } from './module-layout.js';

/** Directory of the workspace's shared kernel crate. */
const KERNEL_DIR = 'platform/kernel';

/** Directory prefix every bounded context lives under. */
const MODULES_PREFIX = 'modules';

/** Directory prefix every runnable assembly lives under. */
const APPLICATION_PREFIX = 'application';

/** Converts a Cargo package name to the identifier `use` spells it with. */
export function toCrateIdent(name: string): string {
  return name.replace(/-/g, '_');
}

/**
 * The Cargo package name of the crate rooted at `dir`.
 *
 * Every path segment joined with `-`, except that a leading
 * `modules/` is dropped: it is a filing convention rather than part
 * of any context's identity, and keeping it would prefix a third of
 * the workspace with the same dead word. So
 * `modules/ordering/user-side/service` is `ordering-user-side-service`
 * while `platform/kernel` is `platform-kernel`.
 */
export function toCrateName(dir: string): string {
  const segments = dir.split('/').filter((s) => s.length > 0);
  const significant = segments[0] === MODULES_PREFIX ? segments.slice(1) : segments;
  return significant.join('-');
}

/** One crate of the emitted project, in all three of its spellings. */
export interface RustCrate {
  /**
   * Project-relative directory holding this crate's `Cargo.toml`,
   * posix separators. Empty for the single crate of a `basic`
   * project, which is the project root.
   */
  readonly dir: string;
  /** Cargo package name — the `[dependencies]` key and member entry. */
  readonly name: string;
  /** Rust identifier — how a `use` statement spells {@link name}. */
  readonly ident: string;
  /** Project-relative path of this crate's manifest. */
  readonly manifest: string;
  /** Project-relative path of `rel` inside this crate's `src/`. */
  src(rel: string): string;
  /**
   * The `path =` value a dependency entry in `from` needs to reach
   * this crate — the `../`-chain whose depth moves with both crates'
   * positions, and the one derivation a template must never do by
   * hand. Always posix, even on Windows, because Cargo manifests are
   * read on every platform.
   */
  pathFrom(from: RustCrate): string;
}

/**
 * The crate rooted at `dir`, named after it unless `name` says
 * otherwise.
 *
 * The override exists for exactly one crate: the single package of a
 * `basic` project, which is rooted at `''` and so has no path
 * segments to derive a name from. Its name is the project's own — the
 * one the user answered — and deriving it would silently produce the
 * empty string.
 */
function crateAt(dir: string, name: string = toCrateName(dir)): RustCrate {
  return {
    dir,
    name,
    ident: toCrateIdent(name),
    manifest: dir === '' ? 'Cargo.toml' : `${dir}/Cargo.toml`,
    src: (rel) => (dir === '' ? `src/${rel}` : `${dir}/src/${rel}`),
    pathFrom: (from) => toPosix(path.relative(from.dir, dir)),
  };
}

function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

/**
 * One logical part of the hexagon, resolved to the crate that holds
 * it and the directory its sources sit in.
 *
 * Under `basic` several units share the single crate and are told
 * apart by their directory (`src/domain.rs` vs `src/infra/`); under
 * the modulith each is its own crate and its directory is that
 * crate's `src/`. Adapters ask for a unit and read paths off it
 * rather than branching on the layout themselves.
 */
export interface RustUnit {
  /** The crate this unit's code compiles into. */
  readonly crate: RustCrate;
  /**
   * Project-relative path of the unit's own root source file —
   * `src/domain.rs` for the `basic` contract face, the crate's
   * `src/lib.rs` under the modulith.
   */
  readonly rootFile: string;
  /**
   * Project-relative path of a submodule of this unit.
   * `contract.moduleFile('greet')` is `src/domain/greet.rs` under
   * `basic` and `modules/greeting/domain/contract/src/greet.rs`
   * under the modulith.
   */
  moduleFile(name: string): string;
  /**
   * How code in *another* crate names this unit's items — the crate
   * identifier under the modulith, `<crate>::<module>` under `basic`
   * where there is only one crate to import from.
   */
  readonly usePath: string;
}

function unitInRoot(crate: RustCrate, module: string): RustUnit {
  return {
    crate,
    rootFile: crate.src(`${module}.rs`),
    moduleFile: (name) => crate.src(`${module}/${name}.rs`),
    usePath: `${crate.ident}::${module}`,
  };
}

function unitAsCrate(crate: RustCrate): RustUnit {
  return {
    crate,
    rootFile: crate.src('lib.rs'),
    moduleFile: (name) => crate.src(`${name}.rs`),
    usePath: crate.ident,
  };
}

/** Where each part of a Rust project lives, and what it is called. */
export interface RustLayoutPaths {
  readonly layout: ModuleLayout;
  /**
   * Whether the project root is a Cargo **workspace** rather than a
   * single package. True under the modulith and only there — the
   * property that decides whether `Cargo.toml` carries `[workspace]`
   * or `[package]`.
   */
  readonly workspace: boolean;
  /**
   * Every crate the workspace declares as a member, in the order the
   * member list should spell them: kernel, then each context's
   * crates, then the assemblies. Empty under `basic`, which has no
   * workspace to list members of.
   */
  readonly members: readonly RustCrate[];
  /**
   * The shared kernel — `BoxFuture` and the ubiquitous ports no
   * bounded context owns. Its own crate under the modulith; under
   * `basic` there is nowhere else to put it, so it is the single
   * crate's `src/platform.rs`.
   */
  readonly kernel: RustUnit;
  /** The context's contract face: commands, ports, factories. */
  readonly contract: RustUnit;
  /** The core behind it, reachable only through the contract face. */
  readonly core: RustUnit;
  /**
   * The peer seam: the only crate a *foreign* context may depend on,
   * and the one whose public API must mention nothing but its own
   * DTOs. Collapses onto {@link contract} under `basic`, which has a
   * single hexagon and therefore no seam to cross.
   */
  readonly service: RustUnit;
  /** A driven (secondary) adapter, e.g. `infra('clock_fake')`. */
  infra(tech: string): RustUnit;
  /** A driving (primary) adapter belonging to a context. */
  userSide(name: string): RustUnit;
  /**
   * A deployment unit's assembly. Under `basic` this is a
   * `src/bin/<typology>/` directory of the single crate; under the
   * modulith it is a crate of its own under `application/`.
   */
  assembly(typology: string): RustUnit;
  /**
   * The binary a deployment unit produces. Deliberately *not*
   * layout-dependent: `skel` and `skel-http` whichever dial the user
   * turned, because renaming somebody's binary is not a structural
   * choice and nothing about the modulith requires it.
   */
  binName(typology: string): string;
  /** The crate rooted at `dir`, for callers holding a path already. */
  crateAt(dir: string): RustCrate;
  /** The context directory of a peer, e.g. `modules/guestbook`. */
  peerCrate(context: string, ...segments: readonly string[]): RustCrate;
}

/** The typology whose binary keeps the bare project name. */
const PRIMARY_TYPOLOGY = 'cli';

/**
 * Resolves the layout-dependent crate names, directories and source
 * paths from a manifest tag set and the project's name. Every Rust
 * adapter that writes or patches outside its own template tree goes
 * through this rather than naming a directory or spelling a crate.
 */
export function rustLayout(tags: readonly Tag[], projectName: string): RustLayoutPaths {
  const layout = moduleLayoutOf(tags);
  const binName = (typology: string): string =>
    typology === PRIMARY_TYPOLOGY ? projectName : `${projectName}-${typology}`;
  if (layout === 'basic') {
    const root = crateAt('', projectName);
    const contract = unitInRoot(root, 'domain');
    return {
      layout,
      workspace: false,
      members: [],
      kernel: unitInRoot(root, 'platform'),
      contract,
      // The core is a private module of the contract face here; its
      // `usePath` is the sibling-module spelling `domain::greet`,
      // which only `src/domain.rs` itself may write.
      core: {
        crate: root,
        rootFile: root.src('domain/greet.rs'),
        moduleFile: (name) => root.src(`domain/${name}.rs`),
        usePath: `${root.ident}::domain`,
      },
      service: contract,
      infra: (tech) => ({
        crate: root,
        rootFile: root.src(`infra/${tech}.rs`),
        moduleFile: (name) => root.src(`infra/${tech}/${name}.rs`),
        usePath: `${root.ident}::infra::${tech}`,
      }),
      userSide: (name) => ({
        crate: root,
        rootFile: root.src(`app/${name}.rs`),
        moduleFile: (sub) => root.src(`app/${name}/${sub}.rs`),
        usePath: `${root.ident}::app::${name}`,
      }),
      assembly: (typology) => ({
        crate: root,
        rootFile: root.src(`bin/${typology}/main.rs`),
        moduleFile: (name) => root.src(`bin/${typology}/${name}.rs`),
        usePath: root.ident,
      }),
      binName,
      crateAt,
      peerCrate: (context, ...segments) =>
        crateAt([MODULES_PREFIX, context, ...segments].join('/')),
    };
  }
  const context = `${MODULES_PREFIX}/${SKELETON_MODULE}`;
  const kernel = crateAt(KERNEL_DIR);
  const contract = crateAt(`${context}/domain/contract`);
  const core = crateAt(`${context}/domain/core`);
  const service = crateAt(`${context}/user-side/service`);
  const infra = (tech: string): RustCrate => crateAt(`${context}/infra/${tech}`);
  const userSide = (name: string): RustCrate => crateAt(`${context}/user-side/${name}`);
  const assembly = (typology: string): RustCrate => crateAt(`${APPLICATION_PREFIX}/${typology}`);
  return {
    layout,
    workspace: true,
    members: [kernel, contract, core, service],
    kernel: unitAsCrate(kernel),
    contract: unitAsCrate(contract),
    core: unitAsCrate(core),
    service: unitAsCrate(service),
    infra: (tech) => unitAsCrate(infra(tech)),
    userSide: (name) => unitAsCrate(userSide(name)),
    assembly: (typology) => ({
      ...unitAsCrate(assembly(typology)),
      rootFile: assembly(typology).src('main.rs'),
    }),
    binName,
    crateAt,
    peerCrate: (peer, ...segments) => crateAt([MODULES_PREFIX, peer, ...segments].join('/')),
  };
}

/**
 * Whether the manifest opted into the second bounded context. The
 * peer only exists under the modulith — `new-project` rejects the
 * flag otherwise — so this is a tag read, not a layout decision.
 */
export function hasPeerContext(tags: readonly Tag[]): boolean {
  return tags.includes(PEER_CONTEXT_TAG);
}

/**
 * The peer context's crates, named the same way the skeleton's are.
 *
 * The peer exists to make the seam *demonstrable* rather than merely
 * present: `guestbook` needs a welcome to record, `greeting` is the
 * context that produces one, and the only edge between them runs
 * through `greeting-user-side-service`. A gateway crate under
 * `modules/guestbook/infra/` is where that edge is declared, and its
 * `Cargo.toml` is the file a reviewer checks — it must list the
 * service crate and must not list `greeting-domain-contract`.
 */
export function rustPeerCrates(layout: RustLayoutPaths): {
  readonly contract: RustUnit;
  readonly core: RustUnit;
  readonly gateway: RustUnit;
} {
  const peer = (...segments: readonly string[]): RustUnit =>
    unitAsCrate(layout.peerCrate(PEER_MODULE, ...segments));
  return {
    contract: peer('domain', 'contract'),
    core: peer('domain', 'core'),
    gateway: peer('infra', `${SKELETON_MODULE}-gateway`),
  };
}

/**
 * The template variables every Rust tree needs: the crate spellings a
 * template would otherwise derive, and the binary names that must not
 * move with the layout. Templates never turn a directory into a crate
 * name — that is what makes the layout a one-line change here rather
 * than a sweep through the trees.
 */
export function rustTemplateVars(
  paths: RustLayoutPaths,
  projectName: string,
): Readonly<Record<string, string>> {
  return {
    projectName,
    crateName: paths.contract.crate.name,
    crateIdent: paths.contract.crate.ident,
    contractUse: paths.contract.usePath,
    kernelCrate: paths.kernel.crate.name,
    kernelUse: paths.kernel.usePath,
    serviceCrate: paths.service.crate.name,
    serviceUse: paths.service.usePath,
  };
}
