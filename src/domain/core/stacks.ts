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
 */

import { vcsVertical } from './verticals/vcs.js';
import { walkingSkeletonVertical } from './verticals/walking-skeleton.js';
import type { Tag, Vertical } from '../contract/composition.js';

/** A curated greenfield preset. */
export interface Stack {
  readonly id: string;
  readonly description: string;
  /** Capability tags this stack contributes to the manifest at install time. */
  readonly tags: readonly Tag[];
  /** Verticals to install, in order. */
  readonly verticals: readonly Vertical[];
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
};

/** Returns the stack registered under `id`, or null if absent. */
export function getStack(id: string): Stack | null {
  return STACKS[id] ?? null;
}

/** Lists the available stack ids in deterministic order. */
export function listStackIds(): readonly string[] {
  return Object.keys(STACKS).sort();
}
