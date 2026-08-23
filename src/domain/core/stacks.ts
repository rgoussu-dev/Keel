/**
 * Stack registry.
 *
 * A `Stack` is a curated combination of capability tags and verticals
 * that produces a coherent greenfield project: pick one with
 * `keel new --stack=<id>` and the engine resolves everything from
 * there. Stacks are sugar — they don't add expressive power that the
 * underlying composition layer doesn't already have, they just spare
 * the user from naming every tag and vertical by hand.
 *
 * Adding a stack: append an entry to `STACKS` whose `tags` and
 * `verticals` describe the desired starting point. The verticals run
 * in array order; if order matters across them (e.g. `vcs` should
 * run before `walking-skeleton` so the project is a repo before
 * files land), reflect that here.
 *
 * A **composite stack** declares `services` instead of scaffolding in
 * place: each service is a full stack installed into its own
 * subdirectory (own tree, own manifest), and every service resolves
 * with its siblings' `projects` tags in scope as `peers` — so
 * peer-conditional adapters (an HTTP gateway in a frontend, a CORS
 * patch in a backend) are selected by the ordinary predicate
 * machinery. A composite stack's own `verticals` run at the product
 * root under the monorepo layout (and are skipped under polyrepo,
 * where no shared root exists).
 */

import { codeStyleVertical } from './verticals/code-style.js';
import { fullstackVertical } from './verticals/fullstack.js';
import { devContainerVertical } from './verticals/dev-container.js';
import { devEnvVertical } from './verticals/dev-env.js';
import { observabilityVertical } from './verticals/observability.js';
import { gatewayVertical } from './verticals/gateway.js';
import { vcsVertical } from './verticals/vcs.js';
import { walkingSkeletonVertical } from './verticals/walking-skeleton.js';
import { MODULE_LAYOUTS, type ModuleLayoutOption } from './adapters/module-layout.js';
import { assemblyRefusal } from './compatibility.js';
import type { Conflict, Tag, Vertical } from '../contract/composition.js';

/**
 * One selectable build system of a stack. The choice folds a `pkg.*`
 * capability tag into the manifest at install time; everything else
 * (which build-tool adapter fires, which build-file trees render) is
 * ordinary predicate machinery reading that tag.
 */
export interface BuildSystemOption {
  /** User-facing id, e.g. `gradle`, `maven`, `npm`, `pnpm`. */
  readonly id: string;
  /** The `pkg.*` tag the choice contributes. */
  readonly tag: Tag;
  /** One-line label shown as the interactive choice. */
  readonly label: string;
  /** Longer help text for the interactive prompt. */
  readonly doc: string;
}

/** Gradle as a selectable JVM build system. */
export const GRADLE_BUILD: BuildSystemOption = {
  id: 'gradle',
  tag: 'pkg.gradle',
  label: 'Gradle — incremental task-graph build (Kotlin DSL)',
  doc: 'Task DAG with incremental builds and caching; build scripts are code.',
};

/** Maven as a selectable JVM build system. */
export const MAVEN_BUILD: BuildSystemOption = {
  id: 'maven',
  tag: 'pkg.maven',
  label: 'Maven — convention-first declarative build (POM)',
  doc: 'Fixed lifecycle and declarative POMs; the conservative, predictable choice.',
};

/** npm as a selectable TypeScript workspace package manager. */
export const NPM_BUILD: BuildSystemOption = {
  id: 'npm',
  tag: 'pkg.npm',
  label: 'npm — the package manager bundled with Node',
  doc: 'Zero extra install; hoisted workspaces with the classic flat node_modules.',
};

/** pnpm as a selectable TypeScript workspace package manager. */
export const PNPM_BUILD: BuildSystemOption = {
  id: 'pnpm',
  tag: 'pkg.pnpm',
  label: 'pnpm — fast, strict, content-addressed installs',
  doc: 'Symlinked strict node_modules (no phantom dependencies) and workspace: protocol.',
};

