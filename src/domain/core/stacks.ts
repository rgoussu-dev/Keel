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
    description: 'Quarkus 3 CLI on Gradle (Java 21), hexagonal layout.',
    tags: [
      'lang.java',
      'runtime.jvm',
      'pkg.gradle',
      'framework.quarkus',
      'arch.hexagonal',
      'arch.cli',
    ],
    verticals: [vcsVertical, walkingSkeletonVertical],
  },
  'quarkus-rest': {
    id: 'quarkus-rest',
    description: 'Quarkus 3 REST service on Gradle (Java 21), hexagonal layout.',
    tags: [
      'lang.java',
      'runtime.jvm',
      'pkg.gradle',
      'framework.quarkus',
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
  'web-components': {
    id: 'web-components',
    description:
      'Framework-free web-components SPA on Vite (TypeScript, npm workspaces), hexagonal layout.',
    tags: [
      'lang.typescript',
      'runtime.browser',
      'pkg.npm',
      'framework.web-components',
      'arch.hexagonal',
      'arch.spa',
    ],
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
};

/** Returns the stack registered under `id`, or null if absent. */
export function getStack(id: string): Stack | null {
  return STACKS[id] ?? null;
}

/** Lists the available stack ids in deterministic order. */
export function listStackIds(): readonly string[] {
  return Object.keys(STACKS).sort();
}
