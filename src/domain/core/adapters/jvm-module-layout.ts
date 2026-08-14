/**
 * The JVM half of the **module layout** dial: where each layout puts
 * a JVM project's modules, and under which package.
 *
 * The dial itself — the two layout names, the `layout.*` tags, the
 * context names, the selectable options — is language-neutral and
 * lives in [`module-layout.ts`](./module-layout.ts). This file is one
 * of its per-language resolvers, and the first: `jvmLayout` maps a
 * manifest's tags to the twelve JVM stacks' module paths, package
 * segments, Gradle project paths and Maven artifact ids.
 *
 * Under **`basic`** that is one `domain/` (kernel + contract + core)
 * and one `application/` per entrypoint; under **`modulith`**, one
 * hexagon per bounded context under `modules/<context>/`, shared
 * plumbing under `platform/`, and one runnable assembly per delivery
 * typology under `application/`.
 *
 * Adapters never hard-code a directory: they call {@link jvmLayout}
 * with the manifest's tags and read the module paths and package
 * segments from the result, so one set of templates serves both
 * layouts wherever the *content* is identical.
 */

import type { Tag } from '../../contract/composition.js';
import { type ModuleLayout, moduleLayoutOf, SKELETON_MODULE } from './module-layout.js';

export {
  BASIC_LAYOUT_TAG,
  MODULITH_LAYOUT_TAG,
  PEER_CONTEXT_TAG,
  PEER_MODULE,
  SKELETON_MODULE,
} from './module-layout.js';

/**
 * Where each part of a JVM project lives, and under which package,
 * for one module layout. Directories are project-relative with
 * posix separators; package fields are the segment appended to the
 * project's `basePackage`.
 */
export interface JvmLayoutPaths {
  readonly layout: ModuleLayout;
  /** Dispatch vocabulary: `Command`, `Handler`, `Mediator`, `DomainHandler`. */
  readonly kernel: string;
  readonly kernelPkg: string;
  /** The hexagon's contract face: ports, commands, domain errors. */
  readonly domainContract: string;
  readonly domainContractPkg: string;
  /** The hexagon's implementation face: handlers, entities. */
  readonly domainCore: string;
  readonly domainCorePkg: string;
  /** Published transport contract of the HTTP adapter (DTOs, OpenAPI). */
  readonly restContract: string;
  readonly restContractPkg: string;
  /** The HTTP driving adapter — resources, mappers, DTO↔command mapping. */
  readonly restAdapters: string;
  readonly restAdaptersPkg: string;
  /**
   * The runnable HTTP deployment unit: main class, composition root,
   * runtime configuration, Dockerfile. Equal to {@link restAdapters}
   * under `basic`, where adapter and assembly are one module.
   */
  readonly restRuntime: string;
  readonly restRuntimePkg: string;
  /** The runnable CLI deployment unit. */
  readonly cliRuntime: string;
  readonly cliRuntimePkg: string;
  /**
   * The in-process driving adapter a peer module consumes. Absent
   * under `basic`, which has no peers to compose with.
   */
  readonly service: string | null;
  readonly servicePkg: string | null;
  /** Directory of a driven adapter, e.g. `infra('clock/fake')`. */
  infra(name: string): string;
  /** Package of a driven adapter, e.g. `infraPkg('clock.fake')`. */
  infraPkg(name: string): string;
  /** Gradle project path of a module directory, e.g. `:domain:core`. */
  gradleProject(dir: string): string;
  /**
   * Maven artifactId of a module directory, e.g. `domain-core` under
   * `basic` and `greeting-domain-core` under the modulith. The
   * `modules/` prefix is dropped — it is scaffolding, not identity —
   * so a context's artifacts read as `<context>-<path>`.
   */
  mavenArtifact(dir: string): string;
  /**
   * Relative path from a module directory back to the project root,
   * e.g. `../../` for `application/api`. Maven `<relativePath>` and
   * the `filesystem:` migration locations both need it, and both get
   * it wrong by hand.
   */
  upToRoot(dir: string): string;
}

