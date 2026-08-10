/**
 * The JVM build-system dial shared by the adapters whose output
 * depends on it (the bootstrap family, `sample-port-fake`). The
 * choice is carried by the manifest's `pkg.*` tag — seeded by the
 * stack (or the user's build-system selection at `keel new` time) —
 * so adapters read it rather than asking again.
 */

import type { Tag } from '../../contract/composition.js';

/** Build systems the JVM template trees ship for. */
export type JvmBuildSystem = 'gradle' | 'maven';

/** Resolves the JVM build system from a manifest tag set. */
export function jvmBuildSystem(tags: readonly Tag[]): JvmBuildSystem {
  return tags.includes('pkg.maven') ? 'maven' : 'gradle';
}