/**
 * Every selectable build system, keyed by id — the lookup a stack
 * preset resolves `buildSystems: ["gradle", "maven"]` through.
 *
 * Flat across families on purpose: nothing stops a preset naming
 * `gradle` and `pnpm` together, and the thing that would make that
 * assembly illegal is a {@link Conflict}, declared by the piece that
 * owns the rule — never a partitioned table here.
 */
export const BUILD_SYSTEMS: Readonly<Record<string, BuildSystemOption>> = Object.freeze(
  Object.fromEntries(
    [GRADLE_BUILD, MAVEN_BUILD, NPM_BUILD, PNPM_BUILD].map((option) => [option.id, option]),
  ),
);

/** Returns the build system registered under `id`, or null if absent. */
export function getBuildSystem(id: string): BuildSystemOption | null {
  return BUILD_SYSTEMS[id] ?? null;
}

/** One service of a composite stack. */
export interface StackService {
  /** Directory the service is scaffolded into, relative to cwd. */
  readonly path: string;
  /** Id of the (non-composite) stack the service is built from. */
  readonly stack: string;
  /**
   * Verticals installed on top of the service stack's own list —
   * typically `gateway`, whose adapters only fire when peer tags are
   * in scope.
   */
  readonly extraVerticals?: readonly Vertical[];
}

/** A curated greenfield preset. */
export interface Stack {
  readonly id: string;
  readonly description: string;
  /** Capability tags this stack contributes to the manifest at install time. */
  readonly tags: readonly Tag[];
  /**
   * Build systems this stack can be scaffolded on; the first entry is
   * the default. Stacks declaring this omit the `pkg.*` tag from
   * `tags` — the install handler folds the chosen option's tag in.
   * Absent when the stack's `tags` already pin its only build system.
   */
  readonly buildSystems?: readonly BuildSystemOption[];
  /**
   * Module layouts this stack can be scaffolded on; the first entry
   * is the default. Stacks declaring this omit the `layout.*` tag
   * from `tags` — the install handler folds the chosen option's tag
   * in. Absent for stacks that ship a single layout, whose adapters
   * then resolve to `basic`.
   */
  readonly moduleLayouts?: readonly ModuleLayoutOption[];
  /** Verticals to install, in order. */
  readonly verticals: readonly Vertical[];
  /**
   * Peer tags this stack projects onto sibling services when composed
   * into a product (e.g. `peer.api.rest` for a REST backend). Declared
   * explicitly — never derived — so the tag vocabulary stays greppable.
   */
  readonly projects?: readonly Tag[];
  /** Present on composite stacks: the services to scaffold. */
  readonly services?: readonly StackService[];
  /**
   * Incompatibilities this preset's own combination of dials creates
   * — a build system its module layout cannot take, a capability its
   * framework will not carry.
   *
   * A stack's rules and a vertical's are read together, because an
   * assembly is the pieces coming together and neither piece alone
   * knows the whole of it. Declared here rather than centrally so a
   * preset arriving from outside this file brings its own. @see Conflict
   */
  readonly conflicts?: readonly Conflict[];
}

