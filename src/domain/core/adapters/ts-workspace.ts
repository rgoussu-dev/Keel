/**
 * The TypeScript-workspace package-manager dial shared by the
 * adapters whose output depends on it (the TS bootstraps, the
 * port-fake packages, the gateway patches). The choice is carried by
 * the manifest's `pkg.*` tag — seeded by the stack or the user's
 * build-system selection at `keel new` time — so adapters read it
 * rather than asking again.
 */

import type { DeferredAction, Tag } from '../../contract/composition.js';

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

/**
 * The deferred install every adapter that **adds a workspace package**
 * has to emit.
 *
 * A package the root manifest now lists but the store has never seen
 * is not resolvable: nothing symlinks it into `node_modules`, so every
 * `import '@scope/<new>'` is a `TS2307` and the project the install
 * just reported as ready does not typecheck. `keel new` gets this for
 * free because the walking skeleton's `npm-install` adapter runs last;
 * anything layered onto a live project has to ask for it.
 *
 * @param id the adapter's own id, so a failure names what asked
 * @param pm the workspace's package manager
 * @param reason what the install is fetching, for the log line
 */
export function workspaceInstall(id: string, pm: TsPackageManager, reason: string): DeferredAction {
  const args = pm === 'npm' ? ['install', '--no-fund', '--no-audit'] : ['install'];
  return {
    id,
    description: `${pm} install (${reason})`,
    run: async ({ cwd, processes }) => {
      const result = await processes.run(pm, args, { cwd });
      if (result.startFailure) {
        throw new Error(
          `'${pm}' is not on PATH — run '${pm} install' in the project root to ${reason}`,
        );
      }
      if (result.status !== 0) {
        throw new Error(
          [`'${pm} install' failed`, result.stderr, result.stdout].filter(Boolean).join('\n'),
        );
      }
    },
  };
}
