/**
 * The TypeScript-workspace package-manager dial shared by the
 * adapters whose output depends on it (the TS bootstraps, the
 * port-fake packages, the gateway patches). The choice is carried by
 * the manifest's `pkg.*` tag — seeded by the stack or the user's
 * build-system selection at `keel new` time — so adapters read it
 * rather than asking again.
 */

import type { Tag } from '../../contract/composition.js';

/** Package managers the TypeScript template trees ship for. */
export type TsPackageManager = 'npm' | 'pnpm';

/** Template variables derived from the workspace's package manager. */
export interface TsWorkspaceVars {
  /** The package manager binary name, usable in docs and scripts. */
  readonly pm: TsPackageManager;
  /**
   * The dependency protocol for intra-workspace references: npm links
   * workspace packages on `"*"`, pnpm requires `"workspace:*"`.
   */
  readonly workspaceDep: string;
}

/** Resolves the workspace variables from a manifest tag set. */
export function tsWorkspaceVars(tags: readonly Tag[]): TsWorkspaceVars {
  const pm: TsPackageManager = tags.includes('pkg.pnpm') ? 'pnpm' : 'npm';
  return { pm, workspaceDep: pm === 'pnpm' ? 'workspace:*' : '*' };
}