export const STACKS: Readonly<Record<string, Stack>> = {
  'quarkus-cli': {
    id: 'quarkus-cli',
    description: 'Quarkus 3 CLI (Java 25), hexagonal layout; Gradle or Maven.',
    tags: ['lang.java', 'runtime.jvm', 'framework.quarkus', 'arch.hexagonal', 'arch.cli'],
    buildSystems: [GRADLE_BUILD, MAVEN_BUILD],
    moduleLayouts: MODULE_LAYOUTS,
    verticals: [vcsVertical, walkingSkeletonVertical, codeStyleVertical, devContainerVertical],
  },
  'quarkus-rest': {
    id: 'quarkus-rest',
    description: 'Quarkus 3 REST service (Java 25), hexagonal layout; Gradle or Maven.',
    tags: ['lang.java', 'runtime.jvm', 'framework.quarkus', 'arch.hexagonal', 'arch.server-http'],
    buildSystems: [GRADLE_BUILD, MAVEN_BUILD],
    moduleLayouts: MODULE_LAYOUTS,
    verticals: [
      vcsVertical,
      walkingSkeletonVertical,
      codeStyleVertical,
      devEnvVertical,
      observabilityVertical,
      devContainerVertical,
    ],
    projects: ['peer.api.rest'],
  },
  'quarkus-cli-kotlin': {
    id: 'quarkus-cli-kotlin',
    description: 'Quarkus 3 CLI (Kotlin, JVM 25), hexagonal layout; Gradle or Maven.',
    tags: ['lang.kotlin', 'runtime.jvm', 'framework.quarkus', 'arch.hexagonal', 'arch.cli'],
    buildSystems: [GRADLE_BUILD, MAVEN_BUILD],
    moduleLayouts: MODULE_LAYOUTS,
    verticals: [vcsVertical, walkingSkeletonVertical, codeStyleVertical, devContainerVertical],
  },
  'quarkus-rest-kotlin': {
    id: 'quarkus-rest-kotlin',
    description: 'Quarkus 3 REST service (Kotlin, JVM 25), hexagonal layout; Gradle or Maven.',
    tags: ['lang.kotlin', 'runtime.jvm', 'framework.quarkus', 'arch.hexagonal', 'arch.server-http'],
    buildSystems: [GRADLE_BUILD, MAVEN_BUILD],
    moduleLayouts: MODULE_LAYOUTS,
    verticals: [
      vcsVertical,
      walkingSkeletonVertical,
      codeStyleVertical,
      devEnvVertical,
      observabilityVertical,
      devContainerVertical,
    ],
    projects: ['peer.api.rest'],
  },
  'quarkus-cli-rest': {
    id: 'quarkus-cli-rest',
    description:
      'Quarkus 3 CLI + REST service (Java 25), one hexagon with both entrypoints; Gradle or Maven; basic or modulith layout.',
    tags: [
      'lang.java',
      'runtime.jvm',
      'framework.quarkus',
      'arch.hexagonal',
      'arch.cli',
      'arch.server-http',
    ],
    buildSystems: [GRADLE_BUILD, MAVEN_BUILD],
    moduleLayouts: MODULE_LAYOUTS,
    verticals: [
      vcsVertical,
      walkingSkeletonVertical,
      codeStyleVertical,
      devEnvVertical,
      observabilityVertical,
      devContainerVertical,
    ],
    projects: ['peer.api.rest'],
  },
  'quarkus-cli-rest-kotlin': {
    id: 'quarkus-cli-rest-kotlin',
    description:
      'Quarkus 3 CLI + REST service (Kotlin, JVM 25), one hexagon with both entrypoints; Gradle or Maven; basic or modulith layout.',
    tags: [
      'lang.kotlin',
      'runtime.jvm',
      'framework.quarkus',
      'arch.hexagonal',
      'arch.cli',
      'arch.server-http',
    ],
    buildSystems: [GRADLE_BUILD, MAVEN_BUILD],
    moduleLayouts: MODULE_LAYOUTS,
    verticals: [
      vcsVertical,
      walkingSkeletonVertical,
      codeStyleVertical,
      devEnvVertical,
      observabilityVertical,
      devContainerVertical,
    ],
    projects: ['peer.api.rest'],
  },
  'spring-cli': {
    id: 'spring-cli',
    description: 'Spring Boot 4 CLI (Java 25, picocli), hexagonal layout; Gradle or Maven.',
    tags: ['lang.java', 'runtime.jvm', 'framework.spring', 'arch.hexagonal', 'arch.cli'],
    buildSystems: [GRADLE_BUILD, MAVEN_BUILD],
    moduleLayouts: MODULE_LAYOUTS,
    verticals: [vcsVertical, walkingSkeletonVertical, codeStyleVertical, devContainerVertical],
  },
  'spring-rest': {
    id: 'spring-rest',
    description: 'Spring Boot 4 REST service (Java 25), hexagonal layout; Gradle or Maven.',
    tags: ['lang.java', 'runtime.jvm', 'framework.spring', 'arch.hexagonal', 'arch.server-http'],
    buildSystems: [GRADLE_BUILD, MAVEN_BUILD],
    moduleLayouts: MODULE_LAYOUTS,
    verticals: [
      vcsVertical,
      walkingSkeletonVertical,
      codeStyleVertical,
      devEnvVertical,
      observabilityVertical,
      devContainerVertical,
    ],
    projects: ['peer.api.rest'],
  },
  'spring-cli-kotlin': {
    id: 'spring-cli-kotlin',
    description: 'Spring Boot 4 CLI (Kotlin, JVM 25, picocli), hexagonal layout; Gradle or Maven.',
    tags: ['lang.kotlin', 'runtime.jvm', 'framework.spring', 'arch.hexagonal', 'arch.cli'],
    buildSystems: [GRADLE_BUILD, MAVEN_BUILD],
    moduleLayouts: MODULE_LAYOUTS,
    verticals: [vcsVertical, walkingSkeletonVertical, codeStyleVertical, devContainerVertical],
  },
  'spring-rest-kotlin': {
    id: 'spring-rest-kotlin',
    description: 'Spring Boot 4 REST service (Kotlin, JVM 25), hexagonal layout; Gradle or Maven.',
    tags: ['lang.kotlin', 'runtime.jvm', 'framework.spring', 'arch.hexagonal', 'arch.server-http'],
    buildSystems: [GRADLE_BUILD, MAVEN_BUILD],
    moduleLayouts: MODULE_LAYOUTS,
    verticals: [
      vcsVertical,
      walkingSkeletonVertical,
      codeStyleVertical,
      devEnvVertical,
      observabilityVertical,
      devContainerVertical,
    ],
    projects: ['peer.api.rest'],
  },
  'spring-cli-rest': {
    id: 'spring-cli-rest',
    description:
      'Spring Boot 4 CLI + REST service (Java 25), one hexagon with both entrypoints; Gradle or Maven; basic or modulith layout.',
    tags: [
      'lang.java',
      'runtime.jvm',
      'framework.spring',
      'arch.hexagonal',
      'arch.cli',
      'arch.server-http',
    ],
    buildSystems: [GRADLE_BUILD, MAVEN_BUILD],
    moduleLayouts: MODULE_LAYOUTS,
    verticals: [
      vcsVertical,
      walkingSkeletonVertical,
      codeStyleVertical,
      devEnvVertical,
      observabilityVertical,
      devContainerVertical,
    ],
    projects: ['peer.api.rest'],
  },
  'spring-cli-rest-kotlin': {
    id: 'spring-cli-rest-kotlin',
    description:
      'Spring Boot 4 CLI + REST service (Kotlin, JVM 25), one hexagon with both entrypoints; Gradle or Maven; basic or modulith layout.',
    tags: [
      'lang.kotlin',
      'runtime.jvm',
      'framework.spring',
      'arch.hexagonal',
      'arch.cli',
      'arch.server-http',
    ],
    buildSystems: [GRADLE_BUILD, MAVEN_BUILD],
    moduleLayouts: MODULE_LAYOUTS,
    verticals: [
      vcsVertical,
      walkingSkeletonVertical,
      codeStyleVertical,
      devEnvVertical,
      observabilityVertical,
      devContainerVertical,
    ],
    projects: ['peer.api.rest'],
  },
  'micronaut-cli': {
    id: 'micronaut-cli',
    description: 'Micronaut 4 CLI (Java 25, picocli), hexagonal layout; Gradle or Maven.',
    tags: ['lang.java', 'runtime.jvm', 'framework.micronaut', 'arch.hexagonal', 'arch.cli'],
    buildSystems: [GRADLE_BUILD, MAVEN_BUILD],
    moduleLayouts: MODULE_LAYOUTS,
    verticals: [vcsVertical, walkingSkeletonVertical, codeStyleVertical, devContainerVertical],
  },
  'micronaut-rest': {
    id: 'micronaut-rest',
    description: 'Micronaut 4 REST service (Java 25), hexagonal layout; Gradle or Maven.',
    tags: ['lang.java', 'runtime.jvm', 'framework.micronaut', 'arch.hexagonal', 'arch.server-http'],
    buildSystems: [GRADLE_BUILD, MAVEN_BUILD],
    moduleLayouts: MODULE_LAYOUTS,
    verticals: [
      vcsVertical,
      walkingSkeletonVertical,
      codeStyleVertical,
      devEnvVertical,
      observabilityVertical,
      devContainerVertical,
    ],
    projects: ['peer.api.rest'],
  },
  'micronaut-cli-kotlin': {
    id: 'micronaut-cli-kotlin',
    description: 'Micronaut 4 CLI (Kotlin, JVM 25, picocli), hexagonal layout; Gradle or Maven.',
    tags: ['lang.kotlin', 'runtime.jvm', 'framework.micronaut', 'arch.hexagonal', 'arch.cli'],
    buildSystems: [GRADLE_BUILD, MAVEN_BUILD],
    moduleLayouts: MODULE_LAYOUTS,
    verticals: [vcsVertical, walkingSkeletonVertical, codeStyleVertical, devContainerVertical],
  },
  'micronaut-rest-kotlin': {
    id: 'micronaut-rest-kotlin',
    description: 'Micronaut 4 REST service (Kotlin, JVM 25), hexagonal layout; Gradle or Maven.',
    tags: [
      'lang.kotlin',
      'runtime.jvm',
      'framework.micronaut',
      'arch.hexagonal',
      'arch.server-http',
    ],
    buildSystems: [GRADLE_BUILD, MAVEN_BUILD],
    moduleLayouts: MODULE_LAYOUTS,
    verticals: [
      vcsVertical,
      walkingSkeletonVertical,
      codeStyleVertical,
      devEnvVertical,
      observabilityVertical,
      devContainerVertical,
    ],
    projects: ['peer.api.rest'],
  },
  'micronaut-cli-rest': {
    id: 'micronaut-cli-rest',
    description:
      'Micronaut 4 CLI + REST service (Java 25), one hexagon with both entrypoints; Gradle or Maven; basic or modulith layout.',
    tags: [
      'lang.java',
      'runtime.jvm',
      'framework.micronaut',
      'arch.hexagonal',
      'arch.cli',
      'arch.server-http',
    ],
    buildSystems: [GRADLE_BUILD, MAVEN_BUILD],
    moduleLayouts: MODULE_LAYOUTS,
    verticals: [
      vcsVertical,
      walkingSkeletonVertical,
      codeStyleVertical,
      devEnvVertical,
      observabilityVertical,
      devContainerVertical,
    ],
    projects: ['peer.api.rest'],
  },
  'micronaut-cli-rest-kotlin': {
    id: 'micronaut-cli-rest-kotlin',
    description:
      'Micronaut 4 CLI + REST service (Kotlin, JVM 25), one hexagon with both entrypoints; Gradle or Maven; basic or modulith layout.',
    tags: [
      'lang.kotlin',
      'runtime.jvm',
      'framework.micronaut',
      'arch.hexagonal',
      'arch.cli',
      'arch.server-http',
    ],
    buildSystems: [GRADLE_BUILD, MAVEN_BUILD],
    moduleLayouts: MODULE_LAYOUTS,
    verticals: [
      vcsVertical,
      walkingSkeletonVertical,
      codeStyleVertical,
      devEnvVertical,
      observabilityVertical,
      devContainerVertical,
    ],
    projects: ['peer.api.rest'],
  },
  'go-cli': {
    id: 'go-cli',
    description: 'Go CLI on the stdlib, hexagonal layout, no mediator object.',
    tags: ['lang.go', 'pkg.go-modules', 'arch.hexagonal', 'arch.cli'],
    moduleLayouts: MODULE_LAYOUTS,
    verticals: [vcsVertical, walkingSkeletonVertical, codeStyleVertical, devContainerVertical],
  },
  'go-http': {
    id: 'go-http',
    description: 'Go HTTP service on stdlib net/http, hexagonal layout, no mediator object.',
    tags: ['lang.go', 'pkg.go-modules', 'arch.hexagonal', 'arch.server-http'],
    moduleLayouts: MODULE_LAYOUTS,
    verticals: [
      vcsVertical,
      walkingSkeletonVertical,
      codeStyleVertical,
      devEnvVertical,
      observabilityVertical,
      devContainerVertical,
    ],
    projects: ['peer.api.rest'],
  },
  'go-cli-http': {
    id: 'go-cli-http',
    description:
      'Go CLI + HTTP service on the stdlib, one shared module with both entrypoints, hexagonal layout, no mediator object.',
    tags: ['lang.go', 'pkg.go-modules', 'arch.hexagonal', 'arch.cli', 'arch.server-http'],
    moduleLayouts: MODULE_LAYOUTS,
    verticals: [
      vcsVertical,
      walkingSkeletonVertical,
      codeStyleVertical,
      devEnvVertical,
      observabilityVertical,
      devContainerVertical,
    ],
    projects: ['peer.api.rest'],
  },
  'rust-cli': {
    id: 'rust-cli',
    description: 'Rust CLI on the stdlib, hexagonal layout, no mediator object.',
    tags: ['lang.rust', 'pkg.cargo', 'arch.hexagonal', 'arch.cli'],
    moduleLayouts: MODULE_LAYOUTS,
    verticals: [vcsVertical, walkingSkeletonVertical, codeStyleVertical, devContainerVertical],
  },
  'rust-http': {
    id: 'rust-http',
    description: 'Rust HTTP service on axum + tokio, hexagonal layout, no mediator object.',
    tags: ['lang.rust', 'pkg.cargo', 'arch.hexagonal', 'arch.server-http'],
    moduleLayouts: MODULE_LAYOUTS,
    verticals: [
      vcsVertical,
      walkingSkeletonVertical,
      codeStyleVertical,
      devEnvVertical,
      observabilityVertical,
      devContainerVertical,
    ],
    projects: ['peer.api.rest'],
  },
  'rust-cli-http': {
    id: 'rust-cli-http',
    description:
      'Rust CLI + HTTP service on axum + tokio, one shared package with both entrypoints, hexagonal layout, no mediator object.',
    tags: ['lang.rust', 'pkg.cargo', 'arch.hexagonal', 'arch.cli', 'arch.server-http'],
    moduleLayouts: MODULE_LAYOUTS,
    verticals: [
      vcsVertical,
      walkingSkeletonVertical,
      codeStyleVertical,
      devEnvVertical,
      observabilityVertical,
      devContainerVertical,
    ],
    projects: ['peer.api.rest'],
  },
  'ts-cli': {
    id: 'ts-cli',
    description:
      'TypeScript CLI on Node (22.18+ runs the sources directly), hexagonal layout, registry mediator; npm or pnpm.',
    tags: ['lang.typescript', 'runtime.node', 'arch.hexagonal', 'arch.cli'],
    buildSystems: [NPM_BUILD, PNPM_BUILD],
    moduleLayouts: MODULE_LAYOUTS,
    verticals: [vcsVertical, walkingSkeletonVertical, codeStyleVertical, devContainerVertical],
  },
  'ts-http': {
    id: 'ts-http',
    description:
      'TypeScript HTTP service on node:http (Node 22.18+ runs the sources directly), hexagonal layout, registry mediator; npm or pnpm.',
    tags: ['lang.typescript', 'runtime.node', 'arch.hexagonal', 'arch.server-http'],
    buildSystems: [NPM_BUILD, PNPM_BUILD],
    moduleLayouts: MODULE_LAYOUTS,
    verticals: [
      vcsVertical,
      walkingSkeletonVertical,
      codeStyleVertical,
      devEnvVertical,
      observabilityVertical,
      devContainerVertical,
    ],
    projects: ['peer.api.rest'],
  },
  'ts-cli-http': {
    id: 'ts-cli-http',
    description:
      'TypeScript CLI + HTTP service on Node (22.18+ runs the sources directly), one shared workspace with both entrypoints, registry mediator; npm or pnpm; basic or modulith layout.',
    tags: ['lang.typescript', 'runtime.node', 'arch.hexagonal', 'arch.cli', 'arch.server-http'],
    buildSystems: [NPM_BUILD, PNPM_BUILD],
    moduleLayouts: MODULE_LAYOUTS,
    verticals: [
      vcsVertical,
      walkingSkeletonVertical,
      codeStyleVertical,
      devEnvVertical,
      observabilityVertical,
      devContainerVertical,
    ],
    projects: ['peer.api.rest'],
  },
  'web-components': {
    id: 'web-components',
    description:
      'Framework-free web-components SPA on Vite (TypeScript workspaces), hexagonal layout; npm or pnpm.',
    tags: [
      'lang.typescript',
      'runtime.browser',
      'framework.web-components',
      'arch.hexagonal',
      'arch.spa',
    ],
    buildSystems: [NPM_BUILD, PNPM_BUILD],
    moduleLayouts: MODULE_LAYOUTS,
    verticals: [vcsVertical, walkingSkeletonVertical, codeStyleVertical, devContainerVertical],
    projects: ['peer.ui.spa'],
  },
  fullstack: {
    id: 'fullstack',
    description:
      'Fullstack product: quarkus-rest backend + web-components frontend, monorepo or polyrepo.',
    tags: [],
    verticals: [vcsVertical, fullstackVertical],
    services: [
      { path: 'backend', stack: 'quarkus-rest', extraVerticals: [gatewayVertical] },
      { path: 'frontend', stack: 'web-components', extraVerticals: [gatewayVertical] },
    ],
  },
  'fullstack-spring': {
    id: 'fullstack-spring',
    description:
      'Fullstack product: spring-rest backend + web-components frontend, monorepo or polyrepo.',
    tags: [],
    verticals: [vcsVertical, fullstackVertical],
    services: [
      { path: 'backend', stack: 'spring-rest', extraVerticals: [gatewayVertical] },
      { path: 'frontend', stack: 'web-components', extraVerticals: [gatewayVertical] },
    ],
  },
  'fullstack-micronaut': {
    id: 'fullstack-micronaut',
    description:
      'Fullstack product: micronaut-rest backend + web-components frontend, monorepo or polyrepo.',
    tags: [],
    verticals: [vcsVertical, fullstackVertical],
    services: [
      { path: 'backend', stack: 'micronaut-rest', extraVerticals: [gatewayVertical] },
      { path: 'frontend', stack: 'web-components', extraVerticals: [gatewayVertical] },
    ],
  },
  'fullstack-go': {
    id: 'fullstack-go',
    description:
      'Fullstack product: go-http backend + web-components frontend, monorepo or polyrepo.',
    tags: [],
    verticals: [vcsVertical, fullstackVertical],
    services: [
      { path: 'backend', stack: 'go-http', extraVerticals: [gatewayVertical] },
      { path: 'frontend', stack: 'web-components', extraVerticals: [gatewayVertical] },
    ],
  },
  'fullstack-ts': {
    id: 'fullstack-ts',
    description:
      'Fullstack product: ts-http backend + web-components frontend, monorepo or polyrepo.',
    tags: [],
    verticals: [vcsVertical, fullstackVertical],
    services: [
      { path: 'backend', stack: 'ts-http', extraVerticals: [gatewayVertical] },
      { path: 'frontend', stack: 'web-components', extraVerticals: [gatewayVertical] },
    ],
  },
  'fullstack-rust': {
    id: 'fullstack-rust',
    description:
      'Fullstack product: rust-http backend + web-components frontend, monorepo or polyrepo.',
    tags: [],
    verticals: [vcsVertical, fullstackVertical],
    services: [
      { path: 'backend', stack: 'rust-http', extraVerticals: [gatewayVertical] },
      { path: 'frontend', stack: 'web-components', extraVerticals: [gatewayVertical] },
    ],
  },
};

