/**
 * The JVM **module layout** dial — the second structural choice a JVM
 * project makes, beside its build system.
 *
 * Two layouts are supported, selected by a `layout.*` capability tag
 * the stack seeds at `keel new` time:
 *
 * - **`basic`** (`layout.basic`) — the flat trisection: one
 *   `domain/` (kernel + contract + core) and one `application/` per
 *   entrypoint. The right shape while the service holds a single
 *   bounded context.
 * - **`modulith`** (`layout.modulith`) — one hexagon per bounded
 *   context under `modules/<context>/`, shared plumbing under
 *   `platform/`, and one runnable assembly per delivery typology
 *   under `application/`. Modules meet only at
 *   `user-side/service`, which is what makes carving a context out
 *   into its own service a wiring change.
 *
 * Adapters never hard-code a directory: they call {@link jvmLayout}
 * with the manifest's tags and read the module paths and package
 * segments from the result, so one set of templates serves both
 * layouts wherever the *content* is identical. A manifest with
 * neither tag — every project scaffolded before the dial existed —
 * resolves to `basic`, so brownfield `keel add` keeps working.
 *
 * Not to be confused with the composite-stack **repository** layout
 * (`monorepo`/`polyrepo`), which decides how sibling *services* live
 * in version control and is deliberately not a tag.
 */

import type { Tag } from '../../contract/composition.js';

/** Module layouts the JVM template trees ship for. */
export type JvmModuleLayout = 'basic' | 'modulith';

/** Capability tag seeding the flat trisection. */
export const BASIC_LAYOUT_TAG: Tag = 'layout.basic';

/** Capability tag seeding the modulith. */
export const MODULITH_LAYOUT_TAG: Tag = 'layout.modulith';

/**
 * The bounded context the walking skeleton scaffolds under the
 * modulith. One module is enough to establish the shape; the second
 * one is the user's first real design decision.
 */
export const SKELETON_MODULE = 'greeting';

/**
 * Where each part of a JVM project lives, and under which package,
 * for one module layout. Directories are project-relative with
 * posix separators; package fields are the segment appended to the
 * project's `basePackage`.
 */
export interface JvmLayoutPaths {
  readonly layout: JvmModuleLayout;
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
}

const BASIC: Omit<JvmLayoutPaths, 'infra' | 'infraPkg' | 'gradleProject'> = {
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

const MODULITH: Omit<JvmLayoutPaths, 'infra' | 'infraPkg' | 'gradleProject'> = {
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

/** Resolves the JVM module layout from a manifest tag set. */
export function jvmModuleLayout(tags: readonly Tag[]): JvmModuleLayout {
  return tags.includes(MODULITH_LAYOUT_TAG) ? 'modulith' : 'basic';
}

/**
 * Resolves the layout-dependent module paths and packages from a
 * manifest tag set. Every JVM adapter that writes outside its own
 * template tree goes through this rather than naming a directory.
 */
export function jvmLayout(tags: readonly Tag[]): JvmLayoutPaths {
  const base = jvmModuleLayout(tags) === 'modulith' ? MODULITH : BASIC;
  const infraRoot = base.layout === 'modulith' ? `${MODULE_ROOT}/infra` : 'infrastructure';
  const infraPkgRoot = base.layout === 'modulith' ? `${SKELETON_MODULE}.infra` : 'infrastructure';
  return {
    ...base,
    infra: (name) => `${infraRoot}/${name}`,
    infraPkg: (name) => `${infraPkgRoot}.${name}`,
    gradleProject,
  };
}