type LayoutBase = Omit<
  JvmLayoutPaths,
  'infra' | 'infraPkg' | 'gradleProject' | 'mavenArtifact' | 'upToRoot'
>;

const BASIC: LayoutBase = {
  layout: 'basic',
  kernel: 'domain/kernel',
  kernelPkg: 'kernel',
  domainContract: 'domain/contract',
  domainContractPkg: 'contract',
  domainCore: 'domain/core',
  domainCorePkg: 'core',
  restContract: 'application/rest/contract',
  restContractPkg: 'rest.contract',
  restAdapters: 'application/rest/executable',
  restAdaptersPkg: 'rest',
  restRuntime: 'application/rest/executable',
  restRuntimePkg: 'rest',
  cliRuntime: 'application/cli',
  cliRuntimePkg: 'cli',
  service: null,
  servicePkg: null,
};

const MODULE_ROOT = `modules/${SKELETON_MODULE}`;

const MODULITH: LayoutBase = {
  layout: 'modulith',
  kernel: 'platform/kernel',
  kernelPkg: 'platform.kernel',
  domainContract: `${MODULE_ROOT}/domain/contract`,
  domainContractPkg: `${SKELETON_MODULE}.domain.contract`,
  domainCore: `${MODULE_ROOT}/domain/core`,
  domainCorePkg: `${SKELETON_MODULE}.domain.core`,
  restContract: `${MODULE_ROOT}/user-side/api/contract`,
  restContractPkg: `${SKELETON_MODULE}.userside.api.contract`,
  restAdapters: `${MODULE_ROOT}/user-side/api/adapters`,
  restAdaptersPkg: `${SKELETON_MODULE}.userside.api`,
  restRuntime: 'application/api',
  restRuntimePkg: 'application.api',
  cliRuntime: 'application/cli',
  cliRuntimePkg: 'application.cli',
  service: `${MODULE_ROOT}/user-side/service`,
  servicePkg: `${SKELETON_MODULE}.userside.service`,
};

/** Gradle project path of a module directory, e.g. `:modules:greeting:infra:clock:fake`. */
export function gradleProject(dir: string): string {
  return `:${dir.split('/').join(':')}`;
}

/** Maven artifactId of a module directory, e.g. `greeting-infra-clock-fake`. */
export function mavenArtifact(dir: string): string {
  return dir
    .replace(/^modules\//, '')
    .split('/')
    .join('-');
}

/** Relative path from a module directory back to the project root. */
export function upToRoot(dir: string): string {
  return '../'.repeat(dir.split('/').length);
}

/**
 * Resolves the module layout from a manifest tag set — the JVM
 * spelling of {@link moduleLayoutOf}, re-exported here so a JVM
 * adapter needs one import to get both the layout and its paths.
 */
export function jvmModuleLayout(tags: readonly Tag[]): ModuleLayout {
  return moduleLayoutOf(tags);
}

/**
 * Resolves the layout-dependent module paths and packages from a
 * manifest tag set. Every JVM adapter that writes outside its own
 * template tree goes through this rather than naming a directory.
 */
export function jvmLayout(tags: readonly Tag[]): JvmLayoutPaths {
  const base = jvmModuleLayout(tags) === 'modulith' ? MODULITH : BASIC;
  const infraRoot = base.layout === 'modulith' ? `${MODULE_ROOT}/infra` : 'infrastructure';
  // Under `basic` the driven adapters sit directly under the base
  // package — the `infrastructure/` directory is a build-module name,
  // never a package segment. The modulith does name it, because a
  // context's adapters have to be distinguishable from its peers'.
  const infraPkgRoot = base.layout === 'modulith' ? `${SKELETON_MODULE}.infra.` : '';
  return {
    ...base,
    infra: (name) => `${infraRoot}/${name}`,
    infraPkg: (name) => `${infraPkgRoot}${name}`,
    gradleProject,
    mavenArtifact,
    upToRoot,
  };
}