/** Returns the stack registered under `id`, or null if absent. */
export function getStack(id: string): Stack | null {
  return STACKS[id] ?? null;
}

/** Lists the available stack ids in deterministic order. */
export function listStackIds(): readonly string[] {
  return Object.keys(STACKS).sort();
}

/** One stack's id + description, for `keel new --list`. */
export interface StackSummary {
  readonly id: string;
  readonly description: string;
}

/** Lists every registered stack's id + description, in deterministic order. */
/**
 * The tag set a stack seeds, once its build-system and module-layout
 * dials have settled.
 *
 * The one place the arithmetic lives, because three readers need the
 * same answer: the install that stages from it, the compatibility
 * probe below, and the menus that filter against it.
 */
export function stackTagsFor(
  stack: Stack,
  buildTag: Tag | null,
  layoutTag: Tag | null,
): readonly Tag[] {
  return [...stack.tags, ...(buildTag ? [buildTag] : []), ...(layoutTag ? [layoutTag] : [])];
}

/**
 * Every tag set this stack could seed — one per combination of the
 * dials it offers, and exactly one when it offers none.
 *
 * The peer context is deliberately not an axis. It is opt-in and
 * defaults to off, so a stack that can only be assembled *with* it is
 * not a thing; whether it may be switched on is its own menu's
 * question, filtered by the same rules at that point.
 */
