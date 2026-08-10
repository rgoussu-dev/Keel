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

import { fullstackVertical } from './verticals/fullstack.js';
import { gatewayVertical } from './verticals/gateway.js';
import { vcsVertical } from './verticals/vcs.js';
import { walkingSkeletonVertical } from './verticals/walking-skeleton.js';
import type { Tag, Vertical } from '../contract/composition.js';

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
}

export const STACKS: Readonly<Record<string, Stack>> = {
  'quarkus-cli': {
    id: 'quarkus-cli',
    description: 'Quarkus 3 CLI (Java 21), hexagonal layout; Gradle or Maven.',
    tags: ['lang.java', 'runtime.jvm', 'framework.quarkus', 'arch.hexagonal', 'arch.cli'],
    buildSystems: [GRADLE_BUILD, MAVEN_BUILD],
    verticals: [vcsVertical, walkingSkeletonVertical],
  },
  'quarkus-rest': {
    id: 'quarkus-rest',
    description: 'Quarkus 3 REST service (Java 21), hexagonal layout; Gradle or Maven.',
    tags: ['lang.java', 'runtime.jvm', 'framework.quarkus', 'arch.hexagonal', 'arch.server-http'],
    buildSystems: [GRADLE_BUILD, MAVEN_BUILD],
    verticals: [vcsVertical, walkingSkeletonVertical],
    projects: ['peer.api.rest'],
  },
  'quarkus-cli-kotlin': {
    id: 'quarkus-cli-kotlin',
    description: 'Quarkus 3 CLI on Gradle (Kotlin, JVM 21), hexagonal layout.',
    tags: [
      'lang.kotlin',
      'runtime.jvm',
      'pkg.gradle',
      'framework.quarkus',
      'arch.hexagonal',
      'arch.cli',
    ],
    verticals: [vcsVertical, walkingSkeletonVertical],
  },
  'quarkus-rest-kotlin': {
    id: 'quarkus-rest-kotlin',
    description: 'Quarkus 3 REST service on Gradle (Kotlin, JVM 21), hexagonal layout.',
    tags: [
      'lang.kotlin',
      'runtime.jvm',
      'pkg.gradle',
      'framework.quarkus',
      'arch.hexagonal',
      'arch.server-http',
    ],
    verticals: [vcsVertical, walkingSkeletonVertical],
    projects: ['peer.api.rest'],
  },
  'spring-cli': {
    id: 'spring-cli',
    description: 'Spring Boot 4 CLI (Java 21, picocli), hexagonal layout; Gradle or Maven.',
    tags: ['lang.java', 'runtime.jvm', 'framework.spring', 'arch.hexagonal', 'arch.cli'],
    buildSystems: [GRADLE_BUILD, MAVEN_BUILD],
    verticals: [vcsVertical, walkingSkeletonVertical],
  },
  'spring-rest': {
    id: 'spring-rest',
    description: 'Spring Boot 4 REST service (Java 21), hexagonal layout; Gradle or Maven.',
    tags: ['lang.java', 'runtime.jvm', 'framework.spring', 'arch.hexagonal', 'arch.server-http'],
    buildSystems: [GRADLE_BUILD, MAVEN_BUILD],
    verticals: [vcsVertical, walkingSkeletonVertical],
    projects: ['peer.api.rest'],
  },
  'spring-cli-kotlin': {
    id: 'spring-cli-kotlin',
    description: 'Spring Boot 4 CLI on Gradle (Kotlin, JVM 21, picocli), hexagonal layout.',
    tags: [
      'lang.kotlin',
      'runtime.jvm',
      'pkg.gradle',
      'framework.spring',
      'arch.hexagonal',
      'arch.cli',
    ],
    verticals: [vcsVertical, walkingSkeletonVertical],
  },
  'spring-rest-kotlin': {
    id: 'spring-rest-kotlin',
    description: 'Spring Boot 4 REST service on Gradle (Kotlin, JVM 21), hexagonal layout.',
    tags: [
      'lang.kotlin',
      'runtime.jvm',
      'pkg.gradle',
      'framework.spring',
      'arch.hexagonal',
      'arch.server-http',
    ],
    verticals: [vcsVertical, walkingSkeletonVertical],
    projects: ['peer.api.rest'],
  },
  'micronaut-cli': {
    id: 'micronaut-cli',
    description: 'Micronaut 4 CLI (Java 21, picocli), hexagonal layout; Gradle or Maven.',
    tags: ['lang.java', 'runtime.jvm', 'framework.micronaut', 'arch.hexagonal', 'arch.cli'],
    buildSystems: [GRADLE_BUILD, MAVEN_BUILD],
    verticals: [vcsVertical, walkingSkeletonVertical],
  },
  'micronaut-rest': {
    id: 'micronaut-rest',
    description: 'Micronaut 4 REST service (Java 21), hexagonal layout; Gradle or Maven.',
    tags: ['lang.java', 'runtime.jvm', 'framework.micronaut', 'arch.hexagonal', 'arch.server-http'],
    buildSystems: [GRADLE_BUILD, MAVEN_BUILD],
    verticals: [vcsVertical, walkingSkeletonVertical],
    projects: ['peer.api.rest'],
  },
  'micronaut-cli-kotlin': {
    id: 'micronaut-cli-kotlin',
    description: 'Micronaut 4 CLI on Gradle (Kotlin, JVM 21, picocli), hexagonal layout.',
    tags: [
      'lang.kotlin',
      'runtime.jvm',
      'pkg.gradle',
      'framework.micronaut',
      'arch.hexagonal',
      'arch.cli',
    ],
    verticals: [vcsVertical, walkingSkeletonVertical],
  },
  'micronaut-rest-kotlin': {
    id: 'micronaut-rest-kotlin',
    description: 'Micronaut 4 REST service on Gradle (Kotlin, JVM 21), hexagonal layout.',
    tags: [
      'lang.kotlin',
      'runtime.jvm',
      'pkg.gradle',
      'framework.micronaut',
      'arch.hexagonal',
      'arch.server-http',
    ],
    verticals: [vcsVertical, walkingSkeletonVertical],
    projects: ['peer.api.rest'],
  },
  'go-cli': {
    id: 'go-cli',
    description: 'Go CLI on the stdlib, hexagonal layout, no mediator object.',
    tags: ['lang.go', 'pkg.go-modules', 'arch.hexagonal', 'arch.cli'],
    verticals: [vcsVertical, walkingSkeletonVertical],
  },
  'go-http': {
    id: 'go-http',
    description: 'Go HTTP service on stdlib net/http, hexagonal layout, no mediator object.',
    tags: ['lang.go', 'pkg.go-modules', 'arch.hexagonal', 'arch.server-http'],
    verticals: [vcsVertical, walkingSkeletonVertical],
    projects: ['peer.api.rest'],
  },
  'rust-cli': {
    id: 'rust-cli',
    description: 'Rust CLI on the stdlib, hexagonal layout, no mediator object.',
    tags: ['lang.rust', 'pkg.cargo', 'arch.hexagonal', 'arch.cli'],
    verticals: [vcsVertical, walkingSkeletonVertical],
  },
  'rust-http': {
    id: 'rust-http',
    description: 'Rust HTTP service on axum + tokio, hexagonal layout, no mediator object.',
    tags: ['lang.rust', 'pkg.cargo', 'arch.hexagonal', 'arch.server-http'],
    verticals: [vcsVertical, walkingSkeletonVertical],
    projects: ['peer.api.rest'],
  },
  'ts-http': {
    id: 'ts-http',
    description:
      'TypeScript HTTP service on node:http (Node 22.18+ runs the sources directly), hexagonal layout, registry mediator; npm or pnpm.',
    tags: ['lang.typescript', 'runtime.node', 'arch.hexagonal', 'arch.server-http'],
    buildSystems: [NPM_BUILD, PNPM_BUILD],
    verticals: [vcsVertical, walkingSkeletonVertical],
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
    verticals: [vcsVertical, walkingSkeletonVertical],
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