export function assemblies(stack: Stack): readonly (readonly Tag[])[] {
  const builds: readonly (Tag | null)[] = stack.buildSystems?.map((o) => o.tag) ?? [null];
  const layouts: readonly (Tag | null)[] = stack.moduleLayouts?.map((o) => o.tag) ?? [null];
  return builds.flatMap((build) => layouts.map((layout) => stackTagsFor(stack, build, layout)));
}

/**
 * Whether this stack can be built at all — whether **some** setting of
 * its dials satisfies the rules its own pieces declare.
 *
 * What it is for is menus, and the "some" is the whole of it. A stack
 * is a dead end only when every way of assembling it is refused;
 * hiding one whose default combination happens to be illegal would
 * take away a preset the user could have reached by moving a dial. The
 * dials' own menus then narrow within it, which is where a specific
 * combination is ruled out.
 *
 * @see assemblyRefusal — the same declaration, read to refuse rather
 * than to filter.
 */
export function isAssemblable(stack: Stack): boolean {
  const pieces = [stack, ...stack.verticals];
  return assemblies(stack).some((tags) => assemblyRefusal(pieces, tags) === null);
}

/** The stacks a menu may offer: every registered one that can be built. */
export function assemblableStacks(): readonly Stack[] {
  return listStackIds()
    .map((id) => STACKS[id])
    .filter((stack): stack is Stack => stack !== undefined && isAssemblable(stack));
}

/**
 * Every stack a menu may offer, id-sorted.
 *
 * Filtered by {@link isAssemblable}: a preset no setting of its dials
 * can build is not an option, and listing it as one is a promise the
 * install would break. {@link listStackIds} stays unfiltered — an
 * "unknown stack 'x'; available: …" message is about which ids exist,
 * and hiding a real id there would send the reader looking for a typo
 * they did not make.
 */
export function listStacks(): readonly StackSummary[] {
  return assemblableStacks().map((stack) => ({ id: stack.id, description: stack.description }));
}
